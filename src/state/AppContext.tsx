import { createContext, useCallback, useContext, useEffect, useReducer, useState, type ReactNode } from 'react'
import type { AppState } from '../types'
import { appReducer, createEmptyState, syncAutoDistribution, type AppAction } from './appReducer'
import { isUntouchedLegacySample, migrateAppState } from '../utils/migrate'
import { useWorkspaces, workspaceStateKey } from './WorkspaceContext'

function withAutoDistribution(state: AppState): AppState {
  return { ...state, contributions: syncAutoDistribution(state.tasks, state.members, state.contributions, state.peerReviews) }
}

function loadInitialState(storageKey: string): AppState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const migrated = migrateAppState(JSON.parse(raw))
      if (migrated) return isUntouchedLegacySample(migrated) ? createEmptyState() : withAutoDistribution(migrated)
    }
  } catch {
    // fall through to empty state
  }
  return createEmptyState()
}

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  workspaceId: string
  // 과제/팀원관리 화면과 빠른 시작 팝업(직접 입력 탭)이 공유하는 "방금 추가함"
  // 표시용 id 집합 -- 어느 쪽에서 추가하든 같은 초록 N 뱃지가 뜨게 한다.
  // 리로드/리마운트 시 초기화되며 별도로 저장하지 않는다.
  recentlyAddedIds: Set<string>
  markRecentlyAdded: (ids: string[]) => void
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const storageKey = workspaceStateKey(workspaceId)
  const [state, rawDispatch] = useReducer(appReducer, storageKey, loadInitialState)
  const { touchWorkspace } = useWorkspaces()
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set())

  function markRecentlyAdded(ids: string[]) {
    setRecentlyAddedIds(new Set(ids))
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Storage may be unavailable (private browsing, sandboxed embed, quota exceeded).
      // Keep running in-memory; nothing else depends on persistence succeeding.
    }
  }, [state, storageKey])

  // 워크스페이스를 열기만 해도(수정 없이 구경만 해도) "최근 수정"이 갱신돼
  // 랜딩 화면의 "평가 진행중" 배지가 실제로는 손대지 않은 워크스페이스로
  // 옮겨가는 문제가 있었다. state가 바뀌는 시점(effect)이 아니라, 실제로
  // 뭔가를 바꾸는 액션이 dispatch될 때만 touchWorkspace를 부르도록
  // dispatch 자체에 붙인다 -- 초기 로드는 dispatch를 거치지 않으므로
  // 자연히 제외된다(React StrictMode의 effect 중복 실행에도 영향받지 않음).
  const dispatch = useCallback<React.Dispatch<AppAction>>(
    (action) => {
      rawDispatch(action)
      touchWorkspace(workspaceId)
    },
    [touchWorkspace, workspaceId],
  )

  return (
    <AppContext.Provider value={{ state, dispatch, workspaceId, recentlyAddedIds, markRecentlyAdded }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

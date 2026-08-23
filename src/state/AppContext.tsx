import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from 'react'
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
  const [state, dispatch] = useReducer(appReducer, storageKey, loadInitialState)
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
    touchWorkspace(workspaceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, storageKey])

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

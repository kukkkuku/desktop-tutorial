import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import type { AppState } from '../types'
import { appReducer, createEmptyState, syncAutoDistribution, type AppAction } from './appReducer'
import { isUntouchedLegacySample, migrateAppState } from '../utils/migrate'
import { useWorkspaces, workspaceStateKey } from './WorkspaceContext'

function withAutoDistribution(state: AppState): AppState {
  return { ...state, contributions: syncAutoDistribution(state.tasks, state.members, state.contributions) }
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
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const storageKey = workspaceStateKey(workspaceId)
  const [state, dispatch] = useReducer(appReducer, storageKey, loadInitialState)
  const { touchWorkspace } = useWorkspaces()

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

  return <AppContext.Provider value={{ state, dispatch, workspaceId }}>{children}</AppContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

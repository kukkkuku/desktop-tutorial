import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import type { AppState } from '../types'
import { appReducer, createEmptyState, syncAutoDistribution, type AppAction } from './appReducer'
import { isUntouchedLegacySample, migrateAppState } from '../utils/migrate'

const STORAGE_KEY = 'ux-performance-evaluation-state'

function withAutoDistribution(state: AppState): AppState {
  return { ...state, contributions: syncAutoDistribution(state.tasks, state.members, state.contributions) }
}

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadInitialState)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage may be unavailable (private browsing, sandboxed embed, quota exceeded).
      // Keep running in-memory; nothing else depends on persistence succeeding.
    }
  }, [state])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import type { AppState } from '../types'
import { appReducer, type AppAction } from './appReducer'
import { createSampleData } from '../utils/sampleData'

const STORAGE_KEY = 'ux-performance-evaluation-state'

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.members)) {
        return parsed
      }
    }
  } catch {
    // fall through to sample data
  }
  return createSampleData()
}

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadInitialState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import type { AppState } from '../types'
import { appReducer, createEmptyState, syncAutoDistribution, type AppAction } from './appReducer'

function withAutoDistribution(state: AppState): AppState {
  return { ...state, contributions: syncAutoDistribution(state.tasks, state.members, state.contributions) }
}

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({
  children,
  initialState,
  onStateChange,
}: {
  children: ReactNode
  initialState?: AppState
  onStateChange?: (state: AppState) => void
}) {
  const [state, dispatch] = useReducer(
    appReducer,
    initialState,
    (value) => value ? withAutoDistribution(value) : createEmptyState(),
  )

  useEffect(() => {
    onStateChange?.(state)
  }, [onStateChange, state])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

import type { AppState, Contribution, Criteria, Task, TeamMember } from '../types'

export type AppAction =
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: { id: string } }
  | { type: 'ADD_MEMBER'; payload: TeamMember }
  | { type: 'UPDATE_MEMBER'; payload: TeamMember }
  | { type: 'DELETE_MEMBER'; payload: { id: string } }
  | { type: 'SET_CONTRIBUTION'; payload: Contribution }
  | { type: 'SET_CRITERIA'; payload: Partial<Criteria> }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload

    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.payload] }

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.payload.id ? action.payload : t)),
      }

    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload.id),
        contributions: state.contributions.filter((c) => c.taskId !== action.payload.id),
      }

    case 'ADD_MEMBER':
      return { ...state, members: [...state.members, action.payload] }

    case 'UPDATE_MEMBER':
      return {
        ...state,
        members: state.members.map((m) => (m.id === action.payload.id ? action.payload : m)),
      }

    case 'DELETE_MEMBER':
      return {
        ...state,
        members: state.members.filter((m) => m.id !== action.payload.id),
        contributions: state.contributions.filter((c) => c.memberId !== action.payload.id),
      }

    case 'SET_CONTRIBUTION': {
      const { taskId, memberId, contributionRatio } = action.payload
      const exists = state.contributions.some(
        (c) => c.taskId === taskId && c.memberId === memberId,
      )
      const contributions = exists
        ? state.contributions.map((c) =>
            c.taskId === taskId && c.memberId === memberId ? { ...c, contributionRatio } : c,
          )
        : [...state.contributions, { taskId, memberId, contributionRatio }]
      return { ...state, contributions }
    }

    case 'SET_CRITERIA':
      return { ...state, criteria: { ...state.criteria, ...action.payload } }

    default:
      return state
  }
}

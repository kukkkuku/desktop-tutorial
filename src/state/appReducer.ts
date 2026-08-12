import type { AppState, Contribution, Criteria, PerformanceGrade, Task, TeamMember } from '../types'

export type AppAction =
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: { id: string } }
  | { type: 'IMPORT_TASKS'; payload: Task[] }
  | { type: 'ADD_MEMBER'; payload: TeamMember }
  | { type: 'UPDATE_MEMBER'; payload: TeamMember }
  | { type: 'DELETE_MEMBER'; payload: { id: string } }
  | { type: 'IMPORT_MEMBERS'; payload: TeamMember[] }
  | { type: 'SET_CONTRIBUTION_PERCENT'; payload: { taskId: string; memberId: string; contributionPercent: number } }
  | { type: 'SET_CONTRIBUTION_GRADE'; payload: { taskId: string; memberId: string; personalPerformanceGrade: PerformanceGrade } }
  | { type: 'SET_CRITERIA'; payload: Partial<Criteria> }
  | { type: 'RESET_ALL' }

function upsertContribution(
  contributions: Contribution[],
  taskId: string,
  memberId: string,
  patch: Partial<Pick<Contribution, 'contributionPercent' | 'personalPerformanceGrade'>>,
): Contribution[] {
  const exists = contributions.some((c) => c.taskId === taskId && c.memberId === memberId)
  if (exists) {
    return contributions.map((c) =>
      c.taskId === taskId && c.memberId === memberId ? { ...c, ...patch } : c,
    )
  }
  return [
    ...contributions,
    {
      taskId,
      memberId,
      contributionPercent: 0,
      personalPerformanceGrade: 'B',
      ...patch,
    },
  ]
}

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

    case 'IMPORT_TASKS':
      return { ...state, tasks: action.payload }

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

    case 'IMPORT_MEMBERS':
      return { ...state, members: action.payload }

    case 'SET_CONTRIBUTION_PERCENT': {
      const { taskId, memberId, contributionPercent } = action.payload
      return {
        ...state,
        contributions: upsertContribution(state.contributions, taskId, memberId, { contributionPercent }),
      }
    }

    case 'SET_CONTRIBUTION_GRADE': {
      const { taskId, memberId, personalPerformanceGrade } = action.payload
      return {
        ...state,
        contributions: upsertContribution(state.contributions, taskId, memberId, { personalPerformanceGrade }),
      }
    }

    case 'SET_CRITERIA':
      return { ...state, criteria: { ...state.criteria, ...action.payload } }

    case 'RESET_ALL':
      return {
        tasks: [],
        members: [],
        contributions: [],
        criteria: {
          usePerformanceGrade: true,
          useImportance: true,
          useWorkload: true,
          usePersonalPerformanceGrade: false,
        },
      }

    default:
      return state
  }
}

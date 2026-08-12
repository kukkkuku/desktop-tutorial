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
  patch: Partial<Pick<Contribution, 'contributionPercent' | 'personalPerformanceGrade' | 'isAutoDistributed'>>,
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

function distributeEqually(count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(100 / count)
  const remainder = 100 - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

function autoDistributeForNewTask(taskId: string, members: TeamMember[]): Contribution[] {
  const shares = distributeEqually(members.length)
  return members.map((member, i) => ({
    taskId,
    memberId: member.id,
    contributionPercent: shares[i],
    personalPerformanceGrade: 'B' as PerformanceGrade,
    isAutoDistributed: true,
  }))
}

function redistributeForNewMember(
  tasks: Task[],
  members: TeamMember[],
  contributions: Contribution[],
): Contribution[] {
  let result = contributions
  for (const task of tasks) {
    const taskContributions = result.filter((c) => c.taskId === task.id)
    const isFullyAuto = taskContributions.every((c) => c.isAutoDistributed)
    if (!isFullyAuto) continue

    const shares = distributeEqually(members.length)
    const redistributed = members.map((member, i) => ({
      taskId: task.id,
      memberId: member.id,
      contributionPercent: shares[i],
      personalPerformanceGrade:
        taskContributions.find((c) => c.memberId === member.id)?.personalPerformanceGrade ?? ('B' as PerformanceGrade),
      isAutoDistributed: true,
    }))
    result = [...result.filter((c) => c.taskId !== task.id), ...redistributed]
  }
  return result
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload

    case 'ADD_TASK': {
      const tasks = [...state.tasks, action.payload]
      if (state.members.length === 0) {
        return { ...state, tasks }
      }
      return {
        ...state,
        tasks,
        contributions: [...state.contributions, ...autoDistributeForNewTask(action.payload.id, state.members)],
      }
    }

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

    case 'ADD_MEMBER': {
      const members = [...state.members, action.payload]
      if (state.tasks.length === 0) {
        return { ...state, members }
      }
      return {
        ...state,
        members,
        contributions: redistributeForNewMember(state.tasks, members, state.contributions),
      }
    }

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
        contributions: upsertContribution(state.contributions, taskId, memberId, {
          contributionPercent,
          isAutoDistributed: false,
        }),
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

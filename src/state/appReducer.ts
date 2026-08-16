import type { AppState, Contribution, Criteria, MeetingNote, PeerReview, PerformanceGrade, Task, TeamMember } from '../types'

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
  | { type: 'ADD_MEETING_NOTE'; payload: MeetingNote }
  | { type: 'UPDATE_MEETING_NOTE'; payload: MeetingNote }
  | { type: 'DELETE_MEETING_NOTE'; payload: { id: string } }
  | { type: 'IMPORT_PEER_REVIEWS'; payload: PeerReview[] }
  | { type: 'ADD_PEER_REVIEW'; payload: PeerReview }
  | { type: 'UPDATE_PEER_REVIEW'; payload: PeerReview }
  | { type: 'DELETE_PEER_REVIEW'; payload: { id: string } }

export function createEmptyState(): AppState {
  return {
    tasks: [],
    members: [],
    contributions: [],
    meetingNotes: [],
    peerReviews: [],
    criteria: {
      performanceGradeWeight: 100,
      taskGradeWeight: 100,
      workloadWeight: 100,
      personalGradeWeight: 0,
      peerReviewWeight: 0,
      contributionWeight: 100,
    },
  }
}

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

function distributeEqually(count: number, total = 100): number[] {
  if (count <= 0) return []
  const clamped = Math.max(0, total)
  const base = Math.floor(clamped / count)
  const remainder = Math.round(clamped - base * count)
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

// After a manual percent edit, re-split the leftover across the task's still-
// auto members (not the one just edited, and not any others the lead already
// hand-set) so a single edit doesn't leave everyone else's numbers stale.
// Any member's value the lead has explicitly typed stays exactly as set --
// to route the leftover to one specific person instead of splitting it
// evenly, the lead just edits that person's cell too, which locks it the
// same way.
function rebalanceTaskRemainder(contributions: Contribution[], taskId: string, members: TeamMember[]): Contribution[] {
  const activeMemberIds = new Set(members.filter((m) => m.active).map((m) => m.id))
  const taskContributions = contributions.filter((c) => c.taskId === taskId && activeMemberIds.has(c.memberId))
  const locked = taskContributions.filter((c) => !c.isAutoDistributed)
  const auto = taskContributions.filter((c) => c.isAutoDistributed)
  if (auto.length === 0) return contributions

  const lockedSum = locked.reduce((sum, c) => sum + c.contributionPercent, 0)
  const shares = distributeEqually(auto.length, 100 - lockedSum)
  const shareByMemberId = new Map(auto.map((c, i) => [c.memberId, shares[i]]))

  return contributions.map((c) =>
    c.taskId === taskId && shareByMemberId.has(c.memberId)
      ? { ...c, contributionPercent: shareByMemberId.get(c.memberId)! }
      : c,
  )
}

// For every task whose contributions are untouched by hand (none recorded yet, or all
// still auto), (re)split its 100% evenly across the currently *active* members --
// inactive members don't hold a contribution share, so the matrix's 100% total is
// reachable using only the members still shown there. Runs after any action that can
// change the task/member count or a member's active flag, and once on app load, so
// this stays true regardless of order, and also repairs data that predates this
// behavior. Tasks someone has already hand-edited (isFullyAuto false) are left alone,
// including a stale share left behind by a member who was just deactivated -- the
// matrix's contribution-sum validation (active-member-only) surfaces that as a
// shortfall for the user to redistribute themselves rather than silently reassigning it.
export function syncAutoDistribution(
  tasks: Task[],
  members: TeamMember[],
  contributions: Contribution[],
): Contribution[] {
  const activeMembers = members.filter((m) => m.active)
  if (activeMembers.length === 0) return contributions

  let result = contributions
  for (const task of tasks) {
    const taskContributions = result.filter((c) => c.taskId === task.id)
    const isFullyAuto = taskContributions.every((c) => c.isAutoDistributed)
    if (!isFullyAuto) continue

    const shares = distributeEqually(activeMembers.length)
    const desired: Contribution[] = activeMembers.map((member, i) => ({
      taskId: task.id,
      memberId: member.id,
      contributionPercent: shares[i],
      personalPerformanceGrade:
        taskContributions.find((c) => c.memberId === member.id)?.personalPerformanceGrade ?? ('B' as PerformanceGrade),
      isAutoDistributed: true,
    }))

    const alreadyCorrect =
      taskContributions.length === desired.length &&
      desired.every((d) =>
        taskContributions.some((c) => c.memberId === d.memberId && c.contributionPercent === d.contributionPercent),
      )
    if (alreadyCorrect) continue

    result = [...result.filter((c) => c.taskId !== task.id), ...desired]
  }
  return result
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload

    case 'ADD_TASK': {
      const tasks = [...state.tasks, action.payload]
      return { ...state, tasks, contributions: syncAutoDistribution(tasks, state.members, state.contributions) }
    }

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.payload.id ? action.payload : t)),
      }

    case 'DELETE_TASK': {
      const tasks = state.tasks.filter((t) => t.id !== action.payload.id)
      const contributions = state.contributions.filter((c) => c.taskId !== action.payload.id)
      return { ...state, tasks, contributions: syncAutoDistribution(tasks, state.members, contributions) }
    }

    case 'IMPORT_TASKS':
      return {
        ...state,
        tasks: action.payload,
        contributions: syncAutoDistribution(action.payload, state.members, state.contributions),
      }

    case 'ADD_MEMBER': {
      const members = [...state.members, action.payload]
      return { ...state, members, contributions: syncAutoDistribution(state.tasks, members, state.contributions) }
    }

    case 'UPDATE_MEMBER': {
      const members = state.members.map((m) => (m.id === action.payload.id ? action.payload : m))
      return { ...state, members, contributions: syncAutoDistribution(state.tasks, members, state.contributions) }
    }

    case 'DELETE_MEMBER': {
      const members = state.members.filter((m) => m.id !== action.payload.id)
      const contributions = state.contributions.filter((c) => c.memberId !== action.payload.id)
      const meetingNotes = state.meetingNotes.filter((n) => n.memberId !== action.payload.id)
      const peerReviews = state.peerReviews.filter((r) => r.targetMemberId !== action.payload.id)
      return {
        ...state,
        members,
        meetingNotes,
        peerReviews,
        contributions: syncAutoDistribution(state.tasks, members, contributions),
      }
    }

    case 'IMPORT_MEMBERS':
      return {
        ...state,
        members: action.payload,
        contributions: syncAutoDistribution(state.tasks, action.payload, state.contributions),
      }

    case 'SET_CONTRIBUTION_PERCENT': {
      const { taskId, memberId, contributionPercent } = action.payload
      const withEdit = upsertContribution(state.contributions, taskId, memberId, {
        contributionPercent,
        isAutoDistributed: false,
      })
      return {
        ...state,
        contributions: rebalanceTaskRemainder(withEdit, taskId, state.members),
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
      return createEmptyState()

    case 'ADD_MEETING_NOTE':
      return { ...state, meetingNotes: [...state.meetingNotes, action.payload] }

    case 'UPDATE_MEETING_NOTE':
      return {
        ...state,
        meetingNotes: state.meetingNotes.map((n) => (n.id === action.payload.id ? action.payload : n)),
      }

    case 'DELETE_MEETING_NOTE':
      return {
        ...state,
        meetingNotes: state.meetingNotes.filter((n) => n.id !== action.payload.id),
      }

    case 'IMPORT_PEER_REVIEWS':
      return { ...state, peerReviews: action.payload }

    case 'ADD_PEER_REVIEW':
      return { ...state, peerReviews: [...state.peerReviews, action.payload] }

    case 'UPDATE_PEER_REVIEW':
      return {
        ...state,
        peerReviews: state.peerReviews.map((r) => (r.id === action.payload.id ? action.payload : r)),
      }

    case 'DELETE_PEER_REVIEW':
      return {
        ...state,
        peerReviews: state.peerReviews.filter((r) => r.id !== action.payload.id),
      }

    default:
      return state
  }
}

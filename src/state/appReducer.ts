import type { AppState, Contribution, Criteria, EvaluationStatus, MeetingNote, PeerReview, PerformanceGrade, Task, TeamMember } from '../types'

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
  | { type: 'SET_CONTRIBUTION_NOTE'; payload: { taskId: string; memberId: string; personalGradeNote: string } }
  | { type: 'SET_CRITERIA'; payload: Partial<Criteria> }
  | { type: 'RESET_ALL' }
  | { type: 'ADD_MEETING_NOTE'; payload: MeetingNote }
  | { type: 'UPDATE_MEETING_NOTE'; payload: MeetingNote }
  | { type: 'DELETE_MEETING_NOTE'; payload: { id: string } }
  | { type: 'IMPORT_PEER_REVIEWS'; payload: PeerReview[] }
  | { type: 'ADD_PEER_REVIEW'; payload: PeerReview }
  | { type: 'UPDATE_PEER_REVIEW'; payload: PeerReview }
  | { type: 'DELETE_PEER_REVIEW'; payload: { id: string } }
  | { type: 'SET_EVALUATION_STATUS'; payload: { memberId: string; status: EvaluationStatus } }
  | { type: 'SET_ALL_EVALUATION_STATUS'; payload: { memberIds: string[]; status: EvaluationStatus } }

export function createEmptyState(): AppState {
  return {
    tasks: [],
    members: [],
    contributions: [],
    meetingNotes: [],
    peerReviews: [],
    evaluationStatus: {},
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
  patch: Partial<Pick<Contribution, 'contributionPercent' | 'personalPerformanceGrade' | 'personalGradeNote' | 'isAutoDistributed'>>,
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

// 이 과제에 기여도를 매긴 피어리뷰가 있으면 그 평균을 100%로 정규화해서
// 돌려준다(없으면 null -- 그때는 균등분배로 대체). 리뷰를 하나도 못 받은
// 활성 팀원은 이 맵에 없으므로 0%가 되고, 팀장이 직접 채워 넣는다.
function computePeerInformedShares(taskId: string, activeMembers: TeamMember[], peerReviews: PeerReview[]): Map<string, number> | null {
  const relevant = peerReviews.filter((r) => r.taskId === taskId && typeof r.contributionPercent === 'number')
  if (relevant.length === 0) return null

  const activeIds = new Set(activeMembers.map((m) => m.id))
  const sums = new Map<string, number>()
  const counts = new Map<string, number>()
  for (const r of relevant) {
    if (!activeIds.has(r.targetMemberId)) continue
    sums.set(r.targetMemberId, (sums.get(r.targetMemberId) ?? 0) + (r.contributionPercent ?? 0))
    counts.set(r.targetMemberId, (counts.get(r.targetMemberId) ?? 0) + 1)
  }
  if (sums.size === 0) return null

  const avgs = new Map<string, number>()
  let total = 0
  for (const [id, sum] of sums) {
    const avg = sum / (counts.get(id) ?? 1)
    avgs.set(id, avg)
    total += avg
  }
  if (total <= 0) return null

  const ids = Array.from(avgs.keys())
  const shares = new Map<string, number>()
  let assigned = 0
  ids.forEach((id, i) => {
    const raw = (avgs.get(id)! / total) * 100
    const rounded = i === ids.length - 1 ? 100 - assigned : Math.round(raw)
    shares.set(id, rounded)
    assigned += rounded
  })
  return shares
}

// For every task whose contributions are untouched by hand (none recorded yet, or all
// still auto), (re)split its 100% across the currently *active* members -- inactive
// members don't hold a contribution share, so the matrix's 100% total is reachable
// using only the members still shown there. If that task has peer-review contribution
// ratings, the split follows those (averaged, normalized to 100) instead of an equal
// split -- teammates' own account of who did how much is a better starting point than
// a blind equal share; the lead still edits from there like any other auto value. Runs
// after any action that can change the task/member count, a member's active flag, or
// its peer reviews, and once on app load, so this stays true regardless of order, and
// also repairs data that predates this behavior. Tasks someone has already hand-edited
// (isFullyAuto false) are normally left alone -- except tasks in `forceTaskIds`, which
// are re-split even if hand-edited. UPDATE_MEMBER passes the set of tasks the member
// being (de)activated actually has a contribution row for, so toggling someone's
// active flag always re-equalizes the tasks that toggle affects, instead of leaving a
// stale share behind on any task the lead had already hand-tuned.
export function syncAutoDistribution(
  tasks: Task[],
  members: TeamMember[],
  contributions: Contribution[],
  peerReviews: PeerReview[] = [],
  forceTaskIds?: Set<string>,
): Contribution[] {
  const activeMembers = members.filter((m) => m.active)
  if (activeMembers.length === 0) return contributions

  let result = contributions
  for (const task of tasks) {
    const taskContributions = result.filter((c) => c.taskId === task.id)
    const isFullyAuto = taskContributions.every((c) => c.isAutoDistributed)
    if (!isFullyAuto && !forceTaskIds?.has(task.id)) continue

    const peerShares = computePeerInformedShares(task.id, activeMembers, peerReviews)
    const equalShares = distributeEqually(activeMembers.length)
    const desired: Contribution[] = activeMembers.map((member, i) => ({
      taskId: task.id,
      memberId: member.id,
      contributionPercent: peerShares ? peerShares.get(member.id) ?? 0 : equalShares[i],
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
      return { ...state, tasks, contributions: syncAutoDistribution(tasks, state.members, state.contributions, state.peerReviews) }
    }

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.payload.id ? action.payload : t)),
      }

    case 'DELETE_TASK': {
      const tasks = state.tasks.filter((t) => t.id !== action.payload.id)
      const contributions = state.contributions.filter((c) => c.taskId !== action.payload.id)
      return { ...state, tasks, contributions: syncAutoDistribution(tasks, state.members, contributions, state.peerReviews) }
    }

    case 'IMPORT_TASKS':
      return {
        ...state,
        tasks: action.payload,
        contributions: syncAutoDistribution(action.payload, state.members, state.contributions, state.peerReviews),
      }

    case 'ADD_MEMBER': {
      const members = [...state.members, action.payload]
      return { ...state, members, contributions: syncAutoDistribution(state.tasks, members, state.contributions, state.peerReviews) }
    }

    case 'UPDATE_MEMBER': {
      const prev = state.members.find((m) => m.id === action.payload.id)
      const members = state.members.map((m) => (m.id === action.payload.id ? action.payload : m))
      const forceTaskIds =
        prev !== undefined && prev.active !== action.payload.active
          ? new Set(state.contributions.filter((c) => c.memberId === action.payload.id).map((c) => c.taskId))
          : undefined
      return {
        ...state,
        members,
        contributions: syncAutoDistribution(state.tasks, members, state.contributions, state.peerReviews, forceTaskIds),
      }
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
        contributions: syncAutoDistribution(state.tasks, members, contributions, state.peerReviews),
      }
    }

    case 'IMPORT_MEMBERS':
      return {
        ...state,
        members: action.payload,
        contributions: syncAutoDistribution(state.tasks, action.payload, state.contributions, state.peerReviews),
      }

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

    case 'SET_CONTRIBUTION_NOTE': {
      const { taskId, memberId, personalGradeNote } = action.payload
      return {
        ...state,
        contributions: upsertContribution(state.contributions, taskId, memberId, { personalGradeNote }),
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

    // 피어리뷰가 바뀌면(추가/수정/삭제/일괄가져오기), 아직 팀장이 손대지
    // 않은(auto 상태인) 과제의 기여도 배분도 그 피어리뷰 평균을 따라
    // 함께 갱신한다 -- "피어리뷰 받으면 그걸로 우선 배분, 팀장이 수정".
    case 'IMPORT_PEER_REVIEWS':
      return {
        ...state,
        peerReviews: action.payload,
        contributions: syncAutoDistribution(state.tasks, state.members, state.contributions, action.payload),
      }

    case 'ADD_PEER_REVIEW': {
      const peerReviews = [...state.peerReviews, action.payload]
      return {
        ...state,
        peerReviews,
        contributions: syncAutoDistribution(state.tasks, state.members, state.contributions, peerReviews),
      }
    }

    case 'UPDATE_PEER_REVIEW': {
      const peerReviews = state.peerReviews.map((r) => (r.id === action.payload.id ? action.payload : r))
      return {
        ...state,
        peerReviews,
        contributions: syncAutoDistribution(state.tasks, state.members, state.contributions, peerReviews),
      }
    }

    case 'DELETE_PEER_REVIEW': {
      const peerReviews = state.peerReviews.filter((r) => r.id !== action.payload.id)
      return {
        ...state,
        peerReviews,
        contributions: syncAutoDistribution(state.tasks, state.members, state.contributions, peerReviews),
      }
    }

    case 'SET_EVALUATION_STATUS':
      return {
        ...state,
        evaluationStatus: { ...state.evaluationStatus, [action.payload.memberId]: action.payload.status },
      }

    case 'SET_ALL_EVALUATION_STATUS': {
      const next = { ...state.evaluationStatus }
      for (const id of action.payload.memberIds) next[id] = action.payload.status
      return { ...state, evaluationStatus: next }
    }

    default:
      return state
  }
}

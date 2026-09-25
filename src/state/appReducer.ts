import { DEFAULT_GRADE_DISTRIBUTION, IMPORTANCE_OPTIONS } from '../types'
import type { MemberTableConfig, AppState, Contribution, RankReview, RankReviewMode, Criteria, EvaluationStatus, Importance, MeetingNote, PeerReview, PerformanceGrade, Task, TaskPeerMethod, TaskPeerReview, TeamMember, WorkBoard } from '../types'
import { createEmptyBoard, detachMember, rematchAssignees } from '../utils/workBoard'

export type AppAction =
  | { type: 'LOAD_STATE'; payload: AppState }
  // 과제관리(L2/L3) 보드는 통째로 교체한다 -- 되돌리기가 스냅샷 방식이라서(utils/workBoard.ts).
  | { type: 'SET_WORK_BOARD'; payload: WorkBoard }
  // 한 평가자의 한 방식 순위 리뷰를 통째로 바꾼다(다시 올리거나 다시 입력하면 덮어씀).
  | { type: 'SET_RANK_REVIEWS'; payload: { reviewerMemberId: string; mode: RankReviewMode; reviews: RankReview[] } }
  | { type: 'DELETE_RANK_REVIEWS'; payload: { reviewerMemberId: string; mode: RankReviewMode } }
  // 과제별 피어리뷰: 한 평가자가 낸 과제들의 리뷰를 통째로 바꾼다(다시 내면 덮어씀).
  | { type: 'SET_TASK_PEER_REVIEWS'; payload: { reviewerMemberId: string; taskIds: string[]; reviews: TaskPeerReview[] } }
  | { type: 'SET_TASK_PEER_METHOD'; payload: { taskIds: string[]; method: TaskPeerMethod } }
  // 과제관리 L3로 평가 과제를 만든다. participants[taskId]에 있는 팀원(L3 담당자)
  // 끼리만 기여도를 똑같이 나누고 나머지는 0 -- 담당자가 없으면 기존 자동 배분.
  | { type: 'ADD_TASKS_FROM_WORK'; payload: { tasks: Task[]; participants: Record<string, string[]> } }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'MERGE_TASKS'; payload: { ids: string[] } }
  | { type: 'SPLIT_TASK'; payload: { id: string; newIds: string[] } }
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
  | { type: 'SET_MEMBER_TABLE'; payload: MemberTableConfig }
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
    workBoard: createEmptyBoard(),
    rankReviews: [],
    taskPeerReviews: [],
    tasks: [],
    members: [],
    contributions: [],
    meetingNotes: [],
    peerReviews: [],
    evaluationStatus: {},
    criteria: {
      performanceGradeWeight: 100,
      taskGradeWeight: 100,
      // 업무량은 쓰지 않는다(과제등급 3단계 + 성과등급으로 평가).
      workloadWeight: 0,
      personalGradeWeight: 0,
      peerReviewWeight: 0,
      contributionWeight: 100,
      gradeDistribution: { ...DEFAULT_GRADE_DISTRIBUTION },
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
      // 팀장이 매기기 전에는 null이다. 예전처럼 'B'를 박아두면 팀장이 한 적
      // 없는 판단이 데이터에 남는다(docs/DATA-MODEL.md).
      personalPerformanceGrade: null,
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
        taskContributions.find((c) => c.memberId === member.id)?.personalPerformanceGrade ?? null,
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

    case 'SET_WORK_BOARD':
      return { ...state, workBoard: action.payload }

    case 'SET_RANK_REVIEWS': {
      const { reviewerMemberId, mode, reviews } = action.payload
      const rest = state.rankReviews.filter((r) => !(r.reviewerMemberId === reviewerMemberId && r.mode === mode))
      return { ...state, rankReviews: [...rest, ...reviews] }
    }

    case 'SET_TASK_PEER_REVIEWS': {
      const { reviewerMemberId, taskIds, reviews } = action.payload
      const tasks = new Set(taskIds)
      const rest = state.taskPeerReviews.filter((r) => !(r.reviewerMemberId === reviewerMemberId && tasks.has(r.taskId)))
      return { ...state, taskPeerReviews: [...rest, ...reviews] }
    }

    case 'SET_TASK_PEER_METHOD': {
      const ids = new Set(action.payload.taskIds)
      return { ...state, tasks: state.tasks.map((t) => (ids.has(t.id) ? { ...t, peerMethod: action.payload.method } : t)) }
    }

    case 'DELETE_RANK_REVIEWS': {
      const { reviewerMemberId, mode } = action.payload
      return { ...state, rankReviews: state.rankReviews.filter((r) => !(r.reviewerMemberId === reviewerMemberId && r.mode === mode)) }
    }

    case 'ADD_TASKS_FROM_WORK': {
      const tasks = [...state.tasks, ...action.payload.tasks]
      const active = state.members.filter((m) => m.active)
      let contributions = state.contributions
      for (const task of action.payload.tasks) {
        const ids = (action.payload.participants[task.id] ?? []).filter((id) => active.some((m) => m.id === id))
        if (ids.length === 0) continue
        const shares = distributeEqually(ids.length)
        // isAutoDistributed를 켜 두면 다음 동기화 때 전원 균등으로 다시 나뉘므로 끈다.
        contributions = [
          ...contributions,
          ...active.map((m) => ({
            taskId: task.id,
            memberId: m.id,
            contributionPercent: ids.includes(m.id) ? shares[ids.indexOf(m.id)] : 0,
            personalPerformanceGrade: null,
            isAutoDistributed: false,
          })),
        ]
      }
      return { ...state, tasks, contributions: syncAutoDistribution(tasks, state.members, contributions, state.peerReviews) }
    }

    case 'ADD_TASK': {
      const tasks = [...state.tasks, action.payload]
      return { ...state, tasks, contributions: syncAutoDistribution(tasks, state.members, state.contributions, state.peerReviews) }
    }

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.payload.id ? action.payload : t)),
      }

    // 평가과제 묶기: 고른 과제들을 첫 과제 하나로 합친다. L3 연결은 모두 모으고, 목표·성과는 다른 내용만 줄을 바꿔 잇는다.
    // 기여도는 어느 과제에든 참여한 팀원끼리 균등으로 다시 나누고(자동 계산 아님 -- 팀장이 고칠 수 있게),
    // 개인등급·근거는 과제 순서대로 먼저 매긴 값을 쓴다. 예전 등급 피어리뷰는 합친 과제로 옮긴다.
    case 'MERGE_TASKS': {
      const picked = state.tasks.filter((t) => action.payload.ids.includes(t.id))
      if (picked.length < 2) return state
      const keep = picked[0]
      const gone = new Set(picked.slice(1).map((t) => t.id))
      const all = new Set(picked.map((t) => t.id))
      const joinDistinct = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean))).join('\n')
      const merged: Task = {
        ...keep,
        workItemIds: Array.from(new Set(picked.flatMap((t) => t.workItemIds ?? []))),
        objective: joinDistinct(picked.map((t) => t.objective)),
        achievement: joinDistinct(picked.map((t) => t.achievement)),
        performanceGrade: keep.performanceGrade ?? picked.find((t) => t.performanceGrade)?.performanceGrade ?? null,
      }
      const tasks = state.tasks.filter((t) => !gone.has(t.id)).map((t) => (t.id === keep.id ? merged : t))
      const old = state.contributions.filter((c) => all.has(c.taskId))
      const order = picked.map((t) => t.id)
      const firstOf = <K extends 'personalPerformanceGrade' | 'personalGradeNote'>(memberId: string, k: K) =>
        old
          .filter((c) => c.memberId === memberId && c[k])
          .sort((a, b) => order.indexOf(a.taskId) - order.indexOf(b.taskId))[0]?.[k]
      const active = state.members.filter((m) => m.active)
      const ids = active.filter((m) => old.some((c) => c.memberId === m.id && c.contributionPercent > 0)).map((m) => m.id)
      const shares = distributeEqually(ids.length)
      const contributions = [
        ...state.contributions.filter((c) => !all.has(c.taskId)),
        ...active.map((m) => ({
          taskId: keep.id,
          memberId: m.id,
          contributionPercent: ids.includes(m.id) ? shares[ids.indexOf(m.id)] : 0,
          personalPerformanceGrade: firstOf(m.id, 'personalPerformanceGrade') ?? null,
          ...(firstOf(m.id, 'personalGradeNote') ? { personalGradeNote: firstOf(m.id, 'personalGradeNote') } : {}),
          isAutoDistributed: false,
        })),
      ]
      const peerReviews = state.peerReviews.map((r) => (r.taskId && gone.has(r.taskId) ? { ...r, taskId: keep.id } : r))
      const taskPeerReviews = state.taskPeerReviews.filter((r) => !gone.has(r.taskId))
      return { ...state, tasks, peerReviews, taskPeerReviews, contributions: syncAutoDistribution(tasks, state.members, contributions, peerReviews) }
    }

    // 평가과제 풀기: 여러 L3가 묶인 과제를 L3 하나당 과제 하나로 나눈다. 원래 과제(등급·목표·기여도 그대로)는
    // 첫 L3 이름으로 남고, 나머지 L3는 과제리스트에서 내보낼 때처럼 새 과제가 된다(담당자끼리 기여도 균등).
    case 'SPLIT_TASK': {
      const task = state.tasks.find((t) => t.id === action.payload.id)
      const items = (task?.workItemIds ?? []).map((id) => state.workBoard.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i)
      if (!task || items.length < 2) return state
      const names = new Set(state.tasks.filter((t) => t.id !== task.id).map((t) => t.name))
      const uniq = (n: string) => {
        let v = n
        for (let k = 2; names.has(v); k++) v = `${n} (${k})`
        names.add(v)
        return v
      }
      const first: Task = { ...task, name: uniq(items[0].name), workItemIds: [items[0].id] }
      const extra: Task[] = items.slice(1).map((it, k) => ({
        id: action.payload.newIds[k],
        name: uniq(it.name),
        importance: it.category && (IMPORTANCE_OPTIONS as string[]).includes(it.category) ? (it.category as Importance) : task.importance,
        performanceGrade: null,
        workload: task.workload,
        objective: '',
        achievement: '',
        workItemIds: [it.id],
      }))
      const at = state.tasks.findIndex((t) => t.id === task.id)
      const tasks = [...state.tasks.slice(0, at), first, ...extra, ...state.tasks.slice(at + 1)]
      const active = state.members.filter((m) => m.active)
      let contributions = state.contributions
      extra.forEach((t, k) => {
        const ids = items[k + 1].assigneeIds.filter((id) => active.some((m) => m.id === id))
        const shares = distributeEqually(ids.length)
        contributions = [
          ...contributions,
          ...active.map((m) => ({
            taskId: t.id,
            memberId: m.id,
            contributionPercent: ids.includes(m.id) ? shares[ids.indexOf(m.id)] : 0,
            personalPerformanceGrade: null,
            isAutoDistributed: ids.length === 0,
          })),
        ]
      })
      return { ...state, tasks, contributions: syncAutoDistribution(tasks, state.members, contributions, state.peerReviews) }
    }

    case 'DELETE_TASK': {
      const tasks = state.tasks.filter((t) => t.id !== action.payload.id)
      const contributions = state.contributions.filter((c) => c.taskId !== action.payload.id)
      const taskPeerReviews = state.taskPeerReviews.filter((r) => r.taskId !== action.payload.id)
      return { ...state, tasks, taskPeerReviews, contributions: syncAutoDistribution(tasks, state.members, contributions, state.peerReviews) }
    }

    case 'IMPORT_TASKS':
      return {
        ...state,
        tasks: action.payload,
        contributions: syncAutoDistribution(action.payload, state.members, state.contributions, state.peerReviews),
      }

    case 'ADD_MEMBER': {
      const members = [...state.members, action.payload]
      return { ...state, members, workBoard: rematchAssignees(state.workBoard, members), contributions: syncAutoDistribution(state.tasks, members, state.contributions, state.peerReviews) }
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
        workBoard: rematchAssignees(state.workBoard, members),
        contributions: syncAutoDistribution(state.tasks, members, state.contributions, state.peerReviews, forceTaskIds),
      }
    }

    case 'DELETE_MEMBER': {
      const members = state.members.filter((m) => m.id !== action.payload.id)
      const contributions = state.contributions.filter((c) => c.memberId !== action.payload.id)
      const meetingNotes = state.meetingNotes.filter((n) => n.memberId !== action.payload.id)
      const peerReviews = state.peerReviews.filter((r) => r.targetMemberId !== action.payload.id)
      const removed = state.members.find((m) => m.id === action.payload.id)
      return {
        ...state,
        rankReviews: state.rankReviews.filter((r) => r.reviewerMemberId !== action.payload.id && r.targetMemberId !== action.payload.id),
        taskPeerReviews: state.taskPeerReviews.filter((r) => r.reviewerMemberId !== action.payload.id && r.targetMemberId !== action.payload.id),
        members,
        workBoard: removed ? detachMember(state.workBoard, removed) : state.workBoard,
        meetingNotes,
        peerReviews,
        contributions: syncAutoDistribution(state.tasks, members, contributions, state.peerReviews),
      }
    }

    case 'IMPORT_MEMBERS':
      return {
        ...state,
        members: action.payload,
        workBoard: rematchAssignees(state.workBoard, action.payload),
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

    case 'SET_MEMBER_TABLE':
      return { ...state, memberTable: action.payload }

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

import type {
  AppState,
  Contribution,
  Criteria,
  EvaluationStatus,
  MeetingActionItem,
  MeetingNote,
  PeerReview,
  PerformanceGrade,
  Task,
  TeamMember,
} from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'

const EVALUATION_STATUS_OPTIONS: EvaluationStatus[] = ['evaluating', 'reviewed', 'confirmed']
function isEvaluationStatus(value: unknown): value is EvaluationStatus {
  return typeof value === 'string' && (EVALUATION_STATUS_OPTIONS as string[]).includes(value)
}

function isPerformanceGrade(value: unknown): value is PerformanceGrade {
  return typeof value === 'string' && (PERFORMANCE_GRADE_OPTIONS as string[]).includes(value)
}

function migrateTask(raw: Record<string, unknown>): Task | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  return {
    id: raw.id,
    name: raw.name,
    importance: raw.importance as Task['importance'],
    performanceGrade: raw.performanceGrade as Task['performanceGrade'],
    workload: raw.workload as Task['workload'],
    objective: typeof raw.objective === 'string' ? raw.objective : '',
    achievement: typeof raw.achievement === 'string' ? raw.achievement : '',
  }
}

function migrateMember(raw: Record<string, unknown>): TeamMember | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  return {
    id: raw.id,
    name: raw.name,
    active: typeof raw.active === 'boolean' ? raw.active : true,
    level: typeof raw.level === 'string' ? (raw.level as TeamMember['level']) : '',
    yearsOfService: typeof raw.yearsOfService === 'number' ? raw.yearsOfService : null,
    role: typeof raw.role === 'string' ? raw.role : '',
    comment: typeof raw.comment === 'string' ? raw.comment : '',
    hireDate: typeof raw.hireDate === 'string' ? raw.hireDate : null,
    currentLevelSince: typeof raw.currentLevelSince === 'string' ? raw.currentLevelSince : null,
    promotionReviewDate: typeof raw.promotionReviewDate === 'string' ? raw.promotionReviewDate : null,
    auxScores:
      raw.auxScores && typeof raw.auxScores === 'object'
        ? (raw.auxScores as TeamMember['auxScores'])
        : null,
  }
}

// Older builds stored contribution as a 0~1 ratio with no personal grade field.
function migrateContribution(raw: Record<string, unknown>): Contribution | null {
  if (typeof raw.taskId !== 'string' || typeof raw.memberId !== 'string') return null

  let contributionPercent: number
  if (typeof raw.contributionPercent === 'number') {
    contributionPercent = raw.contributionPercent
  } else if (typeof raw.contributionRatio === 'number') {
    contributionPercent = raw.contributionRatio * 100
  } else {
    contributionPercent = 0
  }

  // 저장된 등급은 그대로 살리고, 없거나 알 수 없으면 null(미입력)로 둔다.
  // 예전 기본값 'B'로 채우면 팀장이 매긴 적 없는 값이 판단처럼 남는다.
  const personalPerformanceGrade = isPerformanceGrade(raw.personalPerformanceGrade)
    ? raw.personalPerformanceGrade
    : null

  return {
    taskId: raw.taskId,
    memberId: raw.memberId,
    contributionPercent,
    personalPerformanceGrade,
    isAutoDistributed: raw.isAutoDistributed === true,
  }
}

function migrateMeetingAction(raw: Record<string, unknown>): MeetingActionItem | null {
  if (typeof raw.id !== 'string' || typeof raw.content !== 'string') return null
  return {
    id: raw.id,
    content: raw.content,
    dueDate: typeof raw.dueDate === 'string' ? raw.dueDate : '',
    done: raw.done === true,
  }
}

function migrateMeetingNote(raw: Record<string, unknown>): MeetingNote | null {
  if (typeof raw.id !== 'string' || typeof raw.memberId !== 'string') return null
  if (typeof raw.date !== 'string' || typeof raw.comment !== 'string') return null
  const note: MeetingNote = { id: raw.id, memberId: raw.memberId, date: raw.date, comment: raw.comment }
  if (typeof raw.strengths === 'string' && raw.strengths) note.strengths = raw.strengths
  if (typeof raw.improvements === 'string' && raw.improvements) note.improvements = raw.improvements
  if (typeof raw.nextExperience === 'string' && raw.nextExperience) note.nextExperience = raw.nextExperience
  if (typeof raw.careerInterest === 'string' && raw.careerInterest) note.careerInterest = raw.careerInterest
  if (Array.isArray(raw.actions)) {
    const actions = (raw.actions as Record<string, unknown>[])
      .map(migrateMeetingAction)
      .filter((a): a is MeetingActionItem => a !== null)
    if (actions.length > 0) note.actions = actions
  }
  return note
}

// taskId/reviewerMemberId/contributionPercent/comment는 전부 선택 필드라
// "예전 데이터"(과제 연결 없이 엑셀로 올렸던 시절)는 원래도 없을 수 있다.
// 이 함수가 그 필드들을 무조건 비워버리면(과거에 실제로 그랬다) 매번 앱을
// 새로고침할 때마다 방금 올린 최신 데이터(taskId 있음)까지 전부 "과제
// 미상(예전 데이터)"으로 깎여나간다 -- raw에 있으면 그대로 보존해야 한다.
function migratePeerReview(raw: Record<string, unknown>): PeerReview | null {
  if (typeof raw.id !== 'string' || typeof raw.reviewerName !== 'string') return null
  if (typeof raw.targetMemberId !== 'string' || !isPerformanceGrade(raw.grade)) return null
  const review: PeerReview = { id: raw.id, reviewerName: raw.reviewerName, targetMemberId: raw.targetMemberId, grade: raw.grade }
  if (typeof raw.taskId === 'string') review.taskId = raw.taskId
  if (typeof raw.reviewerMemberId === 'string') review.reviewerMemberId = raw.reviewerMemberId
  if (typeof raw.contributionPercent === 'number') review.contributionPercent = raw.contributionPercent
  if (typeof raw.comment === 'string') review.comment = raw.comment
  return review
}

// Criteria used to be plain on/off booleans; now each is a 0-100 reflection
// ratio. Reads the new numeric field if present, else falls back to the old
// boolean (true/false -> 100/0) so existing saved data keeps working, else
// the given default.
function resolveWeight(newValue: unknown, oldValue: unknown, defaultWeight: number): number {
  if (typeof newValue === 'number') return Math.max(0, Math.min(100, newValue))
  if (typeof oldValue === 'boolean') return oldValue ? 100 : 0
  return defaultWeight
}

function migrateCriteria(raw: unknown): Criteria {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    performanceGradeWeight: resolveWeight(r.performanceGradeWeight, r.usePerformanceGrade, 100),
    taskGradeWeight: resolveWeight(r.taskGradeWeight, r.useImportance, 100),
    workloadWeight: resolveWeight(r.workloadWeight, r.useWorkload, 100),
    personalGradeWeight: resolveWeight(r.personalGradeWeight, r.usePersonalPerformanceGrade, 0),
    peerReviewWeight: resolveWeight(r.peerReviewWeight, r.usePeerReview, 0),
    contributionWeight: resolveWeight(r.contributionWeight, undefined, 100),
  }
}

// The old `createSampleData()` fixture (removed) hardcoded a real team's
// name/task info and shipped as the default state to every browser that had
// never touched localStorage. Browsers that opened the app before the fix
// and never edited anything still have that exact fixture saved. Detect it
// by name/field fingerprint (ignoring random ids) and treat it as if the
// user never entered anything, so it resets to a clean empty state instead
// of continuing to show someone else's real data.
const LEGACY_SAMPLE_TASKS = [
  { name: 'CloudX', importance: '중점', performanceGrade: 'A', workload: '대' },
  { name: 'Design System', importance: '핵심', performanceGrade: 'S', workload: '중' },
  { name: 'OneClick', importance: '일반', performanceGrade: 'B', workload: '소' },
]
const LEGACY_SAMPLE_MEMBERS = [
  { name: '김기정', level: '과장', yearsOfService: 7, role: '기획' },
  { name: '이혜원', level: '대리', yearsOfService: 4, role: '디자인' },
  { name: '서승우', level: '사원', yearsOfService: 2, role: '개발' },
]
const LEGACY_SAMPLE_CONTRIBUTIONS: Record<string, [number, PerformanceGrade]> = {
  'CloudX|김기정': [50, 'A'],
  'CloudX|이혜원': [30, 'B'],
  'CloudX|서승우': [20, 'B'],
  'Design System|김기정': [20, 'B'],
  'Design System|이혜원': [50, 'S'],
  'Design System|서승우': [30, 'A'],
  'OneClick|김기정': [30, 'B'],
  'OneClick|이혜원': [30, 'B'],
  'OneClick|서승우': [40, 'A'],
}

export function isUntouchedLegacySample(state: AppState): boolean {
  if (state.meetingNotes.length > 0 || state.peerReviews.length > 0) return false
  if (state.tasks.length !== LEGACY_SAMPLE_TASKS.length) return false
  if (state.members.length !== LEGACY_SAMPLE_MEMBERS.length) return false
  if (state.contributions.length !== Object.keys(LEGACY_SAMPLE_CONTRIBUTIONS).length) return false

  const tasksMatch = LEGACY_SAMPLE_TASKS.every((fixture) =>
    state.tasks.some(
      (t) =>
        t.name === fixture.name &&
        t.importance === fixture.importance &&
        t.performanceGrade === fixture.performanceGrade &&
        t.workload === fixture.workload,
    ),
  )
  if (!tasksMatch) return false

  const membersMatch = LEGACY_SAMPLE_MEMBERS.every((fixture) =>
    state.members.some(
      (m) =>
        m.name === fixture.name &&
        m.level === fixture.level &&
        m.yearsOfService === fixture.yearsOfService &&
        m.role === fixture.role,
    ),
  )
  if (!membersMatch) return false

  const taskNameById = new Map(state.tasks.map((t) => [t.id, t.name]))
  const memberNameById = new Map(state.members.map((m) => [m.id, m.name]))
  return state.contributions.every((c) => {
    const key = `${taskNameById.get(c.taskId)}|${memberNameById.get(c.memberId)}`
    const fixture = LEGACY_SAMPLE_CONTRIBUTIONS[key]
    return fixture && fixture[0] === c.contributionPercent && fixture[1] === c.personalPerformanceGrade
  })
}

export function migrateAppState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.tasks) || !Array.isArray(r.members)) return null

  const tasks = (r.tasks as Record<string, unknown>[])
    .map(migrateTask)
    .filter((t): t is Task => t !== null)
  const members = (r.members as Record<string, unknown>[])
    .map(migrateMember)
    .filter((m): m is TeamMember => m !== null)
  const contributions = Array.isArray(r.contributions)
    ? (r.contributions as Record<string, unknown>[])
        .map(migrateContribution)
        .filter((c): c is Contribution => c !== null)
    : []
  const criteria = migrateCriteria(r.criteria)
  const meetingNotes = Array.isArray(r.meetingNotes)
    ? (r.meetingNotes as Record<string, unknown>[])
        .map(migrateMeetingNote)
        .filter((n): n is MeetingNote => n !== null)
    : []
  const peerReviews = Array.isArray(r.peerReviews)
    ? (r.peerReviews as Record<string, unknown>[])
        .map(migratePeerReview)
        .filter((p): p is PeerReview => p !== null)
    : []

  const rawStatus = (r.evaluationStatus ?? {}) as Record<string, unknown>
  const evaluationStatus: Record<string, EvaluationStatus> = {}
  for (const member of members) {
    const value = rawStatus[member.id]
    if (isEvaluationStatus(value)) evaluationStatus[member.id] = value
  }

  return { tasks, members, contributions, criteria, meetingNotes, peerReviews, evaluationStatus }
}

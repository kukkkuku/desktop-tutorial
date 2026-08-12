import type { AppState, Contribution, Criteria, MeetingNote, PeerReview, PerformanceGrade, Task, TeamMember } from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'

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
    position: typeof raw.position === 'string' ? (raw.position as TeamMember['position']) : '',
    level: typeof raw.level === 'string' ? (raw.level as TeamMember['level']) : '',
    yearsOfService: typeof raw.yearsOfService === 'number' ? raw.yearsOfService : null,
    role: typeof raw.role === 'string' ? raw.role : '',
    comment: typeof raw.comment === 'string' ? raw.comment : '',
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

  const personalPerformanceGrade = isPerformanceGrade(raw.personalPerformanceGrade)
    ? raw.personalPerformanceGrade
    : 'B'

  return {
    taskId: raw.taskId,
    memberId: raw.memberId,
    contributionPercent,
    personalPerformanceGrade,
    isAutoDistributed: raw.isAutoDistributed === true,
  }
}

function migrateMeetingNote(raw: Record<string, unknown>): MeetingNote | null {
  if (typeof raw.id !== 'string' || typeof raw.memberId !== 'string') return null
  if (typeof raw.date !== 'string' || typeof raw.comment !== 'string') return null
  return { id: raw.id, memberId: raw.memberId, date: raw.date, comment: raw.comment }
}

function migratePeerReview(raw: Record<string, unknown>): PeerReview | null {
  if (typeof raw.id !== 'string' || typeof raw.reviewerName !== 'string') return null
  if (typeof raw.targetMemberId !== 'string' || !isPerformanceGrade(raw.grade)) return null
  return { id: raw.id, reviewerName: raw.reviewerName, targetMemberId: raw.targetMemberId, grade: raw.grade }
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
  }
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

  return { tasks, members, contributions, criteria, meetingNotes, peerReviews }
}

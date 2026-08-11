import type { AppState, Contribution, Criteria, PerformanceGrade, Task, TeamMember } from '../types'
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
  }
}

function migrateCriteria(raw: unknown): Criteria {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    usePerformanceGrade: typeof r.usePerformanceGrade === 'boolean' ? r.usePerformanceGrade : true,
    useImportance: typeof r.useImportance === 'boolean' ? r.useImportance : true,
    useWorkload: typeof r.useWorkload === 'boolean' ? r.useWorkload : true,
    usePersonalPerformanceGrade:
      typeof r.usePersonalPerformanceGrade === 'boolean' ? r.usePersonalPerformanceGrade : false,
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

  return { tasks, members, contributions, criteria }
}

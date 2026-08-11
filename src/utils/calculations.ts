import type {
  Contribution,
  Criteria,
  EvaluationGrade,
  Importance,
  PerformanceGrade,
  Task,
  TeamMember,
  Workload,
} from '../types'

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  중점: 1.3,
  핵심: 1.15,
  일반: 1.0,
  지원: 0.88,
}

export const PERFORMANCE_SCORE: Record<PerformanceGrade, number> = {
  S: 100,
  A: 90,
  B: 80,
  C: 70,
  D: 60,
}

export const WORKLOAD_FACTOR: Record<Workload, number> = {
  대: 1.2,
  중: 1.0,
  소: 0.8,
}

export const CONTRIBUTION_TOLERANCE = 0.0001

export function calcTaskScore(task: Task, criteria: Criteria): number {
  const performanceScore = criteria.usePerformanceGrade
    ? PERFORMANCE_SCORE[task.performanceGrade]
    : PERFORMANCE_SCORE.S
  const importanceWeight = criteria.useImportance ? IMPORTANCE_WEIGHT[task.importance] : 1.0
  const workloadFactor = criteria.useWorkload ? WORKLOAD_FACTOR[task.workload] : 1.0
  return performanceScore * importanceWeight * workloadFactor
}

export interface TaskScoreRow {
  task: Task
  score: number
}

export function calcAllTaskScores(tasks: Task[], criteria: Criteria): TaskScoreRow[] {
  return tasks.map((task) => ({ task, score: calcTaskScore(task, criteria) }))
}

export function getContributionRatio(
  contributions: Contribution[],
  taskId: string,
  memberId: string,
): number {
  const found = contributions.find((c) => c.taskId === taskId && c.memberId === memberId)
  return found ? found.contributionRatio : 0
}

export function getTaskContributionSum(contributions: Contribution[], taskId: string): number {
  return contributions
    .filter((c) => c.taskId === taskId)
    .reduce((sum, c) => sum + c.contributionRatio, 0)
}

export function isContributionSumValid(sum: number): boolean {
  return Math.abs(sum - 1.0) <= CONTRIBUTION_TOLERANCE
}

export interface MemberResultRow {
  member: TeamMember
  cumulativeScore: number
  expectedScore: number
  ratio: number
  grade: EvaluationGrade
}

export function calcExpectedScore(taskScores: TaskScoreRow[]): number {
  if (taskScores.length === 0) return 0
  const total = taskScores.reduce((sum, row) => sum + row.score, 0)
  return total / taskScores.length
}

export function calcMemberCumulativeScore(
  member: TeamMember,
  taskScores: TaskScoreRow[],
  contributions: Contribution[],
): number {
  return taskScores.reduce((sum, row) => {
    const ratio = getContributionRatio(contributions, row.task.id, member.id)
    return sum + row.score * ratio
  }, 0)
}

export function calcEvaluationGrade(ratio: number): EvaluationGrade {
  if (ratio >= 1.2) return 'S'
  if (ratio >= 1.0) return 'A'
  if (ratio >= 0.8) return 'B'
  if (ratio >= 0.6) return 'C'
  return 'D'
}

export function calcMemberResults(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
): MemberResultRow[] {
  const taskScores = calcAllTaskScores(tasks, criteria)
  const expectedScore = calcExpectedScore(taskScores)

  return members
    .filter((m) => m.active)
    .map((member) => {
      const cumulativeScore = calcMemberCumulativeScore(member, taskScores, contributions)
      const ratio = expectedScore > 0 ? cumulativeScore / expectedScore : 0
      return {
        member,
        cumulativeScore,
        expectedScore,
        ratio,
        grade: calcEvaluationGrade(ratio),
      }
    })
}

export const GRADE_COLORS: Record<EvaluationGrade, string> = {
  S: 'text-blue-600 bg-blue-50',
  A: 'text-green-600 bg-green-50',
  B: 'text-yellow-600 bg-yellow-50',
  C: 'text-orange-600 bg-orange-50',
  D: 'text-red-600 bg-red-50',
}

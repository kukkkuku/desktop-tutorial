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

export const PERSONAL_GRADE_FACTOR: Record<PerformanceGrade, number> = {
  S: 1.5,
  A: 1.2,
  B: 1.0,
  C: 0.8,
  D: 0.6,
}

export const CONTRIBUTION_TOLERANCE = 0.01

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

export function getContribution(
  contributions: Contribution[],
  taskId: string,
  memberId: string,
): Contribution | undefined {
  return contributions.find((c) => c.taskId === taskId && c.memberId === memberId)
}

export function getContributionPercent(
  contributions: Contribution[],
  taskId: string,
  memberId: string,
): number {
  return getContribution(contributions, taskId, memberId)?.contributionPercent ?? 0
}

export function getPersonalPerformanceGrade(
  contributions: Contribution[],
  taskId: string,
  memberId: string,
): PerformanceGrade {
  return getContribution(contributions, taskId, memberId)?.personalPerformanceGrade ?? 'B'
}

export function getTaskContributionSum(contributions: Contribution[], taskId: string): number {
  return contributions
    .filter((c) => c.taskId === taskId)
    .reduce((sum, c) => sum + c.contributionPercent, 0)
}

export function isContributionSumValid(sum: number): boolean {
  return Math.abs(sum - 100) <= CONTRIBUTION_TOLERANCE
}

export interface MemberResultRow {
  member: TeamMember
  participatedTaskCount: number
  cumulativeScore: number
  weightedAverageScore: number
  expectedScore: number
  ratio: number
  grade: EvaluationGrade
}

export function calcExpectedScore(taskScores: TaskScoreRow[]): number {
  if (taskScores.length === 0) return 0
  const total = taskScores.reduce((sum, row) => sum + row.score, 0)
  return total / taskScores.length
}

export function calcPersonalGradeFactor(
  contribution: Contribution | undefined,
  criteria: Criteria,
): number {
  if (!criteria.usePersonalPerformanceGrade || !contribution) return 1.0
  return PERSONAL_GRADE_FACTOR[contribution.personalPerformanceGrade]
}

export function calcMemberCumulativeScore(
  member: TeamMember,
  taskScores: TaskScoreRow[],
  contributions: Contribution[],
  criteria: Criteria,
): number {
  return taskScores.reduce((sum, row) => {
    const contribution = getContribution(contributions, row.task.id, member.id)
    const percent = contribution?.contributionPercent ?? 0
    const personalFactor = calcPersonalGradeFactor(contribution, criteria)
    return sum + row.score * (percent / 100) * personalFactor
  }, 0)
}

export function calcMemberParticipation(
  member: TeamMember,
  tasks: Task[],
  contributions: Contribution[],
): { count: number; totalShare: number } {
  let count = 0
  let totalShare = 0
  for (const task of tasks) {
    const percent = getContributionPercent(contributions, task.id, member.id)
    if (percent > 0) {
      count += 1
      totalShare += percent / 100
    }
  }
  return { count, totalShare }
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

  const rows = members
    .filter((m) => m.active)
    .map((member) => {
      const cumulativeScore = calcMemberCumulativeScore(member, taskScores, contributions, criteria)
      const { count, totalShare } = calcMemberParticipation(member, tasks, contributions)
      const weightedAverageScore = totalShare > 0 ? cumulativeScore / totalShare : 0
      const ratio = expectedScore > 0 ? cumulativeScore / expectedScore : 0
      return {
        member,
        participatedTaskCount: count,
        cumulativeScore,
        weightedAverageScore,
        expectedScore,
        ratio,
        grade: calcEvaluationGrade(ratio),
      }
    })

  return rows.sort((a, b) => b.weightedAverageScore - a.weightedAverageScore)
}

export const GRADE_COLORS: Record<EvaluationGrade, string> = {
  S: 'text-blue-600 bg-blue-50',
  A: 'text-green-600 bg-green-50',
  B: 'text-yellow-600 bg-yellow-50',
  C: 'text-orange-600 bg-orange-50',
  D: 'text-red-600 bg-red-50',
}

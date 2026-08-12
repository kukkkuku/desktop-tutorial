import type {
  Contribution,
  Criteria,
  EvaluationGrade,
  Importance,
  PeerReview,
  PerformanceGrade,
  Task,
  TeamMember,
  Workload,
} from '../types'

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  중점: 1.3,
  핵심: 1.1,
  일반: 1.0,
  지원: 0.8,
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

// Blends a criterion's actual effect toward its neutral (no-effect) value by
// (100 - weightPercent)%, so a 0-100 "반영 비율" slider can dial a factor's
// influence down smoothly instead of only being fully on or fully off.
export function blendByWeight(neutral: number, actual: number, weightPercent: number): number {
  const ratio = Math.max(0, Math.min(100, weightPercent)) / 100
  return neutral + (actual - neutral) * ratio
}

export function calcTaskScore(task: Task, criteria: Criteria): number {
  const performanceScore = blendByWeight(
    PERFORMANCE_SCORE.S,
    PERFORMANCE_SCORE[task.performanceGrade],
    criteria.performanceGradeWeight,
  )
  const importanceWeight = blendByWeight(1.0, IMPORTANCE_WEIGHT[task.importance], criteria.taskGradeWeight)
  const workloadFactor = blendByWeight(1.0, WORKLOAD_FACTOR[task.workload], criteria.workloadWeight)
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

// The evaluation ratio is peer-relative: "expected" means "what an average
// teammate scored," not a fixed single-task solo-completion baseline. A
// fixed baseline breaks down as soon as a task's 100% is split across
// multiple people (the normal case here) -- everyone's ratio then caps out
// well under 1.0 regardless of how well they actually did, because no one
// individually earns a whole task's score. Comparing to the team's own
// average keeps ratio 1.0 meaning "average performer" no matter the team
// size or how many tasks exist.
export function calcExpectedScore(cumulativeScores: number[]): number {
  if (cumulativeScores.length === 0) return 0
  const total = cumulativeScores.reduce((sum, score) => sum + score, 0)
  return total / cumulativeScores.length
}

export function calcPersonalGradeFactor(
  contribution: Contribution | undefined,
  criteria: Criteria,
): number {
  if (!contribution) return 1.0
  return blendByWeight(1.0, PERSONAL_GRADE_FACTOR[contribution.personalPerformanceGrade], criteria.personalGradeWeight)
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

export function calcPeerReviewFactor(
  peerReviews: PeerReview[],
  memberId: string,
  criteria: Criteria,
): number {
  const received = peerReviews.filter((r) => r.targetMemberId === memberId)
  if (received.length === 0) return 1.0
  const avgScore = received.reduce((sum, r) => sum + PERFORMANCE_SCORE[r.grade], 0) / received.length
  return blendByWeight(1.0, avgScore / 100, criteria.peerReviewWeight)
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
  peerReviews: PeerReview[] = [],
): MemberResultRow[] {
  const taskScores = calcAllTaskScores(tasks, criteria)

  const withCumulativeScore = members
    .filter((m) => m.active)
    .map((member) => {
      const rawCumulativeScore = calcMemberCumulativeScore(member, taskScores, contributions, criteria)
      const peerReviewFactor = calcPeerReviewFactor(peerReviews, member.id, criteria)
      const cumulativeScore = rawCumulativeScore * peerReviewFactor
      const { count, totalShare } = calcMemberParticipation(member, tasks, contributions)
      return { member, cumulativeScore, participatedTaskCount: count, totalShare }
    })

  const expectedScore = calcExpectedScore(withCumulativeScore.map((r) => r.cumulativeScore))

  const rows = withCumulativeScore.map(({ member, cumulativeScore, participatedTaskCount, totalShare }) => {
    const weightedAverageScore = totalShare > 0 ? cumulativeScore / totalShare : 0
    const ratio = expectedScore > 0 ? cumulativeScore / expectedScore : 0
    return {
      member,
      participatedTaskCount,
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

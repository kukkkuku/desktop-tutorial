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

// Task-grade score, on the same 0-100+ point scale as PERFORMANCE_SCORE
// (100 = neutral/no-effect), rather than a raw multiplier — easier to read
// at a glance than a "1.3배" style factor.
export const IMPORTANCE_SCORE: Record<Importance, number> = {
  중점: 130,
  핵심: 110,
  일반: 100,
  지원: 80,
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
  const importanceWeight = blendByWeight(100, IMPORTANCE_SCORE[task.importance], criteria.taskGradeWeight) / 100
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

// The contribution % entered per task/member always has to sum to 100 across
// that task's participants (enforced in the matrix), so blending each
// participant's share toward an equal split preserves that sum exactly:
// blend(equalShare, actual, w) summed over participants = 100 regardless of
// w, since sum(actual) = 100 and sum(equalShare) = participantCount*equalShare = 100.
export function getEffectiveContributionPercent(
  contributions: Contribution[],
  taskId: string,
  memberId: string,
  contributionWeight: number,
): number {
  const actual = getContributionPercent(contributions, taskId, memberId)
  if (actual <= 0) return 0
  const participantCount = contributions.filter((c) => c.taskId === taskId && c.contributionPercent > 0).length
  const equalShare = participantCount > 0 ? 100 / participantCount : 0
  return blendByWeight(equalShare, actual, contributionWeight)
}

export function getPersonalPerformanceGrade(
  contributions: Contribution[],
  taskId: string,
  memberId: string,
): PerformanceGrade {
  return getContribution(contributions, taskId, memberId)?.personalPerformanceGrade ?? 'B'
}

export function getTaskContributionSum(
  contributions: Contribution[],
  taskId: string,
  activeMemberIds?: Set<string>,
): number {
  return contributions
    .filter((c) => c.taskId === taskId && (!activeMemberIds || activeMemberIds.has(c.memberId)))
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
    const percent = getEffectiveContributionPercent(contributions, row.task.id, member.id, criteria.contributionWeight)
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

// Same as calcMemberParticipation but sums effective (contribution-weight-
// blended) share instead of raw entered %, so weightedAverageScore divides
// by the same basis calcMemberCumulativeScore was built on.
function calcMemberEffectiveParticipation(
  member: TeamMember,
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
): { count: number; totalShare: number } {
  let count = 0
  let totalShare = 0
  for (const task of tasks) {
    const percent = getContributionPercent(contributions, task.id, member.id)
    if (percent > 0) {
      count += 1
      const effective = getEffectiveContributionPercent(contributions, task.id, member.id, criteria.contributionWeight)
      totalShare += effective / 100
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
      const { count, totalShare } = calcMemberEffectiveParticipation(member, tasks, contributions, criteria)
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

  // ratio (and therefore grade) is cumulativeScore divided by the same
  // expectedScore for everyone, so sorting by cumulativeScore keeps rank
  // order consistent with grade order. weightedAverageScore is kept as a
  // supplementary, workload-normalized figure but does not drive the sort.
  return rows.sort((a, b) => b.cumulativeScore - a.cumulativeScore)
}

// ---------- 피어리뷰 영향도 ----------
// "피어리뷰가 이번 평가를 실제로 얼마나 움직였는가"를 답하기 위한 계산.
//
// calcPeerReviewFactor가 돌려주는 개인 계수(예: 1.032 = +3.2%)를 그대로
// 보여주는 것은 의미가 없다 -- 등급은 절대 점수가 아니라 팀 평균(expectedScore)
// 대비 비율로 정해지므로, 전원이 똑같이 +3%를 받으면 평균도 같이 올라가 등급은
// 하나도 안 바뀐다. 실제 영향은 "피어리뷰를 빼고 계산했을 때와 무엇이 달라지는가"
// 뿐이라, 같은 계산을 peerReviews 없이 한 번 더 돌려 두 결과를 비교한다.
export interface PeerReviewImpactRow {
  member: TeamMember
  reviewCount: number
  gradeWithout: EvaluationGrade
  gradeWith: EvaluationGrade
  ratioWithout: number
  ratioWith: number
  // 등급 경계를 넘지 않았더라도 팀 평균 대비 비율이 어느 방향으로 얼마나
  // 움직였는지는 보여준다.
  ratioDeltaPercent: number
}

export interface PeerReviewImpact {
  rows: PeerReviewImpactRow[]
  // 등급 자체가 바뀐 팀원. 이 화면의 헤드라인이다.
  changed: PeerReviewImpactRow[]
  // 리뷰를 한 건도 못 받아 동료 의견이 반영되지 않은 팀원.
  membersWithoutReviews: TeamMember[]
  reviewCount: number
  weightPercent: number
}

export function calcPeerReviewImpact(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  peerReviews: PeerReview[],
): PeerReviewImpact {
  const withReviews = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const withoutReviews = calcMemberResults(members, tasks, contributions, criteria, [])
  const withoutById = new Map(withoutReviews.map((r) => [r.member.id, r]))

  const rows: PeerReviewImpactRow[] = withReviews.map((row) => {
    const base = withoutById.get(row.member.id)
    const ratioWithout = base?.ratio ?? row.ratio
    return {
      member: row.member,
      reviewCount: peerReviews.filter((r) => r.targetMemberId === row.member.id).length,
      gradeWithout: base?.grade ?? row.grade,
      gradeWith: row.grade,
      ratioWithout,
      ratioWith: row.ratio,
      ratioDeltaPercent: ratioWithout > 0 ? ((row.ratio - ratioWithout) / ratioWithout) * 100 : 0,
    }
  })

  return {
    rows,
    changed: rows.filter((r) => r.gradeWith !== r.gradeWithout),
    membersWithoutReviews: rows.filter((r) => r.reviewCount === 0).map((r) => r.member),
    reviewCount: peerReviews.length,
    weightPercent: criteria.peerReviewWeight,
  }
}

export const GRADE_COLORS: Record<EvaluationGrade, string> = {
  S: 'text-blue-600 bg-blue-50',
  A: 'text-green-600 bg-green-50',
  B: 'text-yellow-600 bg-yellow-50',
  C: 'text-orange-600 bg-orange-50',
  D: 'text-red-600 bg-red-50',
}

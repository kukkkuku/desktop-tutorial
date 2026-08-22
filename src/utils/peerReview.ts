import type { PeerReview, PerformanceGrade } from '../types'

const GRADE_SCORE: Record<PerformanceGrade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }
const SCORE_GRADE: PerformanceGrade[] = ['D', 'C', 'B', 'A', 'S']

export interface PeerReviewSummary {
  peerContribution: number | null
  selfContribution: number | null
  recommendedGrade: PerformanceGrade | null
  selfGrade: PerformanceGrade | null
  peerGradeCounts: Partial<Record<PerformanceGrade, number>>
  peerCount: number
  evidenceCount: number
  peerEvidence: PeerReview[]
  selfEvidence: PeerReview[]
}

export function summarizePeerReviews(reviews: PeerReview[], taskId: string, targetMemberId: string): PeerReviewSummary {
  const target = reviews.filter((review) => review.taskId === taskId && review.targetMemberId === targetMemberId)
  const self = target.filter((review) => review.reviewerMemberId === targetMemberId)
  const peers = target.filter((review) => review.reviewerMemberId !== targetMemberId)
  const peerContributions = peers.flatMap((review) => review.contributionPercent === null ? [] : [review.contributionPercent])
  const selfContributions = self.flatMap((review) => review.contributionPercent === null ? [] : [review.contributionPercent])
  const peerGrades = peers.flatMap((review) => review.grade ? [review.grade] : [])
  const selfGrades = self.flatMap((review) => review.grade ? [review.grade] : [])
  const peerGradeCounts: Partial<Record<PerformanceGrade, number>> = {}
  peerGrades.forEach((grade) => { peerGradeCounts[grade] = (peerGradeCounts[grade] ?? 0) + 1 })
  const gradeScore = peerGrades.length ? peerGrades.reduce((sum, grade) => sum + GRADE_SCORE[grade], 0) / peerGrades.length : null
  return {
    peerContribution: peerContributions.length ? Math.round(peerContributions.reduce((sum, value) => sum + value, 0) / peerContributions.length) : null,
    selfContribution: selfContributions.length ? Math.round(selfContributions.reduce((sum, value) => sum + value, 0) / selfContributions.length) : null,
    recommendedGrade: gradeScore === null ? null : SCORE_GRADE[Math.max(0, Math.min(4, Math.round(gradeScore) - 1))],
    selfGrade: selfGrades[0] ?? null,
    peerGradeCounts,
    peerCount: new Set(peers.map((review) => review.reviewerMemberId || review.reviewerName)).size,
    evidenceCount: target.filter((review) => review.evidence.trim()).length,
    peerEvidence: peers.filter((review) => review.evidence.trim()),
    selfEvidence: self.filter((review) => review.evidence.trim()),
  }
}

export function mergePeerReviews(existing: PeerReview[], incoming: PeerReview[]) {
  const map = new Map(existing.map((review) => [`${review.taskId}::${review.reviewerMemberId || review.reviewerName}::${review.targetMemberId}`, review]))
  incoming.forEach((review) => map.set(`${review.taskId}::${review.reviewerMemberId || review.reviewerName}::${review.targetMemberId}`, review))
  return Array.from(map.values())
}

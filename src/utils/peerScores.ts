// 새 피어리뷰(단순 순위·과제별 순위/기여도)를 점수 계산에 넣기 위한 변환.
// 예전 등급 리뷰와 같은 척도(PERFORMANCE_SCORE: S 100 … D 60)로 바꿔서
// calcPeerReviewFactor가 한꺼번에 평균 낸다(docs/DATA-MODEL.md "피어리뷰 점수 반영").
//
// 규칙
//  - 순위 → 상대 위치 p = (순위-1)/(인원-1), 점수 = 100 - 40p (1위 100 = S급, 꼴찌 60 = D급)
//  - 기여도 → 그 과제·그 평가자 안에서 많이 받은 순서를 순위로 보고 같은 식(같은 값은 평균 순위)
//  - 본인이 본인에게 준 값은 점수에서 뺀다(목록 크기 계산에는 포함)
//  - 비교 대상이 없으면(인원 1) 뺀다
//  - 과제별 리뷰는 지금 정해진 방식(Task.peerMethod)으로 받은 것만 센다

import type { AppState, PeerReview, TaskPeerReview } from '../types'
import type { PeerScore } from './calculations'

export function rankToScore(rank: number, size: number): number | null {
  if (size < 2) return null
  const p = (rank - 1) / (size - 1)
  return 100 - 40 * Math.max(0, Math.min(1, p))
}

// 값이 클수록 높은 순위(기여도). 같은 값은 평균 순위.
function averageRanks(values: { id: string; v: number }[]): Map<string, number> {
  const sorted = [...values].sort((a, b) => b.v - a.v)
  const out = new Map<string, number>()
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++
    const avg = (i + 1 + (j + 1)) / 2
    for (let k = i; k <= j; k++) out.set(sorted[k].id, avg)
    i = j + 1
  }
  return out
}

export function derivedPeerScores(state: Pick<AppState, 'rankReviews' | 'taskPeerReviews' | 'tasks'>): PeerScore[] {
  const out: PeerScore[] = []
  for (const r of state.rankReviews) {
    if (r.reviewerMemberId === r.targetMemberId) continue
    const score = rankToScore(r.rank, r.groupSize)
    if (score !== null) out.push({ targetMemberId: r.targetMemberId, score, source: 'rank' })
  }
  const methodOf = new Map(state.tasks.map((t) => [t.id, t.peerMethod ?? 'contribution']))
  const groups = new Map<string, TaskPeerReview[]>()
  for (const r of state.taskPeerReviews) {
    if (methodOf.get(r.taskId) !== r.method) continue
    const k = `${r.taskId}|${r.reviewerMemberId}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const list of groups.values()) {
    const size = list.length
    const ranks = list[0].method === 'contribution' ? averageRanks(list.map((r) => ({ id: r.targetMemberId, v: r.value }))) : null
    for (const r of list) {
      if (r.reviewerMemberId === r.targetMemberId) continue
      const rank = ranks ? ranks.get(r.targetMemberId)! : r.value
      const score = rankToScore(rank, size)
      if (score !== null) out.push({ targetMemberId: r.targetMemberId, score, source: 'task' })
    }
  }
  return out
}

// 점수 계산에 넘기는 피어리뷰 전체(예전 등급 리뷰 + 새 리뷰 변환값)
export function peerInputsOf(state: Pick<AppState, 'peerReviews' | 'rankReviews' | 'taskPeerReviews' | 'tasks'>): (PeerReview | PeerScore)[] {
  return [...state.peerReviews, ...derivedPeerScores(state)]
}

import type { PeerReview, PerformanceGrade } from '../types'
import { PERFORMANCE_SCORE } from './calculations'

// 과제 하나에 달린 동료 리뷰들을 사람이 읽는 문장으로 바꾼다.
//
// 표를 그려주는 것만으로는 부족하다 -- 리뷰어 5줄을 눈으로 훑어야 "이서연만
// D를 줬네", "기여도 합이 97%네"가 나온다. 그건 사람이 아니라 앱이 할 일이다.
// 숫자는 문장 안에 근거로만 넣고, 판단(이견 없음/갈림/한쪽만 다름)은 여기서
// 내려서 준다.
//
// 규칙 기반이라 뻔해지기 쉬우므로, 데이터에서 실제로 나온 것만 말한다 --
// 해당하는 상황이 없으면 그 문장은 아예 만들지 않는다(빈 배열이 정상이다).

const GRADE_ORDER: PerformanceGrade[] = ['S', 'A', 'B', 'C', 'D']

export interface TaskReviewSummary {
  // 등급에 대한 판단 한 문장.
  gradeLine: string | null
  // 튄 평가를 남긴 사람의 근거(있을 때만).
  outlierComment: { reviewerName: string; comment: string; unique: boolean } | null
  // 기여도에 대한 문장(볼 것이 있을 때만).
  contributionLine: string | null
  // 합계가 100%에서 벗어난 정도. 0이면 정상.
  contributionSumGap: number
}

function gradeIndex(g: PerformanceGrade): number {
  return GRADE_ORDER.indexOf(g)
}

// 코멘트에서 의미 있는 낱말만 남긴다 -- 다른 리뷰어도 같은 말을 했는지
// 보려는 것이므로, 조사·일반동사까지 정확히 다룰 필요는 없고 2글자 이상
// 토큰이 겹치는지만 본다.
function keywords(text: string): Set<string> {
  return new Set(
    text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2),
  )
}

export function summarizeTaskReviews(reviews: PeerReview[]): TaskReviewSummary {
  const empty: TaskReviewSummary = {
    gradeLine: null,
    outlierComment: null,
    contributionLine: null,
    contributionSumGap: 0,
  }
  if (reviews.length === 0) return empty

  const total = reviews.length
  const grades = reviews.map((r) => r.grade)
  const distinct = new Set(grades)

  // --- 등급 ---
  let gradeLine: string | null = null
  let outlier: PeerReview | null = null

  if (total === 1) {
    gradeLine = `리뷰어 1명이 ${grades[0]}로 평가했습니다. 다른 의견이 없어 이것만으로 판단하기는 이릅니다.`
  } else if (distinct.size === 1) {
    gradeLine = `리뷰어 ${total}명이 모두 ${grades[0]}로 평가했습니다. 이견이 없습니다.`
  } else {
    // 한 사람만 나머지와 두 등급 이상 떨어져 있으면 그게 이 과제에서 팀장이
    // 확인할 지점이다 -- 평균으로 뭉개면 사라지는 정보다.
    const counts = new Map<PerformanceGrade, number>()
    for (const g of grades) counts.set(g, (counts.get(g) ?? 0) + 1)
    const loneGrades = [...counts.entries()].filter(([, c]) => c === 1).map(([g]) => g)

    for (const g of loneGrades) {
      const others = grades.filter((x) => x !== g)
      const minDistance = Math.min(...others.map((o) => Math.abs(gradeIndex(o) - gradeIndex(g))))
      if (minDistance >= 2) {
        outlier = reviews.find((r) => r.grade === g) ?? null
        break
      }
    }

    if (outlier) {
      const rest = grades.filter((_, i) => reviews[i].id !== outlier!.id)
      const outlierIsLow = gradeIndex(outlier.grade) > gradeIndex(rest[0])
      // 나머지를 등급 나열("S·B")로 쓰면 읽기 어렵다. 튄 사람 반대편의
      // 경계 등급 하나로 묶어 "B 이상"처럼 쓴다 -- 어차피 요점은 "저 사람만
      // 다르다"이지 나머지의 정확한 분포가 아니다.
      const restDistinct = new Set(rest)
      const boundary = outlierIsLow
        ? GRADE_ORDER.filter((g) => restDistinct.has(g)).slice(-1)[0]
        : GRADE_ORDER.filter((g) => restDistinct.has(g))[0]
      const restLabel =
        restDistinct.size === 1
          ? `${rest.length}명이 모두 ${rest[0]}`
          : `${rest.length}명이 ${boundary} ${outlierIsLow ? '이상' : '이하'}`
      gradeLine = `${total}명 중 ${restLabel}인데 ${outlier.reviewerName || '한 명'}만 ${outlier.grade}${
        outlierIsLow ? '로 낮게' : '로 높게'
      } 평가했습니다.`
    } else {
      const sorted = [...grades].sort((a, b) => gradeIndex(a) - gradeIndex(b))
      const best = sorted[0]
      const worst = sorted[sorted.length - 1]
      const spread = PERFORMANCE_SCORE[best] - PERFORMANCE_SCORE[worst]
      gradeLine =
        spread >= 20
          ? `평가가 ${best}부터 ${worst}까지 갈립니다. 평균만으로는 판단하기 어렵습니다.`
          : `${total}명의 평가가 ${worst}~${best} 사이로 대체로 모입니다.`
    }
  }

  // --- 튄 평가의 근거 ---
  let outlierComment: TaskReviewSummary['outlierComment'] = null
  if (outlier?.comment?.trim()) {
    const mine = keywords(outlier.comment)
    const othersText = reviews
      .filter((r) => r.id !== outlier!.id)
      .map((r) => r.comment ?? '')
      .join(' ')
    const theirs = keywords(othersText)
    const overlap = [...mine].some((w) => theirs.has(w))
    outlierComment = {
      reviewerName: outlier.reviewerName || '(작성자 미상)',
      comment: outlier.comment.trim(),
      // 다른 리뷰어가 아무도 안 건드린 얘기라면 그게 새 정보다.
      unique: !overlap,
    }
  }

  // --- 기여도 ---
  const withPercent = reviews.filter((r): r is PeerReview & { contributionPercent: number } =>
    typeof r.contributionPercent === 'number',
  )
  let contributionLine: string | null = null
  let contributionSumGap = 0
  if (withPercent.length >= 2) {
    const sorted = [...withPercent].sort((a, b) => b.contributionPercent - a.contributionPercent)
    const high = sorted[0]
    const low = sorted[sorted.length - 1]
    const sum = withPercent.reduce((s, r) => s + r.contributionPercent, 0)
    contributionSumGap = Math.round(sum - 100)

    const parts: string[] = []
    // 최고-최저가 10%p 넘게 벌어질 때만 언급한다 -- 비슷하면 볼 것이 없다.
    if (high.contributionPercent - low.contributionPercent >= 10) {
      parts.push(
        `기여도는 ${high.reviewerName}이 ${high.contributionPercent}%로 가장 높게, ${low.reviewerName}이 ${low.contributionPercent}%로 가장 낮게 봤습니다.`,
      )
    }
    if (Math.abs(contributionSumGap) >= 2) {
      parts.push(
        contributionSumGap > 0
          ? `합계가 ${Math.round(sum)}%로 ${contributionSumGap}%p 초과합니다.`
          : `합계가 ${Math.round(sum)}%라 ${Math.abs(contributionSumGap)}%p가 비어 있습니다.`,
      )
    }
    contributionLine = parts.length > 0 ? parts.join(' ') : null
  }

  return { gradeLine, outlierComment, contributionLine, contributionSumGap }
}

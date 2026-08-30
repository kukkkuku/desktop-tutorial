import type { PeerReview, PerformanceGrade } from '../types'
import { PERFORMANCE_SCORE } from './calculations'

// 과제 하나에 달린 동료 리뷰들을 사람이 읽는 문장으로 바꾼다.
//
// 표를 그려주는 것만으로는 부족하다 -- 리뷰어 5줄을 눈으로 훑어야 "이서연만
// D를 줬네"가 나온다. 그건 사람이 아니라 앱이 할 일이다.
// 숫자는 문장 안에 근거로만 넣고, 판단(이견 없음/갈림/한쪽만 다름)은 여기서
// 내려서 준다.
//
// 규칙 기반이라 뻔해지기 쉬우므로, 데이터에서 실제로 나온 것만 말한다 --
// 해당하는 상황이 없으면 그 문장은 아예 만들지 않는다(빈 배열이 정상이다).

const GRADE_ORDER: PerformanceGrade[] = ['S', 'A', 'B', 'C', 'D']

export interface TaskReviewSummary {
  // 등급에 대한 판단 한 문장.
  gradeLine: string | null
  // 튄 평가를 남긴 사람의 근거(있을 때만). 그 사람이 왜 다르게 봤는지가
  // 팀장이 확인할 지점이라, 원문을 그대로 인용한다.
  outlierComment: { reviewerName: string; comment: string } | null
  // 기여도에 대한 문장(볼 것이 있을 때만).
  contributionLine: string | null
}

function gradeIndex(g: PerformanceGrade): number {
  return GRADE_ORDER.indexOf(g)
}

export function summarizeTaskReviews(reviews: PeerReview[]): TaskReviewSummary {
  const empty: TaskReviewSummary = {
    gradeLine: null,
    outlierComment: null,
    contributionLine: null,
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
  // "다른 리뷰어는 언급하지 않은 지점"까지 단정하지는 않는다 -- 낱말이
  // 겹치는지로 판정하면 "일정이 늦었다"와 "스케줄 지연"을 다른 얘기로 보게
  // 되어, 근거 없는 주장을 팀장에게 들이밀게 된다. 인용까지만 한다.
  const outlierComment: TaskReviewSummary['outlierComment'] = outlier?.comment?.trim()
    ? { reviewerName: outlier.reviewerName || '(작성자 미상)', comment: outlier.comment.trim() }
    : null

  // --- 기여도 ---
  // 여기 있는 값들은 "여러 리뷰어가 각자 이 사람 한 명의 몫을 몇 %로 봤는가"다.
  // 합계는 아무 의미가 없다 -- 100%가 되어야 하는 축은 (과제 + 리뷰어) 고정
  // 상태에서 팀원들에게 배분한 합이지(handleSaveDrafts), 한 사람에 대한
  // 리뷰어들의 추정치를 더한 값이 아니다. 그래서 합계는 아예 계산하지 않고,
  // 리뷰어끼리 얼마나 다르게 봤는지만 말한다.
  const withPercent = reviews.filter((r): r is PeerReview & { contributionPercent: number } =>
    typeof r.contributionPercent === 'number',
  )
  let contributionLine: string | null = null
  if (withPercent.length >= 2) {
    const sorted = [...withPercent].sort((a, b) => b.contributionPercent - a.contributionPercent)
    const high = sorted[0]
    const low = sorted[sorted.length - 1]
    // 10%p 넘게 벌어질 때만 말한다 -- 비슷하면 볼 것이 없다.
    if (high.contributionPercent - low.contributionPercent >= 10) {
      contributionLine = `이 사람의 몫을 ${low.reviewerName}은 ${low.contributionPercent}%로, ${high.reviewerName}은 ${high.contributionPercent}%로 봤습니다. 같이 일한 사람끼리도 체감이 다릅니다.`
    }
  }

  return { gradeLine, outlierComment, contributionLine }
}

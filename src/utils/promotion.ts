// 승진 준비도 계산 — 첨부된 "26OnePlatform_승진시뮬레이션.xlsx"의 실제 수식과
// "260226_인사평가및승진제도이해.pptx"의 제도 설명을 그대로 반영한다.
// 성과평가 기준(Criteria, src/utils/calculations.ts)과는 완전히 별개의 계산이다.
//
// Excel 수식 요약 (과장1 시트 기준, 승진기준 시트 참조):
//   - 등급점수: VLOOKUP(등급, 승진기준!A4:B8, 2) → S=5, A=4, B=3, C=2, D=1
//   - 역량 등급점수는 *2 가중 (직급공통)
//   - 연도가중치: VLOOKUP(체류년수, 승진기준!D4:I6, 연도오프셋+2) — 체류년수(3/4/5년)별로
//     최근연도부터 150% / 100%.../50% 순으로 감소
//   - "승진서열화점수"(X3, 주점수) = Σ(연도가중치 × 해당연도 등급점수합) + 보조점수합계
//   - "승진대상점수"(L8, 대상/미대상 판정용) = Σ(연도별 등급점수합), 가중치 미적용 raw 합계
//   - 대상 판정: raw 합계(L8) ≥ 목표직급 승진자격점수
//   - 준비도 표시(예: 58.8/66, 89%)는 가중 점수(X3)를 기준자격점수와 비교
import type { EvaluationGrade, HRAppraisalRecord, Level, PromotionCriteriaRow } from '../types'

export const DEFAULT_GRADE_SCORES: Record<EvaluationGrade, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
}

// 승진기준 시트 M4:O7 그대로.
export const DEFAULT_PROMOTION_CRITERIA: PromotionCriteriaRow[] = [
  { fromLevel: '사원', toLevel: '대리', tenureYears: 3, requiredScore: 36 },
  { fromLevel: '대리', toLevel: '과장', tenureYears: 4, requiredScore: 50 },
  { fromLevel: '과장', toLevel: '차장', tenureYears: 5, requiredScore: 66 },
  { fromLevel: '차장', toLevel: '부장', tenureYears: 5, requiredScore: 68 },
]

// 승진기준 시트 D4:I6 (체류년수별 연도가중치, 최근연도 → 과거연도 순).
const YEAR_WEIGHTS_BY_TENURE: Record<number, number[]> = {
  3: [1.5, 1.0, 0.5],
  4: [1.5, 1.15, 0.85, 0.5],
  5: [1.5, 1.25, 1.0, 0.75, 0.5],
}

function gradeScore(grade: EvaluationGrade | '', gradeScores: Record<EvaluationGrade, number>): number {
  return grade ? (gradeScores[grade] ?? 0) : 0
}

// 한 연도의 등급점수 합 = 업적(상) + 업적(하) + 역량*2. 등급이 아직 입력되지 않은
// 항목(빈 값)은 0으로 취급한다 — Excel의 중간평균 대체식은 재현하지 않는다.
function yearGradeSum(record: HRAppraisalRecord, gradeScores: Record<EvaluationGrade, number>): number {
  return (
    gradeScore(record.firstHalfGrade, gradeScores) +
    gradeScore(record.secondHalfGrade, gradeScores) +
    gradeScore(record.competencyGrade, gradeScores) * 2
  )
}

// 승진대상점수(raw, 가중치 미적용) — 대상/미대상 판정에만 쓰인다.
export function calcPromotionRawScore(
  records: HRAppraisalRecord[],
  gradeScores: Record<EvaluationGrade, number>,
): number {
  return records.reduce((sum, r) => sum + yearGradeSum(r, gradeScores), 0)
}

// 승진서열화점수(주점수, 가중치 적용) — 준비도 표시(예: 58.8/66)에 쓰인다.
// auxScore(보조점수: 직책/상벌/체류/교육)는 첨부자료에 세부 산정식이 없어 팀장이
// 직접 입력하지 않는 한 0으로 둔다.
export function calcPromotionWeightedScore(
  records: HRAppraisalRecord[],
  gradeScores: Record<EvaluationGrade, number>,
  tenureYears: number,
  auxScore = 0,
): number {
  const weights = YEAR_WEIGHTS_BY_TENURE[tenureYears] ?? YEAR_WEIGHTS_BY_TENURE[5]
  const sortedDesc = [...records].sort((a, b) => b.year - a.year)
  const weighted = sortedDesc.reduce((sum, record, i) => {
    const weight = weights[i] ?? 0
    return sum + weight * yearGradeSum(record, gradeScores)
  }, 0)
  return weighted + auxScore
}

export interface PromotionReadiness {
  criteria: PromotionCriteriaRow
  rawScore: number
  weightedScore: number
  eligible: boolean
  progressPercent: number
  gap: number
}

export function findPromotionCriteria(
  level: Level | '',
  criteriaList: PromotionCriteriaRow[],
): PromotionCriteriaRow | null {
  return criteriaList.find((c) => c.fromLevel === level) ?? null
}

export function calcPromotionReadiness(
  level: Level | '',
  records: HRAppraisalRecord[],
  criteriaList: PromotionCriteriaRow[],
  gradeScores: Record<EvaluationGrade, number>,
  auxScore = 0,
): PromotionReadiness | null {
  const criteria = findPromotionCriteria(level, criteriaList)
  if (!criteria) return null
  const rawScore = calcPromotionRawScore(records, gradeScores)
  const weightedScore = calcPromotionWeightedScore(records, gradeScores, criteria.tenureYears, auxScore)
  const eligible = rawScore >= criteria.requiredScore
  const progressPercent =
    criteria.requiredScore > 0 ? Math.min(100, Math.round((weightedScore / criteria.requiredScore) * 1000) / 10) : 0
  const gap = Math.max(0, Math.round((criteria.requiredScore - weightedScore) * 10) / 10)
  return { criteria, rawScore, weightedScore, eligible, progressPercent, gap }
}

export const GRADE_ORDER: EvaluationGrade[] = ['D', 'C', 'B', 'A', 'S']

// "B → A → A ↑" 형태의 간단한 추이 문자열. grades는 과거→최근 순으로 전달한다.
export function trendArrow(grades: (EvaluationGrade | '')[]): string {
  const valid = grades.filter((g): g is EvaluationGrade => g !== '')
  if (valid.length === 0) return '기록 없음'
  let arrow = ''
  if (valid.length >= 2) {
    const first = GRADE_ORDER.indexOf(valid[0])
    const last = GRADE_ORDER.indexOf(valid[valid.length - 1])
    if (last > first) arrow = ' ↑'
    else if (last < first) arrow = ' ↓'
  }
  return valid.join(' → ') + arrow
}

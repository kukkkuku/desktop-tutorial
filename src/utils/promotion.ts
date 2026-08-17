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
export const YEAR_WEIGHTS_BY_TENURE: Record<number, number[]> = {
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
  tenureMet: boolean
  progressPercent: number
  gap: number
}

export function findPromotionCriteria(
  level: Level | '',
  criteriaList: PromotionCriteriaRow[],
): PromotionCriteriaRow | null {
  return criteriaList.find((c) => c.fromLevel === level) ?? null
}

// tenureYearsCompleted: 현재 직급에서 지난 연차(calcYearsSince). 호출부가 아직
// 넘기지 않으면(null) 재직기간 조건은 "미확인"으로 보고 준비도 계산에서는 충족한
// 것으로 취급한다(기존 호출부 호환용 기본값).
export function calcPromotionReadiness(
  level: Level | '',
  records: HRAppraisalRecord[],
  criteriaList: PromotionCriteriaRow[],
  gradeScores: Record<EvaluationGrade, number>,
  auxScore = 0,
  tenureYearsCompleted: number | null = null,
): PromotionReadiness | null {
  const criteria = findPromotionCriteria(level, criteriaList)
  if (!criteria) return null
  const rawScore = calcPromotionRawScore(records, gradeScores)
  const weightedScore = calcPromotionWeightedScore(records, gradeScores, criteria.tenureYears, auxScore)
  const eligible = rawScore >= criteria.requiredScore
  const tenureMet = tenureYearsCompleted === null || tenureYearsCompleted >= criteria.tenureYears

  // 준비도(%)는 가중점수 비율 하나만으로 계산하면 안 된다 -- 최근 연도에 가중치가
  // 실려 있어서, 실제 승진자격점수(raw)나 재직기간을 채우지 못했는데도 가중점수
  // 비율만 100%를 넘는 경우가 생길 수 있다. 세 비율(가중점수/자격점수/재직기간) 중
  // 가장 낮은 값을 준비도로 써서, 어느 조건 하나라도 미충족이면 100%에 닿지 않게 한다.
  const scoreRatio = criteria.requiredScore > 0 ? (weightedScore / criteria.requiredScore) * 100 : 100
  const rawRatio = criteria.requiredScore > 0 ? (rawScore / criteria.requiredScore) * 100 : 100
  const tenureRatio = tenureMet
    ? 100
    : criteria.tenureYears > 0
      ? ((tenureYearsCompleted ?? 0) / criteria.tenureYears) * 100
      : 100
  const progressPercent = Math.max(0, Math.min(100, Math.round(Math.min(scoreRatio, rawRatio, tenureRatio) * 10) / 10))
  const gap = Math.max(0, Math.round((criteria.requiredScore - weightedScore) * 10) / 10)
  return { criteria, rawScore, weightedScore, eligible, tenureMet, progressPercent, gap }
}

// 예상(시뮬레이션) 승진 점수 -- 다음 연도 예상 등급 + 보조지표 합계를 반영한
// 가중합계. 요약 Bar와 성장 시뮬레이션 패널이 같은 입력값(보조지표/예상 등급)을
// 공유해서 독립적으로 호출하므로 화면 두 곳의 숫자가 항상 일치한다.
export function calcSimulatedPromotionTotal(
  records: HRAppraisalRecord[],
  gradeScores: Record<EvaluationGrade, number>,
  criteria: PromotionCriteriaRow,
  auxSum: number,
  simFirst: EvaluationGrade | '',
  simSecond: EvaluationGrade | '',
  simCompetency: EvaluationGrade | '',
): { nextYear: number; simTotal: number; simEligible: boolean; simGap: number } {
  const simHasInput = simFirst !== '' || simSecond !== '' || simCompetency !== ''
  const nextYear = (records[records.length - 1]?.year ?? new Date().getFullYear() - 1) + 1
  const simRecords = simHasInput
    ? [
        ...records.filter((r) => r.year !== nextYear),
        {
          id: 'sim',
          memberId: records[0]?.memberId ?? '',
          year: nextYear,
          firstHalfGrade: simFirst,
          secondHalfGrade: simSecond,
          competencyGrade: simCompetency,
        },
      ]
    : records
  const simWeighted = calcPromotionWeightedScore(simRecords, gradeScores, criteria.tenureYears, 0)
  const simTotal = Math.round((simWeighted + auxSum) * 10) / 10
  const simEligible = simTotal >= criteria.requiredScore
  const simGap = Math.round((simTotal - criteria.requiredScore) * 10) / 10
  return { nextYear, simTotal, simEligible, simGap }
}

export const GRADE_ORDER: EvaluationGrade[] = ['D', 'C', 'B', 'A', 'S']

// GRADE_ORDER 상에서 한 단계 위 등급. 이미 최고 등급(S)이면 null.
export function nextGradeUp(grade: EvaluationGrade): EvaluationGrade | null {
  const idx = GRADE_ORDER.indexOf(grade)
  return idx >= 0 && idx < GRADE_ORDER.length - 1 ? GRADE_ORDER[idx + 1] : null
}

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

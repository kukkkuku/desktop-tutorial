import type { EvaluationGrade, HRAppraisalRecord } from '../../types'
import { gradeScore } from '../../utils/promotion'

// 연도를 컬럼으로 눕힌 성과 표(Figma "performance-review-table" 그대로) --
// 왼쪽 헤더의 승진심사 연도를 기준으로 최근 5개년을 나란히 보여주고, 맨
// 오른쪽에 노란 강조색 "총합" 컬럼을 붙인다. 반기(상/하) 업적 등급 행과
// 역량 등급 행, 두 줄로 나뉜다.
function HalfCell({ grade, label, gradeScores }: { grade: EvaluationGrade | ''; label: string; gradeScores: Record<EvaluationGrade, number> }) {
  if (!grade) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 border-r border-gray-100 py-2 last:border-r-0">
        <p className="text-base text-gray-400">-</p>
        <p className="text-[11px] text-gray-400">{label}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 border-r border-gray-100 py-2 last:border-r-0">
      <p className="text-base font-extrabold text-black">{grade}</p>
      <p className="text-[11px] text-gray-400">{gradeScore(grade, gradeScores).toFixed(1)}</p>
    </div>
  )
}

function CompetencyCell({ grade, gradeScores }: { grade: EvaluationGrade | ''; gradeScores: Record<EvaluationGrade, number> }) {
  if (!grade) {
    return (
      <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 border-r border-gray-100 py-2 last:border-r-0">
        <p className="text-base text-gray-400">-</p>
        <p className="text-[11px] text-gray-400">역량</p>
      </div>
    )
  }
  return (
    <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 border-r border-gray-100 py-2 last:border-r-0">
      <p className="text-base font-extrabold text-black">{grade}</p>
      <p className="text-[11px] text-gray-400">{gradeScore(grade, gradeScores).toFixed(1)}</p>
    </div>
  )
}

export default function AppraisalYearTable({
  records,
  gradeScores,
  anchorYear,
}: {
  records: HRAppraisalRecord[]
  gradeScores: Record<EvaluationGrade, number>
  anchorYear: number
}) {
  const years = Array.from({ length: 5 }, (_, i) => anchorYear - 1 - i)
  const byYear = new Map(records.map((r) => [r.year, r]))

  const achievementTotal = years.reduce((sum, y) => {
    const r = byYear.get(y)
    return sum + (r ? gradeScore(r.firstHalfGrade, gradeScores) + gradeScore(r.secondHalfGrade, gradeScores) : 0)
  }, 0)
  const competencyTotal = years.reduce((sum, y) => sum + gradeScore(byYear.get(y)?.competencyGrade ?? '', gradeScores), 0)
  const grandTotal = achievementTotal + competencyTotal

  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-slate-800">성과</span>
        <span className="text-xs text-gray-500">
          {years[years.length - 1]}~{years[0]}년 데이터입니다.
        </span>
      </p>

      <div className="mt-1.5 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <div className="flex min-w-max">
          {/* 헤더 -- 연도 5개 + 총합 */}
          <div className="flex">
            {years.map((y) => (
              <div key={y} className="flex h-9 w-[92px] shrink-0 items-center justify-center border-r border-b border-gray-100 text-sm font-semibold text-gray-500">
                {y}
              </div>
            ))}
            <div className="flex h-9 w-[92px] shrink-0 items-center justify-center border-b border-gray-200 bg-yellow-50 text-sm font-bold text-orange-600">
              총합: {grandTotal.toFixed(0)}
            </div>
          </div>
        </div>

        <div className="flex min-w-max">
          {/* 반기 성과(업적 상/하) */}
          {years.map((y) => {
            const r = byYear.get(y)
            return (
              <div key={y} className="flex w-[92px] shrink-0 border-r border-b border-gray-100">
                <HalfCell grade={r?.firstHalfGrade ?? ''} label="상" gradeScores={gradeScores} />
                <HalfCell grade={r?.secondHalfGrade ?? ''} label="하" gradeScores={gradeScores} />
              </div>
            )
          })}
          <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 border-b border-gray-200 bg-yellow-50 py-2">
            <p className="text-base font-bold text-black">{achievementTotal.toFixed(0)}</p>
            <p className="text-[11px] text-gray-400">성과</p>
          </div>
        </div>

        <div className="flex min-w-max">
          {/* 역량 */}
          {years.map((y) => (
            <CompetencyCell key={y} grade={byYear.get(y)?.competencyGrade ?? ''} gradeScores={gradeScores} />
          ))}
          <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 bg-yellow-50 py-2">
            <p className="text-base font-bold text-black">{competencyTotal.toFixed(0)}</p>
            <p className="text-[11px] text-gray-400">역량</p>
          </div>
        </div>
      </div>
    </div>
  )
}

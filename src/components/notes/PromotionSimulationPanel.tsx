import { useState } from 'react'
import type { EvaluationGrade, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'

function GradeSelect({
  value,
  onChange,
  label,
}: {
  value: EvaluationGrade | ''
  onChange: (v: EvaluationGrade | '') => void
  label: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as EvaluationGrade | '')}
        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
      >
        <option value="">-</option>
        {PERFORMANCE_GRADE_OPTIONS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  )
}

// "현재 준비도"와 "조건을 바꾸면 어떻게 되는지"를 바로 보여주는 시뮬레이션
// 중심 패널 -- 과거 인사평가 원장(HRAppraisalHistoryPanel)과는 분리했다.
export default function PromotionSimulationPanel({ member }: { member: TeamMember }) {
  const { profile } = useTeamProfile()
  const records = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)

  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const readiness = calcPromotionReadiness(member.level, records, profile.promotionCriteria, profile.gradeScores)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const tenureMet = criteria ? levelTenureYears !== null && levelTenureYears >= criteria.tenureYears : null

  const nextSimYear = (records[records.length - 1]?.year ?? new Date().getFullYear() - 1) + 1
  const [simYear, setSimYear] = useState(String(nextSimYear))
  const [simFirst, setSimFirst] = useState<EvaluationGrade | ''>('')
  const [simSecond, setSimSecond] = useState<EvaluationGrade | ''>('')
  const [simCompetency, setSimCompetency] = useState<EvaluationGrade | ''>('')

  const simYearNum = Number(simYear)
  const simHasInput = simFirst !== '' || simSecond !== '' || simCompetency !== ''
  const simRecords =
    simHasInput && Number.isFinite(simYearNum)
      ? [
          ...records.filter((r) => r.year !== simYearNum),
          {
            id: 'sim',
            memberId: member.id,
            year: simYearNum,
            firstHalfGrade: simFirst,
            secondHalfGrade: simSecond,
            competencyGrade: simCompetency,
          },
        ]
      : records
  const simReadiness = simHasInput
    ? calcPromotionReadiness(member.level, simRecords, profile.promotionCriteria, profile.gradeScores)
    : null

  const simGradeLabel = [simFirst, simSecond, simCompetency].filter(Boolean).join('/')

  if (!criteria) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-promo">성장·승진 시뮬레이션</p>
        <p className="mt-2 text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-xs font-semibold text-promo">성장·승진 시뮬레이션</p>
        <p className="mt-0.5 text-[13px] text-gray-500">목표 직급 {criteria.toLevel}</p>

        {readiness && (
          <>
            <p className="mt-2 text-3xl font-bold text-black">
              {readiness.progressPercent}%
              <span className="ml-2 text-sm font-medium text-gray-400">
                {readiness.weightedScore.toFixed(1)} / {criteria.requiredScore}
              </span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-promo transition-[width]" style={{ width: `${readiness.progressPercent}%` }} />
            </div>

            <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">
                  재직기간 ({member.level} → {criteria.toLevel}, {criteria.tenureYears}년 이상)
                </span>
                <span className={`font-semibold ${tenureMet ? 'text-success' : 'text-gray-400'}`}>
                  {tenureMet === null ? '미확인' : tenureMet ? '충족' : '미충족'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">승진자격점수 ({criteria.requiredScore}점 이상)</span>
                <span className={`font-semibold ${readiness.eligible ? 'text-success' : 'text-danger'}`}>
                  {readiness.eligible ? '충족' : `${readiness.gap}점 부족`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-md border border-dashed border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold text-gray-500">조건 변경 시뮬레이션</p>
        <p className="mt-0.5 text-[13px] text-gray-400">다음 평가 등급을 바꿔보면 준비도가 어떻게 달라지는지 바로 보여줍니다.</p>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="block text-[11px] font-medium text-gray-400">연도</label>
            <input
              type="number"
              value={simYear}
              onChange={(e) => setSimYear(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
            />
          </div>
          <GradeSelect label="업적(상)" value={simFirst} onChange={setSimFirst} />
          <GradeSelect label="업적(하)" value={simSecond} onChange={setSimSecond} />
          <GradeSelect label="역량" value={simCompetency} onChange={setSimCompetency} />
        </div>

        {simReadiness && readiness ? (
          <p className="mt-3 rounded-md bg-orange-50 px-3 py-2.5 text-sm text-black">
            다음 고과 <span className="font-bold text-accent">{simGradeLabel}</span>라면 → 준비도{' '}
            <span className="font-bold text-promo">{simReadiness.progressPercent}%</span>
            <span className={simReadiness.progressPercent >= readiness.progressPercent ? 'ml-1.5 text-success' : 'ml-1.5 text-danger'}>
              ({simReadiness.progressPercent >= readiness.progressPercent ? '+' : ''}
              {(simReadiness.progressPercent - readiness.progressPercent).toFixed(1)}%p)
            </span>
            <span className="ml-2 text-gray-500">{simReadiness.gap > 0 ? `· ${simReadiness.gap}점 부족` : '· 자격점수 충족'}</span>
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-gray-400">등급을 하나 이상 선택하면 결과가 바로 표시됩니다.</p>
        )}
      </div>
    </div>
  )
}

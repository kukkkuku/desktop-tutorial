import { useState } from 'react'
import type { EvaluationGrade, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { calcPromotionReadiness, findPromotionCriteria, GRADE_ORDER, nextGradeUp } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'

const BASELINE_GRADE: EvaluationGrade = 'B'

interface ConditionRow {
  label: string
  met: boolean
  detail: string
}

function ConditionItem({ row }: { row: ConditionRow }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className="flex items-center gap-1.5 text-gray-600">
        <span aria-hidden="true">{row.met ? '✅' : '⚠️'}</span>
        {row.label}
      </span>
      <span className={`font-semibold ${row.met ? 'text-success' : 'text-gray-500'}`}>{row.detail}</span>
    </div>
  )
}

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

// 최근 반기 고과/역량 등급 하나를 "충족(B 이상)" 여부로 보여주는 코칭용 보조
// 체크리스트 항목 -- 재직기간·성과(자격점수)와 달리 준비도(%) 자체를 좌우하지는
// 않는다(그 둘은 실제 승진 공식이 이미 반영). 면담 중 바로 짚어줄 개선 포인트를
// "B → A 필요"처럼 다음 등급으로 안내하기 위한 용도.
function gradeCondition(label: string, grade: EvaluationGrade | ''): ConditionRow {
  if (!grade) return { label, met: false, detail: '기록 없음' }
  const met = GRADE_ORDER.indexOf(grade) >= GRADE_ORDER.indexOf(BASELINE_GRADE)
  if (met) return { label, met: true, detail: '충족' }
  const up = nextGradeUp(grade)
  return { label, met: false, detail: up ? `${grade} → ${up} 필요` : grade }
}

// "현재 준비도"와 "조건을 바꾸면 어떻게 되는지"를 바로 보여주는 시뮬레이션
// 중심 패널. 준비도(%)는 재직기간·승진자격점수(raw)·가중점수 세 조건을 모두
// calcPromotionReadiness가 함께 반영해서 계산하므로, 조건 하나라도 미충족이면
// 100%로 표시되는 일이 없다.
export default function PromotionSimulationPanel({ member }: { member: TeamMember }) {
  const { profile } = useTeamProfile()
  const records = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)

  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const readiness = calcPromotionReadiness(
    member.level,
    records,
    profile.promotionCriteria,
    profile.gradeScores,
    0,
    levelTenureYears,
  )

  const latest = records[records.length - 1]
  const recentGrade: EvaluationGrade | '' = latest ? latest.secondHalfGrade || latest.firstHalfGrade : ''
  const competencyGrade: EvaluationGrade | '' = latest ? latest.competencyGrade : ''

  const [simGrade, setSimGrade] = useState<EvaluationGrade | ''>('')
  const [simCompetency, setSimCompetency] = useState<EvaluationGrade | ''>('')
  const simHasInput = simGrade !== '' || simCompetency !== ''
  const nextSimYear = (latest?.year ?? new Date().getFullYear() - 1) + 1
  const simRecords = simHasInput
    ? [
        ...records.filter((r) => r.year !== nextSimYear),
        {
          id: 'sim',
          memberId: member.id,
          year: nextSimYear,
          firstHalfGrade: simGrade,
          secondHalfGrade: simGrade,
          competencyGrade: simCompetency,
        },
      ]
    : records
  const simReadiness = simHasInput
    ? calcPromotionReadiness(member.level, simRecords, profile.promotionCriteria, profile.gradeScores, 0, levelTenureYears)
    : null

  if (!criteria) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-promo">성장·승진 시뮬레이션</p>
        <p className="mt-2 text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
      </div>
    )
  }

  const performanceGap = readiness && !readiness.eligible ? Math.max(0, criteria.requiredScore - readiness.rawScore) : 0
  const conditions: ConditionRow[] = readiness
    ? [
        { label: '재직기간', met: readiness.tenureMet, detail: `${levelTenureYears ?? '-'}/${criteria.tenureYears}년` },
        gradeCondition('최근 고과', recentGrade),
        gradeCondition('역량', competencyGrade),
        { label: '성과', met: readiness.eligible, detail: readiness.eligible ? '충족' : `${performanceGap.toFixed(0)}점 부족` },
      ]
    : []

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-xs font-semibold text-promo">성장·승진 시뮬레이션</p>
        <p className="mt-0.5 text-[13px] text-gray-500">목표 직급 {criteria.toLevel}</p>

        {readiness && (
          <>
            <p className="mt-2 text-2xl font-bold text-black">
              현재 준비도 <span className="text-promo">{readiness.progressPercent}%</span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-promo transition-[width]" style={{ width: `${readiness.progressPercent}%` }} />
            </div>

            <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
              {conditions.map((c) => (
                <ConditionItem key={c.label} row={c} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="rounded-md border border-dashed border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold text-gray-500">조건 변경 시뮬레이션</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <GradeSelect label="다음 고과" value={simGrade} onChange={setSimGrade} />
          <GradeSelect label="역량" value={simCompetency} onChange={setSimCompetency} />
        </div>

        {simReadiness && readiness ? (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-md bg-orange-50 px-3 py-2.5">
            <span className="text-lg font-bold text-gray-400">{readiness.progressPercent}%</span>
            <span className="text-gray-400" aria-hidden="true">
              →
            </span>
            <span className="text-2xl font-bold text-accent">{simReadiness.progressPercent}%</span>
            <span
              className={`text-[13px] font-semibold ${
                simReadiness.progressPercent >= readiness.progressPercent ? 'text-success' : 'text-danger'
              }`}
            >
              ({simReadiness.progressPercent >= readiness.progressPercent ? '+' : ''}
              {(simReadiness.progressPercent - readiness.progressPercent).toFixed(1)}%p)
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-gray-400">등급을 선택하면 결과가 바로 표시됩니다.</p>
        )}
      </div>
    </div>
  )
}

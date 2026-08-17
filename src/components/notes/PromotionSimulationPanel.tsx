import { useState } from 'react'
import type { EvaluationGrade, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { calcSimulatedPromotionTotal, findPromotionCriteria, YEAR_WEIGHTS_BY_TENURE } from '../../utils/promotion'
import HRAppraisalHistoryPanel from './HRAppraisalHistoryPanel'

// 보조지표 -- 승진 계산의 auxScore로 합산되는 입력값. 세션 단위 시뮬레이션 입력이며
// 예상 총점에 즉시 반영된다. 상단 Summary Bar의 "예상 총점"과 값을 공유해야 하므로
// 이 state는 MemberGrowthDetail이 들고 있고(controlled), 이 패널은 props로 받는다.
export const AUX_KEYS = [
  { key: 'position', label: '직책' },
  { key: 'reward', label: '상벌' },
  { key: 'tenure', label: '체류' },
  { key: 'education', label: '교육' },
] as const
export type AuxKey = (typeof AUX_KEYS)[number]['key']

function GradeSelect({ value, onChange, label }: { value: EvaluationGrade | ''; onChange: (v: EvaluationGrade | '') => void; label: string }) {
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

interface PromotionSimulationPanelProps {
  member: TeamMember
  aux: Record<AuxKey, string>
  onAuxChange: (updater: (prev: Record<AuxKey, string>) => Record<AuxKey, string>) => void
  simFirst: EvaluationGrade | ''
  simSecond: EvaluationGrade | ''
  simCompetency: EvaluationGrade | ''
  onSimFirstChange: (v: EvaluationGrade | '') => void
  onSimSecondChange: (v: EvaluationGrade | '') => void
  onSimCompetencyChange: (v: EvaluationGrade | '') => void
}

// 성장 시뮬레이션 -- 목표 승진 연도/현재 점수/승진 기준/예상 총점은 상단 Summary
// Bar에서 이미 보여주므로 여기서 반복하지 않는다. 공식 인사평가 이력은 항상
// 노출, 가중치 기준·연차별 가중치·승진자격 점수 같은 참고 자료는 "보기"를
// 눌러야만 펼쳐짐. 보조지표 입력(항상 노출, 즉시 반영) + 예상 평가 입력 +
// 예상 승진점수 결과. 보조지표/예상 등급 state는 MemberGrowthDetail이 소유하고
// (Summary Bar의 "예상 총점"과 값을 공유해야 하므로) 이 컴포넌트는 controlled로 받는다.
export default function PromotionSimulationPanel({
  member,
  aux,
  onAuxChange,
  simFirst,
  simSecond,
  simCompetency,
  onSimFirstChange,
  onSimSecondChange,
  onSimCompetencyChange,
}: PromotionSimulationPanelProps) {
  const { profile } = useTeamProfile()
  const records = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)

  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const auxSum = AUX_KEYS.reduce((s, { key }) => s + (Number(aux[key]) || 0), 0)

  if (!criteria) {
    return (
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-bold text-black">성장 시뮬레이션</h3>
        <p className="mt-2 text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
      </div>
    )
  }

  const { nextYear, simTotal, simEligible, simGap } = calcSimulatedPromotionTotal(
    records,
    profile.gradeScores,
    criteria,
    auxSum,
    simFirst,
    simSecond,
    simCompetency,
  )

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-black">성장 시뮬레이션</h3>

      {/* 공식 인사평가 이력(항상 노출) + 가중치 기준(필요할 때만 펼침) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <HRAppraisalHistoryPanel member={member} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <div className="rounded-lg border border-gray-200 p-3">
            <button onClick={() => setCriteriaOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="text-xs font-bold text-black">가중치 기준 및 점수</span>
              <span className="text-xs font-medium text-gray-400">{criteriaOpen ? '접기 ▴' : '보기 ▾'}</span>
            </button>
            {criteriaOpen && (
              <div className="mt-2.5 space-y-2.5 border-t border-gray-100 pt-2.5">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">평가등급별 점수</p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {(['S', 'A', 'B', 'C', 'D'] as const).map((g) => (
                      <span key={g} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
                        {g} {profile.gradeScores[g]}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">연차별 가중치(최근 연도일수록 크게 반영)</p>
                  <div className="mt-1 space-y-0.5 text-[11px] text-gray-600">
                    {Object.entries(YEAR_WEIGHTS_BY_TENURE).map(([years, weights]) => (
                      <p key={years}>
                        <span className="text-gray-400">{years}년:</span> {weights.map((w) => `${(w * 100).toFixed(0)}%`).join(' / ')}
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">직급별 승진자격 점수</p>
                  <div className="mt-1 space-y-0.5 text-[11px] text-gray-600">
                    {profile.promotionCriteria.map((c) => (
                      <p key={c.fromLevel}>
                        <span className="text-gray-400">
                          {c.fromLevel}→{c.toLevel}:
                        </span>{' '}
                        {c.tenureYears}년 · {c.requiredScore}점
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 보조지표 -- 항상 노출, 예상 총점에 즉시 반영 */}
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-black">보조지표</p>
          <span className="text-[11px] text-gray-400">합계 {auxSum}점</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AUX_KEYS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-[11px] font-medium text-gray-400">{label}</label>
              <input
                type="number"
                value={aux[key]}
                onChange={(e) => onAuxChange((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="0"
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 예상 평가 입력 */}
      <div className="rounded-lg border border-dashed border-gray-300 p-3">
        <p className="text-xs font-bold text-black">{nextYear}년(예상) 평가 입력</p>
        <p className="mt-0.5 text-[11px] text-gray-400">등급을 입력하면 아래 결과가 자동 계산됩니다.</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <GradeSelect label="업적(상)" value={simFirst} onChange={onSimFirstChange} />
          <GradeSelect label="업적(하)" value={simSecond} onChange={onSimSecondChange} />
          <GradeSelect label="역량" value={simCompetency} onChange={onSimCompetencyChange} />
        </div>
      </div>

      {/* 결과 */}
      <div className="rounded-lg bg-gray-50 p-3">
        <p className="text-xs font-bold text-black">결과 ({nextYear}년 시뮬레이션)</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div>
            <p className="text-[10px] text-gray-400">예상 가중합계</p>
            <p className="font-mono text-lg font-bold text-black">{(simTotal - auxSum).toFixed(1)}점</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">보조지표 합계</p>
            <p className="font-mono text-lg font-bold text-black">{auxSum.toFixed(1)}점</p>
          </div>
          <span className="pb-1 text-gray-400" aria-hidden="true">
            →
          </span>
          <div>
            <p className="text-[10px] text-gray-400">예상 총점</p>
            <p className="font-mono text-lg font-bold text-accent">{simTotal.toFixed(1)}점</p>
          </div>
          <div className="ml-auto">
            <p className="text-[10px] text-gray-400">승진 가능성</p>
            <p className={`text-sm font-bold ${simEligible ? 'text-success' : 'text-accent'}`}>{simEligible ? '승진 가능' : '기준 미달'}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          ※ 승진 자격 기준({criteria.requiredScore.toFixed(1)}점) 대비 {simGap >= 0 ? '+' : ''}
          {simGap.toFixed(1)}점
        </p>
      </div>
    </div>
  )
}

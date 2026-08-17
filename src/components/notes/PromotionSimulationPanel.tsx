import { useState } from 'react'
import type { EvaluationGrade, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import {
  calcPromotionReadiness,
  calcPromotionWeightedScore,
  findPromotionCriteria,
  YEAR_WEIGHTS_BY_TENURE,
} from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import HRAppraisalHistoryPanel from './HRAppraisalHistoryPanel'

// 보조지표 -- 승진 계산의 auxScore로 합산되는 입력값. 세션 단위 시뮬레이션 입력이며
// 예상 총점에 즉시 반영된다.
const AUX_KEYS = [
  { key: 'position', label: '직책' },
  { key: 'reward', label: '상벌' },
  { key: 'tenure', label: '체류' },
  { key: 'education', label: '교육' },
] as const
type AuxKey = (typeof AUX_KEYS)[number]['key']

function StripCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-2 text-center">
      <p className="truncate text-[10px] text-gray-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${accent ?? 'text-black'}`}>{value}</p>
    </div>
  )
}

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

// 성장 시뮬레이션 -- 첨부 디자인 구조: 요약 스트립 + (참고 기준은 ⓘ 기준 보기
// 팝오버로 숨김) + 공식 인사평가 이력(등급/점수 토글) + 보조지표 입력 + 예상 평가
// 입력 + 예상 승진점수 결과. 보조지표/예상입력은 예상 총점에 즉시 반영된다.
export default function PromotionSimulationPanel({ member }: { member: TeamMember }) {
  const { profile } = useTeamProfile()
  const records = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)

  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [aux, setAux] = useState<Record<AuxKey, string>>({ position: '', reward: '', tenure: '', education: '' })
  const auxSum = AUX_KEYS.reduce((s, { key }) => s + (Number(aux[key]) || 0), 0)

  const [simFirst, setSimFirst] = useState<EvaluationGrade | ''>('')
  const [simSecond, setSimSecond] = useState<EvaluationGrade | ''>('')
  const [simCompetency, setSimCompetency] = useState<EvaluationGrade | ''>('')

  if (!criteria) {
    return (
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-bold text-black">성장 시뮬레이션</h3>
        <p className="mt-2 text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
      </div>
    )
  }

  const tenureForWeights = criteria.tenureYears
  const readiness = calcPromotionReadiness(member.level, records, profile.promotionCriteria, profile.gradeScores, 0, levelTenureYears)
  const currentWeighted = readiness?.weightedScore ?? 0
  const gap = Math.round((currentWeighted - criteria.requiredScore) * 10) / 10

  const remainingYears = Math.max(0, criteria.tenureYears - (levelTenureYears ?? 0))
  const targetYear = new Date().getFullYear() + remainingYears

  // 예상 시뮬레이션: 다음 해 예상 등급을 추가한 뒤 가중합계 + 보조지표.
  const simHasInput = simFirst !== '' || simSecond !== '' || simCompetency !== ''
  const nextYear = (records[records.length - 1]?.year ?? new Date().getFullYear() - 1) + 1
  const simRecords = simHasInput
    ? [
        ...records.filter((r) => r.year !== nextYear),
        { id: 'sim', memberId: member.id, year: nextYear, firstHalfGrade: simFirst, secondHalfGrade: simSecond, competencyGrade: simCompetency },
      ]
    : records
  const simWeighted = calcPromotionWeightedScore(simRecords, profile.gradeScores, tenureForWeights, 0)
  const simTotal = Math.round((simWeighted + auxSum) * 10) / 10
  const simEligible = simTotal >= criteria.requiredScore
  const simGap = Math.round((simTotal - criteria.requiredScore) * 10) / 10

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-black">성장 시뮬레이션</h3>
        <div className="relative">
          <button
            onClick={() => setCriteriaOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
          >
            ⓘ 기준 보기
          </button>
          {criteriaOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCriteriaOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                <p className="text-xs font-bold text-black">평가등급별 점수</p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  {(['S', 'A', 'B', 'C', 'D'] as const).map((g) => (
                    <span key={g} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
                      {g} {profile.gradeScores[g]}
                    </span>
                  ))}
                </div>
                <p className="mt-2.5 text-xs font-bold text-black">연차별 가중치</p>
                <div className="mt-1 space-y-0.5 text-[11px] text-gray-600">
                  {Object.entries(YEAR_WEIGHTS_BY_TENURE).map(([years, weights]) => (
                    <p key={years}>
                      <span className="text-gray-400">{years}년:</span> {weights.map((w) => `${(w * 100).toFixed(0)}%`).join(' / ')}
                    </p>
                  ))}
                </div>
                <p className="mt-2.5 text-xs font-bold text-black">직급별 승진자격 점수</p>
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
            </>
          )}
        </div>
      </div>

      {/* 요약 스트립 */}
      <div className="flex flex-wrap divide-x divide-gray-200 rounded-lg border border-gray-200 bg-gray-50">
        <StripCell label="목표 승진 연도" value={`${targetYear}`} />
        <StripCell label="현재 직급/연차" value={`${member.level} / ${levelTenureYears ?? '-'}년차`} />
        <StripCell label="목표 승진 직급" value={criteria.toLevel} />
        <StripCell label="현재 점수" value={`${currentWeighted.toFixed(1)}점`} />
        <StripCell label="승진자격 기준" value={`${criteria.requiredScore.toFixed(1)}점`} />
        <StripCell label="필요 점수 갭" value={`${gap >= 0 ? '+' : ''}${gap.toFixed(1)}점`} accent={gap >= 0 ? 'text-success' : 'text-accent'} />
      </div>

      {/* 공식 인사평가 이력 (등급/점수 토글) -- 시뮬레이션 핵심 데이터, 인라인 유지 */}
      <HRAppraisalHistoryPanel member={member} />

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
                onChange={(e) => setAux((prev) => ({ ...prev, [key]: e.target.value }))}
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
          <GradeSelect label="업적(상)" value={simFirst} onChange={setSimFirst} />
          <GradeSelect label="업적(하)" value={simSecond} onChange={setSimSecond} />
          <GradeSelect label="역량" value={simCompetency} onChange={setSimCompetency} />
        </div>
      </div>

      {/* 결과 */}
      <div className="rounded-lg bg-gray-50 p-3">
        <p className="text-xs font-bold text-black">결과 ({nextYear}년 시뮬레이션)</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div>
            <p className="text-[10px] text-gray-400">예상 가중합계</p>
            <p className="font-mono text-lg font-bold text-black">{simWeighted.toFixed(1)}점</p>
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

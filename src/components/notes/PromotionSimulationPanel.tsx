import { useState } from 'react'
import type { EvaluationGrade, PromotionCriteriaRow, TeamMember } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import {
  calcProjectedPromotionScore,
  calcPromotionWeightedScore,
  findPromotionCriteria,
  resolveReviewYear,
  YEAR_WEIGHTS_BY_TENURE,
} from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import HRAppraisalHistoryPanel from './HRAppraisalHistoryPanel'

// 보조지표 -- 승진 계산의 auxScore로 합산되는 입력값. 승급심사 예정년도까지의
// 예상 점수(시뮬레이션 가산)에만 반영된다.
const AUX_KEYS = [
  { key: 'position', label: '직책' },
  { key: 'reward', label: '상벌' },
  { key: 'tenure', label: '체류' },
  { key: 'education', label: '교육' },
] as const
type AuxKey = (typeof AUX_KEYS)[number]['key']

// 가중치 기준표 -- 상시 노출하지 않고 "기준 보기"를 눌렀을 때만 별도 팝업으로
// 띄운다. 평가등급별 점수/연차별 가중치/직급별 승진자격 점수는 읽기 전용 참고
// 자료라 시뮬레이션 조건 입력과 한 화면에 늘어놓을 필요가 없다.
function CriteriaReferenceModal({
  gradeScores,
  promotionCriteria,
  onClose,
}: {
  gradeScores: Record<EvaluationGrade, number>
  promotionCriteria: PromotionCriteriaRow[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-bold text-black">가중치 기준 및 점수</h3>
          <button onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-black">
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500">평가등급별 점수</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              {(['S', 'A', 'B', 'C', 'D'] as const).map((g) => (
                <span key={g} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
                  {g} {gradeScores[g]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500">연차별 가중치(최근 연도일수록 크게 반영)</p>
            <div className="mt-1.5 space-y-1 text-[12px] text-gray-600">
              {Object.entries(YEAR_WEIGHTS_BY_TENURE).map(([years, weights]) => (
                <p key={years}>
                  <span className="text-gray-400">{years}년:</span> {weights.map((w) => `${(w * 100).toFixed(0)}%`).join(' / ')}
                </p>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500">직급별 승진자격 점수</p>
            <div className="mt-1.5 space-y-1 text-[12px] text-gray-600">
              {promotionCriteria.map((c) => (
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
      </div>
    </div>
  )
}

// 성장 시뮬레이션 -- 현재→예상 점수 결과를 최우선으로 보여주고, 그 아래
// 인사평가 히스토리(입력 소스)와 보조지표 입력을 한 화면에 붙여 둔다.
// 가중치 기준표만 상시 노출 대신 별도 팝업으로 확인한다.
export default function PromotionSimulationPanel({ member }: { member: TeamMember }) {
  const { profile } = useTeamProfile()
  const records = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)

  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [aux, setAux] = useState<Record<AuxKey, string>>({ position: '', reward: '', tenure: '', education: '' })
  const auxSum = AUX_KEYS.reduce((s, { key }) => s + (Number(aux[key]) || 0), 0)

  if (!criteria) {
    return <p className="text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
  }

  const currentScore = calcPromotionWeightedScore(records, profile.gradeScores, criteria.tenureYears, 0)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const reviewYear = resolveReviewYear(member.promotionReviewDate, criteria, levelTenureYears)
  const { projectedTotal, projectedGap } = calcProjectedPromotionScore(records, profile.gradeScores, criteria, reviewYear, auxSum)
  const simDelta = Math.round((projectedTotal - currentScore) * 10) / 10

  return (
    <div className="space-y-4">
      {/* 결과 -- 조건을 바꾸기 전에도 항상 맨 위에서 바로 보인다. 승진 가능
          여부 배지는 아코디언 헤더(MemberGrowthDetail)에 이미 있어서 여기서
          반복하지 않는다. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p className="text-[11px] text-gray-500">현재 점수</p>
          <p className="mt-1 text-2xl font-bold text-black">{currentScore.toFixed(1)}점</p>
        </div>
        <span className="text-xl text-gray-300" aria-hidden="true">
          +
        </span>
        <div>
          <p className="text-[11px] text-gray-500">시뮬레이션 가산</p>
          <p className="mt-1 text-2xl font-bold text-accent">
            {simDelta >= 0 ? '+' : ''}
            {simDelta.toFixed(1)}점
          </p>
        </div>
        <span className="text-xl text-gray-300" aria-hidden="true">
          →
        </span>
        <div>
          <p className="text-[11px] text-gray-500">최종 시뮬레이션 점수 ({reviewYear}년)</p>
          <p className="mt-1 text-2xl font-bold text-black">{projectedTotal.toFixed(1)}점</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-500">
        ※ 승진 자격 기준 대비 {projectedGap >= 0 ? '+' : ''}
        {projectedGap.toFixed(1)}점
      </p>

      {/* 인사평가 히스토리 -- 접고 펼 수 있음, 기본 노출. 이력 입력 바로
          위에 보조지표 입력과 기준 보기 버튼을 나란히 둬서, 숨겨진 별도
          섹션을 열지 않아도 바로 보이고 바로 입력할 수 있게 한다. */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setHistoryOpen((v) => !v)} className="text-xs font-medium text-gray-400 hover:text-accent">
            {historyOpen ? '− 인사평가 히스토리 접기' : '인사평가 히스토리 보기 →'}
          </button>
          <button onClick={() => setCriteriaModalOpen(true)} className="shrink-0 text-[11px] font-medium text-gray-400 hover:text-accent">
            ⓘ 기준 보기
          </button>
        </div>
        {historyOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <p className="shrink-0 text-[11px] font-semibold text-gray-500">보조지표</p>
              {AUX_KEYS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  {label}
                  <input
                    type="number"
                    value={aux[key]}
                    onChange={(e) => setAux((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0"
                    className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                  />
                </label>
              ))}
              <span className="ml-auto shrink-0 text-[11px] text-gray-400">합계 {auxSum}점</span>
            </div>
            <HRAppraisalHistoryPanel member={member} />
          </div>
        )}
      </div>

      {criteriaModalOpen && (
        <CriteriaReferenceModal
          gradeScores={profile.gradeScores}
          promotionCriteria={profile.promotionCriteria}
          onClose={() => setCriteriaModalOpen(false)}
        />
      )}
    </div>
  )
}

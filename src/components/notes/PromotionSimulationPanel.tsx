import { useState } from 'react'
import type { TeamMember } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { auxScoreSum, calcProjectedPromotionScore, calcPromotionWeightedScore, findPromotionCriteria, resolveReviewYear } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import HRAppraisalHistoryPanel from './HRAppraisalHistoryPanel'

// 보조지표 -- 승진서열화점수에 그대로 합산되는 입력값(직책/상벌/체류/교육).
// 팀원 데이터에 저장되므로 엑셀로 가져오거나 여기서 직접 입력해도 현재
// 점수·시뮬레이션 점수 양쪽에 똑같이 반영된다.
const AUX_KEYS = [
  { key: 'position', label: '직책' },
  { key: 'reward', label: '상벌' },
  { key: 'tenure', label: '체류' },
  { key: 'education', label: '교육' },
] as const
type AuxKey = (typeof AUX_KEYS)[number]['key']

// 성장 시뮬레이션 -- 현재→예상 점수 결과를 최우선으로 보여주고, 그 아래
// 인사평가 히스토리(입력 소스)와 보조지표 입력을 한 화면에 붙여 둔다.
// 가중치/승진자격 기준은 이 컴포넌트가 직접 띄우지 않고, 상위(MemberGrowthDetail)의
// 공용 "승진 기준" 모달을 열어 달라고 요청만 한다 -- 예전엔 여기서 조회 전용
// 팝업, 위에서 수정용 팝업을 따로 띄워 같은 내용이 두 가지 모양으로 보였다.
export default function PromotionSimulationPanel({ member, onOpenCriteria }: { member: TeamMember; onOpenCriteria: () => void }) {
  const { dispatch } = useAppState()
  const { profile } = useTeamProfile()
  const records = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)

  const [historyOpen, setHistoryOpen] = useState(true)
  const auxSum = auxScoreSum(member.auxScores)

  function setAux(key: AuxKey, value: string) {
    const n = value === '' ? 0 : Number(value)
    if (!Number.isFinite(n)) return
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, auxScores: { ...member.auxScores, [key]: n } } })
  }

  if (!criteria) {
    return <p className="text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
  }

  const currentScore = calcPromotionWeightedScore(records, profile.gradeScores, criteria.tenureYears, auxSum)
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
          <p className="text-[11px] text-gray-500" title="승급심사 예정년도까지 남은 미입력 연도를 기존 실적 평균으로 예측한 만큼의 증가분입니다.">
            시뮬레이션 가산 ⓘ
          </p>
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
          <button onClick={onOpenCriteria} className="shrink-0 text-sm font-bold text-promo hover:underline">
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
                    value={member.auxScores?.[key] ?? ''}
                    onChange={(e) => setAux(key, e.target.value)}
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
    </div>
  )
}

import type { TeamMember } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { auxScoreSum, findPromotionCriteria } from '../../utils/promotion'
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

// 성장 시뮬레이션 -- 현재→예상 점수 결과는 이 패널이 아니라 상위
// (MemberGrowthDetail)의 요약카드에서 보여준다(가장 중요한 숫자라
// 화면을 열자마자 보여야 한다). 이 패널은 그 점수의 입력 소스인
// 보조지표와 인사평가 히스토리를 바로 만질 수 있는 시뮬레이터
// 그 자체다. 가중치/승진자격 기준은 이 컴포넌트가 직접 띄우지 않고,
// 상위의 공용 "승진 기준" 모달을 열어 달라고 요청만 한다.
export default function PromotionSimulationPanel({ member }: { member: TeamMember }) {
  const { dispatch } = useAppState()
  const { profile } = useTeamProfile()
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const auxSum = auxScoreSum(member.auxScores)

  function setAux(key: AuxKey, value: string) {
    const n = value === '' ? 0 : Number(value)
    if (!Number.isFinite(n)) return
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, auxScores: { ...member.auxScores, [key]: n } } })
  }

  if (!criteria) {
    return <p className="text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
  }

  return (
    <div className="space-y-3">
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
  )
}

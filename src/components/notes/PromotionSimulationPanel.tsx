import type { TeamMember } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { findPromotionCriteria } from '../../utils/promotion'
import HRAppraisalHistoryPanel from './HRAppraisalHistoryPanel'

// 성장 시뮬레이션 -- 현재→예상 점수 결과는 이 패널이 아니라 상위
// (MemberGrowthDetail)의 요약카드에서 보여준다(가장 중요한 숫자라
// 화면을 열자마자 보여야 한다). 이 패널은 그 점수의 입력 소스인
// 인사평가 히스토리(등급 입력 + 보조지표)를 바로 만질 수 있는
// 시뮬레이터 그 자체다. 가중치/승진자격 기준은 이 컴포넌트가 직접
// 띄우지 않고, 상위의 공용 "승진 기준" 모달을 열어 달라고 요청만 한다.
export default function PromotionSimulationPanel({ member }: { member: TeamMember }) {
  const { profile } = useTeamProfile()
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)

  if (!criteria) {
    return <p className="text-sm text-gray-400">{member.level || '이 직급'}에 대한 승진 기준이 설정되지 않았습니다.</p>
  }

  return <HRAppraisalHistoryPanel member={member} />
}

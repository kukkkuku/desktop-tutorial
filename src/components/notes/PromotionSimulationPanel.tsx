import type { Level, TeamMember } from '../../types'
import { LEVEL_OPTIONS } from '../../types'
import { useAppState } from '../../state/AppContext'
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
  const { dispatch } = useAppState()
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)

  // 직급이 비어 있으면(시트 담당자에서 추가한 팀원 등) 어느 승진 단계인지 몰라 시뮬레이션을 못 한다.
  // 막다른 안내 대신 여기서 바로 직급을 고르게 한다.
  if (!criteria) {
    const levels = profile.promotionCriteria.map((c) => c.fromLevel)
    return (
      <div className="rounded-card bg-[#F7F7F9] p-4">
        <p className="text-[13px] font-medium text-label">
          {member.level ? `${member.level}의 다음 승진 기준이 없습니다.` : '직급이 없어 승진 시뮬레이션을 할 수 없습니다.'}
        </p>
        <p className="mt-1 text-xs text-label-2">
          {member.level
            ? `승진 기준에는 ${levels.join('·') || '아무 직급도'} 기준만 있습니다. 직급이 맞는지 확인하세요.`
            : '직급을 고르면 승진자격 점수와 연도별 등급 입력표가 나옵니다.'}
        </p>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-label-2">
          직급
          <select
            value={member.level}
            onChange={(e) => dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, level: e.target.value as Level | '' } })}
            className="h-8 rounded-control border border-hairline px-2.5 text-[13px] text-label"
          >
            <option value="">선택</option>
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
    )
  }

  return <HRAppraisalHistoryPanel member={member} />
}

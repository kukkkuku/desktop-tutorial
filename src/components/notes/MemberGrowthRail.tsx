import { Upload, Users } from 'lucide-react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { calcMemberResults, GRADE_COLORS } from '../../utils/calculations'
import { auxScoreSum, calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import Badge from '../Badge'
import { ic } from '../ui/icon'
import type { TeamMember } from '../../types'
import { peerInputsOf } from '../../utils/peerScores'

interface MemberGrowthRailProps {
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onManageTeam: () => void
  onImportHistory: () => void
}

// 팀원 탭 -- 브라우저 탭처럼 위쪽 모서리만 둥글고, 선택된 탭은 흰 배경으로
// 아래 본문과 이어져 보이게 한다(구분선 없이 바로 붙음). 이름 앞에는
// 팀원 색상 대신 이번 고과 등급 배지를 붙여, 탭만 훑어봐도 등급이 바로
// 보이게 한다("황"처럼 성만 보여주는 아바타는 불필요한 정보였다). 승진
// 가능 여부도 상세 화면 헤더 대신 여기서 바로 보여준다.
//
// 폭은 브라우저 탭처럼 기본 200px에서 시작해, 팀원이 늘어나 다 못 들어가면
// 탭들이 균등하게 줄어든다(flex-basis 200px + shrink, 바닥은 88px). "팀원
// 관리" 버튼은 이 그룹 밖에 있어(shrink-0) 늘 고정 크기를 유지한다.
export default function MemberGrowthRail({ selectedMemberId, onSelectMember, onManageTeam, onImportHistory }: MemberGrowthRailProps) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const activeMembers = state.members.filter((m) => m.active)
  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, peerInputsOf(state))

  function currentGrade(memberId: string) {
    return memberResults.find((r) => r.member.id === memberId)?.grade ?? null
  }

  // 승진 가능 여부 -- MemberGrowthDetail 헤더와 같은 계산(각자 재계산 컨벤션).
  // 자격 기준 미달이면 배지를 아예 보여주지 않는다(탭 폭이 좁아 "승진까지
  // N점 필요" 같은 긴 문구까지 넣을 자리가 없다).
  function isPromotionEligible(member: TeamMember) {
    const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)
    if (!criteria) return false
    const appraisals = profile.hrAppraisals.filter((r) => r.memberId === member.id)
    const levelTenureYears = calcYearsSince(member.currentLevelSince)
    const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores, auxScoreSum(member.auxScores), levelTenureYears)
    const currentWeightedScore = readiness?.weightedScore ?? 0
    return currentWeightedScore >= criteria.requiredScore
  }

  // 등급 배지(피그마): S 파랑 · B 노랑 · 없음 회색 점. 그 밖의 등급은 기존 등급 색
  const badgeTone = (grade: string | null) =>
    grade === 'S' ? 'bg-[#f0f6ff] text-[#3968ff]' : grade === 'B' ? 'bg-[#fffce8] text-[#be953c]' : grade ? GRADE_COLORS[grade as keyof typeof GRADE_COLORS] : 'bg-[#dadadd] text-[#be953c]'

  return (
    <div className="-mx-6 -mt-5 flex h-[38px] items-center gap-3 rounded-t-panel [background:var(--tabbar-bg,rgb(0_0_0/0.04))] px-4 lg:-mx-8">
      {/* 팀원 관리: 왼쪽 메뉴의 팀원관리와 같은 사람 겹침 아이콘만 */}
      <button
        onClick={onManageTeam}
        title="팀원 관리"
        aria-label="팀원 관리"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-label-2 hover:bg-black/[0.06] hover:text-label"
      >
        <Users size={16} strokeWidth={1.8} />
      </button>
      <span className="h-3.5 w-px shrink-0 bg-[#d0d0d7]" />
      {/* 팀원 탭: 이름 길이만큼, 칸이 모자랄 때만 안 고른 탭이 줄어들며 … 처리(고른 탭은 이름 전체) */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 py-1">
        {activeMembers.length === 0 ? (
          <p className="px-2 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label-3">등록된 팀원이 없습니다.</p>
        ) : (
          activeMembers.map((member, mi) => {
            const isSelected = selectedMemberId === member.id
            const grade = currentGrade(member.id)
            const eligible = isPromotionEligible(member)
            return (
              <button
                key={member.id}
                onClick={() => onSelectMember(member.id)}
                title={member.name}
                className={`flex h-[26px] min-w-[48px] max-w-[220px] select-none items-center gap-1.5 rounded-[10px] px-[11px] text-left text-[length:calc(13px*var(--ui-fs,1))] transition-colors ${
                  isSelected
                    ? 'l1-tab-on flex-none font-semibold text-label'
                    : `relative flex-[0_1_auto] font-medium text-label-2 hover:bg-black/[0.06] hover:text-label ${activeMembers[mi + 1]?.id === selectedMemberId ? '' : 'l1-tab-sep'}`
                }`}
              >
                <span className={`flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-[4px] px-1 text-[11px] font-semibold ${badgeTone(grade)}`}>{grade ?? '·'}</span>
                <span className="min-w-0 truncate">{member.name}</span>
                {eligible && (
                  <Badge tone="accent" className="min-w-0 shrink truncate">
                    승진 가능
                  </Badge>
                )}
              </button>
            )
          })
        )}
      </div>
      {/* 승진 시뮬레이션 엑셀 가져오기(이름으로 매칭해 여러 팀원에게 한 번에 적용) -- 탭 줄 오른쪽 끝 아이콘 */}
      <button
        onClick={onImportHistory}
        title="지난 성과 엑셀파일 불러오기"
        aria-label="지난 성과 엑셀파일 불러오기"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-label-2 hover:bg-black/[0.06] hover:text-label"
      >
        <Upload {...ic} />
      </button>
    </div>
  )
}

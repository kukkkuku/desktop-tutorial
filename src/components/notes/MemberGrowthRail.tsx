import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { calcMemberResults, GRADE_COLORS } from '../../utils/calculations'
import { auxScoreSum, calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import Badge from '../Badge'
import type { TeamMember } from '../../types'

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

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
export default function MemberGrowthRail({ selectedMemberId, onSelectMember, onManageTeam, onImportHistory }: MemberGrowthRailProps) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const activeMembers = state.members.filter((m) => m.active)
  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)

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

  return (
    <div className="flex items-end gap-1 overflow-x-auto px-3 pt-2">
      {activeMembers.length === 0 ? (
        <p className="px-2 py-2.5 text-[13px] text-gray-400">등록된 팀원이 없습니다.</p>
      ) : (
        activeMembers.map((member) => {
          const isSelected = selectedMemberId === member.id
          const grade = currentGrade(member.id)
          const eligible = isPromotionEligible(member)
          return (
            <button
              key={member.id}
              onClick={() => onSelectMember(member.id)}
              className={`flex w-auto shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2.5 text-left transition-colors ${
                isSelected ? 'bg-white shadow-[0_-1px_0_rgba(0,0,0,0.04)]' : 'bg-gray-100 hover:bg-gray-200/70'
              }`}
            >
              <span className={`flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold ${grade ? GRADE_COLORS[grade] : 'bg-gray-200 text-gray-400'}`}>
                {grade ?? '-'}
              </span>
              <span className={`text-[13px] font-semibold ${isSelected ? 'text-black' : 'text-gray-500'}`}>{member.name}</span>
              {eligible && <Badge tone="accent">승진 가능</Badge>}
            </button>
          )
        })
      )}
      <button
        onClick={onManageTeam}
        className="mb-1 ml-2 shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:bg-white/60 hover:text-accent"
      >
        팀원 관리
      </button>

      {/* 승진 시뮬레이션 엑셀 가져오기 -- 이름으로 매칭해 한 번에 여러 팀원에게
          적용되므로 특정 팀원 화면이 아니라 탭 바 우측(전체 팀원 대상)에 둔다.
          버튼 스타일은 다른 화면의 엑셀 업로드 버튼(TitleUploadControls)과 통일. */}
      <button
        onClick={onImportHistory}
        className="mb-1 ml-auto flex shrink-0 items-center gap-1.5 rounded-md border-2 border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-blue-50"
      >
        <UploadIcon className="h-4 w-4" /> 엑셀로 가져오기
      </button>
    </div>
  )
}

import { useAppState } from '../../state/AppContext'

interface MemberGrowthRailProps {
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onManageTeam: () => void
}

// 상단 팀원 탭 -- 세로 카드 레일 대신 이름만 보이는 가벼운 가로 탭으로 팀원을
// 전환한다. 등급·준비도 같은 상세 정보는 선택 후 본문(MemberGrowthDetail)의
// 프로필 요약에서 확인하므로 탭 자체는 단순하게 유지한다.
export default function MemberGrowthRail({ selectedMemberId, onSelectMember, onManageTeam }: MemberGrowthRailProps) {
  const { state } = useAppState()
  const activeMembers = state.members.filter((m) => m.active)

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
      {activeMembers.length === 0 ? (
        <p className="px-2 py-2 text-[13px] text-gray-400">등록된 팀원이 없습니다.</p>
      ) : (
        activeMembers.map((member) => {
          const isSelected = selectedMemberId === member.id
          return (
            <button
              key={member.id}
              onClick={() => onSelectMember(member.id)}
              className={`shrink-0 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ${
                isSelected ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-black'
              }`}
            >
              {member.name}
            </button>
          )
        })
      )}
      <button
        onClick={onManageTeam}
        className="ml-auto shrink-0 rounded-md px-3 py-2 text-[13px] font-semibold text-gray-400 hover:bg-gray-100 hover:text-black"
      >
        팀원 관리
      </button>
    </div>
  )
}

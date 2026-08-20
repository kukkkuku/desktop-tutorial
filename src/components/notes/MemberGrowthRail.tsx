import { useAppState } from '../../state/AppContext'
import { colorForIndex } from '../../utils/memberColors'

interface MemberGrowthRailProps {
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onManageTeam: () => void
}

// 팀원 탭 -- 브라우저 탭처럼 위쪽 모서리만 둥글고, 선택된 탭은 흰 배경으로
// 아래 본문과 이어져 보이게 한다(구분선 없이 바로 붙음). 탭 안에는 팀원
// 색상의 작은 폴더 아이콘 + 이름만 담아 가볍게 유지한다.
export default function MemberGrowthRail({ selectedMemberId, onSelectMember, onManageTeam }: MemberGrowthRailProps) {
  const { state } = useAppState()
  const activeMembers = state.members.filter((m) => m.active)

  return (
    <div className="flex items-end gap-1 overflow-x-auto px-3 pt-2">
      {activeMembers.length === 0 ? (
        <p className="px-2 py-2.5 text-[13px] text-gray-400">등록된 팀원이 없습니다.</p>
      ) : (
        activeMembers.map((member) => {
          const isSelected = selectedMemberId === member.id
          const colorIdx = state.members.findIndex((m) => m.id === member.id)
          return (
            <button
              key={member.id}
              onClick={() => onSelectMember(member.id)}
              className={`flex w-40 shrink-0 items-center gap-2 rounded-t-lg px-3 py-2.5 text-left transition-colors ${
                isSelected ? 'bg-white shadow-[0_-1px_0_rgba(0,0,0,0.04)]' : 'bg-gray-100 hover:bg-gray-200/70'
              }`}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                style={{ background: colorForIndex(colorIdx) }}
              >
                {member.name.charAt(0)}
              </span>
              <span className={`truncate text-[13px] font-semibold ${isSelected ? 'text-black' : 'text-gray-500'}`}>{member.name}</span>
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
    </div>
  )
}

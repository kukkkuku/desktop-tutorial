import { useAppState } from '../../state/AppContext'
import { colorForIndex } from '../../utils/memberColors'

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
// 아래 본문과 이어져 보이게 한다(구분선 없이 바로 붙음). 탭 안에는 팀원
// 색상의 작은 폴더 아이콘 + 이름만 담아 가볍게 유지한다.
export default function MemberGrowthRail({ selectedMemberId, onSelectMember, onManageTeam, onImportHistory }: MemberGrowthRailProps) {
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

// 팀원 초대 창(홈 「우리 팀」 · 성과관리 평가 목록): 평가가 없어도 우리 팀 명단에 팀원을 추가하고 초대 메일을 보낸다.
// 평가가 생기면 성과관리 › 팀원관리 표에서 이어서 관리한다.
import { X } from 'lucide-react'
import TeamAccountsPanel from './TeamAccountsPanel'

export default function InviteModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-6xl rounded-[16px] bg-canvas p-6 shadow-pop">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-[length:calc(17px*var(--ui-fs,1))] font-semibold text-label">팀원 초대</h3>
          <span className="text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">평가를 만들면 성과관리 › 팀원관리 표에서 이어서 관리합니다</span>
          <button onClick={onClose} aria-label="닫기" className="ml-auto flex h-8 w-8 items-center justify-center rounded-[8px] text-label-2 hover:bg-black/[0.06]">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <TeamAccountsPanel />
      </div>
    </div>
  )
}

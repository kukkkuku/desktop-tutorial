import { createContext, useContext, useState, type ReactNode } from 'react'
import MemberDetailDrawer from '../components/member-detail/MemberDetailDrawer'
import type { NotesSubTab } from '../components/notes/NotesStage'

interface MemberDetailContextValue {
  openMemberDetail: (memberId: string) => void
}

const MemberDetailContext = createContext<MemberDetailContextValue | undefined>(undefined)

// 데이터>팀원, 결과 어디에서 팀원 이름을 클릭하든 동일한 팀원 상세 Drawer/Sheet가
// 열리도록 하는 전역 진입점. Drawer 자체는 요약만 보여주고, 실제 상세 내용(성과
// 히스토리·인사평가·승진 관리·면담 기록)은 모두 면담 탭의 서브탭으로 이동시킨다.
export function MemberDetailProvider({
  onNavigateToNotes,
  children,
}: {
  onNavigateToNotes: (memberId: string, subTab: NotesSubTab) => void
  children: ReactNode
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  function openMemberDetail(memberId: string) {
    setOpenId(memberId)
  }

  function close() {
    setOpenId(null)
  }

  return (
    <MemberDetailContext.Provider value={{ openMemberDetail }}>
      {children}
      {openId && (
        <MemberDetailDrawer
          memberId={openId}
          onClose={close}
          onNavigateToNotes={(subTab) => {
            const memberId = openId
            close()
            onNavigateToNotes(memberId, subTab)
          }}
        />
      )}
    </MemberDetailContext.Provider>
  )
}

export function useMemberDetail() {
  const ctx = useContext(MemberDetailContext)
  if (!ctx) throw new Error('useMemberDetail must be used within MemberDetailProvider')
  return ctx
}

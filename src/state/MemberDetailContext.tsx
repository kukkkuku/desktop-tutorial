import { createContext, useContext, useState, type ReactNode } from 'react'
import type { WorkspaceMeta } from '../types'
import MemberDetailDrawer, { type DetailTab } from '../components/member-detail/MemberDetailDrawer'

interface MemberDetailContextValue {
  openMemberDetail: (memberId: string, tab?: DetailTab) => void
}

const MemberDetailContext = createContext<MemberDetailContextValue | undefined>(undefined)

// 데이터>팀원, 결과, 면담 어디에서 팀원 이름을 클릭하든 동일한 팀원 상세
// Drawer/Sheet가 열리도록 하는 전역 진입점. Desktop=Drawer, Mobile=Full Screen Sheet는
// MemberDetailDrawer 내부의 반응형 클래스 하나로 처리된다(컴포넌트는 하나뿐).
export function MemberDetailProvider({
  periods,
  onGoToMeetingPrep,
  children,
}: {
  periods: WorkspaceMeta[]
  onGoToMeetingPrep: (memberId: string) => void
  children: ReactNode
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')

  function openMemberDetail(memberId: string, initialTab: DetailTab = 'overview') {
    setOpenId(memberId)
    setTab(initialTab)
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
          tab={tab}
          onTabChange={setTab}
          onClose={close}
          periods={periods}
          onOpenMeetingPrep={(memberId) => {
            close()
            onGoToMeetingPrep(memberId)
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

import { useEffect, useState } from 'react'
import TeamGrowthDashboard from './TeamGrowthDashboard'
import MemberGrowthDetail from './MemberGrowthDetail'
import MeetingScheduleDrawer from './MeetingScheduleDrawer'

// NotesSubTab/NotesNavigationRequest는 다른 화면(팀원 상세 Drawer 등)이
// "이 팀원의 성장 관리 화면으로 이동"을 요청할 때 쓰는 진입점 계약이다.
// 성장 관리 안에 탭이 없으므로 subTab 값 자체는 더 쓰지 않지만(단, 'record'는
// 면담 입력창 자동 포커스 트리거로 남아있다), 호출부 시그니처를 유지하기 위해
// 타입은 남겨둔다.
export type NotesSubTab = 'record' | 'history' | 'promotion'

export interface NotesNavigationRequest {
  memberId: string
  subTab: NotesSubTab
  token: number
}

interface NotesStageProps {
  notesRequest?: NotesNavigationRequest | null
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// 팀원 성장 관리 = 팀장용 대시보드(팀 전체 상태) → 팀원별 통합 Growth
// Workspace(현재 성과·승진 시뮬레이션·면담 기록을 한 화면에서). 초고해상도에서
// 콘텐츠가 좌우로 끝없이 늘어나지 않도록 최대 폭을 두고 중앙 정렬한다. 면담
// 일정 캘린더는 상시 노출하지 않고, 상단 버튼으로 여는 Drawer로 뺐다.
export default function NotesStage({ notesRequest }: NotesStageProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  useEffect(() => {
    if (!notesRequest) return
    setSelectedMemberId(notesRequest.memberId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesRequest?.token])

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-black">팀원 성장 관리</h2>
          <p className="mt-1 text-sm text-gray-600">
            {selectedMemberId
              ? '이 팀원의 현재 성과, 승진 준비 상태와 면담 기록을 한 화면에서 관리하세요.'
              : '팀 전체 현황을 먼저 확인하고, 관리가 필요한 팀원부터 살펴보세요.'}
          </p>
        </div>
        <button
          onClick={() => setScheduleOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          <CalendarIcon className="h-4 w-4" />
          면담 일정
        </button>
      </div>

      <div className="mt-4">
        {selectedMemberId ? (
          <MemberGrowthDetail
            memberId={selectedMemberId}
            onBack={() => setSelectedMemberId(null)}
            prepRequest={notesRequest?.subTab === 'record' ? { memberId: notesRequest.memberId, token: notesRequest.token } : null}
          />
        ) : (
          <TeamGrowthDashboard onSelectMember={setSelectedMemberId} />
        )}
      </div>

      <MeetingScheduleDrawer
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSelectMember={(memberId) => setSelectedMemberId(memberId)}
      />
    </div>
  )
}

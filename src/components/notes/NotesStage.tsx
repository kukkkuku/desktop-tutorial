import { useEffect, useState } from 'react'
import { useAppState } from '../../state/AppContext'
import MemberGrowthRail from './MemberGrowthRail'
import MemberGrowthDetail from './MemberGrowthDetail'
import MeetingSchedulePanel from './MeetingSchedulePanel'

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
  onManageTeam: () => void
}

// 팀원 성장 관리 = 좌측 팀원 카드 레일 + 중앙 통합 상세(요약·최근 성과·성장
// 시뮬레이션·면담하기) + 우측 면담 일정. 팀원을 클릭하면 중앙이 그 팀원으로
// 바뀐다.
export default function NotesStage({ notesRequest, onManageTeam }: NotesStageProps) {
  const { state } = useAppState()
  const activeMembers = state.members.filter((m) => m.active)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(activeMembers[0]?.id ?? null)
  const [scheduleOpen, setScheduleOpen] = useState(true)

  useEffect(() => {
    if (!notesRequest) return
    setSelectedMemberId(notesRequest.memberId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesRequest?.token])

  // 팀원 목록이 로드된 뒤에도 아직 아무도 선택되지 않았거나, 선택된 팀원이
  // 더 이상 활성 목록에 없으면 첫 번째 활성 팀원으로 맞춘다.
  useEffect(() => {
    if (activeMembers.length === 0) return
    if (selectedMemberId && activeMembers.some((m) => m.id === selectedMemberId)) return
    setSelectedMemberId(activeMembers[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembers.map((m) => m.id).join(',')])

  return (
    <div className="flex items-start gap-5">
      <div className="w-64 shrink-0">
        <MemberGrowthRail selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} onManageTeam={onManageTeam} />
      </div>

      <div className="min-w-0 flex-1">
        {selectedMemberId ? (
          <MemberGrowthDetail
            memberId={selectedMemberId}
            prepRequest={notesRequest?.subTab === 'record' ? { memberId: notesRequest.memberId, token: notesRequest.token } : null}
          />
        ) : (
          <p className="rounded-lg border border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
            좌측에서 팀원을 선택하세요.
          </p>
        )}
      </div>

      <MeetingSchedulePanel open={scheduleOpen} onToggle={() => setScheduleOpen((v) => !v)} onSelectMember={setSelectedMemberId} />
    </div>
  )
}

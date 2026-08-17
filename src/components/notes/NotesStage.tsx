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
// 시뮬레이션·면담하기) + 우측 면담 일정. Figma 디자인 기준으로 레일/면담
// 일정은 옅은 회색 배경(bg-gray-50)에 담아 흰색 중앙 콘텐츠와 구분하고,
// 컬럼 사이 여백 없이 구분선(border)만으로 붙여서 <main>의 좌우/상하 여백을
// 상쇄한 채(-mx/-my) 화면 끝까지 채운다. 중앙 컬럼 자체에는 패딩을 주지
// 않는다 -- 프로필 요약 바(MemberGrowthDetail 최상단)가 레일/면담 일정의
// 구분선까지 여백 없이 이어져야 해서(Figma의 profile-summary가 바로 그
// 모양), 패딩은 요약 바 아래쪽 콘텐츠에만 개별적으로 준다.
export default function NotesStage({ notesRequest, onManageTeam }: NotesStageProps) {
  const { state } = useAppState()
  const activeMembers = state.members.filter((m) => m.active)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(activeMembers[0]?.id ?? null)
  const [scheduleOpen, setScheduleOpen] = useState(false)

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

  // -my-6로 상쇄한 main의 상하 padding(py-6, 총 3rem)만큼 min-h-full(부모
  // 컨텐츠 박스 100%)에 다시 더해줘야 실제로 main의 테두리 박스 끝까지
  // 닿는다 -- 안 그러면 위쪽 padding을 되찾은 만큼(패딩을 상쇄하려고 위로
  // 끌어올린 만큼) 정확히 그 폭만큼 아래쪽이 못 미치고, 거기에 원래
  // 상쇄됐어야 할 아래쪽 padding까지 더해져서 하단 배경/구분선이 총
  // 3rem(48px)씩 짧아진다.
  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100%+3rem)] items-stretch sm:-mx-6 lg:-mx-8">
      <div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <MemberGrowthRail selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} onManageTeam={onManageTeam} />
      </div>

      <div className="min-w-0 flex-1 bg-white">
        {selectedMemberId ? (
          <MemberGrowthDetail
            memberId={selectedMemberId}
            prepRequest={notesRequest?.subTab === 'record' ? { memberId: notesRequest.memberId, token: notesRequest.token } : null}
          />
        ) : (
          <p className="rounded-lg border border-gray-200 px-4 py-10 text-center text-sm text-gray-500 m-6">
            좌측에서 팀원을 선택하세요.
          </p>
        )}
      </div>

      <div className="shrink-0 border-l border-gray-200 bg-gray-50 p-4">
        <MeetingSchedulePanel open={scheduleOpen} onToggle={() => setScheduleOpen((v) => !v)} onSelectMember={setSelectedMemberId} />
      </div>
    </div>
  )
}

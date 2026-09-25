import { useEffect, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { useAppState } from '../../state/AppContext'
import MemberGrowthRail from './MemberGrowthRail'
import MemberGrowthDetail from './MemberGrowthDetail'
import MeetingSchedulePanel from './MeetingSchedulePanel'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import Button from '../Button'
import { icSm } from '../ui/icon'

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

// 팀원 성장 관리 = 상단 팀원 탭(브라우저 탭처럼 접힌 폴더 모양) + 중앙
// 통합 상세(요약·최근 성과·성장 시뮬레이션·면담하기) + 우측 면담 일정.
// 팀원 전환은 세로 목록이 아니라 상단에 나란히 붙은 탭으로 처리해서, 지금
// 보고 있는 팀원이 브라우저 탭처럼 본문 위에 얹혀 있는 느낌을 준다. 우측
// 면담 일정은 옅은 회색 배경(bg-[#F7F7F9])에 담아 흰색 중앙 콘텐츠와
// 구분하고, 컬럼 사이 여백 없이 구분선(border)만으로 붙여서 <main>의
// 좌우/상하 여백을 상쇄한 채(-mx/-my) 화면 끝까지 채운다. 중앙 컬럼
// 자체에는 패딩을 주지 않는다 -- 프로필 요약 바(MemberGrowthDetail
// 최상단)가 탭 바/면담 일정의 구분선까지 여백 없이 이어져야 해서, 패딩은
// 요약 바 아래쪽 콘텐츠에만 개별적으로 준다.
export default function NotesStage({ notesRequest, onManageTeam }: NotesStageProps) {
  const { state } = useAppState()
  const activeMembers = state.members.filter((m) => m.active)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(activeMembers[0]?.id ?? null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

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
    // 다른 화면과 같은 본문 여백 안에 둔다(예전엔 화면 끝까지 붙어 있었다).
    <div className="flex min-h-full flex-col">
      <div className="shrink-0">
        <MemberGrowthRail
          selectedMemberId={selectedMemberId}
          onSelectMember={setSelectedMemberId}
          onManageTeam={onManageTeam}
          onImportHistory={() => setImportOpen(true)}
        />
      </div>

      <div className="flex flex-1 items-stretch border-x border-b border-separator">
        <div className="min-w-0 flex-1 bg-white">
          {selectedMemberId ? (
            <MemberGrowthDetail
              memberId={selectedMemberId}
              prepRequest={notesRequest?.subTab === 'record' ? { memberId: notesRequest.memberId, token: notesRequest.token } : null}
            />
          ) : activeMembers.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-16 text-center">
              <Users size={40} strokeWidth={1.5} className="text-label-3" />
              <p className="text-[13px] font-semibold text-label">아직 등록된 팀원이 없습니다</p>
              <p className="text-[13px] text-label-2">팀원을 등록하면 여기서 성과·면담을 한눈에 관리할 수 있어요.</p>
              <Button variant="primary" onClick={onManageTeam} className="mt-1">
                <Plus {...icSm} /> 팀원 추가하기
              </Button>
            </div>
          ) : (
            <p className="rounded-card border border-separator px-4 py-10 text-center text-[13px] text-label-2 m-6">
              위에서 팀원을 선택하세요.
            </p>
          )}
        </div>

        <div className="shrink-0 border-l border-separator bg-[#F7F7F9] p-4">
          <MeetingSchedulePanel open={scheduleOpen} onToggle={() => setScheduleOpen((v) => !v)} onSelectMember={setSelectedMemberId} />
        </div>
      </div>

      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

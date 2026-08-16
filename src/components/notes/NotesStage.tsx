import { useEffect, useState } from 'react'
import TeamGrowthDashboard from './TeamGrowthDashboard'
import MemberGrowthDetail from './MemberGrowthDetail'

// NotesSubTab/NotesNavigationRequest는 다른 화면(팀원 상세 Drawer 등)이
// "이 팀원의 성장 관리 화면으로 이동"을 요청할 때 쓰는 진입점 계약이다.
// 이제 성장 관리 안에 탭이 없으므로 subTab 값 자체는 더 쓰지 않지만,
// 호출부 시그니처를 유지하기 위해 타입은 남겨둔다.
export type NotesSubTab = 'record' | 'history' | 'promotion'

export interface NotesNavigationRequest {
  memberId: string
  subTab: NotesSubTab
  token: number
}

interface NotesStageProps {
  notesRequest?: NotesNavigationRequest | null
}

// 팀원 성장 관리 = 팀장용 대시보드(팀 전체 상태) → 팀원별 통합 성장 관리(선택한
// 한 명의 현재 성과·승진 시뮬레이션·면담 기록을 한 화면에서). 팀원을 클릭하면
// 상세로 넘어가고, "팀 현황으로"를 누르면 다시 대시보드로 돌아온다.
export default function NotesStage({ notesRequest }: NotesStageProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  useEffect(() => {
    if (!notesRequest) return
    setSelectedMemberId(notesRequest.memberId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesRequest?.token])

  return (
    <div>
      <h2 className="text-xl font-bold text-black">팀원 성장 관리</h2>
      <p className="mt-1 text-sm text-gray-600">
        {selectedMemberId ? '이 팀원의 현재 성과, 승진 준비 상태와 면담 기록을 한 화면에서 관리하세요.' : '팀 전체 현황을 먼저 확인하고, 관리가 필요한 팀원부터 살펴보세요.'}
      </p>

      <div className="mt-4">
        {selectedMemberId ? (
          <MemberGrowthDetail
            memberId={selectedMemberId}
            onBack={() => setSelectedMemberId(null)}
            onSelectMember={setSelectedMemberId}
            prepRequest={notesRequest?.subTab === 'record' ? { memberId: notesRequest.memberId, token: notesRequest.token } : null}
          />
        ) : (
          <TeamGrowthDashboard onSelectMember={setSelectedMemberId} />
        )}
      </div>
    </div>
  )
}

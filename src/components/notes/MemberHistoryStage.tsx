import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'

export default function MemberHistoryStage({ selectedMemberId }: { selectedMemberId: string | null }) {
  const { state } = useAppState()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === selectedMemberId)

  if (!member) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">팀원을 선택하세요.</p>
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-black">{member.name}의 성과 히스토리</h3>
      <p className="mt-1 text-sm text-gray-600">
        평가하기·결과에서 이미 계산된 성과 데이터를 평가기간별로 모아 보여줍니다. 여기서 다시 입력하지 않습니다.
      </p>
      <div className="mt-4 max-w-2xl">
        <MemberPerformanceHistoryPanel memberId={member.id} periods={periods} />
      </div>
    </div>
  )
}

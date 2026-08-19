import { useEffect, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import TaskManagement from './TaskManagement'
import TeamManagement from './TeamManagement'
import PeerReviewManagement from './PeerReviewManagement'
import ImportFromPreviousDialog from './ImportFromPreviousDialog'

type DataSubTab = 'tasks' | 'members' | 'peer'

export interface DataSubTabRequest {
  subTab: DataSubTab
  token: number
}

const SUB_TABS: { key: DataSubTab; label: string }[] = [
  { key: 'tasks', label: '과제' },
  { key: 'members', label: '팀원' },
  { key: 'peer', label: '피어리뷰' },
]

interface DataStageProps {
  // 다른 화면(성장 관리의 "팀원 관리" 버튼 등)이 특정 서브탭을 열어달라고
  // 요청할 때 쓰는 진입점 -- token이 바뀔 때마다 그 서브탭으로 전환한다.
  subTabRequest?: DataSubTabRequest | null
}

export default function DataStage({ subTabRequest }: DataStageProps) {
  const [sub, setSub] = useState<DataSubTab>(subTabRequest?.subTab ?? 'tasks')
  const { workspaceId } = useAppState()
  const { currentWorkspace, workspaces } = useWorkspaces()
  const [importOpen, setImportOpen] = useState(false)
  const teamName = currentWorkspace?.teamName ?? ''
  const hasOtherPeriods = workspaces.some((w) => w.teamName === teamName && w.id !== workspaceId)

  useEffect(() => {
    if (!subTabRequest) return
    setSub(subTabRequest.subTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTabRequest?.token])

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSub(tab.key)}
              className={`border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                sub === tab.key ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {hasOtherPeriods && (sub === 'tasks' || sub === 'members') && (
          <button onClick={() => setImportOpen(true)} className="mb-2 text-xs font-medium text-gray-400 hover:text-accent">
            이전 평가에서 가져오기
          </button>
        )}
      </div>

      {importOpen && (
        <ImportFromPreviousDialog teamName={teamName} currentWorkspaceId={workspaceId} onClose={() => setImportOpen(false)} />
      )}

      <div className="mt-5">
        {sub === 'tasks' && <TaskManagement />}
        {sub === 'members' && <TeamManagement />}
        {sub === 'peer' && <PeerReviewManagement />}
      </div>
    </div>
  )
}

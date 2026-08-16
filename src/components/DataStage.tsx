import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useUploadsLog } from '../hooks/useUploadsLog'
import DataUploadPanel from './DataUploadPanel'
import TaskManagement from './TaskManagement'
import TeamManagement from './TeamManagement'
import PeerReviewManagement from './PeerReviewManagement'

type DataSubTab = 'tasks' | 'members' | 'peer'

const SUB_TABS: { key: DataSubTab; label: string }[] = [
  { key: 'tasks', label: '과제' },
  { key: 'members', label: '팀원' },
  { key: 'peer', label: '피어리뷰' },
]

export default function DataStage() {
  const [sub, setSub] = useState<DataSubTab>('tasks')
  const { workspaceId } = useAppState()
  const { uploadsLog, recordUpload } = useUploadsLog(workspaceId)

  return (
    <div>
      <div className="flex border-b border-gray-200">
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

      {/* DataUploadPanel은 position:fixed라 문서 흐름에서 공간을 차지하지
          않으므로, 접힌 바에 마지막 행이 항상 가려지지 않도록 여기서
          여유 공간을 직접 확보한다. */}
      <div className="mt-5 pb-20">
        {sub === 'tasks' && <TaskManagement onUploaded={(files) => recordUpload('task', files)} />}
        {sub === 'members' && <TeamManagement onUploaded={(files) => recordUpload('member', files)} />}
        {sub === 'peer' && <PeerReviewManagement onUploaded={(files) => recordUpload('peer', files)} />}
      </div>

      <DataUploadPanel uploadsLog={uploadsLog} recordUpload={recordUpload} />
    </div>
  )
}

import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useUploadsLog } from '../hooks/useUploadsLog'
import DataUploadBar from './DataUploadBar'
import DataUploadExpandedPanel from './DataUploadExpandedPanel'
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
  const [expanded, setExpanded] = useState(false)
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

      <div className="mt-5">
        {sub === 'tasks' && <TaskManagement onUploaded={(files) => recordUpload('task', files)} />}
        {sub === 'members' && <TeamManagement onUploaded={(files) => recordUpload('member', files)} />}
        {sub === 'peer' && <PeerReviewManagement onUploaded={(files) => recordUpload('peer', files)} />}
      </div>

      {/* 스크롤이 길어지면 뷰포트 하단에 붙어 떠 있다가, 펼치면 그 자리에서
          위로 자라나며 테이블 위를 덮는다 -- 문서 흐름을 밀어내지 않는다. */}
      <div className="sticky bottom-0 z-20 mt-5 bg-white">
        <div
          className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${
            expanded ? 'max-h-[70vh]' : 'max-h-0'
          }`}
        >
          <DataUploadExpandedPanel onClose={() => setExpanded(false)} recordUpload={recordUpload} />
        </div>
        <DataUploadBar expanded={expanded} onToggle={() => setExpanded((v) => !v)} uploadsLog={uploadsLog} />
      </div>
    </div>
  )
}

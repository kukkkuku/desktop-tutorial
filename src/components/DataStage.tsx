import { useState } from 'react'
import DataManagementPanel from './DataManagementPanel'
import TaskManagement from './TaskManagement'
import TeamManagement from './TeamManagement'

type DataSubTab = 'tasks' | 'members'

const SUB_TABS: { key: DataSubTab; label: string }[] = [
  { key: 'tasks', label: '과제' },
  { key: 'members', label: '팀원' },
]

export default function DataStage() {
  const [sub, setSub] = useState<DataSubTab>('tasks')

  return (
    <div>
      <DataManagementPanel />

      <div className="mt-5 flex border-b border-gray-200">
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
        {sub === 'tasks' && <TaskManagement />}
        {sub === 'members' && <TeamManagement />}
      </div>
    </div>
  )
}

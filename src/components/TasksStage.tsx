import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import TaskManagement from './TaskManagement'
import ImportFromPreviousDialog from './ImportFromPreviousDialog'

export default function TasksStage() {
  const { workspaceId } = useAppState()
  const { currentWorkspace, workspaces } = useWorkspaces()
  const [importOpen, setImportOpen] = useState(false)
  const teamName = currentWorkspace?.teamName ?? ''
  const hasOtherPeriods = workspaces.some((w) => w.teamName === teamName && w.id !== workspaceId)

  return (
    <div>
      {hasOtherPeriods && (
        <div className="flex justify-end border-b border-gray-200 pb-2">
          <button onClick={() => setImportOpen(true)} className="text-xs font-medium text-gray-400 hover:text-accent">
            이전 평가에서 가져오기
          </button>
        </div>
      )}

      {importOpen && (
        <ImportFromPreviousDialog teamName={teamName} currentWorkspaceId={workspaceId} onClose={() => setImportOpen(false)} />
      )}

      <div className="mt-5">
        <TaskManagement onImportPrevious={hasOtherPeriods ? () => setImportOpen(true) : undefined} />
      </div>
    </div>
  )
}

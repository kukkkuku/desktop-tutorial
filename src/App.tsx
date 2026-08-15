import { useState } from 'react'
import { AppProvider } from './state/AppContext'
import { WorkspaceProvider, useWorkspaces } from './state/WorkspaceContext'
import Sidebar from './components/Sidebar'
import StageTabs, { type Stage, type DataSubTab } from './components/StageTabs'
import WorkspaceLanding from './components/WorkspaceLanding'
import AddPeriodModal from './components/AddPeriodModal'
import TaskManagement from './components/TaskManagement'
import TeamManagement from './components/TeamManagement'
import EvaluationStage from './components/EvaluationStage'
import MeetingNotes from './components/MeetingNotes'
import DataManagementPanel from './components/DataManagementPanel'
import SettingsPage from './components/SettingsPage'

function WorkspaceApp({ workspaceId }: { workspaceId: string }) {
  const [stage, setStage] = useState<Stage>('data')
  const [dataSubTab, setDataSubTab] = useState<DataSubTab>('tasks')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addPeriodOpen, setAddPeriodOpen] = useState(false)
  const { workspaces, currentWorkspace, selectWorkspace, createWorkspace, exitToLanding } = useWorkspaces()

  function handleStageChange(next: Stage) {
    setSettingsOpen(false)
    setStage(next)
    window.scrollTo(0, 0)
  }

  function handleDataSubTabChange(next: DataSubTab) {
    setDataSubTab(next)
    window.scrollTo(0, 0)
  }

  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)

  function handleAddPeriod(periodName: string) {
    createWorkspace(teamName, periodName)
    setAddPeriodOpen(false)
  }

  return (
    <AppProvider workspaceId={workspaceId}>
      <div className="flex min-h-screen flex-col bg-white sm:flex-row">
        <Sidebar
          teamName={teamName}
          currentWorkspaceId={workspaceId}
          periods={periods}
          onSelectPeriod={selectWorkspace}
          onAddPeriod={() => setAddPeriodOpen(true)}
          onExit={exitToLanding}
          settingsActive={settingsOpen}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="min-w-0 flex-1">
          {!settingsOpen && (
            <StageTabs
              stage={stage}
              onStageChange={handleStageChange}
              dataSubTab={dataSubTab}
              onDataSubTabChange={handleDataSubTabChange}
            />
          )}
          <main className="mx-auto w-full max-w-[1920px] px-4 py-6 sm:px-6">
            {settingsOpen ? (
              <SettingsPage />
            ) : (
              <>
                {stage === 'data' && (
                  <div className="space-y-6">
                    <DataManagementPanel />
                    {dataSubTab === 'tasks' && <TaskManagement />}
                    {dataSubTab === 'members' && <TeamManagement />}
                  </div>
                )}
                {stage === 'evaluation' && <EvaluationStage />}
                {stage === 'notes' && <MeetingNotes />}
              </>
            )}
          </main>
        </div>
      </div>
      {addPeriodOpen && (
        <AddPeriodModal teamName={teamName} onSave={handleAddPeriod} onClose={() => setAddPeriodOpen(false)} />
      )}
    </AppProvider>
  )
}

function WorkspaceGate() {
  const { currentWorkspaceId } = useWorkspaces()
  if (!currentWorkspaceId) return <WorkspaceLanding />
  return <WorkspaceApp key={currentWorkspaceId} workspaceId={currentWorkspaceId} />
}

export default function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceGate />
    </WorkspaceProvider>
  )
}

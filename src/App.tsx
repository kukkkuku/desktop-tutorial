import { useState } from 'react'
import { AppProvider } from './state/AppContext'
import { WorkspaceProvider, useWorkspaces } from './state/WorkspaceContext'
import Navigation, { type TabKey } from './components/Navigation'
import WorkspaceLanding from './components/WorkspaceLanding'
import AddPeriodModal from './components/AddPeriodModal'
import TaskManagement from './components/TaskManagement'
import TeamManagement from './components/TeamManagement'
import EvaluationMatrix from './components/EvaluationMatrix'
import CriteriaConfiguration from './components/CriteriaConfiguration'
import EvaluationResults from './components/EvaluationResults'
import MeetingNotes from './components/MeetingNotes'

function WorkspaceApp({ workspaceId }: { workspaceId: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('tasks')
  const [addPeriodOpen, setAddPeriodOpen] = useState(false)
  const { workspaces, currentWorkspace, selectWorkspace, createWorkspace, exitToLanding } = useWorkspaces()

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab)
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
      <div className="min-h-screen bg-white">
        <Navigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          teamName={teamName}
          currentWorkspaceId={workspaceId}
          periods={periods}
          onSelectPeriod={selectWorkspace}
          onAddPeriod={() => setAddPeriodOpen(true)}
          onExit={exitToLanding}
        />
        <main className="mx-auto w-full max-w-[1920px] px-4 py-6 sm:px-6">
          {activeTab === 'tasks' && <TaskManagement />}
          {activeTab === 'members' && <TeamManagement />}
          {activeTab === 'matrix' && <EvaluationMatrix />}
          {activeTab === 'criteria' && <CriteriaConfiguration />}
          {activeTab === 'results' && <EvaluationResults />}
          {activeTab === 'notes' && <MeetingNotes />}
        </main>
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

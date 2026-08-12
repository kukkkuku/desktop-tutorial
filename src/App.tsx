import { useState } from 'react'
import { AppProvider } from './state/AppContext'
import { WorkspaceProvider, useWorkspaces } from './state/WorkspaceContext'
import Navigation, { type TabKey } from './components/Navigation'
import WorkspaceLanding from './components/WorkspaceLanding'
import TaskManagement from './components/TaskManagement'
import TeamManagement from './components/TeamManagement'
import EvaluationMatrix from './components/EvaluationMatrix'
import CriteriaConfiguration from './components/CriteriaConfiguration'
import EvaluationResults from './components/EvaluationResults'
import MeetingNotes from './components/MeetingNotes'

function WorkspaceApp({ workspaceId }: { workspaceId: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('tasks')
  const { currentWorkspace, exitToLanding } = useWorkspaces()

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab)
    window.scrollTo(0, 0)
  }

  return (
    <AppProvider workspaceId={workspaceId}>
      <div className="min-h-screen bg-white">
        <Navigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          teamName={currentWorkspace?.teamName ?? ''}
          periodName={currentWorkspace?.periodName ?? ''}
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

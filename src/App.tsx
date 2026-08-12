import { useState } from 'react'
import { AppProvider } from './state/AppContext'
import Navigation, { type TabKey } from './components/Navigation'
import TaskManagement from './components/TaskManagement'
import TeamManagement from './components/TeamManagement'
import EvaluationMatrix from './components/EvaluationMatrix'
import CriteriaConfiguration from './components/CriteriaConfiguration'
import EvaluationResults from './components/EvaluationResults'
import MeetingNotes from './components/MeetingNotes'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('tasks')

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab)
    window.scrollTo(0, 0)
  }

  return (
    <AppProvider>
      <div className="min-h-screen bg-white">
        <Navigation activeTab={activeTab} onTabChange={handleTabChange} />
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

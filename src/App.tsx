import { useState } from 'react'
import { AppProvider } from './state/AppContext'
import Navigation, { type TabKey } from './components/Navigation'
import TaskManagement from './components/TaskManagement'
import TeamManagement from './components/TeamManagement'
import CriteriaConfiguration from './components/CriteriaConfiguration'
import EvaluationResults from './components/EvaluationResults'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('tasks')

  return (
    <AppProvider>
      <div className="min-h-screen bg-white">
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {activeTab === 'tasks' && <TaskManagement />}
          {activeTab === 'members' && <TeamManagement />}
          {activeTab === 'criteria' && <CriteriaConfiguration />}
          {activeTab === 'results' && <EvaluationResults />}
        </main>
      </div>
    </AppProvider>
  )
}

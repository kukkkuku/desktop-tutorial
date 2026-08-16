import { useState } from 'react'
import { AppProvider } from './state/AppContext'
import { WorkspaceProvider, useWorkspaces } from './state/WorkspaceContext'
import { TeamProvider } from './state/TeamContext'
import { MemberDetailProvider } from './state/MemberDetailContext'
import StageTabs, { type Stage } from './components/StageTabs'
import WorkspaceLanding from './components/WorkspaceLanding'
import AddPeriodModal from './components/AddPeriodModal'
import CriteriaPanel, { type PanelSize } from './components/CriteriaPanel'
import DataStage from './components/DataStage'
import EvaluationMatrix from './components/EvaluationMatrix'
import EvaluationResults from './components/EvaluationResults'
import MeetingNotes from './components/MeetingNotes'

function WorkspaceApp({ workspaceId }: { workspaceId: string }) {
  const [stage, setStage] = useState<Stage>('data')
  const [addPeriodOpen, setAddPeriodOpen] = useState(false)
  const [panelSize, setPanelSize] = useState<PanelSize>('chip')
  const [meetingPrepRequest, setMeetingPrepRequest] = useState<{ memberId: string; token: number } | null>(null)
  const { workspaces, currentWorkspace, selectWorkspace, createWorkspace, exitToLanding } = useWorkspaces()

  function handleStageChange(next: Stage) {
    setStage(next)
    window.scrollTo(0, 0)
  }

  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)

  function handleAddPeriod(periodName: string) {
    createWorkspace(teamName, periodName)
    setAddPeriodOpen(false)
  }

  // 팀원 상세 Drawer의 [면담 준비] 버튼 → 새 페이지가 아니라 기존 면담 화면으로
  // 이동해 해당 팀원을 선택하고 면담 준비 아코디언을 펼친다.
  function goToMeetingPrep(memberId: string) {
    setStage('notes')
    setMeetingPrepRequest({ memberId, token: Date.now() })
    window.scrollTo(0, 0)
  }

  return (
    <AppProvider workspaceId={workspaceId}>
      <TeamProvider teamName={teamName}>
        <MemberDetailProvider periods={periods} onGoToMeetingPrep={goToMeetingPrep}>
          <div className="min-h-screen bg-white">
            <StageTabs
              stage={stage}
              onStageChange={handleStageChange}
              teamName={teamName}
              currentWorkspaceId={workspaceId}
              periods={periods}
              onSelectPeriod={selectWorkspace}
              onAddPeriod={() => setAddPeriodOpen(true)}
              onExit={exitToLanding}
            />
            <div className="flex min-h-0">
              <CriteriaPanel size={panelSize} onSize={setPanelSize} />
              <main className="mx-auto w-full min-w-0 max-w-[1920px] flex-1 px-4 py-6 sm:px-6 md:px-[100px]">
                {stage === 'data' && <DataStage />}
                {stage === 'evaluate' && <EvaluationMatrix />}
                {stage === 'results' && <EvaluationResults />}
                {stage === 'notes' && <MeetingNotes prepRequest={meetingPrepRequest} />}
              </main>
            </div>
          </div>
          {addPeriodOpen && (
            <AddPeriodModal teamName={teamName} onSave={handleAddPeriod} onClose={() => setAddPeriodOpen(false)} />
          )}
        </MemberDetailProvider>
      </TeamProvider>
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

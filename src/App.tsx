import { useLayoutEffect, useRef, useState } from 'react'
import { AppProvider } from './state/AppContext'
import { WorkspaceProvider, useWorkspaces } from './state/WorkspaceContext'
import { TeamProvider } from './state/TeamContext'
import { MemberDetailProvider } from './state/MemberDetailContext'
import StageTabs, { type Stage } from './components/StageTabs'
import WorkspaceLanding from './components/WorkspaceLanding'
import CriteriaPanel, { type PanelSize } from './components/CriteriaPanel'
import TasksStage from './components/TasksStage'
import TeamStage, { type TeamSubTabRequest } from './components/TeamStage'
import EvaluationMatrix from './components/EvaluationMatrix'
import EvaluationResults from './components/EvaluationResults'
import NotesStage, { type NotesNavigationRequest, type NotesSubTab } from './components/notes/NotesStage'
import GoogleSignInGate from './components/GoogleSignInGate'
import DataManagerDrawer, { type DataManagerTab } from './components/DataManagerDrawer'
import WorkStage from './components/work/WorkStage'
import QuickStartModal from './components/QuickStartModal'
import UnderlineTabs from './components/ui/UnderlineTabs'
import { useGoogleAccount } from './hooks/useGoogleAccount'
import { getConnectedEmail, readLastSave } from './utils/googleDrive'
import { AppModeProvider, useAppMode } from './state/AppMode'
import TaskInputApp from './components/taskinput/TaskInputApp'

function WorkspaceApp({ workspaceId }: { workspaceId: string }) {
  const [stage, setStage] = useState<Stage>('work')
  const [dataManagerOpen, setDataManagerOpen] = useState(false)
  const [dataManagerTab] = useState<{ tab: DataManagerTab; token: number } | null>(null)
  // 빠른 시작은 헤더 버튼으로만 연다. 예전에는 과제가 없으면 자동으로 떴는데,
  // 이제 첫 화면인 과제관리의 빈 상태가 시작 안내(구글시트에서 가져오기 / L2
  // 직접 만들기)를 맡는다.
  const [quickStartOpen, setQuickStartOpen] = useState(false)
  const [quickStartTab, setQuickStartTab] = useState<'auto' | 'sheet' | 'progress' | 'direct'>('auto')
  // 시트 칩에서 새 링크를 넣고 연결하면 가져오기 화면이 그 링크로 바로 읽는다.
  const [quickStartUrl, setQuickStartUrl] = useState<string | null>(null)
  const [panelSize, setPanelSize] = useState<PanelSize>('icon')
  const [notesRequest, setNotesRequest] = useState<NotesNavigationRequest | null>(null)
  const [teamSubTabRequest, setTeamSubTabRequest] = useState<TeamSubTabRequest | null>(null)
  const { workspaces, currentWorkspace, selectWorkspace, exitToLanding, reloadForAccount } = useWorkspaces()

  const { accountEmail, isAdminUser, refreshAccount, handleLogout } = useGoogleAccount()
  const hasSavedCurrentPeriod = readLastSave(workspaceId) !== null

  // "계정이 바뀌었을 수 있다"는 신호는 실제 전환(다른 Google 계정 연결)
  // 뿐 아니라, 데이터 관리 드로어를 열 때마다도 도는 단순 새로고침에서도
  // 온다. 이메일이 실제로 달라졌을 때만 워크스페이스를 다시 읽고 프로젝트
  // 선택 화면으로 되돌린다 -- 안 그러면 아무것도 안 바뀐 상황(드로어를
  // 그냥 열기만 했을 때)에도 매번 메인 화면으로 튕겨 나간다.
  function handleAccountChange() {
    const previousEmail = accountEmail
    refreshAccount()
    if (getConnectedEmail() !== previousEmail) {
      reloadForAccount()
      exitToLanding()
    }
  }

  // Drive 전체 저장 진행 상태 -- 데이터 관리 드로어(GoogleDrivePanel)에서
  // 저장을 시작/완료/실패할 때마다 갱신되고, 헤더의 계정 정보 옆 배지로
  // 보여준다.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // CriteriaPanel pins itself right below the header and fills the rest of
  // the viewport, so it needs the header's real rendered height -- a
  // hardcoded guess (the old `3.25rem`) drifted from the header's actual
  // height and left a permanent few-pixel page overflow (a scrollbar that
  // never goes away) on every stage that shows the panel.
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const update = () => setHeaderHeight(el.getBoundingClientRect().height)
    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [])

  function handleStageChange(next: Stage) {
    setStage(next)
    window.scrollTo(0, 0)
  }

  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const hasOtherPeriods = workspaces.some((w) => w.teamName === teamName && w.id !== workspaceId)

  // 팀원 상세 Drawer의 카드/버튼 → 새 페이지가 아니라 면담 탭의 해당 서브탭(면담
  // 기록/성과 히스토리/인사평가·승진 관리)으로 이동해 그 팀원을 선택해둔다.
  function goToNotes(memberId: string, subTab: NotesSubTab) {
    setStage('notes')
    setNotesRequest({ memberId, subTab, token: Date.now() })
    window.scrollTo(0, 0)
  }

  // 면담 화면 좌측 팀원 카드 하단의 "팀원 관리" 버튼 → 팀원관리 탭으로
  // 이동한다(피어리뷰 서브탭이 열려 있었을 수 있으니 토큰으로 요청해서
  // TeamStage가 팀원 서브탭을 열게 한다).
  function goToTeamManagement() {
    setTeamSubTabRequest({ subTab: 'members', token: Date.now() })
    setStage('members')
    window.scrollTo(0, 0)
  }

  return (
    <AppProvider workspaceId={workspaceId}>
      <TeamProvider teamName={teamName}>
        <MemberDetailProvider onNavigateToNotes={goToNotes}>
          <div className="flex min-h-screen flex-col bg-white">
            <div ref={headerRef}>
              <StageTabs
                stage={stage}
                onStageChange={handleStageChange}
                teamName={teamName}
                currentWorkspaceId={workspaceId}
                periods={periods}
                onSelectPeriod={selectWorkspace}
                onExit={exitToLanding}
                onOpenDataManager={() => setDataManagerOpen(true)}
                onOpenQuickStart={() => {
                  setQuickStartUrl(null)
                  setQuickStartTab('auto')
                  setQuickStartOpen(true)
                }}
                quickStartOpen={quickStartOpen}
                accountEmail={accountEmail}
                isAdminUser={isAdminUser}
                hasSavedCurrentPeriod={hasSavedCurrentPeriod}
                onLogout={handleLogout}
                onAccountChange={handleAccountChange}
                saveStatus={saveStatus}
              />
            </div>
            <div className="flex min-h-0 flex-1">
              {stage !== 'notes' && <CriteriaPanel size={panelSize} onSize={setPanelSize} headerHeight={headerHeight} />}
              <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
                {(stage === 'work' || stage === 'tasks') && (
                  <UnderlineTabs
                    className="mb-5"
                    items={[
                      { key: 'work', label: '과제리스트', title: '구글시트와 연결된 L2/L3 과제' },
                      { key: 'tasks', label: '평가과제', title: '과제리스트에서 내보낸 평가용 과제' },
                    ]}
                    value={stage}
                    onChange={(k) => handleStageChange(k)}
                  />
                )}
                {stage === 'work' && (
                  <WorkStage
                    onOpenSheetImport={(url, tab) => {
                      setQuickStartUrl(url ?? null)
                      setQuickStartTab(tab ?? 'sheet')
                      setQuickStartOpen(true)
                    }}
                  />
                )}
                {stage === 'tasks' && <TasksStage onGoToWork={() => handleStageChange('work')} />}
                {stage === 'members' && <TeamStage subTabRequest={teamSubTabRequest} />}
                {stage === 'evaluate' && <EvaluationMatrix />}
                {stage === 'results' && <EvaluationResults />}
                {stage === 'notes' && <NotesStage notesRequest={notesRequest} onManageTeam={goToTeamManagement} />}
              </main>
            </div>
          </div>
          <DataManagerDrawer
            open={dataManagerOpen}
            onClose={() => setDataManagerOpen(false)}
            onAccountChange={handleAccountChange}
            onSaveStatusChange={setSaveStatus}
            tabRequest={dataManagerTab}
            onGoToWork={() => handleStageChange('work')}
          />
          {quickStartOpen && (
            <QuickStartModal
              teamName={teamName}
              currentWorkspaceId={workspaceId}
              hasOtherPeriods={hasOtherPeriods}
              onClose={() => setQuickStartOpen(false)}
              initialTab={quickStartTab}
              initialSheetUrl={quickStartUrl}
              onSheetImported={() => {
                setQuickStartOpen(false)
                handleStageChange('work')
              }}
              onDataReady={() => {
                setQuickStartOpen(false)
                handleStageChange('tasks')
              }}
            />
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

// 메인에서 고른 곳으로: 성과관리(기존 평가 앱) / 과제 입력(추진현황·진척률)
function ModeGate() {
  const { mode } = useAppMode()
  if (mode === 'tasks') return <TaskInputApp />
  return <WorkspaceGate />
}

export default function App() {
  return (
    <WorkspaceProvider>
      <GoogleSignInGate>
        <AppModeProvider>
          <ModeGate />
        </AppModeProvider>
      </GoogleSignInGate>
    </WorkspaceProvider>
  )
}

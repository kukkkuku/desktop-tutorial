import { useEffect, useState } from 'react'
import { getAccessSheetId, refreshAccess } from './utils/accessSheet'
import { LOGIN_EVENT } from './utils/googleDrive'
import { AppProvider } from './state/AppContext'
import { WorkspaceProvider, useWorkspaces } from './state/WorkspaceContext'
import { TeamProvider } from './state/TeamContext'
import { MemberDetailProvider } from './state/MemberDetailContext'
import { SaveBadge, type Stage } from './components/StageTabs'
import WorkspaceLanding from './components/WorkspaceLanding'
import { CriteriaSheet } from './components/CriteriaPanel'
import AppShell, { CrumbSep, PageHeader } from './components/shell/AppShell'
import { PERF_ITEMS } from './components/shell/Sidebar'
import WorkspaceSwitcher from './components/WorkspaceSwitcher'
import Button from './components/Button'
import { SlidersHorizontal } from 'lucide-react'
import TeamStage, { type TeamSubTabRequest } from './components/TeamStage'
import EvaluationMatrix from './components/EvaluationMatrix'
import EvaluationResults from './components/EvaluationResults'
import NotesStage, { type NotesNavigationRequest, type NotesSubTab } from './components/notes/NotesStage'
import GoogleSignInGate from './components/GoogleSignInGate'
import DataManagerDrawer, { type DataManagerTab } from './components/DataManagerDrawer'
import WorkStage from './components/work/WorkStage'
import TaskImportDialog, { type TaskImportSource } from './components/work/TaskImportDialog'
import PerfStartDialog, { takeNewWorkspace } from './components/work/PerfStartDialog'
import { useGoogleAccount } from './hooks/useGoogleAccount'
import { getConnectedEmail, readLastSave } from './utils/googleDrive'
import { AppModeProvider, useAppMode } from './state/AppMode'
import TaskInputApp from './components/taskinput/TaskInputApp'
import HomePage from './components/HomePage'
import AdminApp from './components/admin/AdminApp'

function WorkspaceApp({ workspaceId }: { workspaceId: string }) {
  const { perfStage: stage, setPerfStage: setStage } = useAppMode()
  const [dataManagerOpen, setDataManagerOpen] = useState(false)
  const [dataManagerTab] = useState<{ tab: DataManagerTab; token: number } | null>(null)
  // 과제 가져오기(과제관리 「가져오기 ▾」 · 빈 화면 · 새 평가 시작 안내에서 연다).
  // url: 시트 칩에서 새 링크를 넣고 연결하면 가져오기 화면이 그 링크로 바로 읽는다.
  const [taskImport, setTaskImport] = useState<{ source: TaskImportSource; url?: string | null } | null>(null)
  // 새 평가를 만든 직후 한 번: 어떻게 시작할지(추진현황에서 · 이전 평가에서 · 빈 상태로)
  const [startOpen, setStartOpen] = useState(false)
  useEffect(() => {
    if (!takeNewWorkspace(workspaceId)) return
    setStage('work')
    setStartOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [notesRequest, setNotesRequest] = useState<NotesNavigationRequest | null>(null)
  const [teamSubTabRequest, setTeamSubTabRequest] = useState<TeamSubTabRequest | null>(null)
  const { workspaces, currentWorkspace, selectWorkspace, exitToLanding, reloadForAccount } = useWorkspaces()

  const { accountEmail, refreshAccount } = useGoogleAccount()
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

  function handleStageChange(next: Stage) {
    setStage(next)
  }

  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const hasOtherPeriods = workspaces.some((w) => w.teamName === teamName && w.id !== workspaceId)

  // 팀원 상세 Drawer의 카드/버튼 → 새 페이지가 아니라 면담 탭의 해당 서브탭(면담
  // 기록/성과 히스토리/인사평가·승진 관리)으로 이동해 그 팀원을 선택해둔다.
  function goToNotes(memberId: string, subTab: NotesSubTab) {
    setStage('notes')
    setNotesRequest({ memberId, subTab, token: Date.now() })
  }

  // 면담 화면 좌측 팀원 카드 하단의 "팀원 관리" 버튼 → 팀원관리 탭으로
  // 이동한다(피어리뷰 서브탭이 열려 있었을 수 있으니 토큰으로 요청해서
  // TeamStage가 팀원 서브탭을 열게 한다).
  function goToTeamManagement() {
    setTeamSubTabRequest({ subTab: 'members', token: Date.now() })
    setStage('members')
  }

  return (
    <AppProvider workspaceId={workspaceId}>
      <TeamProvider teamName={teamName}>
        <MemberDetailProvider onNavigateToNotes={goToNotes}>
          <AppShell
            perf={{
              onOpenDataManager: () => setDataManagerOpen(true),
              saveBadge: <SaveBadge saveStatus={saveStatus} hasSavedCurrentPeriod={hasSavedCurrentPeriod} />,
            }}
            header={
              <PageHeader
                crumbs={
                  <>
                    <span>성과관리</span>
                    <CrumbSep />
                    {/* 평가기간 고르기(과제 입력의 연도 고르기와 같은 모양) */}
                    <WorkspaceSwitcher
                      teamName={teamName}
                      currentWorkspaceId={workspaceId}
                      periods={periods}
                      onSelectPeriod={selectWorkspace}
                      onOpenProjectManagement={exitToLanding}
                    />
                  </>
                }
                title={PERF_ITEMS.find((i) => i.key === stage || i.also?.includes(stage))?.label ?? ''}
                actions={
                  stage !== 'notes' && (
                    <Button variant="secondary" onClick={() => setCriteriaOpen((v) => !v)} aria-pressed={criteriaOpen}>
                      <SlidersHorizontal size={15} strokeWidth={1.8} />
                      기준 설정
                    </Button>
                  )
                }
              />
            }
          >
            <main className="w-full min-w-0 flex-1 px-6 pb-10 pt-5 lg:px-8">
              {stage === 'work' && <WorkStage onOpenSheetImport={(url, source) => setTaskImport({ source: source ?? 'sheet', url })} />}
              {stage === 'members' && <TeamStage subTabRequest={teamSubTabRequest} />}
              {/* 평가하기(예전 과제별 'tasks'도 여기로) -- 성과등급 · 목표 · 성과는 과제관리 표에서 */}
              {(stage === 'evaluate' || stage === 'tasks') && <EvaluationMatrix />}
              {stage === 'results' && <EvaluationResults />}
              {stage === 'notes' && <NotesStage notesRequest={notesRequest} onManageTeam={goToTeamManagement} />}
            </main>
          </AppShell>
          {criteriaOpen && <CriteriaSheet onClose={() => setCriteriaOpen(false)} />}
          <DataManagerDrawer
            open={dataManagerOpen}
            onClose={() => setDataManagerOpen(false)}
            onAccountChange={handleAccountChange}
            onSaveStatusChange={setSaveStatus}
            tabRequest={dataManagerTab}
            onGoToWork={() => handleStageChange('work')}
          />
          {taskImport && (
            <TaskImportDialog
              source={taskImport.source}
              initialUrl={taskImport.url}
              onClose={() => setTaskImport(null)}
              onDone={() => {
                setTaskImport(null)
                handleStageChange('work')
              }}
            />
          )}
          {startOpen && (
            <PerfStartDialog
              teamName={teamName}
              periodLabel={currentWorkspace ? `${currentWorkspace.evaluationYear} ${currentWorkspace.periodName}` : ''}
              currentWorkspaceId={workspaceId}
              hasOtherPeriods={hasOtherPeriods}
              onFromProgress={() => {
                setStartOpen(false)
                setTaskImport({ source: 'progress' })
              }}
              onApplied={() => {
                setStartOpen(false)
                handleStageChange('work')
              }}
              onClose={() => setStartOpen(false)}
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

// 홈(대문)에서 고른 곳으로: 성과관리(기존 평가 앱, 팀장) / 과제 입력(추진현황·진척률)
function ModeGate() {
  const { mode } = useAppMode()
  const { canPerf, isAdminUser } = useGoogleAccount()
  if (mode === 'home') return <HomePage />
  if (mode === 'admin' && isAdminUser) return <AdminApp />
  if (mode === 'tasks' || !canPerf) return <TaskInputApp />
  return <WorkspaceGate />
}

// 로그인할 때마다 권한 관리 시트를 다시 읽는다(로그인 토큰에 시트 읽기 권한이 있어 창이 뜨지 않음).
// 못 읽으면(공유 안 됨 등) 기억해 둔 값으로 계속 쓴다 -- 관리 › 권한 시트에서 이유를 볼 수 있다.
function useAccessSync() {
  useEffect(() => {
    const on = () => {
      if (getAccessSheetId()) refreshAccess().catch(() => {})
    }
    window.addEventListener(LOGIN_EVENT, on)
    return () => window.removeEventListener(LOGIN_EVENT, on)
  }, [])
}

export default function App() {
  useAccessSync()
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

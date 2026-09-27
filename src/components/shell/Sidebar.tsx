// 왼쪽 사이드바(디자인 시스템 v2): 앱의 모든 이동이 여기 한 곳에 있다.
//   위: 로고 · 접기  →  홈  →  과제 입력(추진현황 · 진척률)  →  성과관리(프로젝트 · 메뉴, 팀장만)
//   아래: 매뉴얼 · 데이터 백업(성과관리) · 계정(메뉴 안에 로그아웃)
// 접으면 아이콘만(마우스를 올리면 이름). 한 번 더 접으면 사이드바 없이 머리 줄에 메뉴(TopNav).
// 메뉴 모양 버튼과 고른 모양은 AppShell(화면 머리 맨 앞)에.
import { useState, type ReactNode } from 'react'
import {
  BarChart3,
  BookOpen,
  CalendarRange,
  Database,
  FolderOpen,
  Gauge,
  House,
  LayoutList,
  LogOut,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAppMode, type PerfStage, type TaskMenu } from '../../state/AppMode'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { useGoogleAccount } from '../../hooks/useGoogleAccount'
import GoogleAccountMenu from '../GoogleAccountMenu'
import AppLogo from './AppLogo'
import { ManualPanel, type ManualArea } from '../ManualLink'
import { ROLE_LABEL } from '../../utils/roles'
import { IS_PREVIEW } from '../../utils/previewMode'
import { getConnectedEmail } from '../../utils/googleDrive'

const TASK_ITEMS: { key: TaskMenu; label: string; Icon: LucideIcon }[] = [
  { key: 'progress', label: '추진현황', Icon: CalendarRange },
  { key: 'rate', label: '진척률', Icon: Gauge },
]
export const PERF_ITEMS: { key: PerfStage; label: string; Icon: LucideIcon; also?: PerfStage[] }[] = [
  { key: 'work', label: '과제관리', Icon: LayoutList },
  { key: 'members', label: '팀원관리', Icon: Users },
  // 평가하기 = 팀원마다 기여도 · 개인수행등급(성과등급 · 목표 · 성과는 과제관리 표에서). 예전 'tasks'(과제별)도 여기로
  { key: 'evaluate', label: '평가하기', Icon: SlidersHorizontal, also: ['tasks'] },
  { key: 'results', label: '평가결과', Icon: BarChart3 },
  { key: 'notes', label: '면담', Icon: MessageCircle },
]
// 화면마다 여는 매뉴얼 장(public/manual/*.html의 section id)
const PERF_MANUAL: Record<PerfStage, string> = { work: 'work', tasks: 'evaluate', members: 'peer', evaluate: 'evaluate', results: 'results', notes: 'meeting' }

export interface SidebarPerfExtras {
  onOpenDataManager?: () => void
  // 저장 상태 점(저장 중 · 저장됨 · 실패)
  saveBadge?: ReactNode
}

// 사이드바와 위 메뉴가 같이 쓰는 것: 지금 위치 · 계정 바꾸기 · 매뉴얼 열기
function useShellNav() {
  const app = useAppMode()
  const ws = useWorkspaces()
  const account = useGoogleAccount()
  const [manual, setManual] = useState<{ area?: ManualArea; chapter?: string } | null>(null)
  const { mode, taskMenu, perfStage } = app
  const { accountEmail, canPerf, refreshAccount } = account
  const inPerf = mode === 'perf' && !!ws.currentWorkspaceId

  // 다른 구글 계정으로 바꾸면 그 계정의 프로젝트 목록을 다시 읽고 목록 화면으로
  function onAccountChange() {
    const prev = accountEmail
    refreshAccount()
    if (getConnectedEmail() !== prev) {
      ws.reloadForAccount()
      ws.exitToLanding()
    }
  }
  function openManual() {
    // 관리 화면은 과제 입력 매뉴얼 1장(권한 시트)
    if (mode === 'admin') setManual({ area: 'tasks', chapter: 'sheet' })
    else if (mode === 'tasks' || !canPerf) setManual({ area: 'tasks', chapter: taskMenu })
    else if (mode === 'perf') setManual({ area: 'perf', chapter: inPerf ? PERF_MANUAL[perfStage] : 'start' })
    else setManual({})
  }
  const manualPanel = manual && <ManualPanel area={manual.area} chapter={manual.chapter} onClose={() => setManual(null)} />
  // 과제 입력 메뉴가 칠해지는 때(팀원은 홈 밖이면 늘 과제 입력)
  const inTasks = mode === 'tasks' || (!canPerf && mode !== 'home' && mode !== 'admin')
  return { ...app, ...ws, ...account, inPerf, inTasks, onAccountChange, openManual, manualPanel }
}

function LogoutItem({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mac-menu-item">
      <LogOut size={14} strokeWidth={1.8} />
      로그아웃
    </button>
  )
}

export default function Sidebar({ perf, collapsed }: { perf?: SidebarPerfExtras; collapsed: boolean }) {
  const nav = useShellNav()
  const { mode, setMode, taskMenu, setTaskMenu, perfStage, setPerfStage, currentWorkspaceId, currentWorkspace, exitToLanding } = nav
  const { accountEmail, role, canPerf, isAdminUser, handleLogout, inPerf, inTasks, onAccountChange, openManual } = nav
  function item(key: string, label: string, Icon: LucideIcon, on: boolean, onClick: () => void, extra?: ReactNode) {
    return (
      <button
        key={key}
        onClick={onClick}
        aria-current={on ? 'page' : undefined}
        title={collapsed ? label : undefined}
        className={`ds-nav-item ${on ? 'ds-nav-item-on' : ''} ${collapsed ? 'justify-center !px-0' : ''}`}
      >
        <Icon size={17} strokeWidth={1.8} className={`shrink-0 ${on ? 'text-accent' : ''}`} />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {!collapsed && extra}
      </button>
    )
  }
  const label = (t: string) => (collapsed ? <div className="mx-3 my-3 h-px bg-separator" /> : <p className="ds-nav-label">{t}</p>)

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-canvas px-2.5 pb-3 pt-1.5 transition-[width] duration-200 ${collapsed ? 'w-[60px]' : 'w-[236px]'}`}
      aria-label="메뉴"
    >
      {/* 로고 · 이름(접으면 로고만, 누르면 홈). 접기 버튼은 화면 머리 맨 앞에 */}
      <div className={`flex h-9 items-center gap-2.5 ${collapsed ? 'justify-center' : 'pl-1.5'}`}>
        <button onClick={() => mode !== 'home' && setMode('home')} title="홈" aria-label="홈" className="shrink-0 rounded-[8px]">
          <AppLogo size={28} />
        </button>
        {!collapsed && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13.5px] font-semibold text-label">디자인연구소</span>
            <span className="block truncate text-[11.5px] text-label-3">과제 · 성과관리{IS_PREVIEW ? ' · 미리보기' : ''}</span>
          </span>
        )}
      </div>

      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-0.5">{item('home', '홈', House, mode === 'home', () => mode !== 'home' && setMode('home'))}</div>

        {label('과제 입력')}
        <div className="space-y-0.5">
          {TASK_ITEMS.map(({ key, label: l, Icon }) =>
            item(key, l, Icon, inTasks && taskMenu === key, () => {
              setTaskMenu(key)
              if (mode !== 'tasks') setMode('tasks')
            }),
          )}
        </div>

        {canPerf && (
          <>
            {label('성과관리')}
            {/* 위계: 프로젝트 목록 → 프로젝트를 고르면 그 아래에 프로젝트 메뉴(과제관리 · 팀원관리 · 평가하기 …)가 열린다 */}
            <div className="space-y-0.5">
              {item('projects', '프로젝트 목록', FolderOpen, mode === 'perf' && !currentWorkspaceId, () => {
                exitToLanding()
                if (mode !== 'perf') setMode('perf')
              })}
            </div>
            {currentWorkspaceId && (
              <div className="mt-1.5">
                {/* 프로젝트 이름(제목 줄) -- 평가기간 바꾸기는 페이지 머리에서. 다른 영역에 있으면 눌러서 이 프로젝트로 */}
                {!collapsed && (
                  <button
                    onClick={() => !inPerf && setMode('perf')}
                    title={inPerf ? undefined : '이 프로젝트로 가기'}
                    className={`mb-1 flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left ${inPerf ? 'cursor-default' : 'hover:bg-black/[0.04]'}`}
                  >
                    <FolderOpen size={15} strokeWidth={1.8} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-label">
                      {currentWorkspace
                        ? `${currentWorkspace.teamName} · ${currentWorkspace.evaluationYear} ${currentWorkspace.periodName}`
                        : '열어 둔 프로젝트'}
                    </span>
                  </button>
                )}
                <div className={collapsed ? 'space-y-0.5' : 'ml-[18px] space-y-0.5 border-l border-separator pl-2'}>
                  {PERF_ITEMS.map(({ key, label: l, Icon, also }) =>
                    item(key, l, Icon, inPerf && (perfStage === key || !!also?.includes(perfStage)), () => {
                      setPerfStage(key)
                      if (mode !== 'perf') setMode('perf')
                    }),
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      {/* 아래: 매뉴얼 · 백업 · 계정 */}
      <div className="space-y-0.5 pt-2">
        {item('manual', '사용 매뉴얼', BookOpen, false, openManual)}
        {/* 관리(관리자만): 권한 관리 시트 · 팀원 초대 */}
        {isAdminUser && item('admin', '관리', ShieldCheck, mode === 'admin', () => mode !== 'admin' && setMode('admin'))}
        {inPerf && perf?.onOpenDataManager && item('backup', '데이터 백업', Database, false, perf.onOpenDataManager, perf.saveBadge)}
      </div>
      {accountEmail && (
        <GoogleAccountMenu
          placement="up"
          onAccountChange={onAccountChange}
          title={accountEmail}
          className={`mt-2 flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left hover:bg-black/[0.04] ${collapsed ? 'justify-center' : ''}`}
          footer={<LogoutItem onClick={handleLogout} />}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-label shadow-pill">
            {accountEmail.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-label">{accountEmail}</span>
              <span className="block truncate text-[12px] text-label-3">{ROLE_LABEL[role]}</span>
            </span>
          )}
        </GoogleAccountMenu>
      )}
      {nav.manualPanel}
    </aside>
  )
}

// 위 메뉴(사이드바를 끝까지 접었을 때 머리 한 줄): 로고(홈) · 과제 입력|성과관리 · 고르기 · 메뉴 알약 · 오른쪽 동작 · 아이콘 · 계정
// 메뉴가 없는 화면(홈 · 프로젝트 목록 · 관리)은 메뉴 자리에 제목을 굵게.
export function TopNav({ chooser, title, actions, perf }: { chooser?: ReactNode; title: ReactNode; actions?: ReactNode; perf?: SidebarPerfExtras }) {
  const nav = useShellNav()
  const { mode, setMode, taskMenu, setTaskMenu, perfStage, setPerfStage, currentWorkspaceId, exitToLanding } = nav
  const { accountEmail, canPerf, isAdminUser, handleLogout, inPerf, inTasks, onAccountChange, openManual } = nav
  const seg = (on: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      aria-current={on ? 'page' : undefined}
      className={`rounded-[7px] px-2.5 py-1 font-medium ${on ? 'bg-white text-label shadow-pill' : 'text-label-2 hover:text-label'}`}
    >
      {label}
    </button>
  )
  const pill = (key: string, label: string, Icon: LucideIcon, on: boolean, onClick: () => void) => (
    <button
      key={key}
      onClick={onClick}
      aria-current={on ? 'page' : undefined}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${on ? 'bg-ink text-white' : 'text-label-2 hover:bg-black/[0.05] hover:text-label'}`}
    >
      <Icon size={15} strokeWidth={1.8} />
      {label}
    </button>
  )
  const iconBtn = (label: string, Icon: LucideIcon, onClick: () => void, on = false) => (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={on ? 'page' : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-full ${on ? 'bg-white text-accent shadow-pill' : 'text-label-2 hover:bg-black/[0.05] hover:text-label'}`}
    >
      <Icon size={17} strokeWidth={1.8} />
    </button>
  )
  const Sep = () => <span className="mx-1 h-4 w-px bg-separator" />

  let menu: ReactNode
  if (inTasks)
    menu = TASK_ITEMS.map(({ key, label, Icon }) =>
      pill(key, label, Icon, taskMenu === key, () => {
        setTaskMenu(key)
        if (mode !== 'tasks') setMode('tasks')
      }),
    )
  else if (inPerf)
    menu = PERF_ITEMS.map(({ key, label, Icon, also }) => pill(key, label, Icon, perfStage === key || !!also?.includes(perfStage), () => setPerfStage(key)))
  else menu = <h1 className="px-1 text-[16px] font-semibold tracking-[-0.01em] text-label">{title}</h1>

  return (
    <>
      <button onClick={() => mode !== 'home' && setMode('home')} title="홈" aria-label="홈" className="ml-0.5 shrink-0 rounded-[8px]">
        <AppLogo size={26} />
      </button>
      <span className="ml-1 flex items-center gap-0.5 rounded-[9px] bg-black/[0.05] p-0.5">
        {seg(inTasks, '과제 입력', () => {
          if (mode !== 'tasks') setMode('tasks')
        })}
        {canPerf &&
          seg(mode === 'perf', '성과관리', () => {
            // 이미 성과관리면 프로젝트 목록으로
            if (mode === 'perf') {
              if (currentWorkspaceId) exitToLanding()
            } else setMode('perf')
          })}
      </span>
      {chooser && (
        <>
          <Sep />
          <span className="flex items-center font-medium text-label-2">{chooser}</span>
        </>
      )}
      <Sep />
      <nav className="flex flex-wrap items-center gap-0.5" aria-label="메뉴">
        {menu}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {actions}
        {inPerf && perf?.onOpenDataManager && (
          // 저장 상태(저장됨 · 저장 중 · 실패)는 백업 버튼 바로 앞에
          <span className="flex items-center gap-1 pl-1">
            {perf.saveBadge}
            {iconBtn('데이터 백업', Database, perf.onOpenDataManager)}
          </span>
        )}
        {iconBtn('사용 매뉴얼', BookOpen, openManual)}
        {isAdminUser && iconBtn('관리', ShieldCheck, () => mode !== 'admin' && setMode('admin'), mode === 'admin')}
        {accountEmail && (
          <GoogleAccountMenu
            placement="down"
            onAccountChange={onAccountChange}
            title={accountEmail}
            className="ml-0.5 rounded-full"
            footer={<LogoutItem onClick={handleLogout} />}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-label shadow-pill">
              {accountEmail.slice(0, 1).toUpperCase()}
            </span>
          </GoogleAccountMenu>
        )}
      </div>
      {nav.manualPanel}
    </>
  )
}

// 왼쪽 사이드바(디자인 시스템 v2): 앱의 모든 이동이 여기 한 곳에 있다.
//   위: 로고 · 접기  →  홈  →  과제 입력(추진현황 · 진척률)  →  성과관리(프로젝트 · 메뉴, 팀장만)
//   아래: 매뉴얼 · 데이터 백업(성과관리) · 계정(메뉴 안에 로그아웃)
// 접으면 아이콘만(마우스를 올리면 이름). 접기 버튼과 접은 상태는 AppShell(화면 머리 맨 앞)에.
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
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAppMode, type PerfStage, type TaskMenu } from '../../state/AppMode'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { useGoogleAccount } from '../../hooks/useGoogleAccount'
import GoogleAccountMenu from '../GoogleAccountMenu'
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
  { key: 'tasks', label: '평가하기', Icon: SlidersHorizontal, also: ['evaluate'] },
  { key: 'results', label: '평가결과', Icon: BarChart3 },
  { key: 'notes', label: '면담', Icon: MessageCircle },
]
// 화면마다 여는 매뉴얼 장(public/manual/*.html의 section id)
const PERF_MANUAL: Record<PerfStage, string> = { work: 'perf', tasks: 'eval', members: 'peer', evaluate: 'evaluate', results: 'evaluate', notes: 'meeting' }

export interface SidebarPerfExtras {
  onOpenDataManager?: () => void
  // 저장 상태 점(저장 중 · 저장됨 · 실패)
  saveBadge?: ReactNode
}

export default function Sidebar({ perf, collapsed }: { perf?: SidebarPerfExtras; collapsed: boolean }) {
  const { mode, setMode, taskMenu, setTaskMenu, perfStage, setPerfStage } = useAppMode()
  const { currentWorkspaceId, currentWorkspace, exitToLanding, reloadForAccount } = useWorkspaces()
  const { accountEmail, role, canPerf, refreshAccount, handleLogout } = useGoogleAccount()
  const [manual, setManual] = useState<{ area?: ManualArea; chapter?: string } | null>(null)

  // 다른 구글 계정으로 바꾸면 그 계정의 프로젝트 목록을 다시 읽고 목록 화면으로
  function onAccountChange() {
    const prev = accountEmail
    refreshAccount()
    if (getConnectedEmail() !== prev) {
      reloadForAccount()
      exitToLanding()
    }
  }
  const inPerf = mode === 'perf' && !!currentWorkspaceId
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

  function openManual() {
    if (mode === 'tasks' || !canPerf) setManual({ area: 'tasks', chapter: taskMenu })
    else if (mode === 'perf') setManual({ area: 'perf', chapter: inPerf ? PERF_MANUAL[perfStage] : 'start' })
    else setManual({})
  }

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-canvas px-2.5 pb-3 pt-1.5 transition-[width] duration-200 ${collapsed ? 'w-[60px]' : 'w-[236px]'}`}
      aria-label="메뉴"
    >
      {/* 로고 · 이름(접으면 로고만). 접기 버튼은 화면 머리 맨 앞에 */}
      <div className={`flex h-9 items-center gap-2.5 ${collapsed ? 'justify-center' : 'pl-1.5'}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-ink text-[11px] font-bold tracking-tight text-white">DL</span>
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
            item(key, l, Icon, (mode === 'tasks' || (!canPerf && mode !== 'home')) && taskMenu === key, () => {
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
        {inPerf && perf?.onOpenDataManager && item('backup', '데이터 백업', Database, false, perf.onOpenDataManager, perf.saveBadge)}
      </div>
      {accountEmail && (
        <GoogleAccountMenu
          placement="up"
          onAccountChange={onAccountChange}
          title={accountEmail}
          className={`mt-2 flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left hover:bg-black/[0.04] ${collapsed ? 'justify-center' : ''}`}
          footer={
            <button onClick={handleLogout} className="mac-menu-item">
              <LogOut size={14} strokeWidth={1.8} />
              로그아웃
            </button>
          }
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
      {manual && <ManualPanel area={manual.area} chapter={manual.chapter} onClose={() => setManual(null)} />}
    </aside>
  )
}

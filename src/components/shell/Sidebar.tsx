// 왼쪽 사이드바(디자인 시스템 v2): 앱의 모든 이동이 여기 한 곳에 있다.
//   위: 홈  →  과제 입력(추진현황 · 진척률)  →  성과관리(프로젝트 · 메뉴, 팀장만)
//   아래: 매뉴얼 · 데이터 백업(성과관리) · 계정(메뉴 안에 로그아웃)
// 접으면 아이콘만(마우스를 올리면 이름). 한 번 더 접으면 사이드바 없이 머리 줄에 메뉴(TopNav).
// 메뉴 모양 버튼과 고른 모양은 AppShell(화면 머리 맨 앞)에.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ALargeSmall,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Monitor,
  Palette,
  BookOpen,
  ChartGantt,
  Database,
  Folders,
  Gauge,
  House,
  LayoutList,
  LogOut,
  RotateCcw,
  MessagesSquare,
  ShieldCheck,
  SquarePen,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAppMode, type PerfStage, type TaskMenu } from '../../state/AppMode'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { useGoogleAccount } from '../../hooks/useGoogleAccount'
import { useAccessData } from '../../hooks/useAccessData'
import { isPendingEmail } from '../../utils/accessSheet'
import GoogleAccountMenu from '../GoogleAccountMenu'
import NoticeBell from '../NoticeBell'
import DataResetDialog from '../DataResetDialog'
import DataManagerDrawer from '../DataManagerDrawer'
import { ManualPanel, type ManualArea } from '../ManualLink'
import { ROLE_LABEL } from '../../utils/roles'
import { FONT_PREF_LABEL, currentScale, onFontPrefChange, readFontPref, setFontPref, type FontPref } from '../../utils/uiFontScale'
import { getConnectedEmail } from '../../utils/googleDrive'
import { THEMES, onThemeChange, readTheme, setTheme, type ThemeKey } from '../../utils/uiTheme'

const TASK_ITEMS: { key: TaskMenu; label: string; Icon: LucideIcon }[] = [
  { key: 'progress', label: '추진현황', Icon: ChartGantt },
  { key: 'rate', label: '진척률', Icon: Gauge },
]
export const PERF_ITEMS: { key: PerfStage; label: string; Icon: LucideIcon; also?: PerfStage[] }[] = [
  { key: 'work', label: '과제관리', Icon: LayoutList },
  { key: 'members', label: '팀원관리', Icon: Users },
  // 평가하기 = 팀원마다 기여도 · 개인수행등급(성과등급 · 목표 · 성과는 과제관리 표에서). 예전 'tasks'(과제별)도 여기로
  { key: 'evaluate', label: '평가하기', Icon: SquarePen, also: ['tasks'] },
  { key: 'results', label: '평가결과', Icon: Trophy },
  { key: 'notes', label: '면담', Icon: MessagesSquare },
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
    else if (mode === 'tasks' || !canPerf) {
      // 추진현황을 보드 · 타임라인으로 보고 있으면 그 장(보기 모양은 ProgressBoard가 이 브라우저에 기억)
      let board = false
      try {
        board = taskMenu === 'progress' && ['board', 'timeline'].includes(localStorage.getItem('progress-board-view') ?? '')
      } catch {
        // 모르면 추진현황 장
      }
      setManual({ area: 'tasks', chapter: board ? 'views' : taskMenu })
    } else if (mode === 'perf') setManual({ area: 'perf', chapter: inPerf ? PERF_MANUAL[perfStage] : 'start' })
    else setManual({})
  }
  const manualPanel = manual && <ManualPanel area={manual.area} chapter={manual.chapter} onClose={() => setManual(null)} />
  // 데이터 초기화(계정 메뉴): 평가를 열지 않아도 어디서나
  const [resetOpen, setResetOpen] = useState(false)
  // 창은 페이지 맨 위(body)에 띄운다 -- 사이드바 안에 두면 본문 버튼이 창 위로 비친다
  const resetDialog = resetOpen && createPortal(<DataResetDialog onClose={() => setResetOpen(false)} />, document.body)
  // 데이터 백업: 평가 안에서는 그 평가의 창(perf.onOpenDataManager), 밖(평가 목록 · 홈 · 과제 입력)에서는 여기서 연다
  const [backupOpen, setBackupOpen] = useState(false)
  const backupDrawer = backupOpen && createPortal(<DataManagerDrawer open onClose={() => setBackupOpen(false)} />, document.body)
  // 과제 입력 메뉴가 칠해지는 때(팀원은 홈 밖이면 늘 과제 입력)
  const inTasks = mode === 'tasks' || (!canPerf && mode !== 'home' && mode !== 'admin')
  return { ...app, ...ws, ...account, inPerf, inTasks, onAccountChange, openManual, manualPanel, resetDialog, openReset: () => setResetOpen(true), backupDrawer, openBackup: () => setBackupOpen(true) }
}

// 계정 메뉴의 글자 크기: 자동(창 너비) 스위치 + 5단계 슬라이더(아주 작게 · 작게 · 보통 · 크게 · 아주 크게). 슬라이더를 움직이면 자동은 꺼진다
const FONT_STEPS = ['xsmall', 'small', 'normal', 'large', 'xlarge'] as const
function FontSizeItem() {
  const [pref, setPref] = useState<FontPref>(readFontPref)
  useEffect(() => onFontPrefChange(() => setPref(readFontPref())), [])
  const auto = pref === 'auto'
  const idx = auto ? 2 : FONT_STEPS.indexOf(pref)
  const pct = Math.round(currentScale(pref) * 100)
  return (
    <div className="px-3.5 pb-2 pt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 text-[length:calc(13.5px*var(--ui-fs,1))] text-label">
        <ALargeSmall size={15} strokeWidth={1.8} className="text-label-2" />
        글자 크기
        <span className="ml-1 tabular-nums text-label-3">{auto ? `자동 ${pct}%` : `${FONT_PREF_LABEL[pref]} ${pct}%`}</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-2" title="창 너비에 맞춰 자동(큰 모니터일수록 크게)">
          자동
          <button
            role="switch"
            aria-checked={auto}
            onClick={() => setFontPref(auto ? 'normal' : 'auto')}
            className={`relative h-[18px] w-8 rounded-full transition-colors ${auto ? 'bg-accent' : 'bg-black/[0.15]'}`}
          >
            <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left] ${auto ? 'left-[16px]' : 'left-[2px]'}`} />
          </button>
        </label>
      </div>
      <div className={`mt-2.5 flex items-center gap-2.5 ${auto ? 'opacity-45' : ''}`}>
        <span className="text-[12px] font-semibold text-label-2">가</span>
        {/* 그림은 직접 그리고(트랙 · 채움 · 눈금 · 손잡이), 조작은 투명한 range 입력이 받는다(끌기 · 클릭 · 키보드) */}
        <div className="relative h-6 flex-1">
          <div className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-black/[0.1]" />
          <div className="absolute left-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent" style={{ width: `calc((100% - 16px) * ${idx / 4})` }} />
          {FONT_STEPS.map((k, i) => (
            <span
              key={k}
              className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${i <= idx ? 'bg-accent' : 'bg-[#D4D6DB]'}`}
              style={{ left: `calc(8px + (100% - 16px) * ${i / 4})` }}
            />
          ))}
          <span
            className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition-[left]"
            style={{ left: `calc(8px + (100% - 16px) * ${idx / 4})` }}
          />
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={idx}
            onChange={(e) => setFontPref(FONT_STEPS[Number(e.target.value)])}
            aria-label="글자 크기"
            aria-valuetext={FONT_PREF_LABEL[FONT_STEPS[idx]]}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <span className="text-[18px] font-semibold text-label-2">가</span>
      </div>
    </div>
  )
}

// 계정 메뉴의 테마: 색 · 모서리 · 그림자 묶음을 고른다(이 브라우저에 기억). 값은 src/theme.css
function ThemeItem() {
  const [cur, setCur] = useState<ThemeKey>(readTheme)
  useEffect(() => onThemeChange(() => setCur(readTheme())), [])
  return (
    <div className="px-3.5 pb-2 pt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 text-[length:calc(13.5px*var(--ui-fs,1))] text-label">
        <Palette size={15} strokeWidth={1.8} className="text-label-2" />
        테마
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            title={t.desc}
            aria-pressed={cur === t.key}
            className={`flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[length:calc(13px*var(--ui-fs,1))] ${cur === t.key ? 'bg-accent-soft font-medium text-label ring-1 ring-accent/40' : 'text-label-2 hover:bg-black/[0.04]'}`}
          >
            <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: t.dots[0] }}>
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-tl-full" style={{ background: t.dots[1] }} />
            </span>
            <span className="min-w-0 truncate">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ResetItem({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mac-menu-item">
      <RotateCcw size={14} strokeWidth={1.8} />
      데이터 초기화…
    </button>
  )
}

function LogoutItem({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mac-menu-item">
      <LogOut size={14} strokeWidth={1.8} />
      로그아웃
    </button>
  )
}

// 계정 메뉴의 「디스플레이」: 글자 크기 · 테마를 한 줄로 요약하고, 누르면 옆으로 상세 설정이 펼쳐진다(오른쪽 화살표)
function DisplayItem() {
  const [pref, setPref] = useState<FontPref>(readFontPref)
  const [theme, setThemeKey] = useState<ThemeKey>(readTheme)
  useEffect(() => onFontPrefChange(() => setPref(readFontPref())), [])
  useEffect(() => onThemeChange(() => setThemeKey(readTheme())), [])
  const [open, setOpen] = useState(false)
  const rowRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [leftward, setLeftward] = useState(false)
  const W = 288
  useLayoutEffect(() => {
    if (!open) return
    const r = rowRef.current?.getBoundingClientRect()
    const h = panelRef.current?.offsetHeight ?? 0
    if (!r) return
    let left = r.right + 6
    const flip = left + W > window.innerWidth - 8
    if (flip) left = Math.max(8, r.left - W - 6)
    setLeftward(flip)
    const top = Math.max(8, Math.min(r.top - 4, window.innerHeight - h - 8))
    setPos({ left, top })
  }, [open])
  // 열기 전에도 화살표가 펼쳐질 쪽을 가리키게(화면 오른쪽 끝 계정 메뉴는 왼쪽으로 펼쳐진다)
  useLayoutEffect(() => {
    const r = rowRef.current?.getBoundingClientRect()
    if (r) setLeftward(r.right + 6 + W > window.innerWidth - 8)
  }, [])
  const summary = `글자 ${pref === 'auto' ? `자동 ${Math.round(currentScale(pref) * 100)}%` : FONT_PREF_LABEL[pref]}, ${THEMES.find((t) => t.key === theme)?.label ?? ''}`
  return (
    <>
      <button
        ref={rowRef}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        className={`mac-menu-item ${open ? '!bg-black/[0.05]' : ''}`}
      >
        <Monitor size={14} strokeWidth={1.8} className="shrink-0" />
        <span className="min-w-0 flex-1 text-left">
          디스플레이
          <span className="block truncate text-[length:calc(12px*var(--ui-fs,1))] font-normal text-label-3">{summary}</span>
        </span>
        {leftward ? <ChevronLeft size={14} strokeWidth={1.8} className="shrink-0 text-label-3" /> : <ChevronRight size={14} strokeWidth={1.8} className="shrink-0 text-label-3" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-menu-sub
            style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? 0, width: W }}
            className="mac-pop z-[60] py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <FontSizeItem />
            <div className="mac-menu-sep" />
            <ThemeItem />
          </div>,
          document.body,
        )}
    </>
  )
}

// 계정 메뉴 아래쪽(사이드바와 위 메뉴가 같이 씀): 매뉴얼 · 관리(관리자) · 데이터 백업 · 디스플레이 · 데이터 초기화 · 로그아웃
function AccountFooter({ nav, perf }: { nav: ReturnType<typeof useShellNav>; perf?: SidebarPerfExtras }) {
  const { mode, setMode, canPerf, isAdminUser, inPerf, openManual, handleLogout } = nav
  // 관리자: 초대했는데 실적관리 시트 공유를 아직 안 한 사람 수(관리 메뉴 옆 배지)
  const { data: access } = useAccessData(false)
  const shareWait = isAdminUser ? (access?.users ?? []).filter((u) => !isPendingEmail(u.email) && !!u.invitedAt && !u.sheetShare).length : 0
  return (
    <>
      <button onClick={openManual} className="mac-menu-item">
        <BookOpen size={14} strokeWidth={1.8} />
        사용 매뉴얼
      </button>
      {/* 관리(관리자만): 팀장 · 팀원 권한 · 시트 연결. 팀장의 팀원 초대는 성과관리 › 팀원관리에서 */}
      {isAdminUser && (
        <button onClick={() => mode !== 'admin' && setMode('admin')} className="mac-menu-item">
          <ShieldCheck size={14} strokeWidth={1.8} />
          관리
          {shareWait > 0 && (
            <span className="ml-auto rounded-full bg-orange-500 px-1.5 text-[length:calc(11.5px*var(--ui-fs,1))] font-semibold text-white" title={`실적관리 시트 공유 대기 ${shareWait}명`}>
              {shareWait}
            </span>
          )}
        </button>
      )}
      {canPerf && (
        <button onClick={inPerf && perf?.onOpenDataManager ? perf.onOpenDataManager : nav.openBackup} className="mac-menu-item">
          <Database size={14} strokeWidth={1.8} />
          데이터 백업
        </button>
      )}
      <div className="mac-menu-sep" />
      <DisplayItem />
      <div className="mac-menu-sep" />
      <ResetItem onClick={nav.openReset} />
      <LogoutItem onClick={handleLogout} />
    </>
  )
}

// 화면 머리 줄 맨 오른쪽의 계정 단추(저장 상태 점 + 아바타). 누르면 계정 메뉴 -- 사이드바 모양일 때 PageHeader가 붙인다(위 메뉴 모양은 TopNav가 따로 가짐)
export function HeaderAccount({ perf }: { perf?: SidebarPerfExtras }) {
  const nav = useShellNav()
  const { accountEmail, role, inPerf, onAccountChange } = nav
  if (!accountEmail) return null
  return (
    <>
      {inPerf && perf?.saveBadge && <span className="flex items-center pl-1">{perf.saveBadge}</span>}
      <GoogleAccountMenu
        placement="down"
        onAccountChange={onAccountChange}
        title={`${accountEmail} · ${ROLE_LABEL[role]}`}
        className="ml-0.5 shrink-0 rounded-full"
        footer={<AccountFooter nav={nav} perf={perf} />}
        roleLabel={ROLE_LABEL[role]}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label shadow-pill">
          {accountEmail.slice(0, 1).toUpperCase()}
        </span>
      </GoogleAccountMenu>
      {nav.manualPanel}
      {nav.resetDialog}
      {nav.backupDrawer}
    </>
  )
}

export default function Sidebar({ perf, collapsed, width, animate = true }: { perf?: SidebarPerfExtras; collapsed: boolean; width: number; animate?: boolean }) {
  const nav = useShellNav()
  const { mode, setMode, taskMenu, setTaskMenu, perfStage, setPerfStage, currentWorkspaceId, exitToLanding } = nav
  const { canPerf, inPerf, inTasks, accountEmail, role, onAccountChange } = nav
  function item(key: string, label: string, Icon: LucideIcon, on: boolean, onClick: () => void, extra?: ReactNode, off?: string) {
    return (
      <button
        key={key}
        onClick={off ? undefined : onClick}
        aria-disabled={off ? true : undefined}
        aria-current={on ? 'page' : undefined}
        title={off ?? (collapsed ? label : undefined)}
        className={`ds-nav-item ${on ? 'ds-nav-item-on' : ''} ${collapsed ? 'justify-center !px-0' : ''} ${off ? 'cursor-default opacity-40 hover:bg-transparent' : ''}`}
      >
        <Icon size={17} strokeWidth={1.8} className="shrink-0" />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {!collapsed && extra}
      </button>
    )
  }
  const label = (t: string) => (collapsed ? <div className="mx-3 my-3 h-px bg-separator" /> : <p className="ds-nav-label">{t}</p>)

  return (
    <aside
      style={{ width }}
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-canvas px-2.5 pb-3 pt-1.5 ${animate ? 'transition-[width] duration-200' : ''}`}
      aria-label="메뉴"
    >
      <nav className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
            {/* 평평한 메뉴: 어느 평가를 보는지는 페이지 머리 줄(성과관리 / 팀 · 기간 ▾)에서 고르고 바꾼다(과제 입력의 연도와 같은 방식).
                펼쳐도 접어도 같은 모양. 평가를 아직 안 골랐으면 메뉴는 흐리게 */}
            <div className="space-y-0.5">
              {item('projects', '평가 목록', Folders, mode === 'perf' && !currentWorkspaceId, () => {
                exitToLanding()
                if (mode !== 'perf') setMode('perf')
              })}
              {PERF_ITEMS.map(({ key, label: l, Icon, also }) =>
                item(
                  key,
                  l,
                  Icon,
                  inPerf && !!currentWorkspaceId && (perfStage === key || !!also?.includes(perfStage)),
                  () => {
                    setPerfStage(key)
                    if (mode !== 'perf') setMode('perf')
                  },
                  undefined,
                  currentWorkspaceId ? undefined : `${l} -- 평가 목록에서 평가를 먼저 고르세요`,
                ),
              )}
            </div>
          </>
        )}
      </nav>

      {/* 맨 아래 왼쪽: 계정(누르면 위로 메뉴 -- 매뉴얼 · 관리 · 데이터 백업 · 디스플레이 · 로그아웃). 저장 상태 점은 그 옆에.
          메뉴가 위로 열리고 디스플레이 상세는 오른쪽으로 펼쳐진다(화살표 방향과 같게) */}
      {accountEmail && (
        <div className={`mt-1 flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          <GoogleAccountMenu
            placement="up"
            onAccountChange={onAccountChange}
            title={`${accountEmail} · ${ROLE_LABEL[role]}`}
            className={`flex min-w-0 items-center gap-2 rounded-[10px] p-1.5 text-left hover:bg-black/[0.04] ${collapsed ? 'justify-center' : 'flex-1'}`}
            footer={<AccountFooter nav={nav} perf={perf} />}
            roleLabel={ROLE_LABEL[role]}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label shadow-pill">
              {accountEmail.slice(0, 1).toUpperCase()}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label">{accountEmail.split('@')[0]}</span>
                <ChevronsUpDown size={14} strokeWidth={1.8} className="shrink-0 text-label-3" />
              </>
            )}
          </GoogleAccountMenu>
          {inPerf && perf?.saveBadge}
        </div>
      )}
      {nav.manualPanel}
      {nav.resetDialog}
      {nav.backupDrawer}

    </aside>
  )
}

// 위 메뉴(사이드바를 끝까지 접었을 때 머리 한 줄): 로고(홈) · 모양 버튼 · 홈|과제 입력|성과관리 · 고르기 · 메뉴 알약 · 오른쪽 동작 · 아이콘 · 계정
// 메뉴가 없는 화면(홈 · 프로젝트 목록 · 관리)은 메뉴 자리에 제목을 굵게.
export function TopNav({
  toggle,
  chooser,
  title,
  actions,
  perf,
}: {
  toggle?: ReactNode
  chooser?: ReactNode
  title?: ReactNode
  actions?: ReactNode
  perf?: SidebarPerfExtras
}) {
  const nav = useShellNav()
  const { mode, setMode, taskMenu, setTaskMenu, perfStage, setPerfStage, currentWorkspaceId, exitToLanding } = nav
  const { accountEmail, canPerf, inPerf, inTasks, onAccountChange } = nav
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
  else if (mode !== 'home') menu = <h1 className="px-1 text-[length:calc(16px*var(--ui-fs,1))] font-semibold tracking-[-0.01em] text-label">{title}</h1>

  return (
    <>
      {toggle}
      {/* 영역 전환: 사이드바와 같은 순서(홈 · 과제 입력 · 성과관리) */}
      <span className="ml-1 flex items-center gap-0.5 rounded-[9px] bg-black/[0.05] p-0.5">
        {seg(mode === 'home', '홈', () => mode !== 'home' && setMode('home'))}
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
      {/* 홈은 전환 칸에 이미 칠해져 있어 제목을 따로 쓰지 않는다 */}
      {menu && (
        <>
          <Sep />
          <nav className="flex flex-wrap items-center gap-0.5" aria-label="메뉴">
            {menu}
          </nav>
        </>
      )}
      <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
        {actions}
        <NoticeBell />
        {/* 저장 상태(저장됨 · 저장 중 · 실패)는 계정 앞에 */}
        {inPerf && perf?.saveBadge && <span className="flex items-center pl-1">{perf.saveBadge}</span>}
        {accountEmail && (
          <GoogleAccountMenu
            placement="down"
            onAccountChange={onAccountChange}
            title={accountEmail}
            className="ml-0.5 rounded-full"
            footer={<AccountFooter nav={nav} perf={perf} />}
            roleLabel={ROLE_LABEL[nav.role]}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label shadow-pill">
              {accountEmail.slice(0, 1).toUpperCase()}
            </span>
          </GoogleAccountMenu>
        )}
      </div>
      {nav.manualPanel}
      {nav.resetDialog}
      {nav.backupDrawer}
    </>
  )
}

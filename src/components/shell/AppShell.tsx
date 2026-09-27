// 앱 바탕(디자인 시스템 v2): 회색 캔버스 위 왼쪽 사이드바 + 위 한 줄 머리 + 아래 흰 콘텐츠 판.
// 화면은 <AppShell header={<PageHeader .../>}>{내용}</AppShell> 모양으로 쓴다. 하위 탭은 판 안 맨 위에 <PageTabs>로.
// 메뉴 모양 3단계(머리 맨 앞 버튼으로 차례로): 펼침 → 아이콘만(좁은 사이드바) → 위 메뉴(사이드바 없이 머리 한 줄에).
// 고른 모양은 이 브라우저에 기억한다.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelTop } from 'lucide-react'
import Sidebar, { TopNav, type SidebarPerfExtras } from './Sidebar'

export type ShellLayout = 'open' | 'rail' | 'top'
const LAYOUT_KEY = 'sidebar-layout'
const NEXT: Record<ShellLayout, ShellLayout> = { open: 'rail', rail: 'top', top: 'open' }
function readLayout(): ShellLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY)
    if (v === 'open' || v === 'rail' || v === 'top') return v
    return localStorage.getItem('sidebar-collapsed') === '1' ? 'rail' : 'open' // 예전(접기 한 단계) 기억
  } catch {
    return 'open'
  }
}
// 모양을 바꾼 뒤(새 머리가 그려진 뒤) 알린다 -- 머리 빈 칸에 그리는 화면(추진현황 연도 고르기 · ⋯)이 다시 찾도록
export const SHELL_LAYOUT_EVENT = 'shell-layout'
const ShellCtx = createContext<{ layout: ShellLayout; cycle: () => void; perf?: SidebarPerfExtras } | null>(null)

export default function AppShell({ perf, header, children }: { perf?: SidebarPerfExtras; header?: ReactNode; children: ReactNode }) {
  const [layout, setLayout] = useState(readLayout)
  function cycle() {
    const v = NEXT[layout]
    setLayout(v)
    try {
      localStorage.setItem(LAYOUT_KEY, v)
    } catch {
      // 기억 못 해도 지금은 바뀐다
    }
  }
  useEffect(() => {
    window.dispatchEvent(new Event(SHELL_LAYOUT_EVENT))
  }, [layout])
  const top = layout === 'top'
  return (
    <ShellCtx.Provider value={{ layout, cycle, perf }}>
      <div className="flex min-h-screen bg-canvas">
        {!top && <Sidebar perf={perf} collapsed={layout === 'rail'} />}
        <div className={`flex min-h-screen min-w-0 flex-1 flex-col pb-2 pr-2 ${top ? 'pl-2' : ''}`}>
          {header}
          <div className="flex min-w-0 flex-1 flex-col rounded-panel bg-white shadow-card">{children}</div>
        </div>
      </div>
    </ShellCtx.Provider>
  )
}

// 메뉴 모양 버튼(머리 맨 앞, 언제나 같은 자리): 누를 때마다 펼침 → 아이콘만 → 위 메뉴 → 펼침
function LayoutToggle() {
  const ctx = useContext(ShellCtx)
  if (!ctx) return null
  const { layout } = ctx
  const t = layout === 'open' ? '메뉴 접기(아이콘만)' : layout === 'rail' ? '메뉴를 위로 올리기' : '메뉴 펼치기'
  const Icon = layout === 'open' ? PanelLeftClose : layout === 'rail' ? PanelTop : PanelLeftOpen
  return (
    <button
      onClick={ctx.cycle}
      title={t}
      aria-label={t}
      className="-ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-label-2 hover:bg-black/[0.05] hover:text-label"
    >
      <Icon size={17} strokeWidth={1.8} />
    </button>
  )
}

// 화면 머리(회색 바탕 위 한 줄): 메뉴 모양 버튼 · 영역 / 고르기(연도 · 평가기간) / 제목(굵게) · 오른쪽 동작
// 위 메뉴 모양이면 같은 자리에 로고 · 영역 전환 · 고르기 · 메뉴가 한 줄로 들어간다(제목 대신 지금 메뉴가 칠해짐).
export function PageHeader({ area, chooser, title, actions }: { area?: string; chooser?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  const ctx = useContext(ShellCtx)
  if (ctx?.layout === 'top')
    return (
      <header className="flex min-h-[52px] flex-wrap items-center gap-x-1.5 gap-y-1 px-1 py-2 text-[13px]">
        <LayoutToggle />
        <TopNav chooser={chooser} title={title} actions={actions} perf={ctx.perf} />
      </header>
    )
  return (
    <header className="flex min-h-[48px] flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-2 text-[13px]">
      <LayoutToggle />
      {(area || chooser) && (
        <>
          <span className="flex flex-wrap items-center gap-2.5 font-medium text-label-2">
            {area && <span>{area}</span>}
            {area && chooser && <CrumbSep />}
            {chooser}
          </span>
          <CrumbSep />
        </>
      )}
      <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-label">{title}</h1>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

// 흰 판 맨 위의 하위 탭(예: 관리의 권한 시트 · 팀원 초대)
export function PageTabs({ children }: { children: ReactNode }) {
  return <div className="px-6 pt-4 lg:px-8">{children}</div>
}

// 위치 줄의 구분 기호
export function CrumbSep() {
  return <span className="text-label-3/70">/</span>
}

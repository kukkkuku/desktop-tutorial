// 앱 바탕(디자인 시스템 v2): 회색 캔버스 위 왼쪽 사이드바 + 위 한 줄 머리 + 아래 흰 콘텐츠 판.
// 화면은 <AppShell header={<PageHeader .../>}>{내용}</AppShell> 모양으로 쓴다. 하위 탭은 판 안 맨 위에 <PageTabs>로.
// 사이드바 접기 버튼은 머리 맨 앞(언제나 같은 자리)에 있고, 접은 상태는 이 브라우저에 기억한다.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import Sidebar, { type SidebarPerfExtras } from './Sidebar'

const COLLAPSE_KEY = 'sidebar-collapsed'
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}
const CollapseCtx = createContext<{ collapsed: boolean; toggle: () => void } | null>(null)

export default function AppShell({ perf, header, children }: { perf?: SidebarPerfExtras; header?: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  function toggle() {
    const v = !collapsed
    setCollapsed(v)
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
    } catch {
      // 기억 못 해도 지금은 접힌다
    }
  }
  return (
    <CollapseCtx.Provider value={{ collapsed, toggle }}>
      <div className="flex min-h-screen bg-canvas">
        <Sidebar perf={perf} collapsed={collapsed} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-2 pr-2">
          {header}
          <div className="flex min-w-0 flex-1 flex-col rounded-panel bg-white shadow-card">{children}</div>
        </div>
      </div>
    </CollapseCtx.Provider>
  )
}

// 사이드바 접기 · 펼치기 버튼(머리 맨 앞)
function SidebarToggle() {
  const ctx = useContext(CollapseCtx)
  if (!ctx) return null
  const t = ctx.collapsed ? '메뉴 펼치기' : '메뉴 접기'
  return (
    <button
      onClick={ctx.toggle}
      title={t}
      aria-label={t}
      aria-expanded={!ctx.collapsed}
      className="-ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-label-2 hover:bg-black/[0.05] hover:text-label"
    >
      <PanelLeft size={17} strokeWidth={1.8} />
    </button>
  )
}

// 화면 머리(회색 바탕 위 한 줄): 접기 버튼 · 위치 / 위치 / 제목(굵게) · 오른쪽 동작
export function PageHeader({ crumbs, title, actions }: { crumbs?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex min-h-[48px] flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-2 text-[13px]">
      <SidebarToggle />
      {crumbs && (
        <>
          <span className="flex flex-wrap items-center gap-2.5 font-medium text-label-2">{crumbs}</span>
          <CrumbSep />
        </>
      )}
      <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-label">{title}</h1>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

// 흰 판 맨 위의 하위 탭(예: 평가하기의 과제별 · 팀원별)
export function PageTabs({ children }: { children: ReactNode }) {
  return <div className="px-6 pt-4 lg:px-8">{children}</div>
}

// 위치 줄의 구분 기호
export function CrumbSep() {
  return <span className="text-label-3/70">/</span>
}

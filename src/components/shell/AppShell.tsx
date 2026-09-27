// 앱 바탕(디자인 시스템 v2): 회색 캔버스 위 왼쪽 사이드바 + 위 한 줄 머리 + 아래 흰 콘텐츠 판.
// 화면은 <AppShell header={<PageHeader .../>}>{내용}</AppShell> 모양으로 쓴다. 하위 탭은 판 안 맨 위에 <PageTabs>로.
// 메뉴 모양 3단계(머리 맨 앞 버튼): 펼침 ⇄ 아이콘만(좁은 사이드바) ⇄ 위 메뉴(사이드바 없이 머리 한 줄에).
// 고른 모양은 이 브라우저에 기억한다.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Sidebar, { TopNav, type SidebarPerfExtras } from './Sidebar'

export type ShellLayout = 'open' | 'rail' | 'top'
const LAYOUT_KEY = 'sidebar-layout'
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
const ShellCtx = createContext<{ layout: ShellLayout; setLayout: (v: ShellLayout) => void; perf?: SidebarPerfExtras } | null>(null)

export default function AppShell({ perf, header, children }: { perf?: SidebarPerfExtras; header?: ReactNode; children: ReactNode }) {
  const [layout, setLayoutState] = useState(readLayout)
  function setLayout(v: ShellLayout) {
    setLayoutState(v)
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
    <ShellCtx.Provider value={{ layout, setLayout, perf }}>
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

// 메뉴 모양 고르기(머리 맨 앞, 언제나 같은 자리): 세 칸 중 하나를 누르면 바로 그 모양
//   펼침(넓은 왼쪽 판) · 아이콘만(좁은 왼쪽 판) · 위 메뉴(위쪽 판)
const LAYOUT_OPTIONS: { v: ShellLayout; t: string; panel: ReactNode }[] = [
  { v: 'open', t: '메뉴 펼치기', panel: <rect x="3" y="3" width="7" height="14" rx="1.5" /> },
  { v: 'rail', t: '메뉴 아이콘만', panel: <rect x="3" y="3" width="3.5" height="14" rx="1.2" /> },
  { v: 'top', t: '메뉴를 위로', panel: <rect x="3" y="3" width="14" height="4" rx="1.2" /> },
]
function LayoutIcon({ panel }: { panel: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="2" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <g fill="currentColor">{panel}</g>
    </svg>
  )
}
function LayoutToggle() {
  const ctx = useContext(ShellCtx)
  if (!ctx) return null
  const { layout, setLayout } = ctx
  return (
    <span role="radiogroup" aria-label="메뉴 모양" className="-ml-0.5 flex shrink-0 items-center gap-0.5 rounded-[9px] bg-black/[0.05] p-0.5">
      {LAYOUT_OPTIONS.map(({ v, t, panel }) => {
        const on = layout === v
        return (
          <button
            key={v}
            role="radio"
            aria-checked={on}
            onClick={() => !on && setLayout(v)}
            title={t}
            aria-label={t}
            className={`flex h-6 w-7 items-center justify-center rounded-[7px] ${on ? 'bg-white text-label shadow-pill' : 'text-label-3 hover:text-label'}`}
          >
            <LayoutIcon panel={panel} />
          </button>
        )
      })}
    </span>
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

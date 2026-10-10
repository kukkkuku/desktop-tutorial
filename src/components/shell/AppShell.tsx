// 앱 바탕(디자인 시스템 v2): 회색 캔버스 위 왼쪽 사이드바 + 위 한 줄 머리 + 아래 흰 콘텐츠 판.
// 화면은 <AppShell header={<PageHeader .../>}>{내용}</AppShell> 모양으로 쓴다. 하위 탭은 판 안 맨 위에 <PageTabs>로.
// 메뉴 모양 3단계(머리 맨 앞 버튼으로 차례로): 펼침 → 아이콘만(좁은 사이드바) → 위 메뉴(사이드바 없이 머리 한 줄에).
// 고른 모양은 이 브라우저에 기억한다.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, PanelTop } from 'lucide-react'
import Sidebar, { HeaderAccount, TopNav, type SidebarPerfExtras } from './Sidebar'

// 메뉴 모양: open(펼침) · rail(아이콘만) · top(위 메뉴) · hidden(사이드바 숨김). 사이드바 경계를 끌면 폭 조절, 누르거나 ⌘B면 숨김/펼침
export type ShellLayout = 'open' | 'rail' | 'top' | 'hidden'
const LAYOUT_KEY = 'sidebar-layout'
const NEXT: Record<ShellLayout, ShellLayout> = { open: 'rail', rail: 'top', top: 'open', hidden: 'open' }
const WIDTH_KEY = 'sidebar-width'
const W_MIN = 200
const W_MAX = 380
const W_DEFAULT = 200
const RAIL_W = 60
function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    return v >= W_MIN && v <= W_MAX ? v : W_DEFAULT
  } catch {
    return W_DEFAULT
  }
}
function readLayout(): ShellLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY)
    if (v === 'open' || v === 'rail' || v === 'top' || v === 'hidden') return v
    return localStorage.getItem('sidebar-collapsed') === '1' ? 'rail' : 'open' // 예전(접기 한 단계) 기억
  } catch {
    return 'open'
  }
}
// 모양을 바꾼 뒤(새 머리가 그려진 뒤) 알린다 -- 머리 빈 칸에 그리는 화면(추진현황 연도 고르기 · ⋯)이 다시 찾도록
export const SHELL_LAYOUT_EVENT = 'shell-layout'
const FOLD_KEY = 'shell-head-folded'
function readFolded(): boolean {
  // 위쪽 접기 기능은 없앴다 -- 예전에 접어 둔 기억이 있으면 지우고 펼친 채로 둔다
  try {
    localStorage.removeItem(FOLD_KEY)
  } catch {
    // 못 지워도 펼친 채로
  }
  return false
}
const ShellCtx = createContext<{ layout: ShellLayout; cycle: () => void; perf?: SidebarPerfExtras; folded: boolean; toggleFold: () => void } | null>(null)

export default function AppShell({ perf, header, children }: { perf?: SidebarPerfExtras; header?: ReactNode; children: ReactNode }) {
  const [layout, setLayout] = useState(readLayout)
  const [width, setWidth] = useState(readWidth)
  // 위 머리 줄 접기: 접으면 머리 줄이 사라지고 맨 위 가운데 손잡이로 다시 편다(이 브라우저에 기억)
  const [folded, setFolded] = useState(readFolded)
  function toggleFold() {
    setFolded((v) => {
      try {
        localStorage.setItem(FOLD_KEY, v ? '0' : '1')
      } catch {
        // 기억 못 해도 지금은 바뀐다
      }
      return !v
    })
  }
  useEffect(() => {
    const root = document.documentElement
    if (folded) root.setAttribute('data-head-folded', '1')
    else root.removeAttribute('data-head-folded')
    return () => root.removeAttribute('data-head-folded')
  }, [folded])
  function chooseLayout(v: ShellLayout) {
    setLayout(v)
    try {
      localStorage.setItem(LAYOUT_KEY, v)
    } catch {
      // 기억 못 해도 지금은 바뀐다
    }
  }
  function cycle() {
    chooseLayout(NEXT[layout])
  }
  // ⌘B(Ctrl+B): 사이드바 숨기기/펼치기. 글자를 입력하는 중(굵게 단축키 등)에는 건드리지 않는다
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      chooseLayout(layoutRef.current === 'hidden' ? 'open' : 'hidden')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    window.dispatchEvent(new Event(SHELL_LAYOUT_EVENT))
  }, [layout])
  const top = layout === 'top'
  return (
    <ShellCtx.Provider value={{ layout, cycle, perf, folded, toggleFold }}>
      <div className="flex min-h-screen bg-canvas">
        {folded && (
          <button
            onClick={toggleFold}
            title="위쪽 펴기"
            aria-label="위쪽 펴기"
            className="head-fold-handle fixed left-1/2 top-0 z-40 flex h-5 w-14 -translate-x-1/2 items-center justify-center rounded-b-[10px] bg-white text-label-2 shadow-pop hover:text-label"
          >
            <ChevronDown size={14} strokeWidth={2} />
          </button>
        )}
        {!top && layout !== 'hidden' && (
          <div className="relative flex shrink-0">
            <Sidebar perf={perf} collapsed={layout === 'rail'} width={layout === 'rail' ? RAIL_W : width} animate={!dragging} />
            <SidebarEdge
              layout={layout}
              width={width}
              onDragState={setDragging}
              onLayout={chooseLayout}
              onWidth={(w) => {
                setWidth(w)
                try {
                  localStorage.setItem(WIDTH_KEY, String(w))
                } catch {
                  // 기억 못 해도 지금 화면에는 반영
                }
              }}
            />
          </div>
        )}
        <div className={`flex min-h-screen min-w-0 flex-1 flex-col pb-3 pr-3 ${top || layout === 'hidden' ? 'pl-3' : ''}`}>
          {header}
          {/* 본문 판: 흰 판 + 얇은 테두리로 위 줄 · 사이드바와 구분. backdrop-blur 같은 filter는 쓰지 않는다(쓰면 팝업 어둠이 이 판 안에만 깔림) */}
          <div className="flex min-w-0 flex-1 flex-col rounded-panel border border-[color:var(--panel-border)] [background:var(--panel-bg)] [box-shadow:var(--panel-shadow)]">{children}</div>
        </div>
      </div>
    </ShellCtx.Provider>
  )
}

// 위 머리 줄 접기 · 펴기(화면 안의 「위쪽 접기」 버튼이 쓴다)
export function useHeadFold() {
  const ctx = useContext(ShellCtx)
  return { folded: ctx?.folded ?? false, toggleFold: ctx?.toggleFold ?? (() => {}) }
}

// 메뉴 모양 버튼(머리 맨 앞, 언제나 같은 자리): 누를 때마다 펼침 → 아이콘만 → 위 메뉴 → 펼침
function LayoutToggle() {
  const ctx = useContext(ShellCtx)
  if (!ctx) return null
  const { layout } = ctx
  const t = layout === 'open' ? '메뉴 접기(아이콘만) · ⌘B 숨기기' : layout === 'rail' ? '메뉴를 위로 올리기' : layout === 'hidden' ? '사이드바 펼치기 (⌘B)' : '메뉴 펼치기'
  const Icon = layout === 'open' ? PanelLeftClose : layout === 'rail' ? PanelTop : PanelLeftOpen
  return (
    <>
      <button
        onClick={ctx.cycle}
        title={t}
        aria-label={t}
        className="-ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-label-2 hover:bg-black/[0.05] hover:text-label"
      >
        <Icon size={17} strokeWidth={1.8} />
      </button>
    </>
  )
}

// 화면 머리(회색 바탕 위 한 줄): 메뉴 모양 버튼 · 영역 / 고르기(연도 · 평가기간) / 제목(굵게) · 오른쪽 동작
// 위 메뉴 모양이면 같은 자리에 로고 · 영역 전환 · 고르기 · 메뉴가 한 줄로 들어간다(제목 대신 지금 메뉴가 칠해짐).
export function PageHeader({ area, chooser, title, actions }: { area?: string; chooser?: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  const ctx = useContext(ShellCtx)
  if (ctx?.layout === 'top')
    return (
      <header className="shell-header flex min-h-[48px] flex-wrap items-center gap-x-1.5 gap-y-1 px-1 py-2 text-[length:calc(14px*var(--ui-fs,1))]">
        {/* 위 메뉴: 로고가 맨 앞, 메뉴 모양 버튼은 그 뒤 */}
        <TopNav toggle={<LayoutToggle />} chooser={chooser} title={title} actions={actions} perf={ctx.perf} />
      </header>
    )
  return (
    <header className="shell-header flex min-h-[48px] flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-2 text-[length:calc(14px*var(--ui-fs,1))]">
      <LayoutToggle />
      {(area || chooser) && (
        <>
          <span className="flex flex-wrap items-center gap-2.5 font-medium text-label-2">
            {area && <span>{area}</span>}
            {area && chooser && <CrumbSep />}
            {chooser}
          </span>
          {title && <CrumbSep />}
        </>
      )}
      {title && <h1 className="text-[length:calc(17px*var(--ui-fs,1))] font-semibold tracking-[-0.01em] text-label">{title}</h1>}
      <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        {actions}
        <HeaderAccount perf={ctx?.perf} />
      </div>
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

// 사이드바 오른쪽 경계: 끌면 폭 조절(좁게 끌면 아이콘만, 다시 넓히면 펼침), 한 번 누르면 숨기기. 마우스를 올리면 안내(Claude처럼)
function SidebarEdge({
  layout,
  width,
  onDragState,
  onLayout,
  onWidth,
}: {
  layout: ShellLayout
  width: number
  onDragState: (d: boolean) => void
  onLayout: (v: ShellLayout) => void
  onWidth: (w: number) => void
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const [active, setActive] = useState(false)
  function down(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX
    const w0 = layout === 'rail' ? RAIL_W : width
    let moved = false
    let mode: ShellLayout = layout
    let last = width
    setTip(null)
    setActive(true)
    onDragState(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - x0
      if (Math.abs(dx) > 3) moved = true
      if (!moved) return
      const nw = w0 + dx
      if (nw < 150) {
        if (mode !== 'rail') {
          mode = 'rail'
          onLayout('rail')
        }
      } else {
        const w = Math.max(W_MIN, Math.min(W_MAX, nw))
        if (mode !== 'open') {
          mode = 'open'
          onLayout('open')
        }
        last = w
        onWidth(w)
      }
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setActive(false)
      onDragState(false)
      if (!moved) onLayout('hidden')
      else if (mode === 'open') onWidth(last)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="사이드바 크기 조절 · 누르면 숨기기"
        onMouseDown={down}
        onMouseMove={(e) => !active && setTip({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTip(null)}
        className="group/edge absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize"
      >
        <span className={`absolute inset-y-0 left-[3px] w-[2px] rounded-full transition-colors ${active ? 'bg-accent' : 'bg-transparent group-hover/edge:bg-black/[0.12]'}`} />
      </div>
      {tip && !active && (
        <div className="ds-tip fixed z-[70]" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          <div className="flex items-center gap-3">
            <span>사이드바 숨기기</span>
            <span className="ds-kbd !bg-transparent !text-white/60 !shadow-none">⌘ B</span>
          </div>
          <div className="mt-0.5 text-white/60">드래그하여 크기 조절</div>
        </div>
      )}
    </>
  )
}

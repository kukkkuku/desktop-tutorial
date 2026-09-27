// 앱 바탕(디자인 시스템 v2): 회색 캔버스 위 왼쪽 사이드바 + 오른쪽 흰 콘텐츠 판.
// 화면은 <AppShell sidebar={...}><PageHeader .../>{내용}</AppShell> 모양으로 쓴다.
import type { ReactNode } from 'react'
import Sidebar, { type SidebarPerfExtras } from './Sidebar'

export default function AppShell({ perf, children }: { perf?: SidebarPerfExtras; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar perf={perf} />
      <div className="min-w-0 flex-1 py-2 pr-2">
        <div className="flex min-h-[calc(100vh-16px)] flex-col rounded-panel bg-white shadow-card">{children}</div>
      </div>
    </div>
  )
}

// 화면 머리: 위치(작은 글씨) · 큰 제목 · 오른쪽 동작 · 아래 탭
export function PageHeader({
  crumbs,
  title,
  actions,
  tabs,
  sticky = false,
}: {
  crumbs?: ReactNode
  title: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  sticky?: boolean
}) {
  return (
    <header className={`px-6 pt-5 lg:px-8 ${sticky ? 'sticky top-0 z-30 rounded-t-panel bg-white/90 backdrop-blur-xl' : ''}`}>
      {crumbs && <div className="flex min-h-[24px] flex-wrap items-center gap-1.5 text-[13px] text-label-3">{crumbs}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-label">{title}</h1>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
    </header>
  )
}

// 위치 줄의 구분 기호
export function CrumbSep() {
  return <span className="text-label-3/70">/</span>
}

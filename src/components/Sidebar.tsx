import type { WorkspaceMeta } from '../types'

const ADD_PERIOD_VALUE = '__add_period__'

interface SidebarProps {
  teamName: string
  currentWorkspaceId: string
  periods: WorkspaceMeta[]
  onSelectPeriod: (id: string) => void
  onAddPeriod: () => void
  onExit: () => void
  settingsActive: boolean
  onOpenSettings: () => void
}

export default function Sidebar({
  teamName,
  currentWorkspaceId,
  periods,
  onSelectPeriod,
  onAddPeriod,
  onExit,
  settingsActive,
  onOpenSettings,
}: SidebarProps) {
  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === ADD_PERIOD_VALUE) {
      onAddPeriod()
      return
    }
    onSelectPeriod(e.target.value)
  }

  return (
    <aside className="flex w-full flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:h-screen sm:w-56 sm:shrink-0 sm:flex-col sm:items-stretch sm:gap-2 sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-4 sm:py-5">
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onExit}
          title="홈으로"
          aria-label="홈으로"
          className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </button>
        <span className="whitespace-nowrap text-base font-bold text-black sm:text-lg">{teamName} 성과관리</span>
      </div>

      <select
        value={currentWorkspaceId}
        onChange={handlePeriodChange}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black sm:w-full sm:py-2"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.periodName}
          </option>
        ))}
        <option value={ADD_PERIOD_VALUE}>+ 새 기간 추가</option>
      </select>

      <button
        onClick={onOpenSettings}
        aria-current={settingsActive}
        className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors sm:mt-auto sm:w-full sm:py-2 ${
          settingsActive
            ? 'border-accent bg-orange-50 text-accent'
            : 'border-gray-300 text-black hover:bg-gray-100'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        설정
      </button>
    </aside>
  )
}

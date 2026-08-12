import type { WorkspaceMeta } from '../types'

export type TabKey = 'tasks' | 'members' | 'matrix' | 'criteria' | 'results' | 'notes'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'tasks', label: '과제관리' },
  { key: 'members', label: '팀원관리' },
  { key: 'matrix', label: '평가매트릭스' },
  { key: 'criteria', label: '기준설정' },
  { key: 'results', label: '평가결과' },
  { key: 'notes', label: '팀원면담' },
]

const ADD_PERIOD_VALUE = '__add_period__'

interface NavigationProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  teamName: string
  currentWorkspaceId: string
  periods: WorkspaceMeta[]
  onSelectPeriod: (id: string) => void
  onAddPeriod: () => void
  onExit: () => void
}

export default function Navigation({
  activeTab,
  onTabChange,
  teamName,
  currentWorkspaceId,
  periods,
  onSelectPeriod,
  onAddPeriod,
  onExit,
}: NavigationProps) {
  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === ADD_PERIOD_VALUE) {
      onAddPeriod()
      return
    }
    onSelectPeriod(e.target.value)
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="whitespace-nowrap text-lg font-bold text-black">{teamName} 성과관리</div>
          <select
            value={currentWorkspaceId}
            onChange={handlePeriodChange}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.periodName}
              </option>
            ))}
            <option value={ADD_PERIOD_VALUE}>+ 새 기간 추가</option>
          </select>
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
        </div>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                activeTab === tab.key
                  ? 'bg-accent text-white'
                  : 'text-black hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

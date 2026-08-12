export type TabKey = 'tasks' | 'members' | 'matrix' | 'criteria' | 'results' | 'notes'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'tasks', label: '과제관리' },
  { key: 'members', label: '팀원관리' },
  { key: 'matrix', label: '평가매트릭스' },
  { key: 'criteria', label: '기준설정' },
  { key: 'results', label: '평가결과' },
  { key: 'notes', label: '팀원면담' },
]

interface NavigationProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  teamName: string
  periodName: string
  onExit: () => void
}

export default function Navigation({ activeTab, onTabChange, teamName, periodName, onExit }: NavigationProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="whitespace-nowrap text-lg font-bold text-black">UX팀 성과평가 시스템</div>
          <span className="hidden text-gray-300 sm:inline">|</span>
          <button
            onClick={onExit}
            className="whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
            title="다른 평가로 전환"
          >
            {teamName} · {periodName} <span className="text-gray-400">전환</span>
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

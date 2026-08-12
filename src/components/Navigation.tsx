export type TabKey = 'tasks' | 'members' | 'matrix' | 'criteria' | 'results'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'tasks', label: '과제관리' },
  { key: 'members', label: '팀원관리' },
  { key: 'matrix', label: '평가매트릭스' },
  { key: 'criteria', label: '기준설정' },
  { key: 'results', label: '평가결과' },
]

interface NavigationProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
}

export default function Navigation({ activeTab, onTabChange }: NavigationProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="text-lg font-bold text-black">UX팀 성과평가 시스템</div>
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

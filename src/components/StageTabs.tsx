export type Stage = 'data' | 'evaluation' | 'notes'
export type DataSubTab = 'tasks' | 'members'

const STAGES: { key: Stage; label: string }[] = [
  { key: 'data', label: '데이터 관리' },
  { key: 'evaluation', label: '평가' },
  { key: 'notes', label: '면담' },
]

const DATA_SUB_TABS: { key: DataSubTab; label: string }[] = [
  { key: 'tasks', label: '과제' },
  { key: 'members', label: '팀원' },
]

interface StageTabsProps {
  stage: Stage
  onStageChange: (stage: Stage) => void
  dataSubTab: DataSubTab
  onDataSubTabChange: (tab: DataSubTab) => void
}

export default function StageTabs({ stage, onStageChange, dataSubTab, onDataSubTabChange }: StageTabsProps) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6">
        <nav className="flex flex-wrap items-center gap-1">
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => onStageChange(s.key)}
              className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${
                stage === s.key
                  ? 'border-accent font-semibold text-accent'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-black'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {stage === 'data' && (
        <div className="border-t border-gray-100 bg-gray-50">
          <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6">
            <nav className="flex flex-wrap items-center gap-1">
              {DATA_SUB_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => onDataSubTabChange(tab.key)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    dataSubTab === tab.key ? 'bg-accent text-white' : 'text-black hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}

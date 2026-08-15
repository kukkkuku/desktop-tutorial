import type { WorkspaceMeta } from '../types'

export type Stage = 'data' | 'evaluate' | 'results' | 'notes'

const ADD_PERIOD_VALUE = '__add_period__'

const TAB_GROUPS: { key: Stage; label: string }[][] = [
  [{ key: 'data', label: '데이터' }],
  [
    { key: 'evaluate', label: '평가하기' },
    { key: 'results', label: '결과' },
  ],
  [{ key: 'notes', label: '면담' }],
]

interface StageTabsProps {
  stage: Stage
  onStageChange: (stage: Stage) => void
  teamName: string
  currentWorkspaceId: string
  periods: WorkspaceMeta[]
  onSelectPeriod: (id: string) => void
  onAddPeriod: () => void
  onExit: () => void
}

export default function StageTabs({
  stage,
  onStageChange,
  teamName,
  currentWorkspaceId,
  periods,
  onSelectPeriod,
  onAddPeriod,
  onExit,
}: StageTabsProps) {
  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === ADD_PERIOD_VALUE) {
      onAddPeriod()
      return
    }
    onSelectPeriod(e.target.value)
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
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
        <span className="h-3.5 w-px shrink-0 bg-gray-200" />
        <span className="whitespace-nowrap text-sm font-bold text-black">
          {teamName} <span className="font-normal text-gray-400">성과관리</span>
        </span>
        <select
          value={currentWorkspaceId}
          onChange={handlePeriodChange}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-black"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.periodName}
            </option>
          ))}
          <option value={ADD_PERIOD_VALUE}>+ 새 기간 추가</option>
        </select>

        <nav className="ml-auto flex flex-wrap items-center gap-1.5">
          {TAB_GROUPS.map((group, groupIndex) => (
            <div key={groupIndex} className="flex flex-wrap items-center gap-1.5">
              {groupIndex > 0 && <span className="mx-1 hidden h-6 w-px bg-gray-300 sm:inline-block" />}
              {group.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onStageChange(t.key)}
                  className={`rounded-md border-2 px-5 py-2 text-base font-bold transition-colors ${
                    stage === t.key
                      ? 'border-accent bg-orange-50 text-accent'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-black'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </header>
  )
}

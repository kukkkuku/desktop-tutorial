import type { WorkspaceMeta } from '../types'

export type Stage = 'data' | 'evaluate' | 'results' | 'notes'

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
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center gap-4 px-4 py-3.5 sm:px-6">
        <button
          onClick={onExit}
          title="홈으로"
          aria-label="홈으로"
          className="flex shrink-0 items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </button>
        <span className="h-6 w-px shrink-0 bg-gray-200" />
        <span className="whitespace-nowrap text-lg font-bold text-black">
          {teamName} <span className="font-normal text-gray-400">성과관리</span>
        </span>
        <div className="flex items-center gap-2">
          <select
            value={currentWorkspaceId}
            onChange={(e) => onSelectPeriod(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.periodName}
              </option>
            ))}
          </select>
          <button
            onClick={onAddPeriod}
            title="새 기간 추가"
            aria-label="새 기간 추가"
            className="flex shrink-0 items-center justify-center rounded-md border border-gray-300 p-2 text-gray-500 hover:border-accent hover:text-accent"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <nav className="ml-auto flex flex-wrap items-center gap-1">
          {TAB_GROUPS.map((group, groupIndex) => (
            <div key={groupIndex} className="flex flex-wrap items-center gap-1">
              {groupIndex > 0 && <span className="mx-2 hidden h-5 w-px bg-gray-200 sm:inline-block" />}
              {group.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onStageChange(t.key)}
                  className={`rounded-md px-4 py-2 text-base transition-colors ${
                    stage === t.key
                      ? 'bg-orange-50 font-bold text-accent'
                      : 'font-semibold text-gray-500 hover:bg-gray-50 hover:text-black'
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

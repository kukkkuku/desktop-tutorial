import type { WorkspaceMeta } from '../types'
import IconButton from './IconButton'

export type Stage = 'data' | 'evaluate' | 'results' | 'notes'

// 기간(워크스페이스)에 종속된 세 탭 -- 지금 선택된 팀+기간의 데이터를 다룬다.
const PERIOD_TABS: { key: Stage; label: string }[] = [
  { key: 'data', label: '데이터' },
  { key: 'evaluate', label: '평가하기' },
  { key: 'results', label: '결과' },
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

// "성장 관리"는 아이콘을 가진 별도 트렌드-업 마크로 표시된다 -- 팀원
// 성장을 기간 넘어 추적하는, 다른 세 탭과 성격이 다른 상위 메뉴임을
// 시각적으로 구분하기 위함.
function GrowthIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  )
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
      <div className="flex w-full flex-wrap items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <IconButton onClick={onExit} title="홈으로" aria-label="홈으로" className="shrink-0">
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
        </IconButton>
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
          <IconButton onClick={onAddPeriod} title="새 기간 추가" aria-label="새 기간 추가" className="shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </IconButton>
        </div>

        {/* 이 세 탭은 위의 기간 선택과 같은 층위 -- 지금 고른 팀+기간에
            대한 화면이라 기간 컨트롤 바로 옆에 붙인다. */}
        <span className="hidden h-5 w-px bg-gray-200 sm:inline-block" />
        <nav className="flex flex-wrap items-center gap-1">
          {PERIOD_TABS.map((t) => (
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
        </nav>

        {/* 성장 관리는 특정 기간이 아니라 팀원을 기간 너머로 추적하는
            상위 메뉴 -- 아이콘 있는 별도 버튼으로 오른쪽에 확실히 분리. */}
        <button
          onClick={() => onStageChange('notes')}
          className={`ml-auto flex shrink-0 items-center gap-2 rounded-lg border-2 px-4 py-2 text-base font-bold transition-colors ${
            stage === 'notes'
              ? 'border-accent bg-orange-50 text-accent'
              : 'border-gray-300 text-gray-700 hover:border-accent hover:text-accent'
          }`}
        >
          <GrowthIcon className="h-5 w-5 shrink-0" />
          성장 관리
        </button>
      </div>
    </header>
  )
}

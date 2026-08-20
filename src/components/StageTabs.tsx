import type { WorkspaceMeta } from '../types'
import IconButton from './IconButton'

export type Stage = 'tasks' | 'members' | 'evaluate' | 'results' | 'notes'

// 상단 메뉴는 데이터 관리(드로어) - 과제관리 - 팀원관리 - 평가하기 - 평가결과 -
// 팀원 면담 순서로 한 줄에 평평하게 나열한다. 예전에는 "데이터"라는 상위
// 탭 아래 과제/팀원/피어리뷰가 서브탭으로 숨어 있었는데, 자주 쓰는 과제관리·
// 팀원관리를 한 클릭에 바로 갈 수 있도록 최상위로 끌어올렸다.
const STAGE_TABS: { key: Stage; label: string }[] = [
  { key: 'tasks', label: '과제관리' },
  { key: 'members', label: '팀원관리' },
  { key: 'evaluate', label: '평가하기' },
  { key: 'results', label: '평가결과' },
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
  onOpenDataManager: () => void
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  )
}

// "팀원 면담"은 말풍선 아이콘으로 표시된다 -- 팀원과의 대화 기록이라는
// 성격이 다른 네 탭(과제관리/팀원관리/평가하기/평가결과)과 다름을 시각적으로
// 구분하기 위함.
function MeetingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
  onOpenDataManager,
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
                {p.evaluationYear} {p.periodName}
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

        <span className="hidden h-5 w-px bg-gray-200 sm:inline-block" />
        <nav className="flex flex-wrap items-center gap-1">
          <button
            onClick={onOpenDataManager}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-base font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-black"
          >
            <DatabaseIcon className="h-5 w-5 shrink-0" />
            데이터 관리
          </button>

          {STAGE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onStageChange(t.key)}
              className={`rounded-md px-4 py-2 text-base transition-colors ${
                stage === t.key
                  ? 'bg-accent font-bold text-white'
                  : 'font-semibold text-gray-500 hover:bg-gray-50 hover:text-black'
              }`}
            >
              {t.label}
            </button>
          ))}

          <button
            onClick={() => onStageChange('notes')}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-base transition-colors ${
              stage === 'notes'
                ? 'bg-accent font-bold text-white'
                : 'font-semibold text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <MeetingIcon className="h-5 w-5 shrink-0" />
            팀원 면담
          </button>
        </nav>
      </div>
    </header>
  )
}

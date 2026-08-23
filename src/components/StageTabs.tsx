import type { WorkspaceMeta } from '../types'
import GoogleAccountMenu from './GoogleAccountMenu'
import IconButton from './IconButton'
import Spinner from './Spinner'
import WorkspaceSwitcher from './WorkspaceSwitcher'

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
  onExit: () => void
  onOpenDataManager: () => void
  // Google 계정 연결 상태 -- 연결 안 됐으면(또는 연동 자체가 설정 안 됐으면)
  // accountEmail이 null이라 이 영역 전체를 그리지 않는다.
  accountEmail: string | null
  isAdminUser: boolean
  hasSavedCurrentPeriod: boolean
  onLogout: () => void
  // "다른 Google 계정 연결"로 계정을 바꾸면 호출한다 -- App이 accountEmail을
  // 다시 읽어오도록.
  onAccountChange?: () => void
  // Drive 전체 저장 진행 상태 -- 계정 정보 옆에 "저장 중"/"저장 실패" 배지로
  // 보여준다. 지정 안 하면(또는 'idle'이면) hasSavedCurrentPeriod에 따른
  // 기존 "저장됨" 배지만 보여준다.
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
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
  onExit,
  onOpenDataManager,
  accountEmail,
  isAdminUser,
  hasSavedCurrentPeriod,
  onLogout,
  onAccountChange,
  saveStatus = 'idle',
}: StageTabsProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex w-full flex-wrap items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <WorkspaceSwitcher
          teamName={teamName}
          currentWorkspaceId={currentWorkspaceId}
          periods={periods}
          onSelectPeriod={onSelectPeriod}
          onOpenProjectManagement={onExit}
        />

        <span className="hidden h-5 w-px bg-gray-200 sm:inline-block" />
        <nav className="flex flex-wrap items-center gap-1">
          <IconButton onClick={onOpenDataManager} title="데이터 관리" aria-label="데이터 관리" className="shrink-0">
            <DatabaseIcon className="h-5 w-5" />
          </IconButton>

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

        {accountEmail && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <GoogleAccountMenu
              className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-black"
              onAccountChange={onAccountChange}
            >
              {accountEmail}
              {isAdminUser && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">관리자</span>
              )}
              <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" />
            </GoogleAccountMenu>
            {saveStatus === 'saving' && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                <Spinner className="h-3 w-3" />
                저장 중
              </span>
            )}
            {saveStatus === 'error' && (
              <button
                onClick={onOpenDataManager}
                title="데이터 관리에서 다시 저장"
                className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-red-100"
              >
                저장 실패 · 재시도
              </button>
            )}
            {saveStatus !== 'saving' && saveStatus !== 'error' && hasSavedCurrentPeriod && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">저장됨</span>
            )}
            <button onClick={onLogout} className="text-sm text-gray-400 hover:text-black">
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

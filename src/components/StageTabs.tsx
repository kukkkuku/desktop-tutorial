import type { WorkspaceMeta } from '../types'
import GoogleAccountMenu from './GoogleAccountMenu'
import IconButton from './IconButton'
import Spinner from './Spinner'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import { IS_PREVIEW } from '../utils/previewMode'
import { sheetUrl } from '../utils/sheetSources'
import { useAppState } from '../state/AppContext'
import SheetsIcon from './SheetsIcon'
import { withGoogleAccount } from '../utils/googleDrive'
import { BarChart3, ChevronDown, Database, LayoutList, MessageCircle, SlidersHorizontal, Users, Zap, type LucideIcon } from 'lucide-react'
import { ic, icSm } from './ui/icon'

export type Stage = 'work' | 'tasks' | 'members' | 'evaluate' | 'results' | 'notes'

// 상단 메뉴는 데이터 관리(드로어) - 과제관리 - 팀원관리 - 평가하기 - 평가결과 -
// 팀원 면담 순서로 한 줄에 평평하게 나열한다. 예전에는 "데이터"라는 상위
// 탭 아래 과제/팀원/피어리뷰가 서브탭으로 숨어 있었는데, 자주 쓰는 과제관리·
// 팀원관리를 한 클릭에 바로 갈 수 있도록 최상위로 끌어올렸다.
//
// 과제관리는 구글시트와 연동되는 L2/L3 보드(WorkStage)다. 예전 과제관리
// 화면(평가용 과제 목록)은 "평가과제"로 이름을 바꿔 평가하기 앞에 둔다 --
// L3를 하나씩 또는 묶어서 평가과제로 만드는 흐름은 다음 단계에서 붙인다
// (docs/PLAN-TASK-MANAGEMENT.md 6.1).
// 과제리스트(L2/L3 보드)와 평가과제는 한 메뉴 "과제관리" 안의 두 화면이다(화면 위 세그먼트로 전환).
const STAGE_TABS: { key: Stage; label: string; Icon: LucideIcon; also?: Stage[] }[] = [
  { key: 'work', label: '과제관리', Icon: LayoutList, also: ['tasks'] },
  { key: 'members', label: '팀원관리', Icon: Users },
  { key: 'evaluate', label: '평가하기', Icon: SlidersHorizontal },
  { key: 'results', label: '평가결과', Icon: BarChart3 },
  { key: 'notes', label: '팀원 면담', Icon: MessageCircle },
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
  onOpenQuickStart: () => void
  quickStartOpen: boolean
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

export default function StageTabs({
  stage,
  onStageChange,
  teamName,
  currentWorkspaceId,
  periods,
  onSelectPeriod,
  onExit,
  onOpenDataManager,
  onOpenQuickStart,
  quickStartOpen,
  accountEmail,
  isAdminUser,
  hasSavedCurrentPeriod,
  onLogout,
  onAccountChange,
  saveStatus = 'idle',
}: StageTabsProps) {
  const sheetLink = useAppState().state.workBoard.sheetLink
  return (
    <header className="sticky top-0 z-40 border-b border-separator bg-[#FBFBFD]/85 backdrop-blur-xl">
      <div className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <WorkspaceSwitcher
          teamName={teamName}
          currentWorkspaceId={currentWorkspaceId}
          periods={periods}
          onSelectPeriod={onSelectPeriod}
          onOpenProjectManagement={onExit}
        />

        {IS_PREVIEW && (
          <span
            className="mac-badge bg-orange-100 text-orange-700"
            title="개발 중인 버전입니다. 운영 버전과 데이터가 분리돼 있어 여기서 바꾼 내용은 운영에 반영되지 않습니다."
          >
            미리보기
          </span>
        )}
        <span className="hidden h-5 w-px bg-separator sm:inline-block" />
        <IconButton onClick={onOpenDataManager} title="데이터 관리" aria-label="데이터 관리">
          <Database {...ic} />
        </IconButton>
        <IconButton
          onClick={onOpenQuickStart}
          title="빠른 시작"
          aria-label="빠른 시작"
          aria-pressed={quickStartOpen}
          className={quickStartOpen ? 'bg-accent-soft !text-accent' : ''}
        >
          <Zap {...ic} />
        </IconButton>
        <nav className="mac-seg" role="tablist">
          {STAGE_TABS.map(({ key, label, Icon, also }) => {
            const on = stage === key || !!also?.includes(stage)
            return (
            <button
              key={key}
              role="tab"
              aria-selected={on}
              onClick={() => !on && onStageChange(key)}
              className={`mac-seg-item flex items-center gap-1.5 !px-3.5 !py-[6px] ${on ? 'mac-seg-item-on !text-accent' : ''}`}
            >
              <Icon {...icSm} />
              {label}
            </button>
            )
          })}
        </nav>

        {accountEmail && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <GoogleAccountMenu
              className="flex items-center gap-1.5 rounded-control px-2 py-1 text-[13px] text-label hover:bg-black/[0.05]"
              onAccountChange={onAccountChange}
              extraLinks={
                sheetLink?.spreadsheetId
                  ? [{ label: '구글시트 과제로 이동', href: withGoogleAccount(sheetUrl(sheetLink.spreadsheetId, sheetLink.gid)), icon: <SheetsIcon className="h-4 w-4 shrink-0" /> }]
                  : []
              }
            >
              {accountEmail}
              {isAdminUser && (
                <span className="mac-badge bg-accent-soft text-accent">관리자</span>
              )}
              <ChevronDown {...icSm} className="text-label-3" />
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
            <button onClick={onLogout} className="rounded-control px-2 py-1 text-[13px] text-label-2 hover:bg-black/[0.05] hover:text-label">
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

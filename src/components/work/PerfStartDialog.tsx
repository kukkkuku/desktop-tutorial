// 새 평가를 만든 직후 한 번 뜨는 시작 안내 -- 예전 「빠른 시작」 대신.
//   추진현황에서 과제 가져오기(기본 흐름) / 이전 평가에서 이어받기(같은 팀의 다른 기간이 있을 때) / 빈 상태로 시작
// 나중에는 과제관리 「가져오기 ▾」로 같은 일을 한다.
import { useState } from 'react'
import { ArrowLeft, CalendarRange, History, X, type LucideIcon } from 'lucide-react'
import IconButton from '../IconButton'
import ImportFromPreviousPanel from '../ImportFromPreviousPanel'
import { ic } from '../ui/icon'

const ONBOARD_KEY = 'perf-start-dialog'

// 새 평가를 만들면 그 프로젝트 id를 적어 두고, 프로젝트가 열릴 때 한 번 읽고 지운다
export function markNewWorkspace(id: string) {
  try {
    sessionStorage.setItem(ONBOARD_KEY, id)
  } catch {
    // 안내를 못 띄워도 과제관리 빈 화면에서 시작할 수 있다
  }
}
export function takeNewWorkspace(id: string): boolean {
  try {
    if (sessionStorage.getItem(ONBOARD_KEY) !== id) return false
    sessionStorage.removeItem(ONBOARD_KEY)
    return true
  } catch {
    return false
  }
}

function Option({ Icon, title, desc, badge, onClick }: { Icon: LucideIcon; title: string; desc: string; badge?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-card border border-separator bg-white p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-subtle text-label-2 group-hover:text-accent">
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-label">
          {title}
          {badge && <span className="mac-badge bg-accent-soft text-accent">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-label-2">{desc}</span>
      </span>
    </button>
  )
}

export default function PerfStartDialog({
  teamName,
  periodLabel,
  currentWorkspaceId,
  hasOtherPeriods,
  onFromProgress,
  onApplied,
  onClose,
}: {
  teamName: string
  periodLabel: string
  currentWorkspaceId: string
  hasOtherPeriods: boolean
  onFromProgress: () => void
  onApplied: () => void
  onClose: () => void
}) {
  const [view, setView] = useState<'pick' | 'previous'>('pick')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div
        className={`flex max-h-[88vh] flex-col overflow-hidden rounded-[14px] bg-white shadow-dialog transition-[width] duration-200 ${view === 'previous' ? 'w-[min(1080px,calc(100vw-2rem))]' : 'w-[min(520px,calc(100vw-2rem))]'}`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div className="flex items-start gap-2">
            {view === 'previous' && (
              <IconButton onClick={() => setView('pick')} aria-label="뒤로" title="뒤로" className="-ml-2">
                <ArrowLeft {...ic} />
              </IconButton>
            )}
            <div>
              <h3 className="text-[17px] font-semibold text-label">{view === 'pick' ? '새 평가를 어떻게 시작할까요?' : '이전 평가에서 이어받기'}</h3>
              <p className="mt-1 text-[13px] text-label-2">
                {teamName} · {periodLabel}
                {view === 'pick' ? ' -- 나중에는 과제관리 「가져오기」에서 할 수 있습니다.' : ' -- 팀과 평가기간을 골라 필요한 것만 복사합니다.'}
              </p>
            </div>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <X {...ic} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 pb-6 pt-3">
          {view === 'pick' ? (
            <div className="space-y-2">
              <Option
                Icon={CalendarRange}
                title="추진현황에서 과제 가져오기"
                badge="추천"
                desc="과제 입력 › 추진현황에서 평가할 그룹(L2)을 골라 과제리스트를 만듭니다."
                onClick={onFromProgress}
              />
              {hasOtherPeriods && (
                <Option
                  Icon={History}
                  title="이전 평가에서 이어받기"
                  desc="같은 팀의 다른 평가기간에서 과제 · 팀원 · 평가 기준을 골라 복사합니다."
                  onClick={() => setView('previous')}
                />
              )}
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-control py-2 text-[13px] font-medium text-label-2 hover:bg-black/[0.04] hover:text-label"
              >
                빈 상태로 시작
              </button>
            </div>
          ) : (
            <ImportFromPreviousPanel teamName={teamName} currentWorkspaceId={currentWorkspaceId} onApplied={onApplied} />
          )}
        </div>
      </div>
    </div>
  )
}

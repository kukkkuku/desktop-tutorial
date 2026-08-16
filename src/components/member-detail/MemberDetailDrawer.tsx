import { useEffect } from 'react'
import type { WorkspaceMeta } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { calcMemberResults } from '../../utils/calculations'
import { calcPromotionReadiness, trendArrow } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import MemberOverviewPanel from './MemberOverviewPanel'
import MemberPerformanceHistoryPanel from './MemberPerformanceHistoryPanel'
import MemberAppraisalPromotionPanel from './MemberAppraisalPromotionPanel'
import MemberInterviewPanel from './MemberInterviewPanel'

export type DetailTab = 'overview' | 'performance' | 'promotion' | 'meeting'

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'performance', label: '성과 히스토리' },
  { key: 'promotion', label: '인사평가·승진' },
  { key: 'meeting', label: '면담·육성' },
]

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

interface MemberDetailDrawerProps {
  memberId: string
  tab: DetailTab
  onTabChange: (tab: DetailTab) => void
  onClose: () => void
  periods: WorkspaceMeta[]
  onOpenMeetingPrep: (memberId: string) => void
}

// Desktop에서는 우측 Drawer, 모바일/PWA 좁은 화면에서는 반응형 클래스만으로
// 자연스럽게 Full Screen Sheet가 된다 — 내부 4개 패널 컴포넌트는 완전히 동일하게 재사용한다.
export default function MemberDetailDrawer({ memberId, tab, onTabChange, onClose, periods, onOpenMeetingPrep }: MemberDetailDrawerProps) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const member = state.members.find((m) => m.id === memberId)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!member) return null

  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const resultIdx = memberResults.findIndex((r) => r.member.id === memberId)
  const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined
  const rank = resultIdx >= 0 ? resultIdx + 1 : null

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const achievementTrend = trendArrow(appraisals.slice(-3).flatMap((r) => [r.firstHalfGrade, r.secondHalfGrade]))
  const competencyTrend = trendArrow(appraisals.slice(-3).map((r) => r.competencyGrade))

  const lastMeetingDate = state.meetingNotes
    .filter((n) => n.memberId === memberId && n.date <= new Date().toISOString().slice(0, 10))
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null

  function goToMeetingPrep() {
    onOpenMeetingPrep(memberId)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-xl sm:w-[440px] md:w-[480px]">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-black">{member.name}</p>
            <p className="truncate text-xs text-gray-400">{[member.role, member.level].filter(Boolean).join(' · ')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex overflow-x-auto border-b border-gray-200 px-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-black'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'overview' && (
            <MemberOverviewPanel
              member={member}
              rank={rank}
              memberResult={memberResult}
              levelTenureYears={levelTenureYears}
              readiness={readiness}
              achievementTrend={achievementTrend}
              competencyTrend={competencyTrend}
              lastMeetingDate={lastMeetingDate}
              onNavigate={onTabChange}
              onOpenMeetingPrep={goToMeetingPrep}
            />
          )}
          {tab === 'performance' && <MemberPerformanceHistoryPanel memberId={memberId} periods={periods} />}
          {tab === 'promotion' && <MemberAppraisalPromotionPanel member={member} />}
          {tab === 'meeting' && <MemberInterviewPanel member={member} onOpenMeetingPrep={goToMeetingPrep} />}
        </div>
      </div>
    </div>
  )
}

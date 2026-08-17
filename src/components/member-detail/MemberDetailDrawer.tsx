import { useEffect } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { calcMemberResults } from '../../utils/calculations'
import { auxScoreSum, calcPromotionReadiness, trendArrow } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import type { NotesSubTab } from '../notes/NotesStage'
import MemberOverviewPanel from './MemberOverviewPanel'

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
  onClose: () => void
  onNavigateToNotes: (subTab: NotesSubTab) => void
}

// Desktop에서는 우측 Drawer, 모바일/PWA 좁은 화면에서는 반응형 클래스만으로
// 자연스럽게 Full Screen Sheet가 된다. 면담 전에 필요한 핵심 요약만 보여주고,
// 성과 히스토리·인사평가·승진 관리·면담 기록의 실제 내용은 모두 면담 탭의
// 서브탭에 있다 — 여기서는 그곳으로 바로 이동하는 진입점 역할만 한다.
export default function MemberDetailDrawer({ memberId, onClose, onNavigateToNotes }: MemberDetailDrawerProps) {
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
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores, auxScoreSum(member.auxScores), levelTenureYears)
  const achievementTrend = trendArrow(appraisals.slice(-3).flatMap((r) => [r.firstHalfGrade, r.secondHalfGrade]))
  const competencyTrend = trendArrow(appraisals.slice(-3).map((r) => r.competencyGrade))

  const lastMeetingDate = state.meetingNotes
    .filter((n) => n.memberId === memberId && n.date <= new Date().toISOString().slice(0, 10))
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-xl sm:w-[400px] md:w-[420px]">
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <MemberOverviewPanel
            member={member}
            rank={rank}
            memberResult={memberResult}
            levelTenureYears={levelTenureYears}
            readiness={readiness}
            achievementTrend={achievementTrend}
            competencyTrend={competencyTrend}
            lastMeetingDate={lastMeetingDate}
            onNavigateToNotes={onNavigateToNotes}
          />
        </div>
      </div>
    </div>
  )
}

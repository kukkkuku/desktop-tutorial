import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { calcMemberResults, GRADE_COLORS } from '../../utils/calculations'
import { calcPromotionReadiness } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { colorForIndex } from '../../utils/memberColors'

// 면담 기록/성과 히스토리/인사평가·승진 관리 세 서브탭을 오가도 이 팀원이 지금
// 어떤 상태인지 매번 다시 찾아보지 않도록, 선택된 팀원의 핵심 요약을 한 곳에
// 고정해서 보여준다. 성과점수(오렌지)와 승진준비(남색)는 계속 분리된 색으로 표시한다.
export default function MemberGrowthSummaryCard({ memberId, colorIndex }: { memberId: string; colorIndex: number }) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const member = state.members.find((m) => m.id === memberId)
  if (!member) return null

  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const resultIdx = memberResults.findIndex((r) => r.member.id === memberId)
  const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined
  const rank = resultIdx >= 0 ? resultIdx + 1 : null

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)

  const todayStr = new Date().toISOString().slice(0, 10)
  const lastMeetingDate = state.meetingNotes
    .filter((n) => n.memberId === memberId && n.date <= todayStr)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-gray-200 bg-white px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
          style={{ background: colorForIndex(colorIndex) }}
        >
          {member.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-black">{member.name}</p>
          <p className="truncate text-xs text-gray-400">
            {[member.role, formatLevelTenureLabel(member.level, levelTenureYears)].filter(Boolean).join(' · ') || '-'}
          </p>
        </div>
      </div>

      <div className="hidden h-9 w-px shrink-0 bg-gray-200 sm:block" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-lg bg-orange-50/70 px-3 py-1.5">
          <p className="text-[10px] font-semibold text-accent">현재 성과</p>
          {memberResult ? (
            <p className="mt-0.5 flex items-center gap-1 text-sm font-bold text-black">
              {rank ? `${rank}위 · ` : ''}
              {memberResult.cumulativeScore.toFixed(1)}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${GRADE_COLORS[memberResult.grade]}`}>
                {memberResult.grade}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-gray-400">데이터 없음</p>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-1.5">
          <p className="text-[10px] font-semibold text-promo">승진 준비</p>
          {readiness ? (
            <p className="mt-0.5 text-sm font-bold text-black">{readiness.progressPercent}%</p>
          ) : (
            <p className="mt-0.5 text-sm text-gray-400">기준 없음</p>
          )}
        </div>

        <div className="rounded-lg bg-gray-50 px-3 py-1.5">
          <p className="text-[10px] font-semibold text-gray-400">최근 면담</p>
          <p className="mt-0.5 text-sm font-bold text-black">{lastMeetingDate ?? '없음'}</p>
        </div>
      </div>
    </div>
  )
}

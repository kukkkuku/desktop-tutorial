import { useState } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import {
  calcAllTaskScores,
  calcMemberResults,
  getContribution,
  getEffectiveContributionPercent,
  GRADE_COLORS,
} from '../../utils/calculations'
import { calcPromotionReadiness } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { getMemberPerformanceHistory } from '../../utils/memberHistory'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import { colorForIndex } from '../../utils/memberColors'
import TrendSparkline from './TrendSparkline'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import HRAppraisalHistoryPanel from './HRAppraisalHistoryPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import TodayMeetingPanel from './TodayMeetingPanel'

function BackIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function Divider() {
  return <span className="h-3 w-px bg-gray-300" aria-hidden="true" />
}

interface MemberGrowthDetailProps {
  memberId: string
  onBack: () => void
  prepRequest?: { memberId: string; token: number } | null
}

// 팀원 성장 관리의 두 번째 화면 -- 팀장이 실제로 확인/시뮬레이션/기록하는
// 업무 흐름 그대로: 상단에 압축된 현재 상태 요약 한 줄, 그 아래 현재 성과(60%)
// ↔ 성장·승진 시뮬레이션(40%)을 나란히 보면서, 바로 아래 면담 기록까지 한
// 화면에서 끝낸다. 탭 전환도, 별도 페이지 이동도 없다.
export default function MemberGrowthDetail({ memberId, onBack, prepRequest }: MemberGrowthDetailProps) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [showPastPerformance, setShowPastPerformance] = useState(false)
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  if (!member) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">팀원을 찾을 수 없습니다.</p>
  }

  const colorIndex = state.members.findIndex((m) => m.id === memberId)

  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const resultIdx = memberResults.findIndex((r) => r.member.id === memberId)
  const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined
  const rank = resultIdx >= 0 ? resultIdx + 1 : null

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores, 0, levelTenureYears)

  const trendPoints = [...getMemberPerformanceHistory(memberId, periods)]
    .reverse()
    .filter((h) => h.grade !== null)
    .map((h) => ({ period: h.workspace.periodName, grade: h.grade! }))

  const todayStr = new Date().toISOString().slice(0, 10)
  const lastMeetingDate =
    state.meetingNotes
      .filter((n) => n.memberId === memberId && n.date <= todayStr)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null

  const taskScores = calcAllTaskScores(state.tasks, state.criteria)
  const currentTasks = taskScores
    .map(({ task, score }) => {
      const contribution = getContribution(state.contributions, task.id, memberId)
      if (!contribution || contribution.contributionPercent <= 0) return null
      const effectivePercent = getEffectiveContributionPercent(state.contributions, task.id, memberId, state.criteria.contributionWeight)
      return {
        task,
        contributionPercent: contribution.contributionPercent,
        personalGrade: contribution.personalPerformanceGrade,
        personalScore: score * (effectivePercent / 100),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.personalScore - a.personalScore)

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-black">
        <BackIcon className="h-4 w-4" />팀 현황으로
      </button>

      <div className="mt-3 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: colorForIndex(colorIndex) }}
        >
          {member.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-black">
            {member.name}
            <span className="ml-2 text-sm font-normal text-gray-400">
              {[member.role, formatLevelTenureLabel(member.level, levelTenureYears)].filter(Boolean).join(' · ') || '-'}
            </span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-gray-600">
            <span>
              현재 성과{' '}
              {memberResult ? (
                <b className="font-bold text-black">
                  {memberResult.cumulativeScore.toFixed(1)}{' '}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${GRADE_COLORS[memberResult.grade]}`}>{memberResult.grade}</span>
                </b>
              ) : (
                <span className="text-gray-400">데이터 없음</span>
              )}
            </span>
            <Divider />
            <span>
              팀내 <b className="font-bold text-black">{rank ? `${rank}위` : '-'}</b>
            </span>
            <Divider />
            <span className="flex items-center gap-1.5">
              고과 추이 <TrendSparkline points={trendPoints} width={110} />
            </span>
            <Divider />
            <span>
              승진 준비도 <b className="font-bold text-promo">{readiness ? `${readiness.progressPercent}%` : '-'}</b>
            </span>
            <Divider />
            <span>
              최근 면담 <b className="font-bold text-black">{lastMeetingDate ?? '없음'}</b>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-black">현재 성과</h3>
              <button onClick={() => setShowPastPerformance((v) => !v)} className="text-xs font-medium text-gray-500 hover:text-accent">
                {showPastPerformance ? '− 과거 성과 접기' : '과거 성과 보기'}
              </button>
            </div>

            {currentTasks.length === 0 ? (
              <p className="mt-3 text-[13px] text-gray-400">이번 기간 참여한 과제가 없습니다.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {currentTasks.map(({ task, contributionPercent, personalGrade, personalScore }) => (
                  <div key={task.id} className="rounded-md bg-gray-50 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-black">{task.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>{task.importance}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-gray-500">
                      <span>기여도 {contributionPercent}%</span>
                      <span>개인 수행등급 {personalGrade}</span>
                      <span>개인 성과 {personalScore.toFixed(1)}점</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showPastPerformance && (
            <div className="mt-4 space-y-4 rounded-lg border border-dashed border-gray-300 p-4">
              <MemberPerformanceHistoryPanel memberId={memberId} periods={periods} />
              <HRAppraisalHistoryPanel member={member} />
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <PromotionSimulationPanel member={member} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50"
            >
              엑셀로 가져오기
            </button>
            <button
              onClick={() => setCriteriaManagerOpen(true)}
              className="rounded-md border border-promo/30 px-3 py-1.5 text-xs font-medium text-promo hover:bg-promo/5"
            >
              승진 기준 관리
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <TodayMeetingPanel member={member} focusToken={prepRequest?.token ?? null} />
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

import { useState } from 'react'
import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { calcAllTaskScores, getContribution, getEffectiveContributionPercent } from '../../utils/calculations'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import MemberGrowthSummaryCard from './MemberGrowthSummaryCard'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import HRAppraisalHistoryPanel from './HRAppraisalHistoryPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import MeetingNotes from '../MeetingNotes'

function BackIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

interface MemberGrowthDetailProps {
  memberId: string
  onBack: () => void
  onSelectMember: (memberId: string) => void
  prepRequest?: { memberId: string; token: number } | null
}

// 팀원 성장 관리의 두 번째 화면 -- 면담 기록/성과 히스토리/인사평가·승진 관리로
// 나뉘어 있던 탭을 없애고, 한 화면에서 현재 성과와 승진 시뮬레이션을 나란히
// 보면서 바로 면담을 진행할 수 있게 통합했다. 과거 인사평가 원장은 "과거 성과
// 보기"로 접어 보조 기능으로 내렸다.
export default function MemberGrowthDetail({ memberId, onBack, onSelectMember, prepRequest }: MemberGrowthDetailProps) {
  const { state } = useAppState()
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

      <MemberGrowthSummaryCard memberId={memberId} colorIndex={colorIndex} periods={periods} />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-black">현재 성과</h3>
              <button
                onClick={() => setShowPastPerformance((v) => !v)}
                className="text-xs font-medium text-gray-500 hover:text-accent"
              >
                {showPastPerformance ? '− 과거 성과 접기' : '+ 과거 성과 보기'}
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
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>
                        {task.importance}
                      </span>
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
        <h3 className="text-sm font-bold text-black">면담 기록</h3>
        <div className="mt-2">
          <MeetingNotes selectedMemberId={memberId} onSelectMember={onSelectMember} prepRequest={prepRequest} />
        </div>
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

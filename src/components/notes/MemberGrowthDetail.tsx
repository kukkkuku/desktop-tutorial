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
import { calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { getMemberPerformanceHistory } from '../../utils/memberHistory'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import TrendSparkline from './TrendSparkline'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import MeetingForm from './MeetingForm'

// 상단 Summary Bar 한 줄에 들어가는 "라벨 값" 조각 -- 아바타/아이콘 없이
// 텍스트만으로 구성한다.
function Seg({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-gray-400">{label}</span> <span className="font-bold text-black">{children}</span>
    </span>
  )
}

function SegDivider() {
  return <span className="h-3.5 w-px shrink-0 bg-gray-300" aria-hidden="true" />
}

interface MemberGrowthDetailProps {
  memberId: string
  prepRequest?: { memberId: string; token: number } | null
}

// 팀원 성장 관리 상세 -- 좌측 팀원 카드(레일)에서 선택한 팀원의 통합 화면.
// 상단 요약이 전체 폭을 가로지르고, 그 아래는 좌우 2열: 왼쪽(최근 성과 +
// 성장 시뮬레이션)과 오른쪽(면담하기)이 나란히 붙어 있어 면담 중에도 성과·
// 승진 상태를 보면서 바로 기록할 수 있다. 면담하기가 아래로 밀려나지 않는다.
export default function MemberGrowthDetail({ memberId, prepRequest }: MemberGrowthDetailProps) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [recentExpanded, setRecentExpanded] = useState(false)
  const [pastPeriodsOpen, setPastPeriodsOpen] = useState(false)
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  if (!member) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">팀원을 찾을 수 없습니다.</p>
  }

  const activeCount = state.members.filter((m) => m.active).length

  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const resultIdx = memberResults.findIndex((r) => r.member.id === memberId)
  const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined
  const rank = resultIdx >= 0 ? resultIdx + 1 : null

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores, 0, levelTenureYears)

  // Summary Bar의 승진 관련 항목(목표 승진 연도/목표 직급/현재 점수/승진 기준/
  // 점수 갭) -- PromotionSimulationPanel과 같은 계산을 여기서 독립적으로
  // 다시 구해 쓴다(코드베이스 컨벤션: prop으로 내려받지 않고 각자 재계산).
  const promotionCriteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const currentWeightedScore = readiness?.weightedScore ?? 0
  const scoreGap = promotionCriteria ? Math.round((currentWeightedScore - promotionCriteria.requiredScore) * 10) / 10 : null
  const targetYear = promotionCriteria
    ? new Date().getFullYear() + Math.max(0, promotionCriteria.tenureYears - (levelTenureYears ?? 0))
    : null

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

  const visibleTasks = recentExpanded ? currentTasks : currentTasks.slice(0, 2)

  return (
    <div className="space-y-5">
      {/* 상단 Summary Bar -- 아바타/아이콘 없이 텍스트만으로 팀원을 식별하고,
          현재 성과부터 승진 시뮬레이션 핵심 지표까지 한 줄에 모아 보여준다. */}
      <div className="flex flex-nowrap items-center gap-3 overflow-x-auto whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <span className="whitespace-nowrap font-bold text-black">
          {member.name} <span className="font-normal text-gray-400">· {[member.role, formatLevelTenureLabel(member.level, levelTenureYears)].filter(Boolean).join(' · ') || '-'}</span>
        </span>
        <SegDivider />
        <Seg label="현재 성과">
          {memberResult ? (
            <>
              {memberResult.cumulativeScore.toFixed(1)}점{' '}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${GRADE_COLORS[memberResult.grade]}`}>{memberResult.grade}</span>
            </>
          ) : (
            <span className="font-normal text-gray-300">-</span>
          )}
        </Seg>
        <SegDivider />
        <Seg label="팀 내 순위">{rank ? `${rank}위 / ${activeCount}명` : '-'}</Seg>
        <SegDivider />
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-gray-400">고과 추이</span>
          <TrendSparkline points={trendPoints} width={100} />
        </span>
        <SegDivider />
        <Seg label="준비도">
          <span className="text-promo">{readiness ? `${readiness.progressPercent}%` : '-'}</span>
        </Seg>
        <SegDivider />
        <Seg label="최근 면담">{lastMeetingDate ?? '없음'}</Seg>
        <SegDivider />
        <Seg label="목표 승진 연도">{targetYear ?? '-'}</Seg>
        <SegDivider />
        <Seg label="목표 직급">{promotionCriteria?.toLevel ?? '-'}</Seg>
        <SegDivider />
        <Seg label="현재 점수">{promotionCriteria ? `${currentWeightedScore.toFixed(1)}점` : '-'}</Seg>
        <SegDivider />
        <Seg label="승진 기준">{promotionCriteria ? `${promotionCriteria.requiredScore.toFixed(1)}점` : '-'}</Seg>
        <SegDivider />
        <span className="whitespace-nowrap">
          <span className="text-gray-400">점수 갭</span>{' '}
          <span className={`font-bold ${scoreGap === null ? 'text-gray-300' : scoreGap >= 0 ? 'text-success' : 'text-accent'}`}>
            {scoreGap === null ? '-' : `${scoreGap >= 0 ? '+' : ''}${scoreGap.toFixed(1)}점`}
          </span>
        </span>
      </div>

      {/* 아래는 좌우 2열: 왼쪽(최근 성과 + 성장 시뮬레이션) / 오른쪽(면담하기) */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          {/* 최근 성과 */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-black">최근 성과</h3>
              {currentTasks.length > 2 && (
                <button onClick={() => setRecentExpanded((v) => !v)} className="text-xs font-medium text-gray-500 hover:text-accent">
                  {recentExpanded ? '접기' : '더보기'} {recentExpanded ? '˄' : '>'}
                </button>
              )}
            </div>

            {currentTasks.length === 0 ? (
              <p className="mt-3 text-[13px] text-gray-400">이번 기간 참여한 과제가 없습니다.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-400">
                      <th className="py-2 pr-3 font-semibold">프로젝트</th>
                      <th className="px-3 py-2 font-semibold">중요도</th>
                      <th className="px-3 py-2 font-semibold">기여도</th>
                      <th className="px-3 py-2 font-semibold">개인 등급</th>
                      <th className="pl-3 py-2 text-right font-semibold">개인 점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map(({ task, contributionPercent, personalGrade, personalScore }) => (
                      <tr key={task.id} className="border-b border-gray-100 text-black last:border-0">
                        <td className="py-2.5 pr-3 font-medium">{task.name}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>{task.importance}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{contributionPercent}%</td>
                        <td className="px-3 py-2.5 text-gray-600">{personalGrade}</td>
                        <td className="pl-3 py-2.5 text-right font-mono font-semibold">{personalScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => setPastPeriodsOpen((v) => !v)} className="mt-3 text-xs font-medium text-gray-400 hover:text-accent">
              {pastPeriodsOpen ? '− 지난 평가기간 성과 접기' : '지난 평가기간 성과 보기 →'}
            </button>
            {pastPeriodsOpen && (
              <div className="mt-3 border-t border-dashed border-gray-200 pt-3">
                <MemberPerformanceHistoryPanel memberId={memberId} periods={periods} />
              </div>
            )}
          </div>

          {/* 성장 시뮬레이션 */}
          <PromotionSimulationPanel member={member} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setImportOpen(true)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50">
              엑셀로 가져오기
            </button>
            <button onClick={() => setCriteriaManagerOpen(true)} className="rounded-md border border-promo/30 px-3 py-1.5 text-xs font-medium text-promo hover:bg-promo/5">
              승진 기준 관리
            </button>
          </div>
        </div>

        {/* 면담하기 -- 왼쪽 열과 나란한 고정 폭 컬럼, 아래로 밀려나지 않는다 */}
        <div className="w-full shrink-0 lg:w-[380px]">
          <MeetingForm member={member} focusToken={prepRequest?.token ?? null} />
        </div>
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

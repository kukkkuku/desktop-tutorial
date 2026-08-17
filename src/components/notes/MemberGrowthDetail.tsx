import { useState } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { EvaluationGrade } from '../../types'
import {
  calcAllTaskScores,
  calcMemberResults,
  getContribution,
  getEffectiveContributionPercent,
  GRADE_COLORS,
} from '../../utils/calculations'
import { calcPromotionReadiness, calcSimulatedPromotionTotal, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { getMemberPerformanceHistory } from '../../utils/memberHistory'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import TrendSparkline from './TrendSparkline'
import PromotionSimulationPanel, { AUX_KEYS } from './PromotionSimulationPanel'
import type { AuxKey } from './PromotionSimulationPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import MeetingForm from './MeetingForm'

// 상단 Summary Bar의 통계 카드 -- 라벨은 작게 위, 값은 크게 아래. 그룹(현재 성과 /
// 승진 시뮬레이션) 단위로 grid에 담기 때문에 화면이 좁아지면 열 수가 줄면서
// 자동으로 다음 줄로 재배치된다(가로 스크롤 없이).
function HeaderStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-gray-400">{label}</p>
      <div className="mt-0.5 flex items-center gap-1 text-[15px] font-bold text-black">{children}</div>
    </div>
  )
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
  const { state, dispatch } = useAppState()
  const { profile } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [recentExpanded, setRecentExpanded] = useState(false)
  const [pastPeriodsOpen, setPastPeriodsOpen] = useState(false)
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // 보조지표/예상 등급 -- 성장 시뮬레이션 패널과 상단 Summary Bar의 "예상 총점"이
  // 같은 값을 보여줘야 하므로 여기서 소유하고 패널에는 controlled로 내려준다.
  const [aux, setAux] = useState<Record<AuxKey, string>>({ position: '', reward: '', tenure: '', education: '' })
  const [simFirst, setSimFirst] = useState<EvaluationGrade | ''>('')
  const [simSecond, setSimSecond] = useState<EvaluationGrade | ''>('')
  const [simCompetency, setSimCompetency] = useState<EvaluationGrade | ''>('')

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

  // Summary Bar의 승진 관련 항목(목표 승진 연도/목표 직급/현재 점수/승진 기준) --
  // PromotionSimulationPanel과 같은 계산을 여기서 독립적으로 다시 구해 쓴다
  // (코드베이스 컨벤션: prop으로 내려받지 않고 각자 재계산).
  const promotionCriteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const currentWeightedScore = readiness?.weightedScore ?? 0
  const targetYear = promotionCriteria
    ? new Date().getFullYear() + Math.max(0, promotionCriteria.tenureYears - (levelTenureYears ?? 0))
    : null

  // 예상 총점 -- 성장 시뮬레이션 패널과 동일한 입력(보조지표/예상 등급)을 공유해
  // 계산하므로 Summary Bar와 패널의 숫자가 항상 일치한다.
  const auxSum = AUX_KEYS.reduce((s, { key }) => s + (Number(aux[key]) || 0), 0)
  const sim = promotionCriteria
    ? calcSimulatedPromotionTotal(appraisals, profile.gradeScores, promotionCriteria, auxSum, simFirst, simSecond, simCompetency)
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
      {/* 상단 Summary Bar -- 아바타/아이콘 없이 텍스트만으로 팀원을 식별한다.
          현재 성과 그룹과 승진 시뮬레이션 그룹을 별도 박스로 나누고, 각 박스는
          grid라서 화면이 좁아지면 열 수가 줄며 다음 줄로 재배치된다(가로
          스크롤 없이). */}
      <div className="space-y-3">
        <p className="text-base font-bold text-black">
          {member.name}
          <span className="ml-2 font-normal text-gray-400">
            {[member.role, formatLevelTenureLabel(member.level, levelTenureYears)].filter(Boolean).join(' · ') || '-'}
          </span>
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-5 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <HeaderStat label="현재 성과">
            {memberResult ? (
              <>
                {memberResult.cumulativeScore.toFixed(1)}점{' '}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${GRADE_COLORS[memberResult.grade]}`}>{memberResult.grade}</span>
              </>
            ) : (
              <span className="font-normal text-gray-300">-</span>
            )}
          </HeaderStat>
          <HeaderStat label="팀 내 순위">{rank ? `${rank}위 / ${activeCount}명` : '-'}</HeaderStat>
          <HeaderStat label="고과 추이 (5년)">
            <TrendSparkline points={trendPoints} width={130} />
          </HeaderStat>
          <HeaderStat label="준비도">
            <span className="text-promo">{readiness ? `${readiness.progressPercent}%` : '-'}</span>
          </HeaderStat>
          <HeaderStat label="최근 면담">{lastMeetingDate ?? '없음'}</HeaderStat>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(115px,1fr))] gap-x-5 gap-y-3">
            <HeaderStat label="목표 승진 연도">{targetYear ?? '-'}</HeaderStat>
            <HeaderStat label="현재 직급/연차">{formatLevelTenureLabel(member.level, levelTenureYears) || '-'}</HeaderStat>
            <HeaderStat label="목표 승진 직급">{promotionCriteria?.toLevel ?? '-'}</HeaderStat>
            <HeaderStat label="현재 점수">{promotionCriteria ? `${currentWeightedScore.toFixed(1)}점` : '-'}</HeaderStat>
            <HeaderStat label="승진자격 기준">{promotionCriteria ? `${promotionCriteria.requiredScore.toFixed(1)}점` : '-'}</HeaderStat>
            <HeaderStat label="예상 총점">{sim ? `${sim.simTotal.toFixed(1)}점` : '-'}</HeaderStat>
            <HeaderStat label="승급심사">
              <input
                type="month"
                value={member.promotionReviewDate ?? ''}
                onChange={(e) =>
                  dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: e.target.value || null } })
                }
                className="w-full min-w-[100px] rounded border-0 bg-transparent p-0 text-[15px] font-bold text-black focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </HeaderStat>
          </div>
          {promotionCriteria && (
            <span className={`shrink-0 text-sm font-bold ${sim?.simEligible ? 'text-accent' : 'text-gray-400'}`}>
              {sim?.simEligible ? '승진 가능' : '기준 미달'}
            </span>
          )}
        </div>
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
          <PromotionSimulationPanel
            member={member}
            aux={aux}
            onAuxChange={setAux}
            simFirst={simFirst}
            simSecond={simSecond}
            simCompetency={simCompetency}
            onSimFirstChange={setSimFirst}
            onSimSecondChange={setSimSecond}
            onSimCompetencyChange={setSimCompetency}
          />
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

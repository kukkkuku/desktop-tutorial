import { useRef, useState } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { EvaluationGrade } from '../../types'
import {
  calcAllTaskScores,
  calcMemberResults,
  getContribution,
  getEffectiveContributionPercent,
} from '../../utils/calculations'
import { appraisalRecordGrade, calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import TrendSparkline from './TrendSparkline'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import MeetingForm from './MeetingForm'

// 상단 Summary Bar의 통계 셀 -- 라벨은 작게 위, 값은 크게 아래. 하나의 flat한
// 바 안에서 gap만으로 간격을 두고, 구분선/배경색 구분은 쓰지 않는다.
function HeaderStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-gray-400">{label}</p>
      <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[15px] font-bold text-black">{children}</div>
    </div>
  )
}

// 최근 성과 / 성장 시뮬레이션 박스 공용 아코디언 -- 제목을 누르면 섹션 전체를
// 접었다 펼 수 있다(내부 요소별 개별 접기와는 별개의, 섹션 단위 토글).
// collapsedSummary를 주면 접혔을 때 제목 옆에 한 줄 요약이 보여서, 접어도
// 핵심 수치는 계속 눈에 들어온다. headerBadge는 열림/닫힘과 무관하게 제목
// 바로 옆에 항상 떠 있는 상태 배지(예: 승진 가능)다.
function AccordionSection({
  title,
  headerBadge,
  open,
  onToggle,
  collapsedSummary,
  children,
}: {
  title: string
  headerBadge?: React.ReactNode
  open: boolean
  onToggle: () => void
  collapsedSummary?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex shrink-0 items-center gap-2">
          <h3 className="text-sm font-bold text-black">{title}</h3>
          {headerBadge}
        </span>
        {!open && collapsedSummary && <span className="min-w-0 flex-1 truncate text-right text-[13px] text-gray-500">{collapsedSummary}</span>}
        <span className="shrink-0 text-gray-400">{open ? '˄' : '˅'}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

interface MemberGrowthDetailProps {
  memberId: string
  prepRequest?: { memberId: string; token: number } | null
}

const DEFAULT_LEFT_WIDTH = 760
const MIN_LEFT_WIDTH = 420
const MAX_LEFT_WIDTH = 1100

// 팀원 성장 관리 상세 -- 좌측 팀원 카드(레일)에서 선택한 팀원의 통합 화면.
// 상단 요약이 전체 폭을 가로지르고, 그 아래는 좌우 2열: 왼쪽(최근 성과 +
// 성장 시뮬레이션, 아코디언으로 각각 접고 펼 수 있음)과 오른쪽(면담하기)이
// 스플리터로 너비를 조절할 수 있게 나란히 붙어 있다.
export default function MemberGrowthDetail({ memberId, prepRequest }: MemberGrowthDetailProps) {
  const { state, dispatch } = useAppState()
  const { profile } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [recentOpen, setRecentOpen] = useState(true)
  const [simOpen, setSimOpen] = useState(true)
  const [recentExpanded, setRecentExpanded] = useState(false)
  const [pastPeriodsOpen, setPastPeriodsOpen] = useState(false)
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // 좌(최근 성과 + 성장 시뮬레이션) / 우(면담하기) 스플리터 -- lg 이상에서만
  // 동작하고, 그 아래 폭에서는 위/아래로 쌓인다(고정폭 없이).
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH)
  const splitRef = useRef<{ startX: number; startWidth: number } | null>(null)

  function onSplitterPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    splitRef.current = { startX: e.clientX, startWidth: leftWidth }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onSplitterPointerMove(e: React.PointerEvent) {
    if (!splitRef.current) return
    const next = splitRef.current.startWidth + (e.clientX - splitRef.current.startX)
    setLeftWidth(Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, next)))
  }
  function onSplitterPointerUp() {
    splitRef.current = null
  }

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

  // Summary Bar의 승진 관련 항목(현재 점수/승진 기준/필요 점수 갭) --
  // PromotionSimulationPanel과 같은 계산을 여기서 독립적으로 다시 구해 쓴다
  // (코드베이스 컨벤션: prop으로 내려받지 않고 각자 재계산).
  const promotionCriteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const currentWeightedScore = readiness?.weightedScore ?? 0
  const scoreGap = promotionCriteria ? Math.round((currentWeightedScore - promotionCriteria.requiredScore) * 10) / 10 : null

  // 고과 추이는 워크스페이스별 계산 성과가 아니라 공식 인사평가 이력(연도별
  // 업적/역량 등급)이 이전 성과 기준이다 -- 승진심사/승진자격 기준과 같은
  // 데이터 소스를 쓴다.
  const trendPoints = appraisals
    .map((r) => {
      const grade = appraisalRecordGrade(r, profile.gradeScores)
      return grade ? { period: String(r.year), grade } : null
    })
    .filter((p): p is { period: string; grade: EvaluationGrade } => p !== null)

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
      {/* 상단 프로필 요약 -- Figma 디자인 기준: 이름/직무 다음에 일반 성과
          지표(합계 점수/등급 순위/준비도/최근 면담/고과 추이)가 박스 없이
          이어지고, 승진 관련 지표(승급일/직급 기준/평가 점수/승격 기준/
          승격 점수 갭)만 연한 회색 박스로 따로 묶는다. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg border border-gray-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-black">{member.name}</p>
          <p className="mt-0.5 truncate text-xs text-gray-400">{[member.role, member.level].filter(Boolean).join(' · ') || '-'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <HeaderStat label="합계 점수">
            {memberResult ? `${memberResult.cumulativeScore.toFixed(1)}점 (${memberResult.grade})` : <span className="text-gray-300">-</span>}
          </HeaderStat>
          <HeaderStat label="등급 순위">{rank ? `${rank}위 / ${activeCount}명` : '-'}</HeaderStat>
          <HeaderStat label="준비도">
            <span className="text-promo">{readiness ? `${readiness.progressPercent}%` : '-'}</span>
          </HeaderStat>
          <HeaderStat label="최근 면담">{lastMeetingDate ?? '없음'}</HeaderStat>
          <HeaderStat label="고과 추이 (5년)">
            <TrendSparkline points={trendPoints} width={100} />
          </HeaderStat>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-5 py-3">
          <HeaderStat label="승급일">
            <input
              type="month"
              value={member.promotionReviewDate ?? ''}
              onChange={(e) => dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: e.target.value || null } })}
              className="w-full min-w-[100px] rounded border-0 bg-transparent p-0 text-[15px] font-bold text-black focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </HeaderStat>
          <HeaderStat label="직급 기준">{promotionCriteria?.toLevel ?? '-'}</HeaderStat>
          <HeaderStat label="평가 점수">{promotionCriteria ? `${currentWeightedScore.toFixed(1)}점` : '-'}</HeaderStat>
          <HeaderStat label="승격 기준">{promotionCriteria ? `${promotionCriteria.requiredScore.toFixed(1)}점` : '-'}</HeaderStat>
          <HeaderStat label="승격 점수 갭">
            <span className={scoreGap === null ? 'text-gray-300' : scoreGap >= 0 ? 'text-success' : 'text-accent'}>
              {scoreGap === null ? '-' : `${scoreGap >= 0 ? '+' : ''}${scoreGap.toFixed(1)}점`}
            </span>
          </HeaderStat>
        </div>
      </div>

      {/* 아래는 좌우 2열: 왼쪽(최근 성과 + 성장 시뮬레이션, 아코디언) / 오른쪽
          (면담하기) -- 스플리터로 폭 조절, lg 미만에서는 위아래로 쌓인다. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start" style={{ '--left-w': `${leftWidth}px` } as React.CSSProperties}>
        <div className="w-full min-w-0 space-y-5 lg:w-[var(--left-w)] lg:shrink-0">
          <AccordionSection
            title="최근 성과"
            open={recentOpen}
            onToggle={() => setRecentOpen((v) => !v)}
            collapsedSummary={
              memberResult
                ? `${memberResult.cumulativeScore.toFixed(1)}점 (${memberResult.grade}) · 과제 ${currentTasks.length}건`
                : '-'
            }
          >
            {currentTasks.length === 0 ? (
              <p className="text-[13px] text-gray-400">이번 기간 참여한 과제가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
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

            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => setPastPeriodsOpen((v) => !v)} className="text-xs font-medium text-gray-400 hover:text-accent">
                {pastPeriodsOpen ? '− 지난 평가기간 성과 접기' : '지난 평가기간 성과 보기 →'}
              </button>
              {currentTasks.length > 2 && (
                <button onClick={() => setRecentExpanded((v) => !v)} className="text-xs font-medium text-gray-500 hover:text-accent">
                  {recentExpanded ? '접기' : '더보기'} {recentExpanded ? '˄' : '>'}
                </button>
              )}
            </div>
            {pastPeriodsOpen && (
              <div className="mt-3 border-t border-dashed border-gray-200 pt-3">
                <MemberPerformanceHistoryPanel memberId={memberId} periods={periods} />
              </div>
            )}
          </AccordionSection>

          <AccordionSection
            title="성장 시뮬레이션"
            open={simOpen}
            onToggle={() => setSimOpen((v) => !v)}
            headerBadge={
              promotionCriteria && (
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    scoreGap !== null && scoreGap >= 0 ? 'bg-orange-50 text-accent' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {scoreGap !== null && scoreGap >= 0 ? '승진 가능' : '기준 미달'}
                </span>
              )
            }
            collapsedSummary={promotionCriteria ? `${currentWeightedScore.toFixed(1)}점` : '-'}
          >
            <PromotionSimulationPanel member={member} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setImportOpen(true)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50">
                엑셀로 가져오기
              </button>
              <button onClick={() => setCriteriaManagerOpen(true)} className="rounded-md border border-promo/30 px-3 py-1.5 text-xs font-medium text-promo hover:bg-promo/5">
                승진 기준 관리
              </button>
            </div>
          </AccordionSection>
        </div>

        {/* 스플리터 -- lg 이상에서만 드래그로 좌측 폭 조절, 그 아래에서는 숨김 */}
        <div
          onPointerDown={onSplitterPointerDown}
          onPointerMove={onSplitterPointerMove}
          onPointerUp={onSplitterPointerUp}
          onPointerCancel={onSplitterPointerUp}
          style={{ touchAction: 'none' }}
          title="드래그해서 좌우 폭 조절"
          aria-label="좌우 폭 조절"
          role="separator"
          aria-orientation="vertical"
          className="group relative hidden shrink-0 cursor-col-resize items-stretch justify-center self-stretch lg:flex lg:w-3"
        >
          <span className="w-1 shrink-0 rounded-full bg-gray-200 transition-colors group-hover:bg-accent group-active:bg-accent" />
        </div>

        {/* 면담하기 -- 왼쪽 열과 나란한 컬럼, 아래로 밀려나지 않는다 */}
        <div className="w-full min-w-0 flex-1">
          <MeetingForm member={member} focusToken={prepRequest?.token ?? null} />
        </div>
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

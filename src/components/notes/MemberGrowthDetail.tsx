import { useEffect, useRef, useState } from 'react'
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
import { appraisalRecordGrade, auxScoreSum, calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import TrendSparkline from './TrendSparkline'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import MeetingForm from './MeetingForm'
import GradeNoteButton from '../GradeNoteButton'
import Badge from '../Badge'

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
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
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
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

// 좌(최근 성과)/우(면담일지) 폭 비율 -- 픽셀 고정폭이 아니라 요약 바의
// 좌우 flex-[1_1_0%] 분할과 같은 방식으로 비율로 나눈다. 면담이 팀장의 주요
// 액션이고 최근 성과·성장 시뮬레이션은 그 면담을 준비하기 위한 참고자료라,
// 기본값을 4:6으로 잡아 면담하기 쪽에 더 넓은 폭을 준다.
const DEFAULT_LEFT_RATIO = 0.4
const MIN_LEFT_RATIO = 0.25
const MAX_LEFT_RATIO = 0.6

// 팀원 성장 관리 상세 -- 상단 팀원 탭에서 선택한 팀원의 통합 화면. 상단
// 요약이 전체 폭을 가로지르고, 그 아래는 좌우 2열: 왼쪽(최근 성과 +
// 성장 시뮬레이션, 아코디언으로 각각 접고 펼 수 있음)과 오른쪽(면담하기)이
// 스플리터로 너비를 조절할 수 있게 나란히 붙어 있다.
export default function MemberGrowthDetail({ memberId, prepRequest }: MemberGrowthDetailProps) {
  const { state, dispatch } = useAppState()
  const { profile, addPersonalNote, deletePersonalNote } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [recentOpen, setRecentOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const [recentExpanded, setRecentExpanded] = useState(false)
  const [pastPeriodsOpen, setPastPeriodsOpen] = useState(false)
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [noteFormOpen, setNoteFormOpen] = useState(false)
  const [noteInput, setNoteInput] = useState('')

  // 팀원을 전환하면 이전 팀원에서 열어둔 메모 입력창이 그대로 남지 않도록 닫는다.
  useEffect(() => {
    setNoteFormOpen(false)
    setNoteInput('')
  }, [memberId])

  // 좌(최근 성과 + 성장 시뮬레이션) / 우(면담하기) 스플리터 -- lg 이상에서만
  // 동작하고, 그 아래 폭에서는 위/아래로 쌓인다(고정폭 없이). 드래그 중에는
  // 시작 시점의 실제 렌더 폭(rowRef)을 기준으로 이동 거리를 비율로 환산한다.
  const [leftRatio, setLeftRatio] = useState(DEFAULT_LEFT_RATIO)
  const rowRef = useRef<HTMLDivElement>(null)
  const splitRef = useRef<{ startX: number; startRatio: number; containerWidth: number } | null>(null)

  function onSplitterPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const containerWidth = rowRef.current?.getBoundingClientRect().width || 1
    splitRef.current = { startX: e.clientX, startRatio: leftRatio, containerWidth }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onSplitterPointerMove(e: React.PointerEvent) {
    if (!splitRef.current) return
    const { startX, startRatio, containerWidth } = splitRef.current
    const nextRatio = startRatio + (e.clientX - startX) / containerWidth
    setLeftRatio(Math.min(MAX_LEFT_RATIO, Math.max(MIN_LEFT_RATIO, nextRatio)))
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
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores, auxScoreSum(member.auxScores), levelTenureYears)

  // Summary Bar의 승진 관련 항목(현재 점수/승진 기준/필요 점수 갭) --
  // PromotionSimulationPanel과 같은 계산을 여기서 독립적으로 다시 구해 쓴다
  // (코드베이스 컨벤션: prop으로 내려받지 않고 각자 재계산).
  const promotionCriteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const currentWeightedScore = readiness?.weightedScore ?? 0
  const scoreGap = promotionCriteria ? Math.round((currentWeightedScore - promotionCriteria.requiredScore) * 10) / 10 : null

  // 승급일 -- 네이티브 <input type="month">의 브라우저별 달력 팝업이 복잡해
  // 보인다는 피드백이 있어, 연도 입력칸 + 월 드롭다운으로 직접 구성한다.
  const [reviewDateYear, reviewDateMonth = '01'] = (member.promotionReviewDate ?? '').split('-')
  const updatePromotionReviewYear = (value: string) => {
    if (!value) {
      dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: null } })
      return
    }
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${value}-${reviewDateMonth || '01'}` } })
  }
  const updatePromotionReviewMonth = (value: string) => {
    const year = reviewDateYear || String(new Date().getFullYear())
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${year}-${value}` } })
  }

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
        personalGradeNote: contribution.personalGradeNote,
        personalScore: score * (effectivePercent / 100),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.personalScore - a.personalScore)

  const visibleTasks = recentExpanded ? currentTasks : currentTasks.slice(0, 2)

  const personalNotes = profile.personalNotes.filter((n) => n.memberId === memberId)

  // 면담 인사이트 -- 빈 코멘트 칸만 보고 팀장이 매번 질문을 새로 생각해야
  // 하는 문제를 줄이려고, 등급·참여 과제 기준으로 짧은 코칭 멘트를 미리
  // 만들어둔다. 통계 예측이 아니라 규칙 기반 문장 생성이다. 개인 메모(포스트잇)로
  // 남긴 개인 상황도 면담에서 놓치지 않도록 맨 앞에 그대로 얹는다.
  const meetingInsights: string[] = personalNotes.map((n) => n.content)
  if (memberResult) {
    if (memberResult.grade === 'S' || memberResult.grade === 'A') {
      meetingInsights.push(`${memberResult.grade} 고과를 유지한 강점과 다음 단계 목표를 확인해 보세요.`)
    } else if (memberResult.grade === 'C' || memberResult.grade === 'D') {
      meetingInsights.push(`${memberResult.grade} 고과의 원인을 함께 점검하고 개선 계획을 논의해 보세요.`)
    } else {
      meetingInsights.push(`이번 고과(${memberResult.grade})를 바탕으로 강점과 보완점을 균형 있게 짚어보세요.`)
    }
  }
  if (currentTasks.length > 0) {
    const names = currentTasks.slice(0, 2).map((t) => t.task.name)
    meetingInsights.push(`${names.join(', ')}${currentTasks.length > 2 ? ' 등' : ''}에서 맡은 역할과 기여를 구체적으로 확인해 보세요.`)
  }
  meetingInsights.push('다음 평가기간에 강화할 역량과 팀장이 지원할 사항을 합의해 보세요.')

  return (
    <div className="flex min-h-full flex-col">
      {/* 상단 프로필 요약 -- 라벨 붙은 박스를 여러 개 늘어놓지 않고, 사람이
          읽는 문장 두 줄(현재 성과 / 승진심사)로 묶는다. 승진 기준이 없는
          팀원은 그 문장에서 "승진 기준 미설정"만 짧게 보여주고 나머지
          칸(대시로 채워지던 4개)은 아예 렌더링하지 않는다. */}
      <div className="border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-lg font-bold text-black">{member.name}</p>
            <p className="text-xs text-gray-400">
              {[member.role, formatLevelTenureLabel(member.level, levelTenureYears)].filter(Boolean).join(' · ') || '-'}
            </p>
          </div>

          {/* 개인 메모(포스트잇) -- 대학원 재학, 육아, 휴가 계획처럼 성과
              데이터로는 안 잡히지만 면담 전에 챙겨야 할 개인 상황을 한쪽에
              작은 칩으로만 보여준다. 입력창은 "+ 메모"를 눌렀을 때만 펼쳐서
              평소엔 한 줄을 넘지 않는다. 등록하면 아래 면담 인사이트에도
              그대로 반영된다. */}
          <div className="flex max-w-[55%] flex-wrap items-center justify-end gap-1">
            {personalNotes.map((note) => (
              <span key={note.id} className="group flex max-w-[160px] items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-[11px] text-yellow-800">
                <span className="truncate">{note.content}</span>
                <button
                  onClick={() => deletePersonalNote(note.id)}
                  className="shrink-0 leading-none text-yellow-400 opacity-0 hover:text-yellow-700 group-hover:opacity-100"
                  aria-label="메모 삭제"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={() => setNoteFormOpen((v) => !v)}
              className="shrink-0 rounded-full border border-dashed border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-400 hover:border-accent hover:text-accent"
            >
              {noteFormOpen ? '− 메모' : '+ 메모'}
            </button>
          </div>
        </div>

        {noteFormOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!noteInput.trim()) return
              addPersonalNote(memberId, noteInput)
              setNoteInput('')
            }}
            className="mt-1.5 flex items-center justify-end gap-1.5"
          >
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="예: 대학원 재학 중, 육아휴직 복귀 예정, 8월 휴가 예정"
              className="w-64 rounded-md border border-gray-200 px-2.5 py-1 text-[12px] text-black focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={!noteInput.trim()}
              className="shrink-0 rounded-md bg-yellow-200 px-2.5 py-1 text-[12px] font-semibold text-yellow-800 hover:bg-yellow-300 disabled:opacity-40"
            >
              추가
            </button>
          </form>
        )}

        {/* 숫자 여러 개를 박스로 나열하지 않고, 사람이 말하듯 한 줄로
            읽히게 문장형으로 묶는다 -- 승진 기준이 없는 팀원은 그 문장
            자체를 안 보여줘서(대시로 채운 빈 칸 4개 대신) 화면이 더
            가벼워진다. */}
        <p className="mt-1.5 text-sm text-gray-600">
          {memberResult ? (
            <>
              합계 <span className="font-bold text-black">{memberResult.cumulativeScore.toFixed(1)}점 ({memberResult.grade})</span>
            </>
          ) : (
            <span className="text-gray-300">합계 -</span>
          )}
          {' · '}
          등급 <span className="font-semibold text-black">{rank ? `${rank}위 / ${activeCount}명` : '-'}</span>
          {' · '}
          최근 면담 <span className="font-semibold text-black">{lastMeetingDate ?? '없음'}</span>
          {' · '}
          <span className="inline-flex items-center gap-1.5 align-middle">
            고과 추이(5년) <TrendSparkline points={trendPoints} width={90} />
          </span>
        </p>

        <p className="mt-1.5 text-sm text-gray-600">
          승진심사 시기{' '}
          <span className="inline-flex items-center gap-1 font-semibold text-black">
            <input
              type="number"
              value={reviewDateYear}
              onChange={(e) => updatePromotionReviewYear(e.target.value)}
              placeholder="연도"
              className="w-12 rounded border-0 bg-transparent p-0 text-sm font-semibold text-black focus:outline-none focus:ring-1 focus:ring-accent"
            />
            년
            <select
              value={reviewDateMonth}
              onChange={(e) => updatePromotionReviewMonth(e.target.value)}
              className="rounded border-0 bg-transparent p-0 text-sm font-semibold text-black focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                <option key={m} value={m}>
                  {Number(m)}월
                </option>
              ))}
            </select>
          </span>
          {promotionCriteria ? (
            <>
              {' · '}
              <span className="font-semibold text-black">{promotionCriteria.toLevel}</span> 승격 기준{' '}
              <span className="font-semibold text-black">{promotionCriteria.requiredScore.toFixed(1)}점</span>
              {' (현재 '}
              <span className="font-semibold text-black">{currentWeightedScore.toFixed(1)}점</span>
              {', '}
              <span className={scoreGap !== null && scoreGap >= 0 ? 'font-semibold text-success' : 'font-semibold text-accent'}>
                {scoreGap === null ? '-' : `${scoreGap >= 0 ? '+' : ''}${scoreGap.toFixed(1)}점`}
              </span>
              {')'}
            </>
          ) : (
            <span className="text-gray-400"> · 승진 기준 미설정</span>
          )}
        </p>
      </div>

      {/* 면담 인사이트 -- 면담 들어가기 전에 바로 읽을 수 있도록 아코디언
          없이 항상 보인다. */}
      {meetingInsights.length > 0 && (
        <div className="border-b border-gray-200 bg-orange-50/40 px-5 py-3">
          <p className="text-xs font-bold text-accent">면담 인사이트</p>
          <ul className="mt-1 space-y-0.5">
            {meetingInsights.map((line, i) => (
              <li key={i} className="text-[13px] text-gray-700">
                · {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        {/* 아래는 좌우 2열: 왼쪽(최근 성과 + 성장 시뮬레이션, 아코디언) / 오른쪽
            (면담하기) -- 스플리터로 폭 비율 조절(기본 6.5:3.5). 좌측 팀원
            레일 + 우측 면담 일정 레일이 이미 폭을 상당히 가져가므로,
            2xl(≥1536px) 미만에서는 두 열 다 찌그러지지 않도록 위아래로
            쌓는다. flex-1 + min-h-full(위 루트)로 이 행이 화면 하단까지
            늘어나고, 2xl 이상에서는 기본 정렬(stretch)이라 스플리터 선이
            그 늘어난 높이만큼 위아래 끝까지 이어진다 -- 컬럼 내용 높이에만
            맞추면 내용이 짧을 때 선이 중간에서 끊겨 보이는 문제가 있었다.
            좁은 폭에서 위아래로 쌓일 때만 gap-5로 두 열 사이 간격을 두고,
            2xl 이상 좌우 배치에서는 스플리터 선이 양쪽 컬럼에 바짝 붙도록
            gap을 없앤다. */}
        <div
          ref={rowRef}
          className="flex flex-1 flex-col gap-5 2xl:flex-row 2xl:gap-0"
          style={{ '--left-w': `${(leftRatio * 100).toFixed(2)}%` } as React.CSSProperties}
        >
          <div className="w-full min-w-0 space-y-5 2xl:w-[var(--left-w)] 2xl:shrink-0">
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
                      {visibleTasks.map(({ task, contributionPercent, personalGrade, personalGradeNote, personalScore }) => (
                        <tr key={task.id} className="border-b border-gray-100 text-black last:border-0">
                          <td className="py-2.5 pr-3 font-medium">{task.name}</td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>{task.importance}</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{contributionPercent}%</td>
                          <td className="px-3 py-2.5 text-gray-600">
                            <div className="flex items-center gap-1">
                              <span>{personalGrade}</span>
                              <GradeNoteButton note={personalGradeNote} label={task.name} />
                            </div>
                          </td>
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
                  <Badge tone={scoreGap !== null && scoreGap >= 0 ? 'accent' : 'neutral'}>
                    {scoreGap !== null && scoreGap >= 0 ? '승진 가능' : '기준 미달'}
                  </Badge>
                )
              }
              collapsedSummary={promotionCriteria ? `${currentWeightedScore.toFixed(1)}점` : '-'}
            >
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-1.5 rounded-md bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700"
                >
                  <UploadIcon className="h-3.5 w-3.5" /> 엑셀로 가져오기
                </button>
              </div>
              <PromotionSimulationPanel member={member} onOpenCriteria={() => setCriteriaManagerOpen(true)} />
            </AccordionSection>
          </div>

          {/* 스플리터 -- 기준설정(CriteriaPanel) 화면과 같은 디자인: 컬럼
              높이만큼 꽉 차게 이어지는 얇은 세로선 위에, 드래그용 짧은
              알약형 손잡이가 그 선 한가운데 겹쳐서 붙어 있다(선 없이
              손잡이만 떠 있으면 위아래가 비어 보이고 손잡이도 혼자
              떨어져 보인다). lg 이상에서만 드래그로 좌측 폭 조절, 그
              아래에서는 숨김. */}
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
            className="group relative hidden shrink-0 cursor-col-resize self-stretch 2xl:block 2xl:w-3"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200" />
            <span className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-300 transition-colors group-hover:bg-accent group-active:bg-accent" />
          </div>

          {/* 면담하기 -- 왼쪽 열과 나란한 컬럼, 아래로 밀려나지 않는다. 좌측 폭이
              넓게 당겨져도 입력칸이 찌그러지지 않도록 최소 폭을 보장한다. */}
          <div className="w-full min-w-[320px] flex-1">
            <MeetingForm member={member} focusToken={prepRequest?.token ?? null} />
          </div>
        </div>
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

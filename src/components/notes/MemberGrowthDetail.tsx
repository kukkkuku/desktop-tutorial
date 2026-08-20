import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { EvaluationGrade, PersonalNoteColor } from '../../types'
import { calcAllTaskScores, calcMemberResults, getContribution, getEffectiveContributionPercent } from '../../utils/calculations'
import { auxScoreSum, calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import MeetingForm from './MeetingForm'
import GradeNoteButton from '../GradeNoteButton'
import TrendSparkline from './TrendSparkline'
import Badge from '../Badge'
import PromotionDatePicker from '../PromotionDatePicker'

// 최근 성과 표에서 개인등급 근거를 아이콘+짧은 미리보기로 같이 보여줄지
// 판단하는 기준폭 -- 3등분 컬럼이 스플리터로 좁아지면 아이콘만 남긴다.
const WIDE_COL_THRESHOLD = 380
const GRADE_NOTE_PREVIEW_CHARS = 12

// 최근 성과 / 성장 시뮬레이션 카드 공용 래퍼 -- 3등분 컬럼에서 각자 고정된
// 자기 칸을 가지므로 더 이상 접었다 펼 필요가 없다(예전엔 면담하기와 폭을
// 다퉈서 아코디언으로 눌러뒀었다). 제목 + 상태 배지만 통일해서 보여준다.
function SectionCard({
  title,
  headerBadge,
  children,
  bodyRef,
}: {
  title: string
  headerBadge?: React.ReactNode
  children: React.ReactNode
  bodyRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-5">
      <span className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-black">{title}</h3>
        {headerBadge}
      </span>
      <div ref={bodyRef} className="mt-3">
        {children}
      </div>
    </div>
  )
}

// 좌우 폭 조절용 스플리터 손잡이 -- 기준설정(CriteriaPanel) 화면과 같은
// 디자인: 컬럼 높이만큼 꽉 차게 이어지는 얇은 세로선 위에, 드래그용 짧은
// 알약형 손잡이가 그 선 한가운데 겹쳐서 붙어 있다.
function ColumnSplitter({
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: () => void
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: 'none' }}
      title="드래그해서 폭 조절"
      aria-label="폭 조절"
      role="separator"
      aria-orientation="vertical"
      className="group relative hidden shrink-0 cursor-col-resize self-stretch xl:block xl:w-3"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200" />
      <span className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-300 transition-colors group-hover:bg-accent group-active:bg-accent" />
    </div>
  )
}

// 개인 메모 칩 색상 팔레트 -- 팀장이 직접 골라 구분할 수 있게 한다. 스와치
// 순서·톤은 투표 색상 선택기 같은 참고 디자인처럼 회색부터 시작해 파스텔
// 색상이 고르게 이어지도록 맞췄다.
const NOTE_COLOR_STYLES: Record<PersonalNoteColor, { bg: string; text: string; dot: string }> = {
  gray: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-300' },
  pink: { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-300' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-300' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-300' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-300' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-300' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-300' },
}
const NOTE_COLOR_ORDER: PersonalNoteColor[] = ['gray', 'pink', 'violet', 'blue', 'teal', 'green', 'orange']

interface MemberGrowthDetailProps {
  memberId: string
  prepRequest?: { memberId: string; token: number } | null
}

// 3등분 컬럼(최근 성과 / 성장 시뮬레이션 / 면담) 폭 경계 -- [b1, b2]는 전체
// 폭에서 0~1 사이 비율로 나타낸 두 경계선 위치다. 컬럼 폭은 [0,b1], [b1,b2],
// [b2,1] 세 구간. 기본은 정확히 3등분.
const DEFAULT_BOUNDS: [number, number] = [1 / 3, 2 / 3]
const MIN_COL = 0.15

// 팀원 성장 관리 상세 -- 상단 팀원 탭에서 선택한 팀원의 통합 화면. 상단
// 요약이 전체 폭을 가로지르고, 그 아래는 3등분: 최근 성과 / 성장 시뮬레이션 /
// 면담(면담 인사이트 + 면담일지) -- 두 개의 스플리터로 폭을 자유롭게 조절할
// 수 있다. 우측 면담 일정(캘린더)은 NotesStage가 별도 컬럼으로 붙여준다 --
// 이 컴포넌트는 건드리지 않는다.
export default function MemberGrowthDetail({ memberId, prepRequest }: MemberGrowthDetailProps) {
  const { state, dispatch } = useAppState()
  const { profile, addPersonalNote, deletePersonalNote, setPersonalNoteColor } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [insightsOpen, setInsightsOpen] = useState(true)
  const [pastPeriodsOpen, setPastPeriodsOpen] = useState(false)
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [noteAddOpen, setNoteAddOpen] = useState(false)
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const noteStripRef = useRef<HTMLDivElement>(null)

  // 최근 성과 표 폭 -- 스플리터로 좁아지면 개인등급 근거를 아이콘만, 넓으면
  // 아이콘+짧은 미리보기로 보여준다(리사이즈 옵저버로 실측).
  const recentColRef = useRef<HTMLDivElement>(null)
  const [recentColWide, setRecentColWide] = useState(true)

  const [bounds, setBounds] = useState<[number, number]>(DEFAULT_BOUNDS)
  const rowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ handle: 0 | 1; startX: number; startBounds: [number, number]; containerWidth: number } | null>(null)

  function makeSplitterHandlers(handle: 0 | 1) {
    return {
      onPointerDown: (e: ReactPointerEvent) => {
        e.preventDefault()
        const containerWidth = rowRef.current?.getBoundingClientRect().width || 1
        dragRef.current = { handle, startX: e.clientX, startBounds: bounds, containerWidth }
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
      },
      onPointerMove: (e: ReactPointerEvent) => {
        if (!dragRef.current || dragRef.current.handle !== handle) return
        const { startX, startBounds, containerWidth } = dragRef.current
        const delta = (e.clientX - startX) / containerWidth
        if (handle === 0) {
          const next0 = Math.min(startBounds[1] - MIN_COL, Math.max(MIN_COL, startBounds[0] + delta))
          setBounds([next0, startBounds[1]])
        } else {
          const next1 = Math.min(1 - MIN_COL, Math.max(startBounds[0] + MIN_COL, startBounds[1] + delta))
          setBounds([startBounds[0], next1])
        }
      },
      onPointerUp: () => {
        dragRef.current = null
      },
    }
  }
  const splitter0 = makeSplitterHandlers(0)
  const splitter1 = makeSplitterHandlers(1)

  // 팀원을 전환하면 이전 팀원에서 열어둔 메모 입력창이 그대로 남지 않도록 닫는다.
  useEffect(() => {
    setNoteAddOpen(false)
    setNoteInput('')
    setColorPickerFor(null)
  }, [memberId])

  // 색상 피커 바깥을 클릭하면 닫는다.
  useEffect(() => {
    if (!colorPickerFor) return
    function handleClickOutside(e: MouseEvent) {
      if (noteStripRef.current && !noteStripRef.current.contains(e.target as Node)) {
        setColorPickerFor(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [colorPickerFor])

  useLayoutEffect(() => {
    const el = recentColRef.current
    if (!el) return
    const update = () => setRecentColWide(el.getBoundingClientRect().width >= WIDE_COL_THRESHOLD)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!member) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">팀원을 찾을 수 없습니다.</p>
  }

  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const resultIdx = memberResults.findIndex((r) => r.member.id === memberId)
  const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined

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
  // 보인다는 피드백이 있어, 연도+월을 한 번에 고르는 커스텀 인풋박스
  // (PromotionDatePicker) 하나로 구성한다.
  const [reviewDateYearStr, reviewDateMonthStr = '01'] = (member.promotionReviewDate ?? '').split('-')
  const reviewYear = Number(reviewDateYearStr) || new Date().getFullYear()
  const reviewMonth = Number(reviewDateMonthStr) || 1
  const updatePromotionReviewDate = (year: number, month: number) => {
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${year}-${String(month).padStart(2, '0')}` } })
  }

  // 고과 추이 그래프 두 개 -- 상하반기 성과(업적) 고과와 연도별 역량고과는
  // 서로 다른 주기(반기 vs 연간)라 따로 그린다. 최근 4년 구간이 다 보이도록
  // 반기 그래프는 최대 8포인트(연 2회 x 4년), 역량 그래프는 4포인트까지
  // 보여준다.
  const halfYearGradePoints = appraisals.flatMap((r) => {
    const pts: { period: string; grade: EvaluationGrade }[] = []
    if (r.firstHalfGrade) pts.push({ period: `${r.year} 상`, grade: r.firstHalfGrade })
    if (r.secondHalfGrade) pts.push({ period: `${r.year} 하`, grade: r.secondHalfGrade })
    return pts
  })
  const competencyGradePoints = appraisals
    .filter((r): r is typeof r & { competencyGrade: EvaluationGrade } => !!r.competencyGrade)
    .map((r) => ({ period: String(r.year), grade: r.competencyGrade }))

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

  function handleGradeNoteSave(taskId: string, note: string) {
    dispatch({ type: 'SET_CONTRIBUTION_NOTE', payload: { taskId, memberId, personalGradeNote: note } })
  }

  const personalNotes = profile.personalNotes.filter((n) => n.memberId === memberId)

  // 면담 인사이트 -- 빈 코멘트 칸만 보고 팀장이 매번 질문을 새로 생각해야
  // 하는 문제를 줄이려고, 등급·참여 과제 기준으로 짧은 코칭 멘트를 미리
  // 만들어둔다. 통계 예측이 아니라 규칙 기반 문장 생성이다. 개인 메모로
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

  const gridStyle = {
    '--w1': `${(bounds[0] * 100).toFixed(2)}%`,
    '--w2': `${((bounds[1] - bounds[0]) * 100).toFixed(2)}%`,
    '--w3': `${((1 - bounds[1]) * 100).toFixed(2)}%`,
  } as CSSProperties

  return (
    <div className="flex min-h-full flex-col">
      {/* 상단 프로필 요약 -- 이름·심사일 / 고과 추이 / 메모 세 덩이를 한 줄에
          바짝 붙여 놓는다("이름과 심사일 - 고과추이 - 메모" 순서). 각자
          내용만큼만 폭을 쓰고(shrink-0), justify-between처럼 전체 폭에
          억지로 펼치지 않아 화면이 넓어도 가운데에 빈 여백이 생기지
          않는다. 덩이 사이 간격만 20px/40px로 차등을 둔다. */}
      <div className="border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-start">
          <div className="shrink-0">
            <p className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-black">{member.name}</span>
              <span className="text-xs text-gray-500">{formatLevelTenureLabel(member.level, levelTenureYears) || '-'}</span>
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">승진심사</span>
              <PromotionDatePicker year={reviewYear} month={reviewMonth} onChange={updatePromotionReviewDate} />
              {promotionCriteria && scoreGap !== null && (
                <span title={`${promotionCriteria.toLevel} 승격 기준 ${promotionCriteria.requiredScore.toFixed(1)}점 (현재 ${currentWeightedScore.toFixed(1)}점)`}>
                  <Badge tone={scoreGap >= 0 ? 'accent' : 'neutral'}>
                    {scoreGap >= 0 ? '승진 가능' : `승진까지 ${Math.abs(scoreGap).toFixed(1)}점 필요`}
                  </Badge>
                </span>
              )}
            </div>
          </div>

          <div className="ml-5 shrink-0 space-y-2">
            <div>
              <p className="text-xs font-semibold text-gray-400">상하반기 성과 고과 추이</p>
              <TrendSparkline points={halfYearGradePoints} maxPoints={8} width={200} className="mt-1" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400">년도별 역량고과 추이</p>
              <TrendSparkline points={competencyGradePoints} maxPoints={4} width={130} className="mt-1" />
            </div>
          </div>

          {/* 개인 메모 -- 대학원 재학, 육아, 휴가 계획처럼 성과 데이터로는 안
              잡히지만 면담 전에 챙겨야 할 개인 상황을 칩으로 붙여둔다.
              등록하면 면담 인사이트에도 그대로 반영된다. */}
          <div ref={noteStripRef} className="ml-10 flex max-w-xs shrink-0 flex-wrap items-start gap-1.5">
          {personalNotes.map((note) => {
            const style = NOTE_COLOR_STYLES[note.color ?? 'violet']
            return (
              <span key={note.id} className={`group relative flex items-center gap-1 rounded-full ${style.bg} ${style.text} py-1 pl-1 pr-2 text-[12px]`}>
                <button
                  onClick={() => setColorPickerFor((v) => (v === note.id ? null : note.id))}
                  title="색상 변경"
                  aria-label="색상 변경"
                  className={`h-3.5 w-3.5 shrink-0 rounded-full ${style.dot} ring-1 ring-inset ring-black/10`}
                />
                <span className="max-w-[220px] truncate">{note.content}</span>
                <button onClick={() => deletePersonalNote(note.id)} className="shrink-0 leading-none opacity-50 hover:opacity-100" aria-label="메모 삭제">
                  ×
                </button>

                {colorPickerFor === note.id && (
                  <div className="absolute right-0 top-full z-20 mt-1.5 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-2 shadow-lg">
                    {NOTE_COLOR_ORDER.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setPersonalNoteColor(note.id, c)
                          setColorPickerFor(null)
                        }}
                        title={c}
                        aria-label={c}
                        className={`h-5 w-5 rounded-full ${NOTE_COLOR_STYLES[c].dot} transition-transform hover:scale-110 ${
                          (note.color ?? 'violet') === c ? 'ring-2 ring-accent ring-offset-2' : ''
                        }`}
                      />
                    ))}
                  </div>
                )}
              </span>
            )
          })}

          {noteAddOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!noteInput.trim()) return
                addPersonalNote(memberId, noteInput)
                setNoteInput('')
                setNoteAddOpen(false)
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                autoFocus
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onBlur={() => {
                  if (!noteInput.trim()) setNoteAddOpen(false)
                }}
                placeholder="예: 대학원 재학 중, 육아휴직 복귀 예정"
                className="w-60 rounded-full border border-gray-200 px-3 py-1 text-[12px] text-black focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <button
                type="submit"
                disabled={!noteInput.trim()}
                className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[12px] font-semibold text-violet-700 hover:bg-violet-200 disabled:opacity-40"
              >
                추가
              </button>
            </form>
          ) : (
            <button
              onClick={() => setNoteAddOpen(true)}
              className="shrink-0 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[12px] font-medium text-gray-400 hover:border-violet-300 hover:text-violet-600"
            >
              + 메모
            </button>
          )}
          </div>
        </div>
      </div>

      {/* 최근 성과 / 성장 시뮬레이션 / 면담을 3등분 컬럼으로 나란히 놓는다 --
          두 개의 스플리터로 각 컬럼 폭을 자유롭게 조절할 수 있다(기본
          정확히 3등분). xl 미만에서는 위아래로 쌓고 스플리터는 숨긴다. */}
      <div className="flex-1 bg-slate-50 p-5">
        <div ref={rowRef} className="flex flex-col gap-5 xl:flex-row xl:gap-0" style={gridStyle}>
          <div className="w-full min-w-0 xl:w-[var(--w1)] xl:shrink-0">
            <SectionCard title="최근 성과" bodyRef={recentColRef}>
              {currentTasks.length === 0 ? (
                <p className="text-[13px] text-gray-400">이번 기간 참여한 과제가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[380px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs text-gray-400">
                        <th className="py-2 pr-3 font-semibold">과제</th>
                        <th className="px-3 py-2 font-semibold">기여도</th>
                        <th className="px-3 py-2 font-semibold">개인 등급</th>
                        <th className="pl-3 py-2 text-right font-semibold">개인 점수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTasks.map(({ task, contributionPercent, personalGrade, personalGradeNote, personalScore }) => (
                        <tr key={task.id} className="border-b border-gray-100 text-black last:border-0">
                          <td className="py-2.5 pr-3">
                            <span className="flex items-center gap-1.5">
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>{task.importance}</span>
                              <span className="font-medium">{task.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{contributionPercent}%</td>
                          <td className="px-3 py-2.5 text-gray-600">
                            <div className="flex items-center gap-1">
                              <span>{personalGrade}</span>
                              <GradeNoteButton
                                note={personalGradeNote}
                                label={task.name}
                                onSave={(next) => handleGradeNoteSave(task.id, next)}
                                previewChars={recentColWide ? GRADE_NOTE_PREVIEW_CHARS : undefined}
                              />
                            </div>
                          </td>
                          <td className="pl-3 py-2.5 text-right font-mono font-semibold">{personalScore.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3">
                <button onClick={() => setPastPeriodsOpen((v) => !v)} className="text-xs font-medium text-gray-400 hover:text-accent">
                  {pastPeriodsOpen ? '− 지난 평가기간 성과 접기' : '지난 평가기간 성과 보기 →'}
                </button>
              </div>
              {pastPeriodsOpen && (
                <div className="mt-3 border-t border-dashed border-gray-200 pt-3">
                  <MemberPerformanceHistoryPanel memberId={memberId} periods={periods} />
                </div>
              )}
            </SectionCard>
          </div>

          <ColumnSplitter {...splitter0} />

          <div className="w-full min-w-0 xl:w-[var(--w2)] xl:shrink-0">
            <SectionCard
              title="성장 시뮬레이션"
              headerBadge={
                promotionCriteria && (
                  <button onClick={() => setCriteriaManagerOpen(true)} className="shrink-0 text-xs font-semibold text-gray-500 hover:text-accent">
                    ⓘ 기준 보기
                  </button>
                )
              }
            >
              <PromotionSimulationPanel member={member} />
            </SectionCard>
          </div>

          <ColumnSplitter {...splitter1} />

          {/* 면담 -- 면담 인사이트(접고 펼 수 있음) + 면담일지를 다른 두
              컬럼과 같은 흰 카드 안에 함께 담는다. */}
          <div className="w-full min-w-0 xl:w-[var(--w3)] xl:shrink-0 xl:flex-1">
            <div className="h-full rounded-xl border border-gray-200 bg-white p-5">
              {meetingInsights.length > 0 && (
                <div className="mb-4 rounded-lg bg-gray-50">
                  <button
                    onClick={() => setInsightsOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
                  >
                    <span className="text-sm font-bold text-accent">면담 인사이트</span>
                    <span className="shrink-0 text-xs text-gray-400">{insightsOpen ? '접기' : '펼치기'}</span>
                  </button>
                  {insightsOpen && (
                    <ul className="space-y-0.5 px-4 pb-3">
                      {meetingInsights.map((line, i) => (
                        <li key={i} className="text-[13px] text-gray-700">
                          · {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <MeetingForm member={member} focusToken={prepRequest?.token ?? null} />
            </div>
          </div>
        </div>
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
    </div>
  )
}

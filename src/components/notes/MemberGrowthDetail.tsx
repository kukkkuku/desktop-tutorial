import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { EvaluationGrade, Importance, PersonalNoteColor } from '../../types'
import { calcAllTaskScores, calcMemberResults, getContribution, getEffectiveContributionPercent, GRADE_COLORS } from '../../utils/calculations'
import { auxScoreSum, calcPromotionReadiness, calcProjectedPromotionScore, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { getMemberPerformanceHistory } from '../../utils/memberHistory'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import MeetingForm from './MeetingForm'
import GradeNoteButton from '../GradeNoteButton'
import TrendSparkline from './TrendSparkline'
import PromotionDatePicker from '../PromotionDatePicker'
import CollapseToggleButton from '../CollapseToggleButton'

// 최근 성과 표에서 개인등급 근거를 아이콘+짧은 미리보기로 같이 보여줄지
// 판단하는 기준폭 -- 3등분 컬럼이 스플리터로 좁아지면 아이콘만 남긴다.
const WIDE_COL_THRESHOLD = 380
const GRADE_NOTE_PREVIEW_CHARS = 12
// 3등분 컬럼(성장 시뮬레이션/성과/면담) 중 어느 컬럼이든 "접힌 슬림 바"로
// 보일지 판단하는 공용 실측 폭 기준 -- 버튼으로 접고 펼치는 게 아니라,
// 스플리터로 어느 컬럼이든 이 폭 아래로 줄이면 자동으로 세로 타이틀만
// 남은 슬림 바가 되고, 다시 늘리면 컨텐츠가 나온다.
const COL_NARROW_THRESHOLD = 120

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

// 성과 카드 -- Figma(node 36:1266)처럼 평가기간(현재 + 지난 기간) 하나당
// 카드 하나, 각자 접고 펼 수 있다. "지난 평가기간 성과 보기" 같은 별도
// 진입점 없이 목록 그 자체가 접기/펼치기 단위다.
function PeriodCard({
  title,
  score,
  grade,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  score: number | null
  grade: EvaluationGrade | null
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-black">
            {title}
            {score !== null ? ` ${score.toFixed(1)}` : ''}
          </span>
          {grade && <span className={`rounded px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[grade]}`}>{grade}</span>}
        </span>
        <CollapseToggleButton collapsed={!isOpen} onClick={onToggle} label={title} />
      </div>
      {isOpen && <div className="mt-3">{children}</div>}
    </div>
  )
}

// 성과 카드 안의 과제 한 줄 -- 태그+과제명, 기여도, 개인 점수, 개인
// 등급(+근거) 순서로 Figma 컬럼 순서를 그대로 따른다. 지난 기간은 다른
// 워크스페이스 스냅샷 데이터라 그 자리에서 바로 고칠 수 없으므로,
// gradeSlot을 편집 가능/읽기전용으로 바꿔 끼워 현재/과거 모두에서
// 재사용한다.
function TaskRow({
  importance,
  name,
  percent,
  score,
  gradeSlot,
}: {
  importance: Importance
  name: string
  percent: number
  score: number
  gradeSlot: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[importance]}`}>{importance}</span>
        <span className="truncate text-sm font-semibold text-black">{name}</span>
      </span>
      <span className="w-10 shrink-0 text-center text-[13px] text-gray-500">{percent}%</span>
      <span className="w-14 shrink-0 text-right font-mono text-base font-bold text-black">{score.toFixed(1)}</span>
      <span className="flex shrink-0 items-center justify-end gap-1 whitespace-nowrap">{gradeSlot}</span>
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

// 3등분 컬럼(성장 시뮬레이션 / 최근 성과 / 면담) 폭 경계 -- [b0, b1]은 전체
// 폭에서 0~1 사이 비율로 나타낸 두 경계선 위치다. 컬럼 폭은 [0,b0], [b0,b1],
// [b1,1] 세 구간. 성장 시뮬레이션(첫 컬럼)은 기본값이 슬림 바 폭(아래
// SIM_COLLAPSED_WIDTH)이 되도록 마운트 시점에 실측해서 보정하고, 나머지
// 폭은 최근 성과/면담이 반씩 나눠 갖는다.
const DEFAULT_BOUNDS: [number, number] = [0.05, 0.525]
// 성장 시뮬레이션 컬럼의 기본(마운트 시) 슬림 폭(px) -- 버튼으로 접는 게
// 아니라 스플리터로 이 폭 근처까지 줄이면 자동으로 슬림 바 모습이 된다.
const SIM_COLLAPSED_WIDTH = 64
// 세 컬럼 모두가 가질 수 있는 최소 폭(px) -- 스플리터로 어느 컬럼이든
// 완전히 사라지지 않게 막아둔다(접힌 슬림 바의 폭과 같다).
const COL_MIN_WIDTH = 64
// 성과/면담 슬림 바의 "한번에 펼치기" 아이콘을 누르면 이 폭(px)으로 펼친다
// -- 3등분 기본폭까지 늘리지 않고, 내용이 깨지지 않는 최소 크기로만 연다.
const EXPAND_TARGET_WIDTH = 420
// 면담 컬럼 실측 폭이 전체 3등분 영역의 이 비율(절반) 이상이면 내부에서
// 좌(인사이트+기록)/우(작성 폼) 2단으로 나뉜다. 펼치기 아이콘을 눌렀을 때도
// 바로 이 비율만큼 열어서, 열자마자 분할 레이아웃이 되는 게 "면담"의
// 고유 기본 크기다.
const MEETING_SPLIT_RATIO = 0.5

// 팀원 성장 관리 상세 -- 상단 팀원 탭에서 선택한 팀원의 통합 화면. 상단
// 요약(이름·승진심사 + 승진 점수 요약카드 + 메모)이 전체 폭을 가로지르고,
// 그 아래는 3등분: 최근 성과 / 성장 시뮬레이션 / 면담(면담 인사이트 +
// 면담일지) -- 두 개의 스플리터로 폭을 자유롭게 조절할 수 있다. 우측 면담
// 일정(캘린더)은 NotesStage가 별도 컬럼으로 붙여준다 -- 이 컴포넌트는
// 건드리지 않는다.
export default function MemberGrowthDetail({ memberId, prepRequest }: MemberGrowthDetailProps) {
  const { state, dispatch } = useAppState()
  const { profile, addPersonalNote, deletePersonalNote, setPersonalNoteColor } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [insightsOpen, setInsightsOpen] = useState(true)
  // 성과 카드(현재 + 지난 기간) 접기/펼치기 -- 카드별 개별 상태. 현재
  // 보고 있는 평가기간만 기본으로 펼쳐두고 나머지는 접어둔다.
  const [openPeriods, setOpenPeriods] = useState<Set<string>>(() => new Set(currentWorkspace ? [currentWorkspace.id] : []))
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [noteAddOpen, setNoteAddOpen] = useState(false)
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const noteStripRef = useRef<HTMLDivElement>(null)

  // 최근 성과 표 폭 -- 스플리터로 좁아지면 개인등급 근거를 아이콘만, 넓으면
  // 아이콘+짧은 미리보기로 보여준다(리사이즈 옵저버로 실측). 같은 실측값을
  // 성과 컬럼의 슬림 바 여부(perfNarrow) 판단에도 재사용한다.
  const recentColRef = useRef<HTMLDivElement>(null)
  const [recentColWide, setRecentColWide] = useState(true)
  const [perfNarrow, setPerfNarrow] = useState(false)

  // 성장 시뮬레이션 / 면담 컬럼 -- 버튼으로 접고 펼치는 게 아니라, 스플리터로
  // 줄인 실제 폭을 실측해서 슬림 바 모습을 자동으로 켜고 끈다(성과 컬럼도
  // 위 recentColRef로 같은 방식을 쓴다).
  const simColRef = useRef<HTMLDivElement>(null)
  const [simNarrow, setSimNarrow] = useState(true)
  const meetingColRef = useRef<HTMLDivElement>(null)
  const [meetingNarrow, setMeetingNarrow] = useState(false)
  // 면담 컬럼이 3등분 영역 전체 폭의 절반 이상을 차지하면 내부를
  // 좌(인사이트+기록)/우(작성 폼)로 나눈다 -- 스플리터로 넓혀도, 아래
  // expandColumn('meeting')으로 한번에 펼쳐도 똑같이 이 실측값으로 판단한다.
  // xl 미만(위아래로 쌓는 레이아웃)에서는 컬럼 폭이 곧 전체 폭과 같아져
  // 잘못 분할될 수 있어 window 폭으로 xl 여부도 함께 확인한다.
  const [meetingSplit, setMeetingSplit] = useState(false)

  const [bounds, setBounds] = useState<[number, number]>(DEFAULT_BOUNDS)
  const rowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ handle: 0 | 1; startX: number; startBounds: [number, number]; containerWidth: number } | null>(null)
  const boundsInitialized = useRef(false)

  // 마운트 시점에 첫 컬럼(성장 시뮬레이션) 폭이 정확히 슬림 바 픽셀값이
  // 되도록 경계값을 보정한다 -- 화면 폭마다 DEFAULT_BOUNDS의 비율만으로는
  // 정확한 픽셀 폭을 맞출 수 없기 때문.
  useLayoutEffect(() => {
    if (boundsInitialized.current) return
    const containerWidth = rowRef.current?.getBoundingClientRect().width
    if (!containerWidth) return
    boundsInitialized.current = true
    const b0 = SIM_COLLAPSED_WIDTH / containerWidth
    setBounds([b0, b0 + (1 - b0) / 2])
  }, [])

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
        // 세 컬럼 모두 같은 최소 픽셀폭까지 줄일 수 있다 -- 어느 컬럼이든
        // 스플리터로 좁히면 슬림 바가 될 수 있어야 한다는 요구사항.
        const minPx = COL_MIN_WIDTH / containerWidth
        if (handle === 0) {
          const next0 = Math.min(startBounds[1] - minPx, Math.max(minPx, startBounds[0] + delta))
          setBounds([next0, startBounds[1]])
        } else {
          const next1 = Math.min(1 - minPx, Math.max(startBounds[0] + minPx, startBounds[1] + delta))
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

  // 팀원을 전환하면 이전 팀원에서 열어둔 메모 입력창/성과 카드 펼침 상태가
  // 그대로 남지 않도록 초기화한다.
  useEffect(() => {
    setNoteAddOpen(false)
    setNoteInput('')
    setColorPickerFor(null)
    setOpenPeriods(new Set(currentWorkspace ? [currentWorkspace.id] : []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  function togglePeriod(id: string) {
    setOpenPeriods((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 성과/면담 슬림 바의 펼치기 아이콘 -- 스플리터를 직접 드래그하는 대신
  // 클릭 한 번으로, 내용이 깨지지 않는 최소 폭(EXPAND_TARGET_WIDTH)까지
  // 곧바로 펼친다. 성과는 b0(성장 시뮬레이션과의 경계)는 그대로 두고 b1을
  // 옮기고, 면담은 반대로 b1을 옮겨 우측 폭을 확보한다.
  function expandColumn(which: 'perf' | 'meeting') {
    const containerWidth = rowRef.current?.getBoundingClientRect().width
    if (!containerWidth) return
    const minFrac = COL_MIN_WIDTH / containerWidth
    setBounds(([b0]) => {
      if (which === 'perf') {
        const targetFrac = EXPAND_TARGET_WIDTH / containerWidth
        const next1 = Math.max(b0 + minFrac, Math.min(1 - minFrac, b0 + targetFrac))
        return [b0, next1]
      }
      // 면담은 펼치자마자 전체 영역의 절반을 차지하도록 열어, 곧바로
      // 좌우분할(인사이트+기록 / 작성 폼) 레이아웃이 그 자체로 "고유
      // 기본 크기"가 되게 한다.
      const next1 = Math.min(1 - minFrac, Math.max(b0 + minFrac, 1 - MEETING_SPLIT_RATIO))
      return [b0, next1]
    })
  }

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
    const update = () => {
      const width = el.getBoundingClientRect().width
      setRecentColWide(width >= WIDE_COL_THRESHOLD)
      setPerfNarrow(width < COL_NARROW_THRESHOLD)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = simColRef.current
    if (!el) return
    const update = () => setSimNarrow(el.getBoundingClientRect().width < COL_NARROW_THRESHOLD)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = meetingColRef.current
    if (!el) return
    const update = () => {
      const width = el.getBoundingClientRect().width
      setMeetingNarrow(width < COL_NARROW_THRESHOLD)
      const rowWidth = rowRef.current?.getBoundingClientRect().width || 0
      const isXl = window.innerWidth >= 1280
      setMeetingSplit(isXl && rowWidth > 0 && width >= rowWidth * MEETING_SPLIT_RATIO)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  if (!member) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">팀원을 찾을 수 없습니다.</p>
  }

  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const resultIdx = memberResults.findIndex((r) => r.member.id === memberId)
  const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined
  const cardYear = currentWorkspace?.evaluationYear ?? new Date().getFullYear()

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores, auxScoreSum(member.auxScores), levelTenureYears)

  // 요약카드(승진자격 점수/현재 점수/시뮬레이션 가산/최종 시뮬레이션 점수) --
  // 팀장이 화면을 열자마자 가장 먼저 봐야 할 숫자라 성장 시뮬레이션 패널
  // 안이 아니라 상단 요약으로 올린다. PromotionSimulationPanel과 같은
  // 계산을 여기서 독립적으로 다시 구해 쓴다(코드베이스 컨벤션: prop으로
  // 내려받지 않고 각자 재계산).
  const promotionCriteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const currentWeightedScore = readiness?.weightedScore ?? 0

  // 승급일 -- 네이티브 <input type="month">의 브라우저별 달력 팝업이 복잡해
  // 보인다는 피드백이 있어, 연도+월을 한 번에 고르는 커스텀 인풋박스
  // (PromotionDatePicker) 하나로 구성한다.
  const [reviewDateYearStr, reviewDateMonthStr = '01'] = (member.promotionReviewDate ?? '').split('-')
  const reviewYear = Number(reviewDateYearStr) || new Date().getFullYear()
  const reviewMonth = Number(reviewDateMonthStr) || 1
  const updatePromotionReviewDate = (year: number, month: number) => {
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${year}-${String(month).padStart(2, '0')}` } })
  }

  const projectedTotal = promotionCriteria
    ? calcProjectedPromotionScore(appraisals, profile.gradeScores, promotionCriteria, reviewYear, auxScoreSum(member.auxScores)).projectedTotal
    : 0
  const simDelta = Math.round((projectedTotal - currentWeightedScore) * 10) / 10

  // 고과 추이 그래프 두 개 -- 상하반기 성과(업적) 고과와 연도별 역량고과는
  // 서로 다른 주기(반기 vs 연간)라 따로 그린다. 최근 4년 구간이 다 보이도록
  // 반기 그래프는 최대 8포인트(연 2회 x 4년), 역량 그래프는 4포인트까지
  // 보여준다. 최근 성과 카드 안에 작게 넣는다.
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

  // 지난 평가기간 성과 -- 별도 "지난 평가기간 성과 보기" 진입점 없이,
  // 현재 기간 카드 바로 아래에 이어서 각자 접을 수 있는 카드로 보여준다.
  // 다른 워크스페이스 스냅샷에서 가져온 읽기 전용 데이터라 그 자리에서
  // 등급을 고치지는 못한다(현재 기간만 편집 가능).
  const pastPeriods = getMemberPerformanceHistory(memberId, periods).filter((h) => h.workspace.id !== currentWorkspace?.id)

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
      {/* 상단 프로필 요약 -- 이름·심사일 + 승진 점수 요약카드를 왼쪽에 붙여
          놓고, 메모는 화면 가장 우측 끝으로 보낸다(justify-between). 가장
          중요한 숫자(승진자격/현재/가산/최종 점수)를 요약카드로 여기서
          바로 보여준다. */}
      <div className="border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-5">
            <div className="shrink-0">
              <p className="flex items-baseline gap-2">
                <span className="text-[22px] font-bold text-black">{member.name}</span>
                <span className="text-[13px] text-gray-500">{formatLevelTenureLabel(member.level, levelTenureYears) || '-'}</span>
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500">승진심사</span>
                <PromotionDatePicker year={reviewYear} month={reviewMonth} onChange={updatePromotionReviewDate} />
              </div>
            </div>

            {promotionCriteria && (
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl bg-[#f8fafc] px-3 py-2">
                  <div>
                    <p className="text-xs text-gray-500">승진자격 점수</p>
                    <p className="mt-1.5 text-[28px] font-bold leading-none text-black">{promotionCriteria.requiredScore.toFixed(1)}점</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-[#f8fafc] px-3 py-2">
                  <div>
                    <p className="text-xs text-gray-500">현재 점수</p>
                    <p className="mt-1.5 text-[28px] font-bold leading-none text-black">{currentWeightedScore.toFixed(1)}점</p>
                  </div>
                  <span className="text-2xl text-gray-300" aria-hidden="true">
                    +
                  </span>
                  <div>
                    <p className="flex items-center gap-1 text-xs text-gray-500" title="승급심사 예정년도까지 남은 미입력 연도를 기존 실적 평균으로 예측한 만큼의 증가분입니다.">
                      시뮬레이션 가산
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 shrink-0">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </p>
                    <p className="mt-1.5 text-[28px] font-bold leading-none text-accent">
                      {simDelta >= 0 ? '+' : ''}
                      {simDelta.toFixed(1)}점
                    </p>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
                <div className="flex items-center rounded-xl bg-[#fffae8] px-3 py-2">
                  <div>
                    <p className="text-xs text-gray-500">최종 시뮬레이션 점수 ({reviewYear}년)</p>
                    <p className="mt-1.5 text-[28px] font-bold leading-none text-[#e05221]">{projectedTotal.toFixed(1)}점</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 개인 메모 -- 대학원 재학, 육아, 휴가 계획처럼 성과 데이터로는 안
              잡히지만 면담 전에 챙겨야 할 개인 상황을 칩으로 붙여둔다.
              등록하면 면담 인사이트에도 그대로 반영된다. 화면 가장 우측
              끝에 붙여, "+메모" 입력을 위에 두고 칩은 그 아래 오른쪽
              정렬로 쌓는다. */}
          <div ref={noteStripRef} className="flex shrink-0 flex-col items-end gap-1.5">
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

            {personalNotes.length > 0 && (
              <div className="flex max-w-xs flex-wrap justify-end gap-1.5">
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 성장 시뮬레이션 / 성과 / 면담을 3등분 컬럼으로 나란히 놓는다 -- 두
          개의 스플리터로 각 컬럼 폭을 자유롭게 조절할 수 있다. 세 컬럼 모두
          접기 버튼이 따로 없다 -- 스플리터로 어느 컬럼이든 좁히면 실측 폭에
          따라 저절로 세로 타이틀만 남은 슬림 바가 되고, 다시 늘리면 컨텐츠가
          나온다(기본값은 성장 시뮬레이션만 슬림하게 시작). xl 미만에서는
          위아래로 쌓고 스플리터는 숨긴다(이 경우 모든 컬럼이 항상 폭이 넓어
          슬림 바가 되지 않는다). */}
      <div className="flex-1 bg-slate-50 p-5">
        <div ref={rowRef} className="flex flex-col gap-5 xl:flex-row xl:gap-0" style={gridStyle}>
          <div ref={simColRef} className="w-full min-w-0 xl:w-[var(--w1)] xl:shrink-0">
            {simNarrow ? (
              <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-between rounded-xl border border-gray-200 bg-white py-6">
                <span className="[writing-mode:vertical-rl] text-base font-bold text-black">성장 시뮬레이션</span>
                {promotionCriteria && (
                  <button
                    onClick={() => setCriteriaManagerOpen(true)}
                    title="승진 기준 보기"
                    className="[writing-mode:vertical-rl] text-xs font-semibold text-gray-400 hover:text-accent"
                  >
                    ⓘ 기준 보기
                  </button>
                )}
              </div>
            ) : (
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
            )}
          </div>

          <ColumnSplitter {...splitter0} />

          <div ref={recentColRef} className="w-full min-w-0 xl:w-[var(--w2)] xl:shrink-0">
            {perfNarrow ? (
              <div className="flex h-full min-h-[200px] w-full flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white py-6">
                <CollapseToggleButton collapsed onClick={() => expandColumn('perf')} label="성과" />
                <span className="[writing-mode:vertical-rl] text-base font-bold text-black">성과</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-4 px-1">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400">상하반기 성과 고과 추이</p>
                    <TrendSparkline points={halfYearGradePoints} maxPoints={8} width={140} className="mt-0.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400">년도별 역량고과 추이</p>
                    <TrendSparkline points={competencyGradePoints} maxPoints={4} width={90} className="mt-0.5" />
                  </div>
                </div>

                {currentWorkspace && (
                  <PeriodCard
                    title={`${cardYear} ${currentWorkspace.periodName}`}
                    score={memberResult?.cumulativeScore ?? null}
                    grade={memberResult?.grade ?? null}
                    isOpen={openPeriods.has(currentWorkspace.id)}
                    onToggle={() => togglePeriod(currentWorkspace.id)}
                  >
                    {currentTasks.length === 0 ? (
                      <p className="text-[13px] text-gray-400">이번 기간 참여한 과제가 없습니다.</p>
                    ) : (
                      <div className="divide-y divide-dashed divide-gray-200">
                        {currentTasks.map(({ task, contributionPercent, personalGrade, personalGradeNote, personalScore }) => (
                          <TaskRow
                            key={task.id}
                            importance={task.importance}
                            name={task.name}
                            percent={contributionPercent}
                            score={personalScore}
                            gradeSlot={
                              <>
                                <span className="text-sm font-semibold text-black">{personalGrade}</span>
                                <GradeNoteButton
                                  note={personalGradeNote}
                                  label={task.name}
                                  onSave={(next) => handleGradeNoteSave(task.id, next)}
                                  previewChars={recentColWide ? GRADE_NOTE_PREVIEW_CHARS : undefined}
                                />
                              </>
                            }
                          />
                        ))}
                      </div>
                    )}
                  </PeriodCard>
                )}

                {pastPeriods.map(({ workspace, cumulativeScore, grade, tasks }) => (
                  <PeriodCard
                    key={workspace.id}
                    title={`${workspace.evaluationYear} ${workspace.periodName}`}
                    score={cumulativeScore}
                    grade={grade}
                    isOpen={openPeriods.has(workspace.id)}
                    onToggle={() => togglePeriod(workspace.id)}
                  >
                    {tasks.length === 0 ? (
                      <p className="text-[13px] text-gray-400">참여한 과제가 없습니다.</p>
                    ) : (
                      <div className="divide-y divide-dashed divide-gray-200">
                        {tasks.map((t) => (
                          <TaskRow
                            key={t.taskId}
                            importance={t.importance}
                            name={t.taskName}
                            percent={t.contributionPercent}
                            score={t.personalScore}
                            gradeSlot={<span className="text-sm font-semibold text-black">{t.personalGrade}</span>}
                          />
                        ))}
                      </div>
                    )}
                  </PeriodCard>
                ))}
              </div>
            )}
          </div>

          <ColumnSplitter {...splitter1} />

          {/* 면담 -- 시뮬레이션/성과 컬럼이 접혀 폭이 넉넉해지면 내부에서
              좌(인사이트+기록)/우(일지 작성) 2단으로 나뉜다(MeetingForm 내부
              실측). 폭이 좁으면 인사이트 -> 일지 -> 기록 순으로 위아래 쌓인다.
              컬럼 자체도 다른 두 컬럼처럼 스플리터로 좁히면 슬림 바가 된다. */}
          <div ref={meetingColRef} className="w-full min-w-0 xl:w-[var(--w3)] xl:shrink-0 xl:flex-1">
            {meetingNarrow ? (
              <div className="flex h-full min-h-[200px] w-full flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white py-6">
                <CollapseToggleButton collapsed onClick={() => expandColumn('meeting')} label="면담" />
                <span className="[writing-mode:vertical-rl] text-base font-bold text-black">면담</span>
              </div>
            ) : (
              <div className="h-full rounded-xl border border-gray-200 bg-white p-5">
                <MeetingForm
                  member={member}
                  focusToken={prepRequest?.token ?? null}
                  insights={meetingInsights}
                  insightsOpen={insightsOpen}
                  onToggleInsights={() => setInsightsOpen((v) => !v)}
                  splitLayout={meetingSplit}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
    </div>
  )
}

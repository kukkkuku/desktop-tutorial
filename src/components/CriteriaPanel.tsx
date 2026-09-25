import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria, GradeDistribution } from '../types'

type WeightKey = Exclude<keyof Criteria, 'gradeDistribution'>
const DIST_GRADES = ['S', 'A', 'B', 'C', 'D'] as const
// 순위 상대평가를 처음 켤 때 채워 두는 시작값(바로 고칠 수 있다)
const START_DISTRIBUTION: GradeDistribution = { S: 10, A: 20, B: 40, C: 20, D: 10 }
import { blendByWeight } from '../utils/calculations'
import IconButton from './IconButton'
import { ChartNoAxesColumnIncreasing, ChevronLeft, File, Percent, SlidersHorizontal, Star, User, Users, type LucideIcon } from 'lucide-react'
import { ic, icLg } from './ui/icon'

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export type PanelSize = 'icon' | 'full'

const PANEL_WIDTH: Record<PanelSize, number> = { icon: 56, full: 320 }
const MIN_WIDTH = PANEL_WIDTH.icon
const MAX_WIDTH = 480
// Crossing the midpoint while dragging the splitter switches which content
// renders, so widening sweeps icon -> full and narrowing reverses it.
const ICON_FULL_THRESHOLD = (PANEL_WIDTH.icon + PANEL_WIDTH.full) / 2

function widthToSize(width: number): PanelSize {
  return width < ICON_FULL_THRESHOLD ? 'icon' : 'full'
}

interface CriterionIconItem {
  key: WeightKey
  label: string
  Icon: LucideIcon
}

// Two groups, task-side then member-side, matching the divider on the
// collapsed icon rail and the section split in the full settings view.
const ICON_GROUP_1: CriterionIconItem[] = [
  { key: 'taskGradeWeight', label: '과제등급', Icon: File },
  { key: 'workloadWeight', label: '업무량', Icon: ChartNoAxesColumnIncreasing },
  { key: 'performanceGradeWeight', label: '성과등급', Icon: Star },
]
const ICON_GROUP_2: CriterionIconItem[] = [
  { key: 'contributionWeight', label: '기여도', Icon: Percent },
  { key: 'personalGradeWeight', label: '개인수행등급', Icon: User },
  { key: 'peerReviewWeight', label: '피어리뷰', Icon: Users },
]

interface CriteriaPanelProps {
  size: PanelSize
  onSize: (size: PanelSize) => void
  // App's actual measured header height in px -- used instead of a
  // hardcoded rem guess so `top`/`height` always match the real header,
  // whatever it renders as, instead of drifting and leaving a permanent
  // few-pixel page overflow.
  headerHeight: number
}

// Always docked to the left as a normal in-flow sidebar column that reserves
// width and pushes the main content over -- no floating, no dragging to
// reposition. Two states only: a collapsed rail of per-criterion icon
// buttons (title attribute doubles as a tooltip, click toggles on/off) and
// the full detailed settings. Resizing via the splitter sweeps continuously
// between the two and snaps to the nearest preset on release.
export default function CriteriaPanel({ size, onSize, headerHeight }: CriteriaPanelProps) {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  // Non-null only while the splitter is actively being dragged -- the width
  // it tracks is continuous, but releases back to the exact preset width for
  // whichever size the drag landed on (icon/full), not left in-between.
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  function set(key: WeightKey, weight: number) {
    dispatch({ type: 'SET_CRITERIA', payload: { [key]: weight } })
  }

  function toggleActive(key: WeightKey) {
    const current = criteria[key]
    set(key, current > 0 ? 0 : 100)
  }

  // Splitter: drag the panel's right edge to sweep continuously between
  // icon rail and full width (or back) instead of only jumping via buttons.
  function onResizePointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const startWidth = dragWidth ?? PANEL_WIDTH[size]
    resizeRef.current = { startX: e.clientX, startWidth }
    setDragWidth(startWidth)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onResizePointerMove(e: React.PointerEvent) {
    if (!resizeRef.current) return
    const dx = e.clientX - resizeRef.current.startX
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startWidth + dx))
    setDragWidth(next)
    const derivedSize = widthToSize(next)
    if (derivedSize !== size) onSize(derivedSize)
  }

  function onResizePointerUp() {
    resizeRef.current = null
    setDragWidth(null)
  }

  // Collapsed rail trigger -- icon only, opens full settings.
  function ExpandIconButton() {
    return (
      <IconButton onClick={() => onSize('full')} title="상세 설정 열기" aria-label="상세 설정 열기" className="h-9 min-w-9 shrink-0">
        <SlidersHorizontal {...icLg} className="shrink-0" />
      </IconButton>
    )
  }

  // One glyph per criterion on the collapsed rail -- click toggles it on/off,
  // and the native title attribute doubles as a tooltip for the label + %.
  function CriteriaIconButton({ item }: { item: CriterionIconItem }) {
    const value = criteria[item.key]
    const active = value > 0
    const Icon = item.Icon
    return (
      <button
        onClick={() => toggleActive(item.key)}
        title={`${item.label} — ${active ? `${value}%` : '미사용'} (클릭해서 전환)`}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control border transition-colors ${
          active ? 'border-accent/30 bg-accent-soft text-accent' : 'border-separator bg-black/[0.03] text-label-3 hover:text-label-2'
        }`}
      >
        <Icon {...ic} className="shrink-0" />
      </button>
    )
  }

  // Once settings are already open, the icon trigger is redundant -- a
  // plain collapse arrow closes it back down to the icon-only rail.
  function CollapseButton() {
    return (
      <IconButton onClick={() => onSize('icon')} title="접기" aria-label="기준 설정 접기" className="shrink-0">
        <ChevronLeft {...ic} />
      </IconButton>
    )
  }

  function sliderBackground(value: number): string {
    const percent = ((value - 5) / 95) * 100
    return `linear-gradient(to right, var(--accent) ${percent}%, rgba(0, 0, 0, 0.1) ${percent}%)`
  }

  // 최종 고과 배분 -- 켜면 성과점수 순위로 상대평가(동점은 같은 고과). 끄면 팀 기대점수 대비 비율로 매긴다.
  function GradeDistributionSection() {
    const dist = criteria.gradeDistribution ?? null
    const total = dist ? DIST_GRADES.reduce((sum, g) => sum + dist[g], 0) : 100
    function change(g: (typeof DIST_GRADES)[number], raw: number) {
      if (!dist) return
      const value = Math.max(0, Math.min(100, Number.isFinite(raw) ? Math.round(raw) : 0))
      // 합계 100을 유지하도록 D(D를 고치면 B)가 나머지를 받는다.
      const balance = g === 'D' ? 'B' : 'D'
      const others = DIST_GRADES.reduce((sum, k) => (k === g || k === balance ? sum : sum + dist[k]), 0)
      dispatch({ type: 'SET_CRITERIA', payload: { gradeDistribution: { ...dist, [g]: value, [balance]: Math.max(0, 100 - others - value) } } })
    }
    return (
      <div className="border-t border-separator pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-label">최종 고과 배분</p>
          <button
            onClick={() => dispatch({ type: 'SET_CRITERIA', payload: { gradeDistribution: dist ? null : START_DISTRIBUTION } })}
            title="클릭해서 방식 전환"
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
              dist ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-black/[0.05] text-label-2 hover:bg-black/[0.08]'
            }`}
          >
            {dist ? '상대평가' : '기대점수 기준'}
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-label-2">
          {dist
            ? '성과점수 순위에 따라 상대평가하며 동점자는 같은 고과로 표시합니다.'
            : '팀 기대점수 대비 비율로 매깁니다 (1.2배 이상 S · 1.0 A · 0.8 B · 0.6 C · 그 아래 D). 눌러서 순위 상대평가로 바꿀 수 있습니다.'}
        </p>
        {dist && (
          <>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {DIST_GRADES.map((g) => (
                <label key={g} className="text-center text-xs font-semibold text-label-2">
                  {g} <span className="font-normal text-label-3">%</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={dist[g]}
                    onChange={(e) => change(g, Number(e.target.value))}
                    className="mt-1 h-8 w-full min-w-0 rounded-control border border-hairline !px-1 text-center text-[13px] tabular-nums text-label"
                  />
                </label>
              ))}
            </div>
            <p className={`mt-1 text-right text-xs font-medium ${total === 100 ? 'text-success' : 'text-danger'}`}>합계 {total}%</p>
          </>
        )}
      </div>
    )
  }

  function CriteriaItem({ itemKey, label, desc }: { itemKey: WeightKey; label: string; desc: string }) {
    const value = criteria[itemKey]
    const checked = value > 0
    return (
      <div className="mac-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-label">
            {label}
            {checked && <span className="ml-2 tabular-nums text-[13px] font-semibold text-accent">{value}%</span>}
          </p>
          <button
            onClick={() => set(itemKey, checked ? 0 : 100)}
            title="클릭해서 사용 여부 전환"
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
              checked ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-black/[0.05] text-label-2 hover:bg-black/[0.08]'
            }`}
          >
            {checked ? '사용' : '미사용'}
          </button>
        </div>
        {checked && (
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={value}
            onChange={(e) => set(itemKey, Number(e.target.value))}
            style={{ background: sliderBackground(value) }}
            className="criteria-slider mt-2.5 w-full"
          />
        )}
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-label-2">{desc}</p>
      </div>
    )
  }

  const w = criteria.performanceGradeWeight
  const performanceGradeDescription =
    w === 0
      ? '사용 안 함 — 모든 과제를 항상 S(100점)로 간주합니다.'
      : `S ${fmt(blendByWeight(100, 100, w))} / A ${fmt(blendByWeight(100, 90, w))} / B ${fmt(blendByWeight(100, 80, w))} / C ${fmt(blendByWeight(100, 70, w))} / D ${fmt(blendByWeight(100, 60, w))}점`

  const tw = criteria.taskGradeWeight
  const taskGradeDescription =
    tw === 0
      ? '사용 안 함 — 모든 과제의 과제등급 점수를 항상 100점으로 간주합니다.'
      : `과제 ${fmt(blendByWeight(100, 120, tw))} / 일반 ${fmt(blendByWeight(100, 100, tw))} / 일상 ${fmt(blendByWeight(100, 80, tw))}점`

  const ww = criteria.workloadWeight
  const workloadDescription =
    ww === 0
      ? '사용 안 함 — 모든 과제의 업무량 계수를 항상 1.0배로 간주합니다.'
      : `대 ${fmt(blendByWeight(1, 1.2, ww))} / 중 ${fmt(blendByWeight(1, 1.0, ww))} / 소 ${fmt(blendByWeight(1, 0.8, ww))}배`

  const pw = criteria.personalGradeWeight
  const personalGradeDescription =
    pw === 0
      ? '사용 안 함 — 켜면 점수에 반영됩니다.'
      : `S ${fmt(blendByWeight(1, 1.5, pw))} / A ${fmt(blendByWeight(1, 1.2, pw))} / B ${fmt(blendByWeight(1, 1.0, pw))} / C ${fmt(blendByWeight(1, 0.8, pw))} / D ${fmt(blendByWeight(1, 0.6, pw))}배`

  const rw = criteria.peerReviewWeight
  const peerReviewDescription =
    rw === 0
      ? '사용 안 함 — 켜면 피어리뷰(순위·과제별)가 점수에 반영됩니다.'
      : `받은 피어리뷰 평균이 1위·S(100점)면 ${fmt(blendByWeight(1, 1.0, rw))}배, 5위 이하·D(60점)면 ${fmt(blendByWeight(1, 0.6, rw))}배 (순위 한 계단 10점, 본인 평가 제외)`

  const cw = criteria.contributionWeight
  const contributionDescription =
    cw === 0
      ? '사용 안 함 — 매트릭스에 입력한 값 대신 참여 팀원에게 과제 점수를 균등하게 나눠줍니다.'
      : cw === 100
        ? '매트릭스 입력값 기여도 100% 반영'
        : `매트릭스 입력값과 균등분배를 ${cw}:${100 - cw} 비율로 반영`

  const TASK_ITEMS: { key: WeightKey; label: string; desc: string }[] = [
    { key: 'taskGradeWeight', label: '과제등급 사용', desc: taskGradeDescription },
    // 업무량은 쓰지 않는다. 이전 기준으로 켜 둔 평가에서만 보여 줘서 끌 수 있게 한다.
    ...(ww > 0 ? [{ key: 'workloadWeight' as const, label: '업무량 사용 (이전 기준)', desc: workloadDescription }] : []),
    { key: 'performanceGradeWeight', label: '성과등급 사용', desc: performanceGradeDescription },
  ]
  const MEMBER_ITEMS: { key: WeightKey; label: string; desc: string }[] = [
    { key: 'contributionWeight', label: '기여도 사용', desc: contributionDescription },
    { key: 'personalGradeWeight', label: '개인수행등급', desc: personalGradeDescription },
    { key: 'peerReviewWeight', label: '피어리뷰', desc: peerReviewDescription },
  ]

  return (
    <div
      className={`sticky relative shrink-0 self-start overflow-y-auto border-r border-separator bg-white ${
        dragWidth === null ? 'transition-[width] duration-200' : ''
      }`}
      style={{ width: dragWidth ?? PANEL_WIDTH[size], top: headerHeight, height: `calc(100vh - ${headerHeight}px)` }}
    >
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        style={{ touchAction: 'none', right: 0 }}
        title="드래그해서 너비 조절 (아이콘 ↔ 상세설정)"
        aria-label="패널 너비 조절"
        className="group absolute inset-y-0 z-10 flex w-3 cursor-col-resize items-center justify-center"
      >
        <span className="h-10 w-1 shrink-0 rounded-full bg-black/15 transition-colors group-hover:bg-accent group-active:bg-accent" />
      </div>

      {size === 'icon' && (
        <div className="flex h-full flex-col items-center gap-1.5 px-2 py-3">
          <ExpandIconButton />
          <span className="my-0.5 h-px w-full bg-separator" />
          {ICON_GROUP_1.filter((item) => item.key !== 'workloadWeight' || criteria.workloadWeight > 0).map((item) => (
            <CriteriaIconButton key={item.key} item={item} />
          ))}
          <span className="my-0.5 h-px w-full bg-separator" />
          {ICON_GROUP_2.map((item) => (
            <CriteriaIconButton key={item.key} item={item} />
          ))}
        </div>
      )}

      {size === 'full' && (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-separator px-3 py-3">
            <CollapseButton />
            <span className="text-[13px] font-semibold text-label">기준 설정</span>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <p className="text-[13px] leading-relaxed text-label-2">
              켜면 반영 비율(0~100%)을 슬라이더로 조절할 수 있습니다. 변경 시 결과가 즉시 재계산됩니다.
            </p>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-label-2">과제 평가 기준</p>
              <div className="space-y-2">
                {TASK_ITEMS.map(({ key, label, desc }) => (
                  <CriteriaItem key={key} itemKey={key} label={label} desc={desc} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-label-2">팀원 평가 기준</p>
              <div className="space-y-2">
                {MEMBER_ITEMS.map(({ key, label, desc }) => (
                  <CriteriaItem key={key} itemKey={key} label={label} desc={desc} />
                ))}
              </div>
            </div>

            <GradeDistributionSection />
          </div>
        </div>
      )}
    </div>
  )
}

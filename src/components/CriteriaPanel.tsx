import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import { blendByWeight } from '../utils/calculations'

interface IconProps {
  className?: string
}

// "Adjustment sliders" glyph -- reads as tuning/criteria controls rather
// than a generic settings gear, matching what this button actually opens.
function AdjustIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

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

interface CriteriaPanelProps {
  size: PanelSize
  onSize: (size: PanelSize) => void
}

// Always docked to the left as a normal in-flow sidebar column that reserves
// width and pushes the main content over -- no floating, no dragging to
// reposition. Two states only: an icon-only rail and the full detailed
// settings. The only interaction besides toggling/tuning criteria is
// resizing via the splitter, which sweeps continuously between the two and
// snaps to the nearest preset on release.
export default function CriteriaPanel({ size, onSize }: CriteriaPanelProps) {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  // Non-null only while the splitter is actively being dragged -- the width
  // it tracks is continuous, but releases back to the exact preset width for
  // whichever size the drag landed on (icon/full), not left in-between.
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  function set(key: keyof Criteria, weight: number) {
    dispatch({ type: 'SET_CRITERIA', payload: { [key]: weight } })
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
      <button
        onClick={() => onSize('full')}
        title="기준 설정 열기"
        aria-label="기준 설정 열기"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-accent"
      >
        <AdjustIcon className="h-5 w-5 shrink-0" />
      </button>
    )
  }

  // Once settings are already open, the icon trigger is redundant -- a
  // plain collapse arrow closes it back down to the icon-only rail.
  function CollapseButton() {
    return (
      <button
        onClick={() => onSize('icon')}
        title="접기"
        aria-label="기준 설정 접기"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-accent"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
    )
  }

  function sliderBackground(value: number): string {
    const percent = ((value - 5) / 95) * 100
    return `linear-gradient(to right, #eb6100 ${percent}%, #e5e7eb ${percent}%)`
  }

  function CriteriaItem({ itemKey, label, desc }: { itemKey: keyof Criteria; label: string; desc: string }) {
    const value = criteria[itemKey]
    const checked = value > 0
    return (
      <div className="rounded-md border border-gray-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-black">
            {label}
            {checked && <span className="ml-2 font-mono text-[13px] font-bold text-accent">{value}%</span>}
          </p>
          <button
            onClick={() => set(itemKey, checked ? 0 : 100)}
            title="클릭해서 사용 여부 전환"
            className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
              checked ? 'bg-orange-50 text-accent hover:bg-orange-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-gray-600">{desc}</p>
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
      : `중점 ${fmt(blendByWeight(100, 130, tw))} / 핵심 ${fmt(blendByWeight(100, 110, tw))} / 일반 ${fmt(blendByWeight(100, 100, tw))} / 지원 ${fmt(blendByWeight(100, 80, tw))}점`

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
      ? '사용 안 함 — 켜면 점수에 반영됩니다.'
      : `평균 등급 S(100점)면 ${fmt(blendByWeight(1, 1.0, rw))}배, D(60점)면 ${fmt(blendByWeight(1, 0.6, rw))}배`

  const cw = criteria.contributionWeight
  const contributionDescription =
    cw === 0
      ? '사용 안 함 — 매트릭스에 입력한 값 대신 참여 팀원에게 과제 점수를 균등하게 나눠줍니다.'
      : cw === 100
        ? '매트릭스 입력값 기여도 100% 반영'
        : `매트릭스 입력값과 균등분배를 ${cw}:${100 - cw} 비율로 반영`

  const TASK_ITEMS: { key: keyof Criteria; label: string; desc: string }[] = [
    { key: 'taskGradeWeight', label: '과제등급 사용', desc: taskGradeDescription },
    { key: 'workloadWeight', label: '업무량 사용', desc: workloadDescription },
    { key: 'performanceGradeWeight', label: '성과등급 사용', desc: performanceGradeDescription },
  ]
  const MEMBER_ITEMS: { key: keyof Criteria; label: string; desc: string }[] = [
    { key: 'contributionWeight', label: '기여도 사용', desc: contributionDescription },
    { key: 'personalGradeWeight', label: '개인수행등급', desc: personalGradeDescription },
    { key: 'peerReviewWeight', label: '피어리뷰', desc: peerReviewDescription },
  ]

  return (
    <div
      className={`sticky top-[3.25rem] relative shrink-0 self-start overflow-y-auto border-r border-gray-200 bg-white ${
        dragWidth === null ? 'transition-[width] duration-200' : ''
      }`}
      style={{ width: dragWidth ?? PANEL_WIDTH[size], height: 'calc(100vh - 3.25rem)' }}
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
        <span className="h-10 w-1 shrink-0 rounded-full bg-gray-300 transition-colors group-hover:bg-accent group-active:bg-accent" />
      </div>

      {size === 'icon' && (
        <div className="flex h-full flex-col items-center gap-1.5 px-2 py-3">
          <ExpandIconButton />
        </div>
      )}

      {size === 'full' && (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-3">
            <CollapseButton />
            <span className="text-sm font-semibold text-black">기준 설정</span>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <p className="text-[13px] leading-relaxed text-gray-400">
              켜면 반영 비율(0~100%)을 슬라이더로 조절할 수 있습니다. 변경 시 결과가 즉시 재계산됩니다.
            </p>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-gray-400">과제 평가 기준</p>
              <div className="space-y-2">
                {TASK_ITEMS.map(({ key, label, desc }) => (
                  <CriteriaItem key={key} itemKey={key} label={label} desc={desc} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-gray-400">팀원 평가 기준</p>
              <div className="space-y-2">
                {MEMBER_ITEMS.map(({ key, label, desc }) => (
                  <CriteriaItem key={key} itemKey={key} label={label} desc={desc} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

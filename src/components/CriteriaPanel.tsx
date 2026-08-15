import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import { blendByWeight } from '../utils/calculations'

interface IconProps {
  className?: string
}

function MoveIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  )
}

function StarIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function FlagIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function BarsIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function PercentIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  )
}

function UserCheckIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  )
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  )
}

function PinIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  )
}

interface ToggleProps {
  on: boolean
  onChange: (v: boolean) => void
}

function Toggle({ on, onChange }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${on ? 'bg-accent' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

type ItemKey = keyof Criteria

interface ItemDef {
  key: ItemKey
  label: string
  Icon: (p: IconProps) => JSX.Element
}

// Two groups, task-side then member-side, matching the divider the user asked for.
const GROUP_1: ItemDef[] = [
  { key: 'taskGradeWeight', label: '과제등급', Icon: FlagIcon },
  { key: 'workloadWeight', label: '업무량', Icon: BarsIcon },
  { key: 'performanceGradeWeight', label: '성과등급', Icon: StarIcon },
]
const GROUP_2: ItemDef[] = [
  { key: 'contributionWeight', label: '기여도', Icon: PercentIcon },
  { key: 'personalGradeWeight', label: '개인수행등급', Icon: UserCheckIcon },
  { key: 'peerReviewWeight', label: '피어리뷰', Icon: UsersIcon },
]

export type PanelSize = 'icon' | 'chip' | 'full'
export type PanelDock = 'left' | 'right' | null

const PANEL_WIDTH: Record<PanelSize, number> = { icon: 56, chip: 188, full: 320 }
export const DEFAULT_FLOAT_X = 24
export const FLOAT_Y = 84
const MIN_WIDTH = PANEL_WIDTH.icon
const MAX_WIDTH = 480
// Crossing a midpoint while dragging the splitter switches which content
// renders, so widening sweeps icon -> chip -> full and narrowing reverses it.
const ICON_CHIP_THRESHOLD = (PANEL_WIDTH.icon + PANEL_WIDTH.chip) / 2
const CHIP_FULL_THRESHOLD = (PANEL_WIDTH.chip + PANEL_WIDTH.full) / 2

function widthToSize(width: number): PanelSize {
  if (width < ICON_CHIP_THRESHOLD) return 'icon'
  if (width < CHIP_FULL_THRESHOLD) return 'chip'
  return 'full'
}

interface CriteriaPanelProps {
  dock: PanelDock
  size: PanelSize
  floatX: number
  onDock: (dock: PanelDock) => void
  onSize: (size: PanelSize) => void
  onFloatX: (x: number) => void
}

// Undocked: a small floating icon-only strip that can be dragged left/right
// and pinned to the nearest screen edge. Docked (left/right): a real sidebar
// column in the page layout (not floating) that reserves width and pushes
// the main content over, exactly like a normal app rail -- while docked it
// can still be resized icon -> chip -> full without leaving the dock, and an
// unpin control returns it to the floating icon.
export default function CriteriaPanel({ dock, size, floatX, onDock, onSize, onFloatX }: CriteriaPanelProps) {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; origX: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  // Non-null only while the splitter is actively being dragged -- the width
  // it tracks is continuous, but releases back to the exact preset width for
  // whichever size the drag landed on (icon/chip/full), not left in-between.
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  function set(key: keyof Criteria, weight: number) {
    dispatch({ type: 'SET_CRITERIA', payload: { [key]: weight } })
  }

  function toggleActive(key: ItemKey) {
    const current = criteria[key]
    set(key, current > 0 ? 0 : 100)
  }

  function onDragPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, origX: floatX }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onDragPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const width = panelRef.current?.offsetWidth ?? PANEL_WIDTH.icon
    const maxX = Math.max(window.innerWidth - width, 0)
    onFloatX(Math.min(Math.max(dragRef.current.origX + dx, 0), maxX))
  }

  function onDragPointerUp() {
    dragRef.current = null
  }

  function handlePin() {
    const width = panelRef.current?.offsetWidth ?? PANEL_WIDTH.icon
    const distLeft = floatX
    const distRight = window.innerWidth - (floatX + width)
    onDock(distLeft <= distRight ? 'left' : 'right')
  }

  function handleUnpin() {
    onDock(null)
    onSize('icon')
  }

  // Splitter: drag the docked panel's inner edge to sweep continuously
  // through icon -> chip -> full (or back) instead of only jumping between
  // the three presets via buttons. Direction flips with dock side so
  // dragging always feels like "pull the edge toward the content."
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
    const delta = dock === 'left' ? dx : -dx
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startWidth + delta))
    setDragWidth(next)
    const derivedSize = widthToSize(next)
    if (derivedSize !== size) onSize(derivedSize)
  }

  function onResizePointerUp() {
    resizeRef.current = null
    setDragWidth(null)
  }

  function IconButton({ item }: { item: ItemDef }) {
    const value = criteria[item.key]
    const active = value > 0
    return (
      <button
        onClick={() => toggleActive(item.key)}
        title={`${item.label} — ${active ? value + '%' : '사용 안 함'} (클릭해서 전환)`}
        aria-label={item.label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${
          active ? 'bg-orange-50 text-accent hover:bg-orange-100' : 'text-gray-300 hover:bg-gray-100'
        }`}
      >
        <item.Icon className="h-4 w-4" />
      </button>
    )
  }

  function Chip({ item }: { item: ItemDef }) {
    const value = criteria[item.key]
    const active = value > 0
    return (
      <button
        onClick={() => toggleActive(item.key)}
        title="클릭해서 사용 여부 전환"
        className={`inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          active ? 'border-orange-200 bg-orange-50 text-accent hover:border-orange-300' : 'border-gray-200 bg-gray-50 text-gray-400'
        }`}
      >
        {item.label}
        <span className="font-mono">{active ? `${value}%` : '0%'}</span>
      </button>
    )
  }

  const w = criteria.performanceGradeWeight
  const performanceGradeDescription =
    w === 0
      ? '사용 안 함 — 모든 과제를 항상 S(100점)로 간주합니다.'
      : `S ${fmt(blendByWeight(100, 100, w))} / A ${fmt(blendByWeight(100, 90, w))} / B ${fmt(blendByWeight(100, 80, w))} / C ${fmt(blendByWeight(100, 70, w))} / D ${fmt(blendByWeight(100, 60, w))}점 기준으로 반영됩니다.`

  const tw = criteria.taskGradeWeight
  const taskGradeDescription =
    tw === 0
      ? '사용 안 함 — 모든 과제의 과제등급 점수를 항상 100점으로 간주합니다.'
      : `중점 ${fmt(blendByWeight(100, 130, tw))} / 핵심 ${fmt(blendByWeight(100, 110, tw))} / 일반 ${fmt(blendByWeight(100, 100, tw))} / 지원 ${fmt(blendByWeight(100, 80, tw))}점 기준으로 반영됩니다.`

  const ww = criteria.workloadWeight
  const workloadDescription =
    ww === 0
      ? '사용 안 함 — 모든 과제의 업무량 계수를 항상 1.0배로 간주합니다.'
      : `대 ${fmt(blendByWeight(1, 1.2, ww))} / 중 ${fmt(blendByWeight(1, 1.0, ww))} / 소 ${fmt(blendByWeight(1, 0.8, ww))}배 계수로 반영됩니다.`

  const pw = criteria.personalGradeWeight
  const personalGradeDescription =
    pw === 0
      ? '사용 안 함 — 켜면 점수에 반영됩니다.'
      : `S ${fmt(blendByWeight(1, 1.5, pw))} / A ${fmt(blendByWeight(1, 1.2, pw))} / B ${fmt(blendByWeight(1, 1.0, pw))} / C ${fmt(blendByWeight(1, 0.8, pw))} / D ${fmt(blendByWeight(1, 0.6, pw))}배로 반영됩니다.`

  const rw = criteria.peerReviewWeight
  const peerReviewDescription =
    rw === 0
      ? '사용 안 함 — 켜면 점수에 반영됩니다.'
      : `평균 등급 S(100점)면 ${fmt(blendByWeight(1, 1.0, rw))}배, D(60점)면 ${fmt(blendByWeight(1, 0.6, rw))}배로 반영됩니다.`

  const cw = criteria.contributionWeight
  const contributionDescription =
    cw === 0
      ? '사용 안 함 — 매트릭스에 입력한 값 대신 참여 팀원에게 과제 점수를 균등하게 나눠줍니다.'
      : cw === 100
        ? '매트릭스에 입력한 기여도(%)를 그대로 반영합니다.'
        : `매트릭스 입력값과 균등분배를 ${cw}:${100 - cw} 비율로 섞어 반영합니다.`

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

  if (dock === null) {
    return (
      <div
        ref={panelRef}
        className="fixed z-40 flex flex-col items-center gap-1.5 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
        style={{ left: floatX, top: FLOAT_Y }}
      >
        <button
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          style={{ touchAction: 'none' }}
          title="이동 (좌우로 드래그)"
          aria-label="패널 이동"
          className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
        >
          <MoveIcon className="h-4 w-4" />
        </button>
        <button
          onClick={handlePin}
          title="가까운 가장자리(왼쪽/오른쪽)에 고정"
          aria-label="가장자리에 고정"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
        >
          <PinIcon className="h-4 w-4" />
        </button>
        <span className="my-1 h-px w-6 shrink-0 bg-gray-200" />
        {GROUP_1.map((item) => (
          <IconButton key={item.key} item={item} />
        ))}
        <span className="my-1 h-px w-6 shrink-0 bg-gray-200" />
        {GROUP_2.map((item) => (
          <IconButton key={item.key} item={item} />
        ))}
      </div>
    )
  }

  const expandRotate = dock === 'right' ? 'rotate-180' : ''
  const collapseRotate = dock === 'right' ? '' : 'rotate-180'

  return (
    <div
      className={`sticky top-[3.25rem] relative shrink-0 self-start overflow-y-auto bg-white ${
        dragWidth === null ? 'transition-[width] duration-200' : ''
      } ${dock === 'left' ? 'border-r' : 'border-l'} border-gray-200`}
      style={{ width: dragWidth ?? PANEL_WIDTH[size], height: 'calc(100vh - 3.25rem)' }}
    >
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        style={{ touchAction: 'none', [dock === 'left' ? 'right' : 'left']: 0 }}
        title="드래그해서 너비 조절 (아이콘 ↔ 칩 ↔ 상세설정)"
        aria-label="패널 너비 조절"
        className="group absolute inset-y-0 z-10 flex w-3 cursor-col-resize items-center justify-center"
      >
        <span className="h-10 w-1 shrink-0 rounded-full bg-gray-300 transition-colors group-hover:bg-accent group-active:bg-accent" />
      </div>

      {size === 'icon' && (
        <div className="flex flex-col items-center gap-1.5 p-3">
          <button
            onClick={handleUnpin}
            title="고정 해제"
            aria-label="고정 해제"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white"
          >
            <PinIcon className="h-4 w-4" />
          </button>
          <span className="my-1 h-px w-6 shrink-0 bg-gray-200" />
          {GROUP_1.map((item) => (
            <IconButton key={item.key} item={item} />
          ))}
          <span className="my-1 h-px w-6 shrink-0 bg-gray-200" />
          {GROUP_2.map((item) => (
            <IconButton key={item.key} item={item} />
          ))}
          <span className="my-1 h-px w-6 shrink-0 bg-gray-200" />
          <button
            onClick={() => onSize('chip')}
            title="펼치기"
            aria-label="기준 설정 펼치기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
          >
            <ChevronRightIcon className={`h-4 w-4 ${expandRotate}`} />
          </button>
        </div>
      )}

      {size === 'chip' && (
        <div className="flex flex-col gap-2 px-4 py-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">기준 설정</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleUnpin}
                title="고정 해제"
                aria-label="고정 해제"
                className="flex h-5 w-5 items-center justify-center rounded text-accent hover:bg-orange-50"
              >
                <PinIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onSize('icon')}
                title="아이콘으로 접기"
                aria-label="아이콘으로 접기"
                className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-500"
              >
                <ChevronRightIcon className={`h-3.5 w-3.5 ${collapseRotate}`} />
              </button>
            </div>
          </div>
          {GROUP_1.map((item) => (
            <Chip key={item.key} item={item} />
          ))}
          <span className="my-0.5 h-px w-full bg-gray-100" />
          {GROUP_2.map((item) => (
            <Chip key={item.key} item={item} />
          ))}
          <button
            onClick={() => onSize('full')}
            className="mt-2 w-full rounded-md border border-accent py-1.5 text-center text-xs font-medium text-accent transition-colors hover:bg-orange-50"
          >
            설정 변경 →
          </button>
        </div>
      )}

      {size === 'full' && (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
            <span className="text-sm font-semibold text-black">기준 설정</span>
            <div className="flex items-center gap-2.5">
              <button onClick={handleUnpin} title="고정 해제" aria-label="고정 해제" className="text-accent hover:opacity-80">
                <PinIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => onSize('chip')}
                title="접기"
                aria-label="기준 설정 접기"
                className="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <ChevronUpIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <p className="text-xs leading-relaxed text-gray-500">
              켜면 반영 비율(0~100%)을 슬라이더로 조절할 수 있습니다. 변경 시 결과가 즉시 재계산됩니다.
            </p>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-400">과제 평가 기준</p>
              <div className="space-y-2">
                {TASK_ITEMS.map(({ key, label, desc }) => {
                  const value = criteria[key]
                  const checked = value > 0
                  return (
                    <div key={key} className="rounded-md border border-gray-200 p-3">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-black">{label}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{desc}</p>
                        </div>
                        <Toggle on={checked} onChange={(v) => set(key, v ? 100 : 0)} />
                      </div>
                      {checked && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between">
                            <span className="text-xs text-gray-400">반영 비율</span>
                            <span className="font-mono text-xs font-bold text-accent">{value}%</span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={100}
                            step={5}
                            value={value}
                            onChange={(e) => set(key, Number(e.target.value))}
                            className="criteria-slider w-full"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-400">팀원 평가 기준</p>
              <div className="space-y-2">
                {MEMBER_ITEMS.map(({ key, label, desc }) => {
                  const value = criteria[key]
                  const checked = value > 0
                  return (
                    <div key={key} className="rounded-md border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-black">{label}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{desc}</p>
                        </div>
                        <Toggle on={checked} onChange={(v) => set(key, v ? 100 : 0)} />
                      </div>
                      {checked && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between">
                            <span className="text-xs text-gray-400">반영 비율</span>
                            <span className="font-mono text-xs font-bold text-accent">{value}%</span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={100}
                            step={5}
                            value={value}
                            onChange={(e) => set(key, Number(e.target.value))}
                            className="criteria-slider w-full"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

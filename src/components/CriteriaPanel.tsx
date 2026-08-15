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

interface ToggleProps {
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function Toggle({ on, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-gray-300'} ${
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      }`}
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

type ItemKey = keyof Criteria | 'contribution'

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
  { key: 'contribution', label: '기여도', Icon: PercentIcon },
  { key: 'personalGradeWeight', label: '개인수행등급', Icon: UserCheckIcon },
  { key: 'peerReviewWeight', label: '피어리뷰', Icon: UsersIcon },
]

type PanelSize = 'icon' | 'chip' | 'full'

const PANEL_WIDTH: Record<PanelSize, number> = { icon: 56, chip: 188, full: 320 }
const DEFAULT_POS = { x: 16, y: 76 }

// Floating, draggable palette (like a pen-tool panel) rather than a fixed
// rail, so it can be moved out of the way on any tab/screen size. Three
// sizes step progressively: icon-only -> chip list -> full toggle+slider
// panel. Clicking an icon/chip toggles that criterion on/off directly;
// resizing is a separate control (the move handle / explicit expand button)
// so drag and toggle never fight over the same click.
export default function CriteriaPanel() {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const [size, setSize] = useState<PanelSize>('chip')
  const [pos, setPos] = useState(DEFAULT_POS)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  function set(key: keyof Criteria, weight: number) {
    dispatch({ type: 'SET_CRITERIA', payload: { [key]: weight } })
  }

  function isAlwaysOn(key: ItemKey): key is 'contribution' {
    return key === 'contribution'
  }

  function valueFor(key: ItemKey): number {
    return isAlwaysOn(key) ? 100 : (criteria[key] as number)
  }

  function toggleActive(key: ItemKey) {
    if (isAlwaysOn(key)) return
    const current = criteria[key] as number
    set(key, current > 0 ? 0 : 100)
  }

  function onDragPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onDragPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const width = panelRef.current?.offsetWidth ?? PANEL_WIDTH[size]
    const height = panelRef.current?.offsetHeight ?? 200
    const maxX = Math.max(window.innerWidth - width, 0)
    const maxY = Math.max(window.innerHeight - height, 0)
    setPos({
      x: Math.min(Math.max(dragRef.current.origX + dx, 0), maxX),
      y: Math.min(Math.max(dragRef.current.origY + dy, 0), maxY),
    })
  }

  function onDragPointerUp() {
    dragRef.current = null
  }

  const dragHandleProps = {
    onPointerDown: onDragPointerDown,
    onPointerMove: onDragPointerMove,
    onPointerUp: onDragPointerUp,
    onPointerCancel: onDragPointerUp,
    style: { touchAction: 'none' as const },
  }

  function IconButton({ item }: { item: ItemDef }) {
    const value = valueFor(item.key)
    const active = value > 0
    const alwaysOn = isAlwaysOn(item.key)
    return (
      <button
        onClick={() => toggleActive(item.key)}
        disabled={alwaysOn}
        title={alwaysOn ? `${item.label} — 항상 사용` : `${item.label} — ${active ? value + '%' : '사용 안 함'} (클릭해서 전환)`}
        aria-label={item.label}
        className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
          active ? 'bg-orange-50 text-accent' : 'text-gray-300'
        } ${alwaysOn ? 'cursor-default' : 'cursor-pointer hover:bg-orange-100'} ${!active && !alwaysOn ? 'hover:bg-gray-100' : ''}`}
      >
        <item.Icon className="h-4 w-4" />
      </button>
    )
  }

  function Chip({ item }: { item: ItemDef }) {
    const value = valueFor(item.key)
    const active = value > 0
    const alwaysOn = isAlwaysOn(item.key)
    return (
      <button
        onClick={() => toggleActive(item.key)}
        disabled={alwaysOn}
        title={alwaysOn ? `${item.label} — 항상 사용` : '클릭해서 사용 여부 전환'}
        className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          active ? 'border-orange-200 bg-orange-50 text-accent' : 'border-gray-200 bg-gray-50 text-gray-400'
        } ${alwaysOn ? 'cursor-default' : 'cursor-pointer hover:border-orange-300'}`}
      >
        {item.label}
        <span className="font-mono">{alwaysOn ? '필수' : active ? `${value}%` : '0%'}</span>
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

  const TASK_ITEMS: { key: keyof Criteria; label: string; desc: string }[] = [
    { key: 'taskGradeWeight', label: '과제등급 사용', desc: taskGradeDescription },
    { key: 'workloadWeight', label: '업무량 사용', desc: workloadDescription },
    { key: 'performanceGradeWeight', label: '성과등급 사용', desc: performanceGradeDescription },
  ]
  const MEMBER_ITEMS: { key: keyof Criteria; label: string; desc: string }[] = [
    { key: 'personalGradeWeight', label: '개인수행등급', desc: personalGradeDescription },
    { key: 'peerReviewWeight', label: '피어리뷰', desc: peerReviewDescription },
  ]

  return (
    <div
      ref={panelRef}
      className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl transition-[width] duration-200"
      style={{ left: pos.x, top: pos.y, width: PANEL_WIDTH[size], maxHeight: 'calc(100vh - 32px)' }}
    >
      {size === 'icon' && (
        <div className="flex flex-col items-center gap-1.5 overflow-y-auto py-3">
          <button
            {...dragHandleProps}
            title="이동"
            aria-label="패널 이동"
            className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
          >
            <MoveIcon className="h-4 w-4" />
          </button>
          <span className="my-1 h-px w-6 bg-gray-200" />
          {GROUP_1.map((item) => (
            <IconButton key={item.key} item={item} />
          ))}
          <span className="my-1 h-px w-6 bg-gray-200" />
          {GROUP_2.map((item) => (
            <IconButton key={item.key} item={item} />
          ))}
          <span className="my-1 h-px w-6 bg-gray-200" />
          <button
            onClick={() => setSize('chip')}
            title="펼치기"
            aria-label="기준 설정 펼치기"
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {size === 'chip' && (
        <div className="flex flex-col gap-2 overflow-y-auto px-4 py-4">
          <div className="mb-1 flex items-center justify-between">
            <button
              {...dragHandleProps}
              title="이동"
              aria-label="패널 이동"
              className="flex h-6 items-center gap-1.5 rounded-md px-1 text-xs font-bold uppercase tracking-widest text-gray-400 hover:bg-gray-100"
            >
              <MoveIcon className="h-3.5 w-3.5 cursor-grab active:cursor-grabbing" />
              기준 설정
            </button>
            <button
              onClick={() => setSize('icon')}
              title="아이콘으로 접기"
              aria-label="아이콘으로 접기"
              className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-500"
            >
              <ChevronRightIcon className="h-3.5 w-3.5 rotate-180" />
            </button>
          </div>
          {GROUP_1.map((item) => (
            <Chip key={item.key} item={item} />
          ))}
          <span className="my-0.5 h-px w-full bg-gray-100" />
          {GROUP_2.map((item) => (
            <Chip key={item.key} item={item} />
          ))}
          <button
            onClick={() => setSize('full')}
            className="mt-2 w-full rounded-md border border-accent py-1.5 text-center text-xs font-medium text-accent transition-colors hover:bg-orange-50"
          >
            설정 변경 →
          </button>
        </div>
      )}

      {size === 'full' && (
        <div className="flex h-full flex-col overflow-hidden">
          <div
            {...dragHandleProps}
            className="flex shrink-0 cursor-grab items-center justify-between border-b border-gray-200 px-5 py-3 active:cursor-grabbing"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-black">
              <MoveIcon className="h-4 w-4 text-gray-400" />
              기준 설정
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSize('chip')
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="기준 설정 접기"
              className="text-base leading-none text-gray-400 transition-colors hover:text-gray-600"
            >
              ∧
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <p className="text-xs leading-relaxed text-gray-500">
              켜면 반영 비율(0~100%)을 슬라이더로 조절할 수 있습니다. 변경 시 결과가 즉시 재계산됩니다.
            </p>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-400">과제 평가 기준</p>
              <div className="space-y-2">
                {TASK_ITEMS.map(({ key, label, desc }) => {
                  const value = criteria[key] as number
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
                            className="w-full accent-accent"
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
                <div className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-black">기여도</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-400">항상 필수 기준으로 사용됩니다.</p>
                    </div>
                    <Toggle on disabled onChange={() => {}} />
                  </div>
                </div>
                {MEMBER_ITEMS.map(({ key, label, desc }) => {
                  const value = criteria[key] as number
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
                            className="w-full accent-accent"
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

import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import { blendByWeight } from '../utils/calculations'

interface IconProps {
  className?: string
}

function SlidersIcon({ className }: IconProps) {
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

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 18-6-6 6-6" />
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

const CHIP_DEFS: { key: keyof Criteria; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { key: 'performanceGradeWeight', label: '성과등급', Icon: StarIcon },
  { key: 'taskGradeWeight', label: '과제등급', Icon: FlagIcon },
  { key: 'workloadWeight', label: '업무량', Icon: BarsIcon },
  { key: 'personalGradeWeight', label: '개인수행등급', Icon: UserCheckIcon },
  { key: 'peerReviewWeight', label: '피어리뷰', Icon: UsersIcon },
]

type PanelSize = 'icon' | 'chip' | 'full'

const PANEL_WIDTH: Record<PanelSize, number> = { icon: 56, chip: 176, full: 320 }

// App-wide sticky left rail, visible on every tab (데이터/평가하기/결과/면담) so
// criteria can always be checked/adjusted without losing your place. Three
// sizes step progressively: icon-only (narrowest) -> chip list -> full
// toggle+slider panel.
export default function CriteriaPanel() {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const [size, setSize] = useState<PanelSize>('chip')

  function set(key: keyof Criteria, weight: number) {
    dispatch({ type: 'SET_CRITERIA', payload: { [key]: weight } })
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
    { key: 'performanceGradeWeight', label: '성과등급 사용', desc: performanceGradeDescription },
    { key: 'taskGradeWeight', label: '과제등급 사용', desc: taskGradeDescription },
    { key: 'workloadWeight', label: '업무량 사용', desc: workloadDescription },
  ]
  const MEMBER_ITEMS: { key: keyof Criteria; label: string; desc: string }[] = [
    { key: 'personalGradeWeight', label: '개인수행등급', desc: personalGradeDescription },
    { key: 'peerReviewWeight', label: '피어리뷰', desc: peerReviewDescription },
  ]

  return (
    <div
      className="sticky top-[3.25rem] shrink-0 self-start overflow-y-auto border-r border-gray-200 bg-white transition-all duration-300"
      style={{ width: PANEL_WIDTH[size], height: 'calc(100vh - 3.25rem)' }}
    >
      {size === 'icon' && (
        <div className="flex flex-col items-center gap-2.5 py-5">
          <button
            onClick={() => setSize('chip')}
            title="기준 설정 펼치기"
            aria-label="기준 설정 펼치기"
            className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          >
            <SlidersIcon className="h-5 w-5" />
          </button>
          <span className="h-px w-6 bg-gray-200" />
          {CHIP_DEFS.map(({ key, label, Icon }) => {
            const value = criteria[key] as number
            const active = value > 0
            return (
              <button
                key={key}
                onClick={() => setSize('chip')}
                title={`${label} — ${active ? value + '%' : '사용 안 함'}`}
                aria-label={label}
                className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                  active ? 'bg-orange-50 text-accent hover:bg-orange-100' : 'text-gray-300 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      )}

      {size === 'chip' && (
        <div className="flex flex-col gap-2 px-4 py-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">기준 설정</p>
            <button
              onClick={() => setSize('icon')}
              title="아이콘으로 접기"
              aria-label="아이콘으로 접기"
              className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-500"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {CHIP_DEFS.map(({ key, label }) => {
            const value = criteria[key] as number
            const active = value > 0
            return (
              <span
                key={key}
                className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                  active ? 'border-orange-200 bg-orange-50 text-accent' : 'border-gray-200 bg-gray-50 text-gray-400'
                }`}
              >
                {label}
                <span className="font-mono">{active ? `${value}%` : '0%'}</span>
              </span>
            )
          })}
          <button
            onClick={() => setSize('full')}
            className="mt-2 w-full rounded-md border border-accent py-1.5 text-center text-xs font-medium text-accent transition-colors hover:bg-orange-50"
          >
            설정 변경 →
          </button>
        </div>
      )}

      {size === 'full' && (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
            <span className="text-sm font-semibold text-black">기준 설정</span>
            <button
              onClick={() => setSize('chip')}
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
                <div className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-black">기여도</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-400">항상 필수 기준으로 사용됩니다.</p>
                    </div>
                    <Toggle on disabled onChange={() => {}} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

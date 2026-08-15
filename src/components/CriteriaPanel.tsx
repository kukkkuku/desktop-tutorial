import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import { blendByWeight } from '../utils/calculations'

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

const CHIP_DEFS: { key: keyof Criteria; label: string }[] = [
  { key: 'performanceGradeWeight', label: '성과등급' },
  { key: 'taskGradeWeight', label: '과제등급' },
  { key: 'workloadWeight', label: '업무량' },
  { key: 'personalGradeWeight', label: '개인수행등급' },
  { key: 'peerReviewWeight', label: '피어리뷰' },
]

// Sticky left rail within the 평가하기 tab: collapsed shows a compact chip
// list of current weights, expanded shows the full toggle+slider panel --
// so criteria can be checked/adjusted without leaving the matrix/results.
export default function CriteriaPanel() {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const [expanded, setExpanded] = useState(false)

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
      className="shrink-0 self-start overflow-y-auto border-r border-gray-200 bg-white transition-all duration-300"
      style={{ width: expanded ? 320 : 176, height: 'calc(100vh - 3.25rem)' }}
    >
      {!expanded && (
        <div className="flex flex-col gap-2 px-4 py-5">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-400">기준 설정</p>
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
            onClick={() => setExpanded(true)}
            className="mt-2 w-full rounded-md border border-accent py-1.5 text-center text-xs font-medium text-accent transition-colors hover:bg-orange-50"
          >
            설정 변경 →
          </button>
        </div>
      )}

      {expanded && (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
            <span className="text-sm font-semibold text-black">기준 설정</span>
            <button
              onClick={() => setExpanded(false)}
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

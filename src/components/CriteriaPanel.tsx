import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import { blendByWeight } from '../utils/calculations'

interface CriteriaRowProps {
  label: string
  description: string
  weight: number
  onChange: (weight: number) => void
  disabled?: boolean
}

function CriteriaRow({ label, description, weight, onChange, disabled }: CriteriaRowProps) {
  const checked = weight > 0

  function handleToggle() {
    onChange(checked ? 0 : 100)
  }

  return (
    <div className="rounded-lg border border-gray-200 px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-black">{label}</p>
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        </div>
        <button
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={handleToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            checked ? 'bg-accent' : 'bg-gray-300'
          } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {checked && !disabled && (
        <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3">
          <span className="shrink-0 text-xs text-gray-500">반영 비율</span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={weight}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <span className="w-12 shrink-0 text-right text-sm font-semibold text-accent">{weight}%</span>
        </div>
      )}
    </div>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export function CriteriaBadge({ label, weight }: { label: string; weight: number }) {
  const active = weight > 0
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-orange-50 text-accent' : 'bg-gray-100 text-gray-400'
      }`}
    >
      {label} {weight}%
    </span>
  )
}

// Inline, collapsible criteria panel meant to live directly on the 평가
// screen -- so weights can be checked and adjusted right next to the
// matrix/results they affect, instead of navigating to a separate tab.
export default function CriteriaPanel() {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const [expanded, setExpanded] = useState(false)

  function update(payload: Partial<Criteria>) {
    dispatch({ type: 'SET_CRITERIA', payload })
  }

  const w = criteria.performanceGradeWeight
  const performanceGradeDescription =
    w === 0
      ? '사용 안 함 — 모든 과제를 항상 S(100점)로 간주합니다.'
      : `사용 시 성과등급 점수가 100점 기준에서 실제 등급 쪽으로 섞입니다. 지금 비율 기준: S ${fmt(blendByWeight(100, 100, w))} / A ${fmt(blendByWeight(100, 90, w))} / B ${fmt(blendByWeight(100, 80, w))} / C ${fmt(blendByWeight(100, 70, w))} / D ${fmt(blendByWeight(100, 60, w))}점.`

  const tw = criteria.taskGradeWeight
  const taskGradeDescription =
    tw === 0
      ? '사용 안 함 — 모든 과제의 과제등급 점수를 항상 100점으로 간주합니다.'
      : `사용 시 과제등급(중점/핵심/일반/지원) 점수가 100점 기준에서 실제 값 쪽으로 섞입니다. 지금 비율 기준: 중점 ${fmt(blendByWeight(100, 130, tw))} / 핵심 ${fmt(blendByWeight(100, 110, tw))} / 일반 ${fmt(blendByWeight(100, 100, tw))} / 지원 ${fmt(blendByWeight(100, 80, tw))}점.`

  const ww = criteria.workloadWeight
  const workloadDescription =
    ww === 0
      ? '사용 안 함 — 모든 과제의 업무량 계수를 항상 1.0배로 간주합니다.'
      : `사용 시 업무량(대/중/소) 계수가 1.0 기준에서 실제 값 쪽으로 섞입니다. 지금 비율 기준: 대 ${fmt(blendByWeight(1, 1.2, ww))} / 중 ${fmt(blendByWeight(1, 1.0, ww))} / 소 ${fmt(blendByWeight(1, 0.8, ww))}배.`

  const pw = criteria.personalGradeWeight
  const personalGradeDescription =
    pw === 0
      ? '사용 안 함 — 개인수행등급을 입력해도 점수 계산에는 영향을 주지 않습니다(입력값은 보존됩니다).'
      : `사용 시 개인수행등급(S~D) 배율이 1.0 기준에서 실제 값 쪽으로 섞입니다. 지금 비율 기준: S ${fmt(blendByWeight(1, 1.5, pw))} / A ${fmt(blendByWeight(1, 1.2, pw))} / B ${fmt(blendByWeight(1, 1.0, pw))} / C ${fmt(blendByWeight(1, 0.8, pw))} / D ${fmt(blendByWeight(1, 0.6, pw))}배.`

  const rw = criteria.peerReviewWeight
  const peerReviewDescription =
    rw === 0
      ? '사용 안 함 — 피어리뷰를 업로드해도 점수 계산에는 영향을 주지 않습니다.'
      : `사용 시 업로드한 피어리뷰 등급의 평균 배율이 1.0 기준에서 섞입니다. 지금 비율 기준: 평균 등급 S(100점)면 ${fmt(blendByWeight(1, 1.0, rw))}배, D(60점)면 ${fmt(blendByWeight(1, 0.6, rw))}배.`

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-start justify-between gap-4 text-left">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-black">기준 설정</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <CriteriaBadge label="성과등급" weight={criteria.performanceGradeWeight} />
            <CriteriaBadge label="과제등급" weight={criteria.taskGradeWeight} />
            <CriteriaBadge label="업무량" weight={criteria.workloadWeight} />
            <CriteriaBadge label="개인수행등급" weight={criteria.personalGradeWeight} />
            <CriteriaBadge label="피어리뷰" weight={criteria.peerReviewWeight} />
            <CriteriaBadge label="기여도" weight={100} />
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-600">
            켜면 반영 비율(0~100%)을 슬라이더로 세밀하게 조절할 수 있습니다. 변경 시 아래 매트릭스·결과가 즉시
            재계산됩니다.
          </p>

          <div>
            <h4 className="text-xs font-semibold text-gray-500">과제 평가 기준</h4>
            <div className="mt-2 space-y-2">
              <CriteriaRow
                label="성과등급 사용"
                description={performanceGradeDescription}
                weight={criteria.performanceGradeWeight}
                onChange={(weight) => update({ performanceGradeWeight: weight })}
              />
              <CriteriaRow
                label="과제등급 사용"
                description={taskGradeDescription}
                weight={criteria.taskGradeWeight}
                onChange={(weight) => update({ taskGradeWeight: weight })}
              />
              <CriteriaRow
                label="업무량 사용"
                description={workloadDescription}
                weight={criteria.workloadWeight}
                onChange={(weight) => update({ workloadWeight: weight })}
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-500">팀원 평가 기준</h4>
            <div className="mt-2 space-y-2">
              <CriteriaRow
                label="개인수행등급 사용"
                description={personalGradeDescription}
                weight={criteria.personalGradeWeight}
                onChange={(weight) => update({ personalGradeWeight: weight })}
              />
              <CriteriaRow
                label="피어리뷰 사용"
                description={peerReviewDescription}
                weight={criteria.peerReviewWeight}
                onChange={(weight) => update({ peerReviewWeight: weight })}
              />
              <CriteriaRow
                label="기여도"
                description="기여도는 항상 필수 기준으로 사용됩니다."
                weight={100}
                onChange={() => {}}
                disabled
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

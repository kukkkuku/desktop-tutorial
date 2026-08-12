import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import { blendByWeight } from '../utils/calculations'
import ConfirmDialog from './ConfirmDialog'

interface WeightSliderProps {
  label: string
  description: string
  weight: number
  onChange: (weight: number) => void
  disabled?: boolean
}

function WeightSlider({ label, description, weight, onChange, disabled }: WeightSliderProps) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium text-black">{label}</p>
        <span className={`shrink-0 text-sm font-semibold ${disabled ? 'text-gray-400' : 'text-accent'}`}>
          반영 비율 {weight}%
        </span>
      </div>
      <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={weight}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-accent disabled:opacity-50"
      />
    </div>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export default function CriteriaConfiguration() {
  const { state, dispatch } = useAppState()
  const { criteria } = state
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  function update(payload: Partial<Criteria>) {
    dispatch({ type: 'SET_CRITERIA', payload })
  }

  function handleResetConfirm() {
    dispatch({ type: 'RESET_ALL' })
    setResetDialogOpen(false)
  }

  const w = criteria.performanceGradeWeight
  const performanceGradeDescription =
    w === 0
      ? '0%로 설정되어 있어 모든 과제를 항상 S(100점)로 간주하고, 성과등급은 점수에 영향을 주지 않습니다.'
      : `반영 비율에 따라 성과등급 점수가 100점 기준에서 실제 등급 쪽으로 섞입니다. 지금 비율 기준: S ${fmt(blendByWeight(100, 100, w))} / A ${fmt(blendByWeight(100, 90, w))} / B ${fmt(blendByWeight(100, 80, w))} / C ${fmt(blendByWeight(100, 70, w))} / D ${fmt(blendByWeight(100, 60, w))}점.`

  const tw = criteria.taskGradeWeight
  const taskGradeDescription =
    tw === 0
      ? '0%로 설정되어 있어 모든 과제의 과제등급 가중치를 항상 1.0배로 간주합니다.'
      : `과제등급(중점/핵심/일반/지원) 가중치가 1.0 기준에서 실제 값 쪽으로 섞입니다. 지금 비율 기준: 중점 ${fmt(blendByWeight(1, 1.3, tw))} / 핵심 ${fmt(blendByWeight(1, 1.1, tw))} / 일반 ${fmt(blendByWeight(1, 1.0, tw))} / 지원 ${fmt(blendByWeight(1, 0.8, tw))}배.`

  const ww = criteria.workloadWeight
  const workloadDescription =
    ww === 0
      ? '0%로 설정되어 있어 모든 과제의 업무량 계수를 항상 1.0배로 간주합니다.'
      : `업무량(대/중/소) 계수가 1.0 기준에서 실제 값 쪽으로 섞입니다. 지금 비율 기준: 대 ${fmt(blendByWeight(1, 1.2, ww))} / 중 ${fmt(blendByWeight(1, 1.0, ww))} / 소 ${fmt(blendByWeight(1, 0.8, ww))}배.`

  const pw = criteria.personalGradeWeight
  const personalGradeDescription =
    pw === 0
      ? '0%로 설정되어 있어 개인수행등급을 입력해도 점수 계산에는 영향을 주지 않습니다(입력값은 보존됩니다).'
      : `개인수행등급(S~D) 배율이 1.0 기준에서 실제 값 쪽으로 섞입니다. 지금 비율 기준: S ${fmt(blendByWeight(1, 1.5, pw))} / A ${fmt(blendByWeight(1, 1.2, pw))} / B ${fmt(blendByWeight(1, 1.0, pw))} / C ${fmt(blendByWeight(1, 0.8, pw))} / D ${fmt(blendByWeight(1, 0.6, pw))}배.`

  const rw = criteria.peerReviewWeight
  const peerReviewDescription =
    rw === 0
      ? '0%로 설정되어 있어 팀원면담 탭에서 피어리뷰를 업로드해도 점수 계산에는 영향을 주지 않습니다.'
      : `팀원면담 탭에서 업로드한 피어리뷰 등급의 평균 배율이 1.0 기준에서 섞입니다. 지금 비율 기준: 평균 등급 S(100점)면 ${fmt(blendByWeight(1, 1.0, rw))}배, D(60점)면 ${fmt(blendByWeight(1, 0.6, rw))}배.`

  return (
    <div>
      <h2 className="text-xl font-bold text-black">기준 설정</h2>
      <p className="mt-1 text-sm text-gray-600">
        각 기준의 반영 비율(0~100%)을 조절하세요. 0%는 완전히 반영 안 함, 100%는 원래 값을 그대로 반영하는
        것이며, 그 사이 값은 두 값의 중간으로 섞여 반영됩니다. 변경 시 평가 결과가 자동으로 재계산됩니다.
      </p>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-500">과제 평가 기준</h3>
        <div className="mt-2 space-y-2">
          <WeightSlider
            label="성과등급"
            description={performanceGradeDescription}
            weight={criteria.performanceGradeWeight}
            onChange={(weight) => update({ performanceGradeWeight: weight })}
          />
          <WeightSlider
            label="과제등급"
            description={taskGradeDescription}
            weight={criteria.taskGradeWeight}
            onChange={(weight) => update({ taskGradeWeight: weight })}
          />
          <WeightSlider
            label="업무량"
            description={workloadDescription}
            weight={criteria.workloadWeight}
            onChange={(weight) => update({ workloadWeight: weight })}
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-500">팀원 평가 기준</h3>
        <div className="mt-2 space-y-2">
          <WeightSlider
            label="개인수행등급"
            description={personalGradeDescription}
            weight={criteria.personalGradeWeight}
            onChange={(weight) => update({ personalGradeWeight: weight })}
          />
          <WeightSlider
            label="피어리뷰"
            description={peerReviewDescription}
            weight={criteria.peerReviewWeight}
            onChange={(weight) => update({ peerReviewWeight: weight })}
          />
          <WeightSlider label="기여도" description="기여도는 항상 100% 필수 기준으로 사용됩니다." weight={100} onChange={() => {}} disabled />
        </div>
      </div>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-sm font-semibold text-danger">위험 구역</h3>
        <div className="mt-2 flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-red-50 px-4 py-4">
          <div>
            <p className="font-medium text-black">전체 데이터 초기화</p>
            <p className="mt-0.5 text-sm text-gray-600">
              과제, 팀원, 평가 매트릭스 입력값을 모두 삭제하고 빈 상태로 되돌립니다. 되돌릴 수 없으니 필요하다면 먼저
              엑셀로 백업하세요.
            </p>
          </div>
          <button
            onClick={() => setResetDialogOpen(true)}
            className="shrink-0 rounded-md border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger hover:text-white"
          >
            초기화
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        title="전체 데이터 초기화"
        message="과제, 팀원, 평가 매트릭스 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?"
        onConfirm={handleResetConfirm}
        onCancel={() => setResetDialogOpen(false)}
      />
    </div>
  )
}

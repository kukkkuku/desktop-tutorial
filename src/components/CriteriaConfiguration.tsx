import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-4">
      <div>
        <p className="font-medium text-black">{label}</p>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-gray-300'
        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export default function CriteriaConfiguration() {
  const { state, dispatch } = useAppState()
  const { criteria } = state

  function update(payload: Partial<Criteria>) {
    dispatch({ type: 'SET_CRITERIA', payload })
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-black">기준 설정</h2>
      <p className="mt-1 text-sm text-gray-600">
        평가에 반영할 기준을 선택하세요. 변경 시 평가 결과가 자동으로 재계산됩니다.
      </p>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-500">과제 평가 기준</h3>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="성과등급 사용"
            description="사용 안 함 선택 시 모든 과제의 성과등급을 S(100점)로 간주합니다."
            checked={criteria.usePerformanceGrade}
            onChange={(checked) => update({ usePerformanceGrade: checked })}
          />
          <ToggleRow
            label="중요도 사용"
            description="사용 안 함 선택 시 모든 과제의 중요도 가중치를 1.0으로 간주합니다."
            checked={criteria.useImportance}
            onChange={(checked) => update({ useImportance: checked })}
          />
          <ToggleRow
            label="업무량 사용"
            description="사용 안 함 선택 시 모든 과제의 업무량 계수를 1.0으로 간주합니다."
            checked={criteria.useWorkload}
            onChange={(checked) => update({ useWorkload: checked })}
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-500">팀원 평가 기준</h3>
        <div className="mt-2 space-y-2">
          <ToggleRow
            label="개인수행등급 사용"
            description="개인별 수행 등급을 평가에 반영합니다. (현재 버전 준비 중)"
            checked={criteria.usePersonalPerformanceGrade}
            onChange={(checked) => update({ usePersonalPerformanceGrade: checked })}
          />
          <ToggleRow
            label="기여도"
            description="기여도는 항상 필수 기준으로 사용됩니다."
            checked
            disabled
            onChange={() => {}}
          />
        </div>
      </div>
    </div>
  )
}

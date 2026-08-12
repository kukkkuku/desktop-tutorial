import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import ConfirmDialog from './ConfirmDialog'

interface ToggleRowProps {
  label: string
  onDescription: string
  offDescription?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, onDescription, offDescription, checked, disabled, onChange }: ToggleRowProps) {
  const description = checked || !offDescription ? onDescription : offDescription
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-4">
      <div className="min-w-0 flex-1">
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
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
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
            onDescription="과제별 성과등급(S 100 / A 90 / B 80 / C 70 / D 60점)이 점수에 반영됩니다."
            offDescription="모든 과제의 성과등급을 S(100점)로 간주합니다."
            checked={criteria.usePerformanceGrade}
            onChange={(checked) => update({ usePerformanceGrade: checked })}
          />
          <ToggleRow
            label="과제등급 사용"
            onDescription="과제등급(중점 130점 / 핵심 110점 / 일반 100점 / 지원 80점)에 따라 가중치가 곱해집니다. 과제 자체의 전략적 중요도/성격에 따라 점수를 차등 적용합니다."
            offDescription="모든 과제의 과제등급 가중치를 100점으로 간주합니다."
            checked={criteria.useImportance}
            onChange={(checked) => update({ useImportance: checked })}
          />
          <ToggleRow
            label="업무량 사용"
            onDescription="업무량(대 1.2 / 중 1.0 / 소 0.8)에 따라 계수가 곱해집니다."
            offDescription="모든 과제의 업무량 계수를 1.0으로 간주합니다."
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
            onDescription="팀원별 개인수행등급(S 1.5 / A 1.2 / B 1.0 / C 0.8 / D 0.6배)이 점수에 곱해집니다. (현재 버전 준비 중)"
            offDescription="모든 팀원의 개인수행등급 배율을 1.0으로 간주합니다."
            checked={criteria.usePersonalPerformanceGrade}
            onChange={(checked) => update({ usePersonalPerformanceGrade: checked })}
          />
          <ToggleRow
            label="기여도"
            onDescription="기여도는 항상 필수 기준으로 사용됩니다."
            checked
            disabled
            onChange={() => {}}
          />
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

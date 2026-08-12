import { useState } from 'react'

interface AddPeriodModalProps {
  teamName: string
  onSave: (periodName: string) => void
  onClose: () => void
}

export default function AddPeriodModal({ teamName, onSave, onClose }: AddPeriodModalProps) {
  const [periodName, setPeriodName] = useState('')
  const [error, setError] = useState('')

  function handleSubmit() {
    if (!periodName.trim()) {
      setError('평가 기간을 입력하세요.')
      return
    }
    onSave(periodName)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-black">새 기간 추가</h3>
        <p className="mt-1 text-sm text-gray-600">'{teamName}' 팀에 새 평가 기간을 추가합니다.</p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-black">평가 기간</label>
          <input
            type="text"
            value={periodName}
            onChange={(e) => setPeriodName(e.target.value)}
            placeholder="예: 2026 하반기"
            autoFocus
            className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
              error ? 'border-danger' : 'border-gray-300'
            }`}
          />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  )
}

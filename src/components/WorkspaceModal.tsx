import { useState } from 'react'
import type { WorkspaceMeta } from '../types'

interface WorkspaceModalProps {
  initialWorkspace: WorkspaceMeta | null
  onSave: (teamName: string, periodName: string) => void
  onClose: () => void
}

export default function WorkspaceModal({ initialWorkspace, onSave, onClose }: WorkspaceModalProps) {
  const [teamName, setTeamName] = useState(initialWorkspace?.teamName ?? '')
  const [periodName, setPeriodName] = useState(initialWorkspace?.periodName ?? '')
  const [error, setError] = useState('')

  function handleSubmit() {
    if (!teamName.trim()) {
      setError('팀 이름을 입력하세요.')
      return
    }
    if (!periodName.trim()) {
      setError('평가 기간을 입력하세요.')
      return
    }
    onSave(teamName, periodName)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-black">{initialWorkspace ? '평가 정보 수정' : '새 평가 만들기'}</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black">팀 이름</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="예: UX팀"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                error && !teamName.trim() ? 'border-danger' : 'border-gray-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">평가 기간</label>
            <input
              type="text"
              value={periodName}
              onChange={(e) => setPeriodName(e.target.value)}
              placeholder="예: 2026 상반기"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                error && !periodName.trim() ? 'border-danger' : 'border-gray-300'
              }`}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
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
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

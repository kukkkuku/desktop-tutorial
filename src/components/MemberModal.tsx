import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { TeamMember } from '../types'

interface MemberModalProps {
  initialMember: TeamMember | null
  existingNames: string[]
  onSave: (member: TeamMember) => void
  onClose: () => void
}

export default function MemberModal({
  initialMember,
  existingNames,
  onSave,
  onClose,
}: MemberModalProps) {
  const [name, setName] = useState(initialMember?.name ?? '')
  const [active, setActive] = useState(initialMember?.active ?? true)
  const [error, setError] = useState('')

  function handleSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('이름을 입력하세요.')
      return
    }
    if (existingNames.some((n) => n === trimmedName && n !== initialMember?.name)) {
      setError(`팀원명 '${trimmedName}'은(는) 이미 존재합니다.`)
      return
    }
    onSave({
      id: initialMember?.id ?? uuidv4(),
      name: trimmedName,
      active,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-black">{initialMember ? '팀원 수정' : '팀원 추가'}</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 김기정"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                error ? 'border-danger' : 'border-gray-300'
              }`}
            />
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="member-active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="member-active" className="text-sm text-black">
              활성 (사용)
            </label>
          </div>
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

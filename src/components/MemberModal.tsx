import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Level, Position, TeamMember } from '../types'
import { LEVEL_OPTIONS, POSITION_OPTIONS } from '../types'

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
  const [position, setPosition] = useState<Position | ''>(initialMember?.position ?? '')
  const [level, setLevel] = useState<Level | ''>(initialMember?.level ?? '')
  const [yearsOfService, setYearsOfService] = useState(
    initialMember?.yearsOfService != null ? String(initialMember.yearsOfService) : '',
  )
  const [role, setRole] = useState(initialMember?.role ?? '')
  const [comment, setComment] = useState(initialMember?.comment ?? '')
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
      position,
      level,
      yearsOfService: yearsOfService.trim() === '' ? null : Number(yearsOfService),
      role: role.trim(),
      comment: comment.trim(),
    })
  }

  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel max-w-sm">
        <h3 className="ui-modal-title">{initialMember ? '팀원 수정' : '팀원 추가'}</h3>

        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="ui-label">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 홍길동"
              className={`ui-field ${
                error ? 'border-danger' : 'border-gray-300'
              }`}
            />
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ui-label">직책</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as Position | '')}
                className="ui-field"
              >
                <option value="">-</option>
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label">직급</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Level | '')}
                className="ui-field"
              >
                <option value="">-</option>
                {LEVEL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ui-label">연차</label>
              <input
                type="number"
                min={0}
                value={yearsOfService}
                onChange={(e) => setYearsOfService(e.target.value)}
                placeholder="예: 3"
                className="ui-field"
              />
            </div>
            <div>
              <label className="ui-label">역할</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="예: 기획, 디자인, 개발"
                className="ui-field"
              />
            </div>
          </div>

          <div>
            <label className="ui-label">코멘트</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="팀원에 대한 코멘트를 남겨보세요 (선택)"
              rows={2}
              className="ui-field"
            />
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

        <div className="ui-modal-actions">
          <button
            onClick={onClose}
            className="ui-button ui-button-secondary"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className="ui-button ui-button-primary"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

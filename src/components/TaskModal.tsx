import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Criteria, Importance, PerformanceGrade, Task, Workload } from '../types'
import { IMPORTANCE_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'

interface TaskModalProps {
  initialTask: Task | null
  existingNames: string[]
  onSave: (task: Task) => void
  onClose: () => void
  criteria: Criteria
}

export default function TaskModal({ initialTask, existingNames, onSave, onClose, criteria }: TaskModalProps) {
  const [name, setName] = useState(initialTask?.name ?? '')
  const [importance, setImportance] = useState<Importance>(initialTask?.importance ?? '일반')
  const [performanceGrade, setPerformanceGrade] = useState<PerformanceGrade>(
    initialTask?.performanceGrade ?? 'B',
  )
  const [workload, setWorkload] = useState<Workload>(initialTask?.workload ?? '중')
  const [objective, setObjective] = useState(initialTask?.objective ?? '')
  const [achievement, setAchievement] = useState(initialTask?.achievement ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    const trimmedName = name.trim()

    if (!trimmedName) {
      newErrors.name = '과제명을 입력하세요.'
    } else if (
      existingNames.some(
        (n) => n === trimmedName && n !== initialTask?.name,
      )
    ) {
      newErrors.name = `과제명 '${trimmedName}'은(는) 이미 존재합니다.`
    }

    if (!objective.trim()) {
      newErrors.objective = '목표를 입력하세요.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit() {
    if (!validate()) return
    onSave({
      id: initialTask?.id ?? uuidv4(),
      name: name.trim(),
      importance,
      performanceGrade,
      workload,
      objective: objective.trim(),
      achievement: achievement.trim(),
    })
  }

  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel max-w-md">
        <h3 className="ui-modal-title">{initialTask ? '과제 수정' : '과제 추가'}</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="ui-label">과제명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: CloudX"
              className={`ui-field ${
                errors.name ? 'border-danger' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
          </div>

          <div>
            <label className="ui-label">과제등급</label>
            <select
              disabled={criteria.taskGradeWeight === 0}
              value={importance}
              onChange={(e) => setImportance(e.target.value as Importance)}
              className="ui-field disabled:bg-gray-100 disabled:text-gray-400"
            >
              {IMPORTANCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">성과등급</label>
            <select
              disabled={criteria.performanceGradeWeight === 0}
              value={performanceGrade}
              onChange={(e) => setPerformanceGrade(e.target.value as PerformanceGrade)}
              className="ui-field disabled:bg-gray-100 disabled:text-gray-400"
            >
              {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">업무량</label>
            <select
              disabled={criteria.workloadWeight === 0}
              value={workload}
              onChange={(e) => setWorkload(e.target.value as Workload)}
              className="ui-field disabled:bg-gray-100 disabled:text-gray-400"
            >
              {WORKLOAD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ui-label">목표</label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="과제의 목표를 입력하세요"
              rows={3}
              className={`ui-field ${
                errors.objective ? 'border-danger' : 'border-gray-300'
              }`}
            />
            {errors.objective && <p className="mt-1 text-xs text-danger">{errors.objective}</p>}
          </div>

          <div>
            <label className="ui-label">성과</label>
            <textarea
              value={achievement}
              onChange={(e) => setAchievement(e.target.value)}
              placeholder="실제 달성한 성과를 입력하세요 (선택)"
              rows={2}
              className="ui-field"
            />
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

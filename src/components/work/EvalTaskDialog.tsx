// 과제관리에서 고른 L3로 평가 과제를 만든다.
//   - 하나씩: L3마다 평가 과제 1개. 과제등급 = 그 L3의 분류(시트 값).
//   - 묶어서: 고른 L3 전체로 평가 과제 1개. 이름과 과제등급은 팀장이 정한다.
// 성과등급은 비워 둔다(null) -- 팀장이 평가과제에서 매긴다(docs/DATA-MODEL.md).
// 참여자는 연결된 L3들의 담당자(팀원 목록에 있는 사람)이고 기여도는 똑같이 나눈다.

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Importance, Task, WorkItem } from '../../types'
import { IMPORTANCE_OPTIONS } from '../../types'
import Button from '../Button'

interface Props {
  mode: 'single' | 'group'
  items: WorkItem[]
  onCancel: () => void
  onCreate: (tasks: Task[], participants: Record<string, string[]>) => void
}

function newTask(name: string, importance: Importance, items: WorkItem[]): Task {
  return {
    id: uuidv4(),
    name,
    importance,
    performanceGrade: null,
    workload: '중',
    objective: '',
    achievement: '',
    workItemIds: items.map((i) => i.id),
  }
}

function participantsOf(items: WorkItem[]): string[] {
  return Array.from(new Set(items.flatMap((i) => i.assigneeIds)))
}

export default function EvalTaskDialog({ mode, items, onCancel, onCreate }: Props) {
  const counts = IMPORTANCE_OPTIONS.map((opt) => ({ opt, n: items.filter((i) => i.category === opt).length }))
  const uncategorized = items.filter((i) => !i.category)
  const [name, setName] = useState(() => (items.length > 1 ? `${items[0].name} 외 ${items.length - 1}건` : items[0]?.name ?? ''))
  // 묶음의 과제등급은 앱이 고르지 않는다 -- 팀장이 고르기 전에는 비어 있다.
  const [groupGrade, setGroupGrade] = useState<Importance | ''>('')
  // 하나씩 만들 때 분류가 비어 있는 L3의 과제등급
  const [fallbackGrade, setFallbackGrade] = useState<Importance | ''>('')

  const canCreate = mode === 'group' ? name.trim() !== '' && groupGrade !== '' : uncategorized.length === 0 || fallbackGrade !== ''

  function create() {
    if (!canCreate) return
    if (mode === 'group') {
      const task = newTask(name.trim(), groupGrade as Importance, items)
      onCreate([task], { [task.id]: participantsOf(items) })
      return
    }
    const tasks: Task[] = []
    const participants: Record<string, string[]> = {}
    for (const item of items) {
      const task = newTask(item.name || '(이름 없는 L3)', (item.category ?? fallbackGrade) as Importance, [item])
      tasks.push(task)
      participants[task.id] = participantsOf([item])
    }
    onCreate(tasks, participants)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-black">{mode === 'group' ? `L3 ${items.length}건을 평가 과제 1개로 묶기` : `L3 ${items.length}건을 각각 평가 과제로`}</h3>
        <p className="mt-1 text-sm text-gray-600">
          성과등급은 비워 두고, 평가과제 탭에서 팀장이 매깁니다. 기여도는 L3 담당자끼리 똑같이 나눠 둡니다(평가하기에서 조정).
        </p>

        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[#F7F8FA] p-3 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              <span className={`shrink-0 rounded px-1.5 text-[11px] font-bold leading-5 ${i.category ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-700'}`}>
                {i.category ?? '분류 없음'}
              </span>
              <span className="truncate">{i.name || '(이름 없음)'}</span>
            </li>
          ))}
        </ul>

        {mode === 'group' ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-black">
              평가 과제 이름
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" autoFocus />
            </label>
            <label className="block text-sm font-medium text-black">
              과제등급
              <select value={groupGrade} onChange={(e) => setGroupGrade(e.target.value as Importance | '')} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">고르세요</option>
                {IMPORTANCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-gray-500">
                묶은 L3의 분류: {counts.filter((c) => c.n > 0).map((c) => `${c.opt} ${c.n}`).join(' · ') || '없음'}
                {uncategorized.length > 0 && ` · 분류 없음 ${uncategorized.length}`}
              </span>
            </label>
          </div>
        ) : (
          uncategorized.length > 0 && (
            <label className="mt-4 block text-sm font-medium text-black">
              분류가 비어 있는 L3 {uncategorized.length}건의 과제등급
              <select value={fallbackGrade} onChange={(e) => setFallbackGrade(e.target.value as Importance | '')} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">고르세요</option>
                {IMPORTANCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-gray-500">나머지는 시트의 분류(과제/일반/일상)를 그대로 과제등급으로 씁니다.</span>
            </label>
          )
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button variant="primary" onClick={create} disabled={!canCreate}>
            {mode === 'group' ? '묶어서 만들기' : `평가 과제 ${items.length}개 만들기`}
          </Button>
        </div>
      </div>
    </div>
  )
}

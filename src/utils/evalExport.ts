// 과제관리 → 평가과제 내보내기. 체크한 L3를 "내보낼 단위"로 모은다.
//   - 평가과제 열(evalGroup)이 같은 L3끼리 = 평가과제 1개 (보드 전체에서 같은 이름)
//   - 평가과제 열이 빈 L3 = 그 L3 하나로 평가과제 1개
// 과제등급은 묶인 L3의 분류가 모두 같을 때만 그 값을 쓰고, 섞였거나 비었으면 null --
// 앱이 고르지 않고 팀장이 고른다(docs/DATA-MODEL.md). 성과등급은 비워 둔다(null).

import { v4 as uuidv4 } from 'uuid'
import type { Importance, Task, WorkBoard, WorkItem } from '../types'
import { evalGroupOf } from './workBoard'

export interface ExportUnit {
  key: string
  name: string
  items: WorkItem[]
  grade: Importance | null // 분류에서 정해진 값. null이면 팀장이 골라야 함
  mixed: boolean // 분류가 섞였는지(안내용)
}

export function unitKeyOf(item: WorkItem): string {
  const g = evalGroupOf(item)
  return g ? `g:${g}` : `i:${item.id}`
}

export function exportUnits(board: WorkBoard, checkedIds: Set<string>, exported: Set<string>): ExportUnit[] {
  const units = new Map<string, ExportUnit>()
  for (const item of board.items) {
    if (!checkedIds.has(item.id) || exported.has(item.id)) continue
    const key = unitKeyOf(item)
    if (units.has(key)) continue
    const g = evalGroupOf(item)
    const items = g ? board.items.filter((i) => evalGroupOf(i) === g && !exported.has(i.id)) : [item]
    const cats = new Set(items.map((i) => i.category))
    const only = cats.size === 1 ? [...cats][0] : null
    units.set(key, { key, name: g || item.name || '(이름 없는 L3)', items, grade: only ?? null, mixed: cats.size > 1 })
  }
  return [...units.values()]
}

export function unitsToTasks(units: ExportUnit[], grades: Record<string, Importance>): { tasks: Task[]; participants: Record<string, string[]> } {
  const tasks: Task[] = []
  const participants: Record<string, string[]> = {}
  for (const u of units) {
    const importance = u.grade ?? grades[u.key]
    if (!importance) continue
    const task: Task = {
      id: uuidv4(),
      name: u.name,
      importance,
      performanceGrade: null,
      workload: '중',
      objective: '',
      achievement: '',
      workItemIds: u.items.map((i) => i.id),
    }
    tasks.push(task)
    participants[task.id] = Array.from(new Set(u.items.flatMap((i) => i.assigneeIds)))
  }
  return { tasks, participants }
}

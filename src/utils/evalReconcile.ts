// 과제리스트(L3 · 묶음) → 평가과제 맞추기.
// 과제리스트의 "평가 대상" 단위(묶음 하나 또는 묶이지 않은 L3 하나) = 평가과제 하나.
// 평가과제가 가리키는 L3가 들어 있는 단위가 곧 평가 대상이다(따로 켜 둔 표시를 두지 않는다 --
// 예전에 내보낸 평가과제도 그대로 평가 대상으로 보인다).
// 과제리스트에서 묶거나 풀거나 이름 · 분류를 바꾸면 평가과제를 다음처럼 맞춘다.
//   - 이름 = 묶음 이름(낱개면 L3 이름), 과제등급 = 단위의 분류가 모두 같을 때 그 값(섞였으면 그대로)
//   - 한 단위에 평가과제가 둘 이상 = 평가 대상끼리 묶음: 첫 과제로 합친다(MERGE_TASKS와 같은 규칙)
//   - 한 평가과제가 여러 단위에 걸침 = 묶음을 풀었음: L3가 가장 많이 남은 단위(같으면 묶음)에 남고, 나머지 단위는 새 평가과제
//   - L3가 모두 과제리스트에서 지워진 평가과제는 등급 · 기여도를 잃지 않게 그대로 둔다
// 성과등급 · 목표 · 성과 · 기여도는 평가 화면에서 고친 값을 지킨다. 기여도는 L3가 바뀐 과제만 담당자에 맞춘다.
import { v4 as uuidv4 } from 'uuid'
import { IMPORTANCE_OPTIONS } from '../types'
import type { AppState, Importance, Task, WorkItem } from '../types'
import { evalGroupOf } from './workBoard'
import { syncContributionsToAssignees } from './assigneeSync'

export interface EvalUnit {
  key: string
  name: string
  items: WorkItem[]
  grade: Importance | null // 단위의 분류가 모두 같고 과제등급 값이면 그 값
}

export function unitKeyOf(item: WorkItem): string {
  const g = evalGroupOf(item)
  return g ? `g:${g}` : `i:${item.id}`
}

export function unitGrade(items: WorkItem[]): Importance | null {
  const cats = new Set(items.map((i) => i.category))
  const only = cats.size === 1 ? [...cats][0] : null
  return only && (IMPORTANCE_OPTIONS as string[]).includes(only) ? (only as Importance) : null
}

// 묶음에 정해 둔 분류가 과제등급 값이면 그것
function storedGrade(grades: Record<string, string> | undefined, name: string): Importance | null {
  const v = grades?.[name]
  return v && (IMPORTANCE_OPTIONS as string[]).includes(v) ? (v as Importance) : null
}

// 보드 순서대로 단위 목록. 묶음은 묶음 분류(evalGroupGrades)가 있으면 그것, 없으면 하위가 모두 같을 때 그 값.
export function evalUnits(items: WorkItem[], groupGrades?: Record<string, string>): Map<string, EvalUnit> {
  const units = new Map<string, EvalUnit>()
  for (const item of items) {
    const key = unitKeyOf(item)
    const u = units.get(key)
    if (u) u.items.push(item)
    else units.set(key, { key, name: evalGroupOf(item) || item.name || '(이름 없는 L3)', items: [item], grade: null })
  }
  for (const u of units.values()) u.grade = (u.key.startsWith('g:') ? storedGrade(groupGrades, u.name) : null) ?? unitGrade(u.items)
  return units
}

type Reduce = (s: AppState, a: { type: 'MERGE_TASKS'; payload: { ids: string[] } }) => AppState

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function reconcileEvalTasks(state: AppState, reduce: Reduce): AppState {
  const items = state.workBoard.items
  if (!state.tasks.some((t) => t.workItemIds?.length)) return state
  const units = evalUnits(items, state.workBoard.evalGroupGrades)
  const keyOf = new Map(items.map((i) => [i.id, unitKeyOf(i)]))

  // 평가과제마다 첫 L3의 단위(= 그 과제가 남을 단위)와 걸친 단위들
  const claim = new Map<string, string[]>() // 단위 → 평가과제 id(과제 순서)
  const touchedBy = new Map<string, Task>() // 단위 → 처음 걸친 평가과제
  for (const t of state.tasks) {
    const live = (t.workItemIds ?? []).filter((id) => keyOf.has(id))
    if (!live.length) continue
    // 남을 단위: L3가 가장 많이 든 단위, 같으면 묶음, 그래도 같으면 앞 L3의 단위
    const count = new Map<string, number>()
    for (const id of live) count.set(keyOf.get(id)!, (count.get(keyOf.get(id)!) ?? 0) + 1)
    const home = [...count.keys()].sort((x, y) => count.get(y)! - count.get(x)! || Number(y.startsWith('g:')) - Number(x.startsWith('g:')))[0]
    claim.set(home, [...(claim.get(home) ?? []), t.id])
    for (const id of live) {
      const k = keyOf.get(id)!
      if (!touchedBy.has(k)) touchedBy.set(k, t)
    }
  }

  let s = state
  // 한 단위에 평가과제가 여럿 → 합치기
  for (const ids of claim.values()) if (ids.length > 1) s = reduce(s, { type: 'MERGE_TASKS', payload: { ids } })
  const homeOf = new Map<string, EvalUnit>() // 평가과제 id → 단위
  for (const [k, ids] of claim) homeOf.set(ids[0], units.get(k)!)

  // 이름은 겹치지 않게(과제리스트와 이어지지 않은 과제 이름을 먼저 잡아 둔다)
  const taken = new Set(s.tasks.filter((t) => !homeOf.has(t.id)).map((t) => t.name))
  const uniq = (n: string) => {
    let v = n
    for (let k = 2; taken.has(v); k++) v = `${n} (${k})`
    taken.add(v)
    return v
  }
  // 단위 순서(보드 순서)대로 이름을 정해야 결과가 흔들리지 않는다
  const nameOf = new Map<string, string>()
  const newUnits: EvalUnit[] = []
  for (const u of units.values()) {
    if (claim.has(u.key)) nameOf.set(u.key, uniq(u.name))
    else if (touchedBy.has(u.key)) {
      nameOf.set(u.key, uniq(u.name))
      newUnits.push(u)
    }
  }

  const changed = new Set<string>()
  let tasksChanged = false
  const tasks = s.tasks.map((t) => {
    const u = homeOf.get(t.id)
    if (!u) return t
    const dead = (t.workItemIds ?? []).filter((id) => !keyOf.has(id))
    const workItemIds = [...u.items.map((i) => i.id), ...dead]
    const name = nameOf.get(u.key)!
    const importance = u.grade ?? t.importance
    const idsChanged = !sameList(workItemIds, t.workItemIds ?? [])
    if (!idsChanged && name === t.name && importance === t.importance) return t
    if (idsChanged) changed.add(t.id)
    tasksChanged = true
    return { ...t, workItemIds, name, importance }
  })
  if (tasksChanged) s = { ...s, tasks }

  // 묶음을 풀어 떨어져 나온 단위 → 새 평가과제(기여도는 담당자끼리 똑같이)
  if (newUnits.length) {
    const extra: Task[] = newUnits.map((u) => {
      const from = touchedBy.get(u.key)!
      return {
        id: uuidv4(),
        name: nameOf.get(u.key)!,
        importance: u.grade ?? from.importance,
        performanceGrade: null,
        workload: from.workload,
        objective: '',
        achievement: '',
        workItemIds: u.items.map((i) => i.id),
      }
    })
    for (const t of extra) changed.add(t.id)
    s = { ...s, tasks: [...s.tasks, ...extra] }
  }

  if (changed.size) {
    const only = s.tasks.filter((t) => changed.has(t.id))
    s = { ...s, contributions: syncContributionsToAssignees({ ...s, tasks: only }, items) }
  }
  return s
}

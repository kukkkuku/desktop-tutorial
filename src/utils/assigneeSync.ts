// 평가과제 기여도를 과제리스트(L3) 담당자에 맞춘다.
// 평가과제로 내보낼 때 담당자끼리 기여도를 똑같이 나눴는데, 그 뒤 과제리스트에서 담당자를 바꾸면
// 평가하기 · 참여 인원 · 과제별 피어리뷰에 반영되지 않던 문제를 고친다.
//   - 기여도가 아직 "담당자끼리 똑같이 나눈 그대로"면: 새 담당자끼리 다시 똑같이 나눈다.
//   - 팀장이 기여도를 고쳤으면: 새 담당자는 똑같이 나눈 몫을 받고, 빠진 담당자는 0 -- 합이 100이 아니면
//     평가하기가 알려 주므로 팀장이 맞춘다(고친 값은 지우지 않는다).
import type { AppState, Contribution, Task, WorkItem } from '../types'

export function evenShares(count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(100 / count)
  const remainder = 100 - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

// 평가과제에 묶인 L3들의 담당자(활성 팀원만, 처음 나온 순서)
export function assigneesOf(task: Pick<Task, 'workItemIds'>, items: WorkItem[], activeIds: Set<string>): string[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const out: string[] = []
  for (const id of task.workItemIds ?? []) for (const a of byId.get(id)?.assigneeIds ?? []) if (activeIds.has(a) && !out.includes(a)) out.push(a)
  return out
}

// 지금 기여도가 0보다 큰 사람(= 참여자)
function participantsOf(taskId: string, contributions: Contribution[]): string[] {
  return contributions.filter((c) => c.taskId === taskId && c.contributionPercent > 0).map((c) => c.memberId)
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

// ids 순서로 똑같이 나눈 값과 지금 값이 같은가(담당자 기준 그대로인가)
function isEvenSplit(taskId: string, ids: string[], contributions: Contribution[]): boolean {
  const shares = evenShares(ids.length)
  const mine = contributions.filter((c) => c.taskId === taskId && c.contributionPercent > 0)
  if (mine.length !== ids.length) return false
  const sorted = [...mine.map((c) => c.contributionPercent)].sort((x, y) => x - y)
  return sorted.join(',') === [...shares].sort((x, y) => x - y).join(',')
}

// 한 과제의 기여도를 담당자에 맞춘 새 기여도 목록. 바뀐 게 없으면 그대로 돌려준다.
function syncTask(task: Task, want: string[], contributions: Contribution[], activeIds: Set<string>): Contribution[] {
  const have = participantsOf(task.id, contributions)
  if (!want.length || sameSet(have, want)) return contributions
  const untouched = have.length === 0 || isEvenSplit(task.id, have, contributions)
  const shares = evenShares(want.length)
  const next = new Map<string, number>()
  if (untouched) want.forEach((id, i) => next.set(id, shares[i]))
  else {
    for (const c of contributions)
      if (c.taskId === task.id && want.includes(c.memberId) && c.contributionPercent > 0) next.set(c.memberId, c.contributionPercent)
    const share = Math.round(100 / want.length)
    for (const id of want) if (!next.has(id)) next.set(id, share)
  }
  const rest = contributions.filter((c) => c.taskId !== task.id)
  const mine = contributions.filter((c) => c.taskId === task.id)
  const rows: Contribution[] = mine.map((c) => ({ ...c, contributionPercent: next.get(c.memberId) ?? 0, isAutoDistributed: false }))
  for (const id of activeIds)
    if (!rows.some((r) => r.memberId === id))
      rows.push({ taskId: task.id, memberId: id, contributionPercent: next.get(id) ?? 0, personalPerformanceGrade: null, isAutoDistributed: false })
  return [...rest, ...rows]
}

// L3에서 온 모든 평가과제를 담당자에 맞춘다. prevItems가 있으면 담당자가 바뀐 과제만(보드를 고쳤을 때).
export function syncContributionsToAssignees(
  state: Pick<AppState, 'tasks' | 'members' | 'contributions'>,
  items: WorkItem[],
  prevItems?: WorkItem[],
): Contribution[] {
  const activeIds = new Set(state.members.filter((m) => m.active).map((m) => m.id))
  let contributions = state.contributions
  for (const task of state.tasks) {
    if (!task.workItemIds?.length) continue
    const want = assigneesOf(task, items, activeIds)
    if (prevItems && sameSet(assigneesOf(task, prevItems, activeIds), want)) continue
    contributions = syncTask(task, want, contributions, activeIds)
  }
  return contributions
}

// 담당자와 참여자가 다른 평가과제(평가하기에서 알려 주고 한 번에 맞추기)
export function tasksOutOfSync(state: Pick<AppState, 'tasks' | 'members' | 'contributions' | 'workBoard'>): Task[] {
  const activeIds = new Set(state.members.filter((m) => m.active).map((m) => m.id))
  return state.tasks.filter((t) => {
    if (!t.workItemIds?.length) return false
    const want = assigneesOf(t, state.workBoard.items, activeIds)
    return want.length > 0 && !sameSet(participantsOf(t.id, state.contributions), want)
  })
}

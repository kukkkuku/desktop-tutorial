// 팀원의 여러 평가기간(워크스페이스)에 걸친 성과 히스토리 — 기존 평가 계산 함수를
// 그대로 재사용하고, 별도로 데이터를 입력/저장하지 않는다. 같은 팀(teamName)의
// 다른 기간 워크스페이스는 createWorkspace의 copyMembers 동작 덕분에 팀원 id가
// 그대로 유지되므로, 각 기간의 저장된 상태를 순회하며 동일 memberId를 찾아 재사용한다.
import type { AppState, EvaluationGrade, Importance, PerformanceGrade, WorkspaceMeta } from '../types'
import { workspaceStateKey } from '../state/WorkspaceContext'
import { calcAllTaskScores, calcMemberResults, getContribution, getEffectiveContributionPercent } from './calculations'

export interface MemberPeriodTaskEntry {
  taskId: string
  taskName: string
  importance: Importance
  contributionPercent: number
  personalGrade: PerformanceGrade
  personalScore: number
}

export interface MemberPeriodHistory {
  workspace: WorkspaceMeta
  rank: number | null
  cumulativeScore: number | null
  grade: EvaluationGrade | null
  tasks: MemberPeriodTaskEntry[]
}

function loadWorkspaceState(workspaceId: string): AppState | null {
  try {
    const raw = localStorage.getItem(workspaceStateKey(workspaceId))
    if (!raw) return null
    return JSON.parse(raw) as AppState
  } catch {
    return null
  }
}

// 최근 기간이 먼저 오도록 정렬해 반환한다.
export function getMemberPerformanceHistory(memberId: string, periods: WorkspaceMeta[]): MemberPeriodHistory[] {
  const sortedPeriods = [...periods].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.periodName.localeCompare(b.periodName),
  )

  const out: MemberPeriodHistory[] = []
  for (const workspace of sortedPeriods) {
    const state = loadWorkspaceState(workspace.id)
    if (!state) continue
    const member = state.members.find((m) => m.id === memberId)
    if (!member) continue

    const taskScores = calcAllTaskScores(state.tasks, state.criteria)
    const results = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
    const idx = results.findIndex((r) => r.member.id === memberId)
    const row = idx >= 0 ? results[idx] : null

    const tasks: MemberPeriodTaskEntry[] = []
    for (const { task, score } of taskScores) {
      const contribution = getContribution(state.contributions, task.id, memberId)
      if (!contribution || contribution.contributionPercent <= 0) continue
      const effectivePercent = getEffectiveContributionPercent(
        state.contributions,
        task.id,
        memberId,
        state.criteria.contributionWeight,
      )
      tasks.push({
        taskId: task.id,
        taskName: task.name,
        importance: task.importance,
        contributionPercent: contribution.contributionPercent,
        personalGrade: contribution.personalPerformanceGrade,
        personalScore: score * (effectivePercent / 100),
      })
    }
    tasks.sort((a, b) => b.personalScore - a.personalScore)

    out.push({
      workspace,
      rank: idx >= 0 ? idx + 1 : null,
      cumulativeScore: row?.cumulativeScore ?? null,
      grade: row?.grade ?? null,
      tasks,
    })
  }

  return out.reverse()
}

// 팀원의 여러 평가기간(워크스페이스)에 걸친 성과 히스토리 — 기존 평가 계산 함수를
// 그대로 재사용하고, 별도로 데이터를 입력/저장하지 않는다. 같은 팀(teamName)의
// 다른 기간 워크스페이스는 createWorkspace의 copyMembers 동작 덕분에 팀원 id가
// 그대로 유지되므로, 각 기간의 저장된 상태를 순회하며 동일 memberId를 찾아 재사용한다.
import type { AppState, EvaluationGrade, Importance, PerformanceGrade, WorkspaceMeta } from '../types'
import { workspaceStateKey } from '../state/WorkspaceContext'
import {
  calcAllTaskScores,
  calcEvaluationGrade,
  calcExpectedScore,
  calcMemberCumulativeScore,
  calcMemberResults,
  calcPeerReviewFactor,
  getContribution,
  getEffectiveContributionPercent,
} from './calculations'

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
    let row: { cumulativeScore: number; grade: EvaluationGrade } | null = idx >= 0 ? results[idx] : null

    // calcMemberResults는 그 기간 스냅샷에서 비활성으로 저장된 팀원은 아예
    // 제외한다(순위표에는 맞는 동작). 하지만 고과 추이는 "그 기간에 실제로
    // 평가됐는지"가 기준이어야 하므로, 활성 팀원 코호트로 계산한 기대점수를
    // 그대로 써서 점수/등급을 별도로 구해 트렌드에서 누락되지 않게 한다.
    if (!row && member.active === false) {
      const rawCumulativeScore = calcMemberCumulativeScore(member, taskScores, state.contributions, state.criteria)
      const peerReviewFactor = calcPeerReviewFactor(state.peerReviews, member.id, state.criteria)
      const cumulativeScore = rawCumulativeScore * peerReviewFactor
      const expectedScore = calcExpectedScore(results.map((r) => r.cumulativeScore))
      const ratio = expectedScore > 0 ? cumulativeScore / expectedScore : 0
      row = { cumulativeScore, grade: calcEvaluationGrade(ratio) }
    }

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

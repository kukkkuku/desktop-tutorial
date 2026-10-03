import type { WorkspaceMeta } from '../types'
import { workspaceStateKey } from '../state/WorkspaceContext'

// 평가 목록의 팀 이름 바꾸기: 그 팀의 모든 평가 + 팀원 담당팀까지(안 그러면 모두 "다른 팀"으로 보인다)
export function renameEvalTeam(
  workspaces: WorkspaceMeta[],
  renameWorkspace: (id: string, teamName: string, periodName: string) => void,
  from: string,
  to: string,
) {
  for (const ws of workspaces.filter((w) => w.teamName === from)) {
    renameWorkspace(ws.id, to, ws.periodName)
    try {
      const key = workspaceStateKey(ws.id)
      const raw = localStorage.getItem(key)
      if (raw) {
        const st = JSON.parse(raw)
        if (Array.isArray(st.members) && st.members.some((m: { team?: string }) => m.team === from)) {
          st.members = st.members.map((m: { team?: string }) => (m.team === from ? { ...m, team: to } : m))
          localStorage.setItem(key, JSON.stringify(st))
        }
      }
    } catch {
      // 팀원 담당팀을 못 고쳐도 팀 이름은 바뀐다
    }
  }
}

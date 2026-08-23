import { accountScope } from './accountScope'

// 계정 분리 이전(스코프 없이) 쓰던 원래 키. 마이그레이션에서 옛 데이터를
// 찾아낼 때만 이 상수들을 직접 쓴다 -- 그 외에는 항상 아래의 스코프가
// 붙은 키 생성 함수를 쓴다.
export const LEGACY_WORKSPACES_KEY = 'ux-performance-evaluation-workspaces'
export const LEGACY_CURRENT_KEY = 'ux-performance-evaluation-current-workspace'
export const LEGACY_CYCLE_PREF_KEY = 'ux-performance-evaluation-cycle-pref'
export const LEGACY_WORKSPACE_STATE_PREFIX = 'ux-performance-evaluation-workspace-'
export const LEGACY_TEAM_PROFILE_PREFIX = 'ux-performance-evaluation-team-'

export function workspacesKey(scope: string = accountScope()): string {
  return `${LEGACY_WORKSPACES_KEY}:${scope}`
}

export function currentWorkspaceKey(scope: string = accountScope()): string {
  return `${LEGACY_CURRENT_KEY}:${scope}`
}

export function cyclePreferenceKey(scope: string = accountScope()): string {
  return `${LEGACY_CYCLE_PREF_KEY}:${scope}`
}

export function workspaceStateKey(id: string, scope: string = accountScope()): string {
  return `${LEGACY_WORKSPACE_STATE_PREFIX}${scope}:${id}`
}

export function teamProfileKey(teamName: string, scope: string = accountScope()): string {
  return `${LEGACY_TEAM_PROFILE_PREFIX}${scope}:${teamName}`
}

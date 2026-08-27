import { v4 as uuidv4 } from 'uuid'
import type { WorkspaceMeta } from '../types'
import { isUntouchedLegacySample, migrateAppState } from './migrate'
import { accountScope, ANONYMOUS_SCOPE } from './accountScope'
import {
  LEGACY_CURRENT_KEY,
  LEGACY_CYCLE_PREF_KEY,
  LEGACY_TEAM_PROFILE_PREFIX,
  LEGACY_WORKSPACES_KEY,
  LEGACY_WORKSPACE_STATE_PREFIX,
  currentWorkspaceKey,
  cyclePreferenceKey,
  teamProfileKey,
  workspaceStateKey,
  workspacesKey,
} from './storageKeys'

// 워크스페이스 개념 자체가 생기기 전, 단 하나의 평가만 저장하던 가장 오래된
// 형식. 계정 분리 이전에도 이미 있었던 이관 대상이라 여기서도 그대로 챙긴다.
const OLD_SINGLE_STATE_KEY = 'ux-performance-evaluation-state'
const MIGRATION_FLAG = 'ux-performance-evaluation-legacy-migrated-once'

// 이 앱은 원래 계정 구분 없이 브라우저 하나에 데이터 하나만 저장했다.
// 저장 키를 계정별로 분리한 뒤, 이 브라우저에서 처음 로그인하는 계정
// 하나에게만(그 사람이 원래 이 브라우저를 쓰던 사람일 가능성이 가장
// 높다) 옛 데이터를 옮겨준다. 한 번 옮기고 나면 다시는 옮기지 않는다 --
// 그러면 나중에 다른 계정이 로그인했을 때도 첫 계정 데이터를 그대로
// 이어받아버려서 "계정별 분리"가 무의미해지기 때문이다.
export function migrateLegacyDataOnce(): void {
  const scope = accountScope()
  if (scope === ANONYMOUS_SCOPE) return
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === '1') return
    localStorage.setItem(MIGRATION_FLAG, '1')

    const legacyWorkspacesRaw = localStorage.getItem(LEGACY_WORKSPACES_KEY)
    if (legacyWorkspacesRaw !== null) {
      localStorage.setItem(workspacesKey(scope), legacyWorkspacesRaw)
      const legacyCurrent = localStorage.getItem(LEGACY_CURRENT_KEY)
      if (legacyCurrent !== null) localStorage.setItem(currentWorkspaceKey(scope), legacyCurrent)
      const legacyCyclePref = localStorage.getItem(LEGACY_CYCLE_PREF_KEY)
      if (legacyCyclePref !== null) localStorage.setItem(cyclePreferenceKey(scope), legacyCyclePref)

      try {
        const metas = JSON.parse(legacyWorkspacesRaw)
        if (Array.isArray(metas)) {
          for (const m of metas) {
            const id = m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined
            if (typeof id !== 'string') continue
            const oldStateRaw = localStorage.getItem(`${LEGACY_WORKSPACE_STATE_PREFIX}${id}`)
            if (oldStateRaw !== null) localStorage.setItem(workspaceStateKey(id, scope), oldStateRaw)
          }
        }
      } catch {
        // 워크스페이스별 상태까지는 못 옮겨도 목록은 이미 옮겨졌으니 그대로 둔다.
      }

      // 옮긴 뒤에는 예전 무계정 키를 지운다 -- 남겨두면 이후 백업(JSON)에
      // 중복으로 딸려 들어가고, 아무도 다시 안 쓸 죽은 데이터로 남는다.
      localStorage.removeItem(LEGACY_WORKSPACES_KEY)
      localStorage.removeItem(LEGACY_CURRENT_KEY)
      localStorage.removeItem(LEGACY_CYCLE_PREF_KEY)
    } else {
      const legacySingleRaw = localStorage.getItem(OLD_SINGLE_STATE_KEY)
      if (legacySingleRaw) {
        const migrated = migrateAppState(JSON.parse(legacySingleRaw))
        if (migrated && !isUntouchedLegacySample(migrated)) {
          const hasContent =
            migrated.tasks.length > 0 ||
            migrated.members.length > 0 ||
            migrated.meetingNotes.length > 0 ||
            migrated.peerReviews.length > 0
          if (hasContent) {
            const id = uuidv4()
            const now = new Date().toISOString()
            const meta: WorkspaceMeta = {
              id,
              teamName: 'UX팀',
              periodName: '기존 데이터',
              evaluationYear: new Date().getFullYear(),
              evaluationCycle: 'custom',
              evaluationPeriodCode: 'CUSTOM-기존-데이터',
              createdAt: now,
              updatedAt: now,
            }
            localStorage.setItem(workspaceStateKey(id, scope), JSON.stringify(migrated))
            localStorage.setItem(workspacesKey(scope), JSON.stringify([meta]))
            localStorage.setItem(currentWorkspaceKey(scope), id)
          }
        }
      }
    }

    // 팀 프로필(인사평가 이력/승진 기준/개인 메모)도 팀 이름만으로 저장돼
    // 있었다 -- 계정 구분 없이 쓰던 시절 값을 스캔해서 옮긴다.
    const scopedTeamPrefix = `${LEGACY_TEAM_PROFILE_PREFIX}${scope}:`
    const legacyTeamKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(LEGACY_TEAM_PROFILE_PREFIX) && !key.startsWith(scopedTeamPrefix)) {
        legacyTeamKeys.push(key)
      }
    }
    for (const key of legacyTeamKeys) {
      const teamName = key.slice(LEGACY_TEAM_PROFILE_PREFIX.length)
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      localStorage.setItem(teamProfileKey(teamName, scope), raw)
      localStorage.removeItem(key)
    }
  } catch {
    // 마이그레이션은 최선을 다해 시도할 뿐, 실패해도 앱은 빈 상태로 정상 동작한다.
  }
}

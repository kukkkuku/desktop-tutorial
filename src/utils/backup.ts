import type { AppState, WorkspaceMeta } from '../types'
import { workspaceStateKey } from '../state/WorkspaceContext'
import { saveBlobLocally } from './localSave'
import { workspacesKey, currentWorkspaceKey, cyclePreferenceKey } from './storageKeys'
import { lastSaveKey } from './googleDrive'

export function listAllWorkspaceMetas(): WorkspaceMeta[] {
  try {
    const raw = localStorage.getItem(workspacesKey())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 지금 로그인된 계정 스코프에 속하는 저장 키 전부 -- 워크스페이스 목록/현재
// 선택/주기 설정 + 워크스페이스별 평가 데이터 + 각 워크스페이스의 Drive
// 마지막 저장 기록. "전체 데이터 초기화"가 지우는 범위와 백업(JSON/엑셀)이
// 담는 범위가 정확히 이 계정 하나로 일치해야 하므로 한 곳에서 계산한다.
// 계정별로 저장 키를 분리하기 전에는 이 브라우저 전체를 대상으로 했지만,
// 이제는 다른 계정으로 로그인해 저장한 데이터나 다른 기기·브라우저의
// 데이터에는 전혀 손대지 않는다.
function collectCurrentAccountKeys(): string[] {
  const keys = [workspacesKey(), currentWorkspaceKey(), cyclePreferenceKey()]
  for (const meta of listAllWorkspaceMetas()) {
    keys.push(workspaceStateKey(meta.id))
    keys.push(lastSaveKey(meta.id))
  }
  return keys
}

// 로컬 JSON 백업 -- 지금 로그인된 계정의 팀·평가 원본 데이터를 키 그대로
// 담은 스냅샷. 엑셀 백업(사람이 읽기 좋은 사본)과 달리, 필요하면 같은 키로
// localStorage에 다시 넣어 완전히 복원할 수 있는 유일한 백업이다.
export async function downloadLocalJsonBackup() {
  const data: Record<string, string> = {}
  for (const key of collectCurrentAccountKeys()) {
    const value = localStorage.getItem(key)
    if (value !== null) data[key] = value
  }
  const payload = { exportedAt: new Date().toISOString(), data }
  await saveBlobLocally(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `성과관리_전체백업_${new Date().toISOString().slice(0, 10)}.json`,
  )
}

// "전체 데이터 초기화" -- 지금 로그인된 계정의 팀·평가 데이터를 전부 지운다
// (지금 열려 있는 프로젝트 하나가 아니라 이 계정의 전부, 그러나 다른
// 계정으로 저장한 데이터에는 영향이 없다). 여러 컨텍스트(App/Workspace/
// Team)가 각자 localStorage에서 상태를 읽어오므로, 하나하나 메모리 상태를
// 리셋하는 것보다 새로고침으로 처음부터 다시 읽게 하는 쪽이 더 확실하다.
export function wipeAllAppData() {
  for (const key of collectCurrentAccountKeys()) {
    localStorage.removeItem(key)
  }
  window.location.reload()
}

// 엑셀 백업은 프로젝트(워크스페이스)별로 결과 리포트를 만들어야 해서,
// 지금 화면에 로드된 현재 프로젝트 state뿐 아니라 같은 계정에 저장된
// 나머지 프로젝트들의 원본 state도 각각 읽어온다.
export function loadAllWorkspaceEntries(): { meta: WorkspaceMeta; state: AppState }[] {
  const out: { meta: WorkspaceMeta; state: AppState }[] = []
  for (const meta of listAllWorkspaceMetas()) {
    try {
      const raw = localStorage.getItem(workspaceStateKey(meta.id))
      if (!raw) continue
      out.push({ meta, state: JSON.parse(raw) as AppState })
    } catch {
      // 손상된 항목은 건너뛴다 -- 백업은 최선을 다해 나머지라도 담는다.
    }
  }
  return out
}

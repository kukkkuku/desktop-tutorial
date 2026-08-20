import type { AppState, WorkspaceMeta } from '../types'
import { workspaceStateKey } from '../state/WorkspaceContext'

// 이 앱이 localStorage에 쓰는 모든 키는 이 접두어들 중 하나로 시작한다
// (워크스페이스 목록/현재 워크스페이스/주기 설정/워크스페이스별 평가
// 데이터/팀별 프로필은 'ux-performance-evaluation-', 구글 드라이브 마지막
// 저장 메타데이터는 'gdrive-last-save-'). "전체 데이터 초기화"가 지우는
// 범위와 백업이 담는 범위가 정확히 일치해야 하므로, 개별 상수를 export해서
// 가져오는 대신 이 접두어 스캔 하나로 항상 같은 범위를 계산한다. 구글
// 로그인 게이트 플래그처럼 평가 데이터가 아닌 값은 건드리지 않는다.
const APP_KEY_PREFIXES = ['ux-performance-evaluation-', 'gdrive-last-save-']

function collectAppKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key)
  }
  return keys
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 로컬 JSON 백업 -- 이 브라우저에 저장된 모든 팀·평가 원본 데이터를 키 그대로
// 담은 스냅샷. 엑셀 백업(사람이 읽기 좋은 사본)과 달리, 필요하면 같은 키로
// localStorage에 다시 넣어 완전히 복원할 수 있는 유일한 백업이다.
export function downloadLocalJsonBackup() {
  const data: Record<string, string> = {}
  for (const key of collectAppKeys()) {
    const value = localStorage.getItem(key)
    if (value !== null) data[key] = value
  }
  const payload = { exportedAt: new Date().toISOString(), data }
  triggerDownload(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `성과관리_전체백업_${new Date().toISOString().slice(0, 10)}.json`,
  )
}

// "전체 데이터 초기화" -- 이 브라우저에 저장된 모든 팀·평가 데이터를 지운다
// (지금 열려 있는 프로젝트 하나가 아니라 전부). 여러 컨텍스트(App/
// Workspace/Team)가 각자 localStorage에서 상태를 읽어오므로, 하나하나
// 메모리 상태를 리셋하는 것보다 새로고침으로 처음부터 다시 읽게 하는 쪽이
// 더 확실하다.
export function wipeAllAppData() {
  for (const key of collectAppKeys()) {
    localStorage.removeItem(key)
  }
  window.location.reload()
}

export function listAllWorkspaceMetas(): WorkspaceMeta[] {
  try {
    const raw = localStorage.getItem('ux-performance-evaluation-workspaces')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 엑셀 백업은 프로젝트(워크스페이스)별로 결과 리포트를 만들어야 해서,
// 지금 화면에 로드된 현재 프로젝트 state뿐 아니라 이 브라우저에 저장된
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

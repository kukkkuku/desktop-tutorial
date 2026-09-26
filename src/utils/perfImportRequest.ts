// 과제 입력 → 성과관리로 "이 그룹(L1) 내보내기" 요청. 성과관리 화면(프로젝트)이 열리면 한 번 꺼내
// 구글시트 연결(빠른 시작) 화면을 그 시트 · 그 L1들이 골라진 채로 연다. 이 탭(sessionStorage)에만 둔다.
const KEY = 'perf-import-request'

export interface PerfImportRequest {
  url: string // 구글시트 링크(탭 gid 포함)
  l1s: string[] // 고를 L1들(그 아래 L2를 모두 골라 둔다)
}

export function requestPerfImport(req: PerfImportRequest) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(req))
  } catch {
    // 못 남기면 성과관리에서 직접 연결하면 된다.
  }
}

export function takePerfImportRequest(): PerfImportRequest | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PerfImportRequest | null
    sessionStorage.removeItem(KEY)
    return v && typeof v.url === 'string' && Array.isArray(v.l1s) ? v : null
  } catch {
    return null
  }
}

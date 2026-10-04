// 구글 접근 토큰을 이 탭에만(sessionStorage) 만료 시각까지 보관한다 -- 새로고침해도 로그인 창을 다시 띄우지 않게.
// 탭을 닫으면 브라우저가 지우고, 로그아웃 · 구글이 거절(401)하면 앱이 지운다. 만료(약 1시간)는 구글 규칙이라 그대로.
export interface StoredToken {
  token: string
  expiresAt: number
  scope?: string
  email?: string | null
}
const KEY = (name: string) => `g-token:${name}`

export function loadToken(name: string): StoredToken | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY(name)) ?? 'null') as StoredToken | null
    if (!t || typeof t.token !== 'string' || !(t.expiresAt - 60_000 > Date.now())) return null
    return t
  } catch {
    return null
  }
}

export function saveToken(name: string, t: StoredToken | null) {
  try {
    if (t) sessionStorage.setItem(KEY(name), JSON.stringify(t))
    else sessionStorage.removeItem(KEY(name))
  } catch {
    // 보관 못 하면 예전처럼 메모리에만(새로고침하면 다시 로그인)
  }
}

export const TOKEN_NAMES = ['login', 'sheets-read', 'sheets-write', 'admin-mail'] as const
export function clearAllTokens() {
  TOKEN_NAMES.forEach((n) => saveToken(n, null))
}

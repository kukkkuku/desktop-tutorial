// 구글(시트 · 드라이브 · 캘린더 · Gmail · 로그인) 오류를 사용자가 읽을 한국어로.
// 구글이 돌려준 원문(영어 · JSON)은 화면에 보이지 않게 개발자 콘솔에만 남긴다.

const HANGUL = /[가-힣]/

// API 응답(상태 코드 + 본문) → 한국어 안내. what = 무엇을 하다가 실패했나(예: '시트 읽기', '메일 보내기')
export function googleErrorText(status: number, body: string, what: string): string {
  let message = ''
  let reasons: string[] = []
  try {
    const j = JSON.parse(body) as { error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } }
    message = j.error?.message ?? ''
    reasons = [...(j.error?.errors ?? []), ...(j.error?.details ?? [])].map((x) => x.reason ?? '').filter(Boolean)
  } catch {
    // JSON이 아니면 원문은 콘솔에만
  }
  console.warn(`[google ${what}] ${status}`, message || body.slice(0, 500))
  if (status === 401) return '구글 로그인이 만료되었습니다. 다시 로그인해 주세요.'
  if (status === 429 || reasons.some((r) => /rate|quota/i.test(r))) return '구글 요청이 많아 잠시 막혔습니다. 1분쯤 뒤 다시 시도해 주세요.'
  if (status === 403) return `${what} 권한이 없습니다. 공유받은 계정으로 로그인했는지 확인해 주세요.`
  if (status === 404) return `${what}: 대상을 찾지 못했습니다. 링크나 파일이 지워지지 않았는지 확인해 주세요.`
  if (status === 400 && /parse range/i.test(message)) return '시트에서 해당 탭을 찾지 못했습니다(탭 이름이 바뀌었을 수 있습니다).'
  if (status >= 500) return '구글 서버가 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요.'
  const why = message ? `구글 ${status}: ${message.slice(0, 160)}` : `구글 ${status}`
  return `${what}에 실패했습니다(${why}). 잠시 후 다시 시도해 주세요.`
}

// 구글 로그인 창(OAuth) 오류 코드 → 한국어
export function oauthErrorText(code: string | undefined, fallback = '구글 로그인이 취소되었습니다.'): string {
  if (!code) return fallback
  console.warn('[google oauth]', code)
  if (code === 'access_denied') return '구글 권한을 허용하지 않았습니다. 다시 시도해 허용해 주세요.'
  return '구글 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'
}

// 화면에 띄울 오류 문장: 한국어 메시지면 그대로, 아니면(영어 · 객체 등) 기본 문장
export function errText(e: unknown, fallback = '잠시 후 다시 시도해 주세요.'): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (msg && HANGUL.test(msg)) return msg
  if (msg || e) console.warn('[error]', e)
  return fallback
}

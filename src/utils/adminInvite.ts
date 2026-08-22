// 관리자 전용: 관리자 계정으로 Google 로그인한 뒤 그 사람 명의로 팀원들에게
// 초대 메일을 직접 보낸다(Gmail API, gmail.send 스코프). 백엔드 서버 없이
// 브라우저에서 바로 돌아가는 이 앱 구조상, "관리자"는 서버가 검증하는
// 역할이 아니라 로그인한 Google 계정 이메일이 아래 화이트리스트에 있는지만
// 클라이언트에서 확인하는 수준이다 -- 진짜 보안 경계가 필요하면 백엔드가
// 있어야 한다(지금은 초대 메일 발송 편의 기능일 뿐, 앱 접근 자체를 막는
// 수단은 아니다. 앱 접근 제한은 Google Cloud Console의 OAuth 테스트
// 사용자 목록이 담당한다).
import * as XLSX from 'xlsx'
import { loadGis } from './googleDrive'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const ADMIN_SCOPE = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email'

export const ADMIN_EMAILS = ['jjy.osstem@gmail.com']

export function isAdminConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

let adminToken: { token: string; expiresAt: number } | null = null
let adminEmail: string | null = null

export function isAdminConnected(): boolean {
  return adminToken !== null && adminToken.expiresAt - 60_000 > Date.now() && adminEmail !== null && ADMIN_EMAILS.includes(adminEmail)
}

export function getAdminEmail(): string | null {
  return isAdminConnected() ? adminEmail : null
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { email?: string }
  return data.email ?? null
}

// "관리자로 Google 연결" 버튼에서 호출한다. 로그인 자체는 성공해도, 그
// 계정이 ADMIN_EMAILS에 없으면 토큰을 버리고 에러를 던진다.
export async function connectAdmin(): Promise<void> {
  await loadGis()
  if (!CLIENT_ID) throw new Error('Google Client ID가 설정되지 않았습니다.')
  if (!window.google) throw new Error('Google 로그인 스크립트가 로드되지 않았습니다.')

  const accessToken = await new Promise<string>((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: ADMIN_SCOPE,
      callback: (resp: GoogleTokenResponse) => {
        if (resp.error || !resp.access_token) reject(new Error(resp.error || '로그인이 취소되었습니다.'))
        else resolve(resp.access_token)
      },
    })
    tokenClient.requestAccessToken()
  })

  const email = await fetchEmail(accessToken)
  if (!email || !ADMIN_EMAILS.includes(email)) {
    adminToken = null
    adminEmail = null
    throw new Error(`관리자 계정이 아닙니다${email ? ` (${email})` : ''}. 관리자로 등록된 계정으로 로그인해주세요.`)
  }

  adminToken = { token: accessToken, expiresAt: Date.now() + 3300 * 1000 }
  adminEmail = email
}

// ---------- 초대 대상자 명단(로컬 저장) ----------
// 관리자 브라우저에만 저장되는 목록이다 -- "누구를 초대했는지" 기록용이고,
// 실제 로그인 허용 여부는 Google Cloud Console의 테스트 사용자 목록이
// 별도로 관리한다(이 목록에 있다고 자동으로 로그인이 허용되지 않는다).

const LIST_KEY = 'admin-invite-recipients'

export interface InviteRecipient {
  email: string
  addedAt: string
  lastInvitedAt: string | null
}

export function loadInviteList(): InviteRecipient[] {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    return raw ? (JSON.parse(raw) as InviteRecipient[]) : []
  } catch {
    return []
  }
}

function saveInviteList(list: InviteRecipient[]): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {
    // 저장 실패해도 화면 상태는 이미 갱신됐으니 이번 세션 안에서는 그대로 쓸 수 있다.
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 붙여넣기(줄바꿈/쉼표/세미콜론 구분) 텍스트에서 이메일 형식만 걸러낸다.
export function parseEmailText(text: string): { emails: string[]; invalid: string[] } {
  const raw = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const emails: string[] = []
  const invalid: string[] = []
  for (const item of raw) {
    if (EMAIL_RE.test(item)) emails.push(item.toLowerCase())
    else invalid.push(item)
  }
  return { emails, invalid }
}

// 엑셀 업로드용: 첫 시트의 모든 셀을 훑어 이메일 형식인 값만 뽑는다. 특정
// 헤더 이름(예: '이메일')을 강제하지 않는 건, 사람들이 아무 열에나 이메일을
// 붙여넣어도 인식되게 하기 위해서다.
export function parseEmailWorkbook(buffer: ArrayBuffer): { emails: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const emails = new Set<string>()
  for (const row of rows) {
    for (const cell of row) {
      const s = String(cell ?? '').trim().toLowerCase()
      if (EMAIL_RE.test(s)) emails.add(s)
    }
  }
  return { emails: Array.from(emails) }
}

export function addEmailsToList(emails: string[]): InviteRecipient[] {
  const list = loadInviteList()
  const existing = new Set(list.map((r) => r.email))
  const now = new Date().toISOString()
  for (const email of emails) {
    if (!existing.has(email)) {
      list.push({ email, addedAt: now, lastInvitedAt: null })
      existing.add(email)
    }
  }
  saveInviteList(list)
  return list
}

export function removeEmailFromList(email: string): InviteRecipient[] {
  const list = loadInviteList().filter((r) => r.email !== email)
  saveInviteList(list)
  return list
}

function markInvited(emails: string[]): InviteRecipient[] {
  const sent = new Set(emails)
  const now = new Date().toISOString()
  const list = loadInviteList().map((r) => (sent.has(r.email) ? { ...r, lastInvitedAt: now } : r))
  saveInviteList(list)
  return list
}

// ---------- Gmail 발송 ----------

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function toBase64Url(input: string): string {
  return toBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function buildRawMessage(from: string, to: string, subject: string, bodyText: string): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${toBase64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ].join('\r\n')
  return toBase64Url(`${headers}\r\n\r\n${bodyText}`)
}

export interface SendInviteResult {
  sent: string[]
  failed: { email: string; error: string }[]
}

// 순차 발송한다 -- Gmail API에는 여러 수신자에게 한 번에 보내는 배치
// 엔드포인트가 없고, 병렬로 쏘면 사용자별 발송 쿼터에 걸리기 쉽다.
export async function sendInviteEmails(emails: string[], subject: string, bodyText: string): Promise<SendInviteResult> {
  if (!isAdminConnected() || !adminToken || !adminEmail) throw new Error('관리자로 먼저 연결해주세요.')

  const sent: string[] = []
  const failed: { email: string; error: string }[] = []

  for (const email of emails) {
    try {
      const raw = buildRawMessage(adminEmail, email, subject, bodyText)
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`(${res.status}) ${text}`)
      }
      sent.push(email)
    } catch (err) {
      failed.push({ email, error: err instanceof Error ? err.message : '발송 실패' })
    }
  }

  if (sent.length > 0) markInvited(sent)
  return { sent, failed }
}

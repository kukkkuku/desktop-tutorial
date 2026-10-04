// 팀장 · 관리자: 그 계정으로 Google 로그인한 뒤 그 사람 명의로 팀원들에게
// 초대 메일을 직접 보낸다(Gmail API, gmail.send 스코프). 백엔드 서버 없이
// 브라우저에서 바로 돌아가는 이 앱 구조상, "관리자"는 서버가 검증하는
// 역할이 아니라 로그인한 Google 계정 이메일이 아래 화이트리스트에 있는지만
// 클라이언트에서 확인하는 수준이다 -- 진짜 보안 경계가 필요하면 백엔드가
// 있어야 한다(지금은 초대 메일 발송 편의 기능일 뿐, 앱 접근 자체를 막는
// 수단은 아니다. 앱 접근 제한은 Google Cloud Console의 OAuth 테스트
// 사용자 목록이 담당한다).
import * as XLSX from 'xlsx'
import { loadGis } from './googleDrive'
import { googleErrorText, oauthErrorText } from './googleError'
import { canManageEmail } from './roles'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const ADMIN_SCOPE = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email'

// 보낼 수 있는 사람: 팀장 · 관리자(권한 시트 역할 · 앱에 정해 둔 첫 관리자)
const canSend = (email: string | null) => canManageEmail(email)

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
  return adminToken !== null && adminToken.expiresAt - 60_000 > Date.now() && canSend(adminEmail)
}

export function getAdminEmail(): string | null {
  return isAdminConnected() ? adminEmail : null
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const data = (await res.json()) as { email?: string }
  return data.email ?? null
}

// "관리자로 Google 연결" 버튼에서 호출한다. 로그인 자체는 성공해도, 그
// 계정이 팀장 · 관리자가 아니면 토큰을 버리고 에러를 던진다.
export async function connectAdmin(): Promise<void> {
  await loadGis()
  if (!CLIENT_ID) throw new Error('Google Client ID가 설정되지 않았습니다.')
  if (!window.google) throw new Error('Google 로그인 스크립트가 로드되지 않았습니다.')

  const accessToken = await new Promise<string>((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: ADMIN_SCOPE,
      callback: (resp: GoogleTokenResponse) => {
        if (resp.error || !resp.access_token) reject(new Error(oauthErrorText(resp.error)))
        else resolve(resp.access_token)
      },
    })
    tokenClient.requestAccessToken()
  })

  const email = await fetchEmail(accessToken)
  if (!email || !canSend(email)) {
    adminToken = null
    adminEmail = null
    throw new Error(`팀장 · 관리자 계정이 아닙니다${email ? ` (${email})` : ''}. 권한 시트에 팀장 · 관리자로 등록된 계정으로 로그인해주세요.`)
  }

  adminToken = { token: accessToken, expiresAt: Date.now() + 3300 * 1000 }
  adminEmail = email
}

// ---------- 초대 대상자 명단(로컬 저장) ----------
// 보낸 사람 브라우저에만 저장되는 목록이다 -- "누구를 초대했는지" 기록용.
// 앱은 프로덕션으로 게시돼 구글 테스트 사용자 등록 없이 로그인된다. 볼 수 있는 내용은 시트 공유 · 권한 시트가 정한다.

const LIST_KEY = 'admin-invite-recipients'

// email = 로그인할 Gmail(권한 시트 · 시트 공유 · 앱 로그인용, 목록의 열쇠)
// sendTo = 초대 메일을 받을 주소(회사 메일 등). 비우면 email로 보낸다.
export interface InviteRecipient {
  email: string
  sendTo?: string
  name?: string
  addedAt: string
  lastInvitedAt: string | null
  lastSentTo?: string
}
export const mailOf = (r: InviteRecipient) => (r.sendTo?.trim() || r.email).toLowerCase()

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
// 받는 사람이 전부 Gmail이라, "@" 없이 아이디만 적어도 등록할 수 있게 한다
// (예: "hong.gildong" -> "hong.gildong@gmail.com"). Gmail 아이디에 실제로
// 쓰이는 문자만 허용해서, 이상한 텍스트가 엉뚱하게 이메일로 만들어지지
// 않게 한다.
const GMAIL_ID_RE = /^[a-zA-Z0-9.]+$/

export type InviteEntry = { email: string; sendTo?: string; name?: string }
const asGmail = (item: string) => (!item.includes('@') && GMAIL_ID_RE.test(item) ? `${item}@gmail.com` : item).toLowerCase()

// 한 사람의 칸들(붙여넣기 한 줄 · 엑셀 한 행)에서: 첫 Gmail(또는 아이디) = 로그인 계정, 그 밖의 메일 = 받는 메일, 메일이 아닌 글 = 이름.
// Gmail이 없고 메일만 있으면 그 메일을 로그인 계정으로 본다(Gmail이 아닌 구글 계정일 수 있음).
function entryOf(cells: string[], allowIds = true): InviteEntry | null {
  const emails: string[] = []
  let name = ''
  for (const c of cells.map((x) => x.replace(/\s*입니다.*$/, '').trim()).filter(Boolean)) {
    const e = allowIds ? asGmail(c) : c.toLowerCase()
    if (EMAIL_RE.test(e)) emails.push(e)
    else if (!name) name = c
  }
  if (!emails.length) return null
  const login = emails.find((e) => e.endsWith('@gmail.com')) ?? emails[0]
  const other = emails.find((e) => e !== login)
  return { email: login, ...(other ? { sendTo: other } : {}), ...(name ? { name } : {}) }
}

// 붙여넣기: 한 줄에 한 사람 -- 「Gmail(아이디만 적어도 됨), 받는 메일, 이름」(쉼표 · 탭 · 세미콜론). 줄에 메일이 하나면 그 메일이 로그인 계정.
export function parseInviteText(text: string): { entries: InviteEntry[]; invalid: string[] } {
  const entries: InviteEntry[] = []
  const invalid: string[] = []
  for (const line of text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)) {
    const e = entryOf(line.split(/[,;\t]+/))
    if (e) entries.push(e)
    else invalid.push(line)
  }
  return { entries, invalid }
}

// 엑셀 업로드용: 첫 시트의 행마다 한 사람(Gmail · 받는 메일 · 이름을 아무 열에나). 머리글 이름은 따지지 않는다.
// 아이디만 적힌 칸은 이름과 구분할 수 없어 엑셀에서는 @가 있는 메일만 본다.
export function parseInviteWorkbook(buffer: ArrayBuffer): { entries: InviteEntry[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const entries: InviteEntry[] = []
  for (const row of rows) {
    const cells = row.map((c) => String(c ?? '').trim()).filter(Boolean)
    if (!cells.some((c) => c.includes('@'))) continue
    const e = entryOf(cells, false)
    if (e) entries.push(e)
  }
  return { entries }
}

// 같은 로그인 Gmail이 이미 있으면 받는 메일 · 이름만 새 값으로 채운다
export function addEntriesToList(entries: InviteEntry[]): InviteRecipient[] {
  const list = loadInviteList()
  const now = new Date().toISOString()
  for (const e of entries) {
    const hit = list.find((r) => r.email === e.email)
    if (hit) {
      if (e.sendTo) hit.sendTo = e.sendTo
      if (e.name && !hit.name) hit.name = e.name
    } else list.push({ ...e, addedAt: now, lastInvitedAt: null })
  }
  saveInviteList(list)
  return list
}

export function setSendTo(email: string, sendTo: string): InviteRecipient[] {
  const v = sendTo.trim().toLowerCase()
  const list = loadInviteList().map((r) => (r.email === email ? { ...r, sendTo: v && v !== r.email ? v : undefined } : r))
  saveInviteList(list)
  return list
}
export const isEmail = (v: string) => EMAIL_RE.test(v.trim())

export function removeEmailFromList(email: string): InviteRecipient[] {
  const list = loadInviteList().filter((r) => r.email !== email)
  saveInviteList(list)
  return list
}

function markInvited(sent: Map<string, string>): InviteRecipient[] {
  const now = new Date().toISOString()
  const list = loadInviteList().map((r) => (sent.has(r.email) ? { ...r, lastInvitedAt: now, lastSentTo: sent.get(r.email) } : r))
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

// 초대 메일 HTML(메일 앱용 · 표와 인라인 스타일만). 읽는 순서대로 크게:
//   제목 → 인사말 → 「시작하는 방법」 1 · 2 · 3(2 = 로그인할 계정, 3 = 확인하지 않은 앱 화면은 노란 상자로 강조) → 시작 버튼 → 문의하기 버튼.
//   앱 주소는 버튼 뒤에만 둔다.
export type InviteContact = { email: string; name?: string } | null
const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function inviteHtml(message: string, r: { email: string; name?: string }, from: string, appUrl: string, contact: InviteContact = null): string {
  const msg = message
    .split(/\r?\n/)
    .filter((line) => !/^\s*https?:\/\/\S+\s*$/.test(line)) // 주소만 있는 줄은 버튼이 대신한다
    .map((line) => escHtml(line))
    .join('<br>')
    .replace(/(<br>){3,}/g, '<br><br>')
  const font = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif"
  const who = r.name ? `${escHtml(r.name)}님, ` : ''
  const num = (n: number, color = '#2563EB') =>
    `<td valign="top" style="width:28px;padding-top:1px"><div style="width:24px;height:24px;border-radius:12px;background:${color};color:#FFFFFF;font-size:13px;font-weight:700;line-height:24px;text-align:center">${n}</div></td>`
  const chip = (t: string) => `<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#FFFFFF;border:1px solid #E8C26A;color:#7A4B00;font-weight:700">${t}</span>`
  const mailto = contact
    ? `mailto:${contact.email}?subject=${encodeURIComponent(`[페이스] 로그인 문의 - ${r.name || r.email}`)}&body=${encodeURIComponent(
        `로그인할 계정: ${r.email}\n어떤 화면에서 막혔는지 적어 주세요:\n\n`,
      )}`
    : ''
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F3F4F6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 12px;font-family:${font}">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#FFFFFF;border-radius:16px;overflow:hidden">
<tr><td style="padding:28px 32px 0">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:34px;height:34px;border-radius:17px;background:#2563EB;text-align:center;vertical-align:middle"><div style="width:12px;height:12px;margin:0 auto;border-radius:9px;border:3px solid #FFFFFF"></div></td>
    <td style="padding-left:10px;font-size:17px;font-weight:700;color:#18181B">페이스<div style="font-size:12px;font-weight:400;color:#8A8F98">과제 · 성과관리</div></td>
  </tr></table>
</td></tr>
<tr><td style="padding:22px 32px 0;font-size:23px;line-height:1.4;font-weight:800;color:#18181B">${who}페이스에 초대합니다</td></tr>
<tr><td style="padding:10px 32px 0;font-size:15px;line-height:1.75;color:#3F434A">${msg}</td></tr>

<tr><td style="padding:26px 32px 0;font-size:13px;font-weight:700;letter-spacing:.02em;color:#8A8F98">시작하는 방법</td></tr>
<tr><td style="padding:10px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>${num(1)}<td style="padding:0 0 14px 10px;font-size:15px;line-height:1.6;color:#18181B"><b>아래 「페이스 시작하기」</b> 버튼을 누릅니다.</td></tr>
    <tr>${num(2)}<td style="padding:0 0 14px 10px;font-size:15px;line-height:1.6;color:#18181B"><b>이 Google 계정으로 로그인</b>합니다.
      <div style="margin-top:6px;padding:10px 14px;border-radius:10px;background:#EEF3FF;font-size:16px;font-weight:700;color:#1D4ED8">${escHtml(r.email)}</div>
      <div style="margin-top:4px;font-size:12.5px;color:#6B7079">다른 계정으로 로그인하면 메뉴가 다르게 보일 수 있습니다.</div></td></tr>
    <tr>${num(3, '#D97706')}<td style="padding:0 0 4px 10px;font-size:15px;line-height:1.6;color:#18181B"><b>「Google에서 확인하지 않은 앱」 화면이 나오면</b>
      <div style="margin-top:6px;padding:12px 14px;border-radius:10px;background:#FFF7E0;border:1px solid #F2D58A;font-size:14px;line-height:1.9;color:#5C3B00">
        왼쪽 아래 ${chip('고급')} 을 누르고 → ${chip('페이스(으)로 이동')} 을 누르세요.<br>
        <span style="font-size:12.5px;color:#7A5A1C">사내용 앱이라 처음 한 번 나오는 화면입니다. 이 메일의 버튼으로 연 페이스에서만 이렇게 하세요.</span>
      </div></td></tr>
  </table>
</td></tr>

<tr><td style="padding:22px 32px 0">
  <a href="${escHtml(appUrl)}" style="display:block;padding:15px 0;border-radius:12px;background:#2563EB;color:#FFFFFF;text-align:center;font-size:17px;font-weight:700;text-decoration:none">페이스 시작하기</a>
</td></tr>
${
  contact
    ? `<tr><td style="padding:10px 32px 0">
  <a href="${escHtml(mailto)}" style="display:block;padding:12px 0;border-radius:12px;background:#FFFFFF;border:1px solid #D9DCE1;color:#3F434A;text-align:center;font-size:15px;font-weight:600;text-decoration:none">로그인이 안 되거나 궁금한 점 문의하기</a>
  <div style="margin-top:6px;text-align:center;font-size:12px;color:#9AA0A6">${escHtml(contact.name ? `${contact.name}(${contact.email})` : contact.email)}에게 메일이 갑니다</div>
</td></tr>`
    : ''
}
<tr><td style="padding:22px 32px 28px">
  <div style="border-top:1px solid #ECEDEF;padding-top:14px;font-size:12px;line-height:1.6;color:#9AA0A6">${escHtml(from)} 님이 보낸 페이스 초대입니다.</div>
</td></tr>
</table>
</td></tr></table></body></html>`
}
// 글만 보는 메일 앱용: 인사말 + 시작하는 방법 + 문의
function inviteText(message: string, r: { email: string }, appUrl: string, contact: InviteContact): string {
  return `${message.trim()}

[시작하는 방법]
1. 페이스 시작하기: ${appUrl}
2. 이 Google 계정으로 로그인: ${r.email}
3. 「Google에서 확인하지 않은 앱」 화면이 나오면 → 고급 → 페이스(으)로 이동
${contact ? `\n로그인이 안 되거나 궁금한 점은 ${contact.email} 로 문의하세요.` : ''}`
}

// 글(text/plain)과 HTML을 함께 보낸다 -- 메일 앱은 HTML(버튼)을, 글만 보는 곳은 주소를 보여 준다.
function buildRawMessage(from: string, to: string, subject: string, bodyText: string, bodyHtmlText: string): string {
  const boundary = `inv_${Date.now().toString(36)}`
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${toBase64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n')
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${toBase64(bodyText)}`,
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${toBase64(bodyHtmlText)}`,
    `--${boundary}--`,
  ].join('\r\n')
  return toBase64Url(`${headers}\r\n\r\n${parts}`)
}

export interface SendInviteResult {
  sent: string[]
  failed: { email: string; error: string }[]
}
// 본문에서 사람마다 바뀌는 칸: {로그인계정} → 그 사람의 로그인 Gmail, {이름} → 이름(없으면 빈칸)
export const LOGIN_TOKEN = '{로그인계정}'
export const NAME_TOKEN = '{이름}'
const fill = (text: string, r: InviteRecipient) =>
  text
    .split(LOGIN_TOKEN)
    .join(r.email)
    .split(NAME_TOKEN)
    .join(r.name ?? '')

// 순차 발송한다 -- Gmail API에는 여러 수신자에게 한 번에 보내는 배치
// 엔드포인트가 없고, 병렬로 쏘면 사용자별 발송 쿼터에 걸리기 쉽다.
// 보내는 곳은 받는 메일(없으면 로그인 Gmail). 결과의 email은 로그인 Gmail(목록 열쇠).
export async function sendInviteEmails(
  recipients: InviteRecipient[],
  subject: string,
  bodyText: string,
  appUrl: string,
  contactOf: (r: InviteRecipient) => InviteContact = () => null,
): Promise<SendInviteResult> {
  if (!isAdminConnected() || !adminToken || !adminEmail) throw new Error('Google 계정으로 먼저 연결해주세요.')

  const sent: string[] = []
  const sentTo = new Map<string, string>()
  const failed: { email: string; error: string }[] = []

  for (const r of recipients) {
    const email = r.email
    const to = mailOf(r)
    try {
      const msg = fill(bodyText, r)
      const contact = contactOf(r)
      const raw = buildRawMessage(adminEmail, to, fill(subject, r), inviteText(msg, r, appUrl, contact), inviteHtml(msg, r, adminEmail, appUrl, contact))
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(googleErrorText(res.status, text, '메일 보내기'))
      }
      sent.push(email)
      sentTo.set(email, to)
    } catch (err) {
      failed.push({ email: to, error: err instanceof Error ? err.message : '발송 실패' })
    }
  }

  if (sent.length > 0) markInvited(sentTo)
  return { sent, failed }
}

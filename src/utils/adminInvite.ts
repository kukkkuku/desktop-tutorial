// 팀장 · 관리자: 그 계정으로 Google 로그인한 뒤 그 사람 명의로 팀원들에게
// 초대 메일을 직접 보낸다(Gmail API, gmail.send 스코프). 백엔드 서버 없이
// 브라우저에서 바로 돌아가는 이 앱 구조상, "관리자"는 서버가 검증하는
// 역할이 아니라 로그인한 Google 계정 이메일이 아래 화이트리스트에 있는지만
// 클라이언트에서 확인하는 수준이다 -- 진짜 보안 경계가 필요하면 백엔드가
// 있어야 한다(지금은 초대 메일 발송 편의 기능일 뿐, 앱 접근 자체를 막는
// 수단은 아니다. 앱 접근 제한은 Google Cloud Console의 OAuth 테스트
// 사용자 목록이 담당한다).
import { loadToken, saveToken } from './tokenStore'
import * as XLSX from 'xlsx'
import { loadGis, getConnectedEmail, readRememberedEmail, peekLoginToken, loginTokenExpiry, MAIL_SEND_SCOPE } from './googleDrive'
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

// 이 탭에 보관해 둔 메일 보내기 토큰이 있으면 이어 쓴다(tokenStore)
const restoredAdmin = loadToken('admin-mail')
let adminToken: { token: string; expiresAt: number } | null = restoredAdmin ? { token: restoredAdmin.token, expiresAt: restoredAdmin.expiresAt } : null
let adminEmail: string | null = restoredAdmin?.email ?? null

// 로그인 때 메일 보내기 권한을 같이 받았으면 그 토큰을 그대로 쓴다(권한 창을 또 띄우지 않음)
function adoptLoginMailToken(): void {
  if (adminToken !== null && adminToken.expiresAt - 60_000 > Date.now()) return
  const token = peekLoginToken(MAIL_SEND_SCOPE)
  const expiresAt = loginTokenExpiry()
  const email = getConnectedEmail()
  if (!token || !expiresAt || !email || !canSend(email)) return
  adminToken = { token, expiresAt }
  adminEmail = email
  saveToken('admin-mail', { ...adminToken, email })
}

export function isAdminConnected(): boolean {
  adoptLoginMailToken()
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
  adoptLoginMailToken()
  if (isAdminConnected()) return
  await loadGis()
  if (!CLIENT_ID) throw new Error('Google Client ID가 설정되지 않았습니다.')
  if (!window.google) throw new Error('Google 로그인 스크립트가 로드되지 않았습니다.')

  const accessToken = await new Promise<string>((resolve, reject) => {
    // 이미 로그인한 계정을 지정해 계정 선택 화면 없이 바로 동의로 넘긴다(다른 로그인 창과 같은 방식).
    // 창을 닫거나 막히면 끝없이 기다리지 않고 알린다.
    const hint = getConnectedEmail() ?? readRememberedEmail() ?? undefined
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: ADMIN_SCOPE,
      ...(hint ? { login_hint: hint } : {}),
      error_callback: (err: { type?: string }) =>
        reject(new Error(err.type === 'popup_failed_to_open' ? '구글 로그인 창이 열리지 않았습니다(팝업 차단 확인).' : '구글 로그인 창이 닫혔습니다. 「보내기」를 다시 눌러 주세요.')),
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
  saveToken('admin-mail', { ...adminToken, email })
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
// 받는 사람마다 앱 주소에 로그인할 계정을 붙인다 -- 링크로 열면 로그인 화면에 그 계정이 뜬다(?login=, googleDrive.ts)
function withLoginHint(appUrl: string, email: string): string {
  try {
    const u = new URL(appUrl)
    u.searchParams.set('login', email)
    return u.toString()
  } catch {
    return appUrl
  }
}
const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// _from: 예전 맨 아래 「… 님이 보낸 초대」 줄(뺐음) -- 부르는 곳은 그대로 둔다. #invite-msg = 인사말(미리보기에서 그 자리 고치기)
export function inviteHtml(message: string, r: { email: string; name?: string }, _from: string, appUrl: string, contact: InviteContact = null): string {
  const msg = message
    .split(/\r?\n/)
    .filter((line) => !/^\s*https?:\/\/\S+\s*$/.test(line)) // 주소만 있는 줄은 버튼이 대신한다
    .map((line) => escHtml(line))
    .join('<br>')
    .replace(/(<br>){3,}/g, '<br><br>')
  appUrl = withLoginHint(appUrl, r.email)
  const mailto = contact
    ? `mailto:${contact.email}?subject=${encodeURIComponent(`[페이스] 로그인 문의 - ${r.name || r.email}`)}&body=${encodeURIComponent(
        `로그인할 계정: ${r.email}\n어떤 화면에서 막혔는지 적어 주세요:\n\n`,
      )}`
    : ''
  // 시안 「Refined」: 흰 바탕 · 표정 4개 · 계정이 들어간 검은 알약 버튼. 표 + inline 스타일(메일 앱용), Outlook은 VML 버튼.
  // 그림은 앱 주소의 /invite/ 폴더(public/invite)에서 불러온다(메일 앱이 SVG를 못 보여 줘서 PNG). 원본 · 미리보기: docs/invite-email
  const imgBase = (() => {
    try {
      const u = new URL(appUrl)
      u.search = ''
      u.hash = ''
      if (!u.pathname.endsWith('/')) u.pathname = /\.[a-z0-9]+$/i.test(u.pathname) ? u.pathname.replace(/[^/]*$/, '') : `${u.pathname}/`
      return new URL('invite/', u).href
    } catch {
      return 'invite/'
    }
  })()
  return `<!DOCTYPE html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<!-- 다크모드: 이 메일은 밝은 모드 색을 그대로 쓴다(흰 배경이 뒤집히지 않게) -->
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>페이스에 초대합니다</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>
  table, td, div, p, a, span { font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif !important; }
</style>
<![endif]-->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" type="text/css">
<!--<![endif]-->
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  /* 다크모드를 지원하는 메일 앱(애플 메일 · Outlook.com 등)이 색을 바꾸지 못하게 같은 색을 다시 지정 */
  @media (prefers-color-scheme: dark) {
    body, .bg-main { background-color: #FFFFFF !important; background-image: linear-gradient(#FFFFFF, #FFFFFF) !important; }
    .ink { color: #181818 !important; }
    .gray { color: #535353 !important; }
    .btn-cell { background-color: #181818 !important; background-image: linear-gradient(#181818, #181818) !important; }
    .btn-text { color: #FFFFFF !important; }
  }
  [data-ogsc] .ink { color: #181818 !important; }
  [data-ogsc] .gray { color: #535353 !important; }
  [data-ogsc] .btn-text { color: #FFFFFF !important; }
  [data-ogsb] .bg-main { background-color: #FFFFFF !important; }
  [data-ogsb] .btn-cell { background-color: #181818 !important; }
  /* 모바일(실제 폰 화면) */
  @media only screen and (max-width: 480px) {
    .wrap { width: 100% !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .guide { padding-left: 8px !important; }
  }
</style>
</head>
<body class="bg-main" bgcolor="#FFFFFF" style="margin:0;padding:0;width:100%;background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);">

<!-- 미리보기 글(받은편지함 목록에 보이는 한 줄) -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  페이스(과제관리)에 초대합니다. 아래 계정으로 로그인해 주세요.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>

<table role="presentation" class="bg-main" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);">
<tr><td align="center" bgcolor="#FFFFFF" class="bg-main" style="background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);">

  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
  <table role="presentation" class="wrap bg-main" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:600px;max-width:600px;background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);">

    <!-- 위 머리 줄 -->
    <tr><td class="pad bg-main" bgcolor="#FFFFFF" style="padding:37px 58px 0 58px;background-color:#FFFFFF;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="gray" align="left" style="padding:0 0 22px 0;border-bottom:1px solid #181818;font-family:'Roboto Mono','Courier New',Courier,monospace;font-size:13px;line-height:18px;color:#535353;">INVITATION</td>
        </tr>
      </table>
    </td></tr>

    <!-- 인사 : 표정 4개 → 안녕하세요. → 제목 → 안내 한 줄(초대 창에서 그 자리에서 고침) -->
    <tr><td class="pad bg-main" align="center" bgcolor="#FFFFFF" style="padding:30px 58px 40px 58px;background-color:#FFFFFF;">
      <img src="${imgBase}faces.png" width="127" height="23" alt="웃는 얼굴 아이콘 네 개" style="display:block;margin:0 auto;width:127px;height:23px;border:0;">
      <div class="gray" style="padding-top:6px;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:24px;font-weight:500;color:#535353;text-align:center;">안녕하세요.</div>
      <div class="ink" style="padding-top:12px;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:26px;line-height:32px;font-weight:700;color:#000000;text-align:center;">과제 관리 앱으로 초대합니다.</div>
      <div id="invite-msg" class="gray" style="padding-top:2px;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:26px;font-weight:500;color:#535353;text-align:center;">${msg}</div>
    </td></tr>

    <!-- 계정 + 시작 버튼 (알약 · 계정이 버튼 안에 들어간다 · Outlook은 VML) -->
    <tr><td class="pad bg-main" bgcolor="#FFFFFF" style="padding:0 58px;background-color:#FFFFFF;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escHtml(appUrl)}" style="height:49px;v-text-anchor:middle;width:484px;" arcsize="50%" stroke="f" fillcolor="#181818">
        <w:anchorlock/>
        <center style="color:#FFFFFF;font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif;font-size:17px;font-weight:bold;">${escHtml(r.email)} &nbsp;&nbsp;&nbsp; 시작 &nbsp;&rarr;</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="btn-cell" bgcolor="#181818" style="background-color:#181818;background-image:linear-gradient(#181818,#181818);border-radius:99px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" height="49" style="height:49px;padding:0 0 0 32px;">
                  <a class="btn-text" href="${escHtml(appUrl)}" target="_blank" style="display:block;line-height:49px;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:19px;font-weight:700;color:#FFFFFF;text-decoration:none;word-break:break-all;">${escHtml(r.email)}</a>
                </td>
                <td align="right" width="52" style="width:52px;padding:0 0 0 8px;white-space:nowrap;">
                  <a class="btn-text" href="${escHtml(appUrl)}" target="_blank" style="display:block;line-height:49px;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:17px;font-weight:700;color:#FFFFFF;text-decoration:none;">시작</a>
                </td>
                <td align="right" width="64" style="width:64px;padding:0 6px 0 0;">
                  <a href="${escHtml(appUrl)}" target="_blank" style="display:block;font-size:0;line-height:0;"><img src="${imgBase}arrow.png" width="52" height="52" alt="&rarr;" style="display:block;width:52px;height:52px;border:0;color:#FFFFFF;font-size:22px;"></a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <!--<![endif]-->
    </td></tr>

    <!-- 처음 로그인할 때 -->
    <tr><td class="pad guide bg-main" bgcolor="#FFFFFF" style="padding:22px 87px 18px 87px;background-color:#FFFFFF;">
      <div class="ink" style="font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:20px;font-weight:700;color:#181818;">처음 로그인할 때</div>
      <div class="gray" style="padding-top:8px;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:20px;color:#535353;"><b style="font-weight:700;">「Google에서 확인하지 않은 앱」</b> 화면이 나오면</div>
      <div class="gray" style="padding-top:2px;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:20px;color:#535353;">&nbsp;&nbsp;&nbsp;왼쪽 아래 <b class="ink" style="font-weight:700;color:#181818;">「고급」 → 「페이스(으)로 이동」</b> 을 눌러 주세요.</div>
    </td></tr>

    <!-- 바닥 줄: 문의하기 -->
    <tr><td class="pad bg-main" bgcolor="#FFFFFF" style="padding:0 58px 28px 58px;background-color:#FFFFFF;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #181818;">
        <tr>
${contact ? `
          <td align="left" valign="middle" style="padding:19px 0 0 0;font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:20px;color:#777777;">로그인이 안 되나요? <a href="${escHtml(mailto)}" style="color:#181818;text-decoration:underline;">문의하기</a></td>` : ''}
        </tr>
      </table>
    </td></tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>
`
}
// 글만 보는 메일 앱용: 인사말 + 시작하는 방법 + 문의
function inviteText(message: string, r: { email: string }, appUrl: string, contact: InviteContact): string {
  appUrl = withLoginHint(appUrl, r.email)
  return `안녕하세요.
과제 관리 앱으로 초대합니다.
${message.trim()}

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

// 권한 관리 시트 -- 서버 없이 팀 전체가 같은 설정을 쓰기 위한 구글시트 한 개.
//   「사용자」 탭: 이메일 · 이름 · 역할(관리자/팀장/팀원) · 팀 · 메모
//   「연결 시트」 탭: 팀 · 추진현황 시트 링크 · 메모   ("전체" = 팀 행이 없는 사람 모두)
// 관리자가 앱(관리 › 권한 시트)에서 만들고, 구글시트 공유로 팀원에게 "보기" 권한을 준다.
// 각자의 앱은 로그인할 때 이 시트를 읽어 역할과 "관리자가 공유한 시트"를 정한다(이 브라우저에 기억).
// 어느 시트인지는: 주소의 ?access=ID(초대 링크) > 이 브라우저에 기억한 것 > 아래 기본값.
import { createSpreadsheet, fetchValues, parseSheetUrl, sheetUrl } from './sheetSources'

// 운영에 쓰는 권한 관리 시트(관리자가 앱에서 만든 「성과관리 앱 권한 관리」). 초대 링크에 ?access= 없이도 모두가 읽는다.
// id만으로는 아무도 못 읽는다 -- 구글시트 공유(뷰어)를 받은 사람만 읽힌다.
export const DEFAULT_ACCESS_SHEET_ID = '14dxpm3aO7c3vbxh1SzZFftlZRbKUJdeX3GO7DpgkOz4'

export type AccessRole = 'admin' | 'leader' | 'member'
export interface AccessUser {
  email: string
  name: string
  role: AccessRole
  team: string
}
export interface AccessLink {
  team: string
  url: string
  note: string
}
export interface AccessData {
  id: string
  title: string
  fetchedAt: string
  users: AccessUser[]
  links: AccessLink[]
}

export const USERS_TAB = '사용자'
export const LINKS_TAB = '연결 시트'
export const ALL_TEAMS = '전체'
export const ACCESS_EVENT = 'access-updated'
const ID_KEY = 'access-sheet-id'
const CACHE_KEY = 'access-sheet-cache'

const ROLE_WORDS: Record<string, AccessRole> = { 관리자: 'admin', admin: 'admin', 팀장: 'leader', leader: 'leader', 팀원: 'member', member: 'member' }
export const ROLE_WORD: Record<AccessRole, string> = { admin: '관리자', leader: '팀장', member: '팀원' }
const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

// 초대 링크(?access=ID)로 들어오면 기억하고 주소에서는 지운다
function takeUrlParam(): string | null {
  try {
    const u = new URL(window.location.href)
    const v = u.searchParams.get('access')
    if (!v) return null
    u.searchParams.delete('access')
    window.history.replaceState(null, '', u.toString())
    return parseSheetUrl(v)?.spreadsheetId ?? null
  } catch {
    return null
  }
}
const fromUrl = typeof window !== 'undefined' ? takeUrlParam() : null
if (fromUrl) setAccessSheetId(fromUrl)

export function getAccessSheetId(): string | null {
  try {
    return localStorage.getItem(ID_KEY) || DEFAULT_ACCESS_SHEET_ID || null
  } catch {
    return DEFAULT_ACCESS_SHEET_ID || null
  }
}
export function setAccessSheetId(id: string | null) {
  try {
    if (id) localStorage.setItem(ID_KEY, id)
    else localStorage.removeItem(ID_KEY)
  } catch {
    // 기억 못 해도 지금은 쓴다
  }
}
export function accessSheetUrl(id = getAccessSheetId()): string | null {
  return id ? sheetUrl(id) : null
}
// 팀원에게 보낼 앱 주소(열면 이 권한 시트를 기억)
export function appInviteUrl(id = getAccessSheetId()): string {
  const base = `${window.location.origin}${window.location.pathname}`
  // 기본 권한 시트면 주소만(짧게). 다른 시트를 쓸 때만 ?access=를 붙인다.
  return id && id !== DEFAULT_ACCESS_SHEET_ID ? `${base}?access=${id}` : base
}

export function readAccessCache(): AccessData | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as AccessData | null
    return v && v.id === getAccessSheetId() ? v : null
  } catch {
    return null
  }
}
function writeCache(d: AccessData | null) {
  try {
    if (d) localStorage.setItem(CACHE_KEY, JSON.stringify(d))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // 기억 못 해도 이번에는 쓴다
  }
  window.dispatchEvent(new Event(ACCESS_EVENT))
}

// 시트를 읽어 기억한다. 머리글(1행)은 건너뛰고 이메일 · 팀이 빈 줄은 뺀다.
export async function refreshAccess(id = getAccessSheetId()): Promise<AccessData | null> {
  if (!id) return null
  const { title, values } = await fetchValues(id, [`'${USERS_TAB}'!A2:E`, `'${LINKS_TAB}'!A2:C`])
  const [u = [], l = []] = values
  const users = u
    .map((r) => ({ email: norm(r[0]), name: (r[1] ?? '').trim(), role: ROLE_WORDS[(r[2] ?? '').trim()] ?? 'member', team: (r[3] ?? '').trim() }))
    .filter((x) => x.email.includes('@'))
  const links = l.map((r) => ({ team: (r[0] ?? '').trim(), url: (r[1] ?? '').trim(), note: (r[2] ?? '').trim() })).filter((x) => x.team && parseSheetUrl(x.url))
  const data: AccessData = { id, title, fetchedAt: new Date().toISOString(), users, links }
  writeCache(data)
  return data
}
export function forgetAccess() {
  setAccessSheetId(null)
  writeCache(null)
}

export function accessUserOf(email: string | null | undefined): AccessUser | null {
  const e = norm(email)
  if (!e) return null
  return readAccessCache()?.users.find((x) => x.email === e) ?? null
}
export function accessRoleOf(email: string | null | undefined): AccessRole | null {
  return accessUserOf(email)?.role ?? null
}
// 이 사람의 팀에 정한 추진현황 시트(없으면 "전체" 행)
export function sharedSheetFor(email: string | null | undefined): { url: string; team: string } | null {
  const d = readAccessCache()
  if (!d) return null
  const team = accessUserOf(email)?.team
  const hit = (team && d.links.find((x) => x.team === team)) || d.links.find((x) => x.team === ALL_TEAMS)
  return hit ? { url: hit.url, team: hit.team } : null
}

// 관리자가 처음 한 번: 머리글과 지금 아는 값으로 시트를 만든다(만든 사람 드라이브에).
export async function createAccessSheet(opts: { adminEmail: string; leaders: string[]; sheetLink: string }): Promise<string> {
  const users: string[][] = [
    ['이메일', '이름', '역할', '팀', '메모'],
    [opts.adminEmail, '', '관리자', '', '처음 만든 사람'],
    ...opts.leaders.filter((e) => norm(e) !== norm(opts.adminEmail)).map((e) => [e, '', '팀장', '', '']),
  ]
  const links: string[][] = [
    ['팀', '추진현황 시트 링크', '메모'],
    [ALL_TEAMS, opts.sheetLink, '팀 행이 없는 사람은 이 시트'],
  ]
  const guide: string[][] = [
    ['권한 관리 시트 사용법'],
    ['1. 「사용자」 탭에 앱을 쓸 사람의 구글 이메일 · 이름 · 역할(관리자/팀장/팀원) · 팀을 적습니다.'],
    ['2. 「연결 시트」 탭에 팀별 추진현황 시트 링크를 적습니다. "전체"는 팀 행이 없는 모두에게 쓰입니다.'],
    ['3. 오른쪽 위 "공유"에서 팀원들에게 이 시트 "뷰어" 권한을 줍니다(추진현황 시트도 따로 공유).'],
    ['4. 앱 › 관리 › 권한 시트에서 "다시 읽기"를 누르면 바로 반영됩니다. 팀원은 로그인할 때 읽습니다.'],
  ]
  const id = await createSpreadsheet('성과관리 앱 권한 관리', [
    { title: USERS_TAB, rows: users, widths: [240, 120, 90, 140, 200] },
    { title: LINKS_TAB, rows: links, widths: [140, 420, 220] },
    { title: '안내', rows: guide, widths: [720] },
  ])
  setAccessSheetId(id)
  return id
}

// 권한 관리 시트 -- 서버 없이 팀 전체가 같은 설정을 쓰기 위한 구글시트 한 개.
//   「사용자」 탭: 이메일 · 이름 · 역할(관리자/팀장/팀원) · 팀 · 메모 · 추가한 사람 · 받는 메일 · 초대 보냄
//   「연결 시트」 탭: 팀 · 추진현황 시트 링크 · 메모   ("전체" = 팀 행이 없는 사람 모두)
//   「변경 기록」 탭: 앱에서 저장할 때마다 시각 · 누가 · 무엇을 한 줄씩
// 관리자가 앱(관리 › 권한 시트)에서 만들고 고친다(앱에서 고쳐 저장하거나 시트에서 직접). 구글시트 공유로 팀원에게 "보기" 권한을 준다.
// 각자의 앱은 로그인할 때 이 시트를 읽어 역할과 "관리자가 공유한 시트"를 정한다(이 브라우저에 기억).
// 어느 시트인지는: 주소의 ?access=ID(초대 링크) > 이 브라우저에 기억한 것 > 아래 기본값.
import { appendRows, createSpreadsheet, fetchValues, parseSheetUrl, sheetUrl, writeValues } from './sheetSources'

// 운영에 쓰는 권한 관리 시트(관리자가 앱에서 만든 「성과관리 앱 권한 관리」). 초대 링크에 ?access= 없이도 모두가 읽는다.
// id만으로는 아무도 못 읽는다 -- 구글시트 공유(뷰어)를 받은 사람만 읽힌다.
export const DEFAULT_ACCESS_SHEET_ID = '14dxpm3aO7c3vbxh1SzZFftlZRbKUJdeX3GO7DpgkOz4'

export type AccessRole = 'admin' | 'leader' | 'member'
export interface AccessUser {
  email: string
  name: string
  role: AccessRole
  team: string
  memo?: string
  addedBy?: string // 팀원 탭에서 추가한 사람(팀장은 자기가 추가한 사람만 보고 관리)
  sendTo?: string // 초대 메일 받는 곳(비우면 로그인 Gmail)
  invitedAt?: string // 마지막으로 초대 메일 보낸 날(YYYY-MM-DD HH:mm)
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
export const LOG_TAB = '변경 기록'
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
  try {
    const data = await readSheet(id)
    writeCache(data)
    return data
  } catch (e) {
    // 기억한 시트에 「사용자」 탭이 없으면(과제 시트 등 다른 파일을 잘못 넣음) 기본 권한 시트로 돌아가 다시 읽는다
    const msg = e instanceof Error ? e.message : ''
    if (id !== DEFAULT_ACCESS_SHEET_ID && DEFAULT_ACCESS_SHEET_ID && /parse range|Unable to parse|찾지 못/i.test(msg)) {
      setAccessSheetId(null)
      const data = await readSheet(DEFAULT_ACCESS_SHEET_ID)
      writeCache(data)
      return data
    }
    throw e
  }
}
async function readSheet(id: string): Promise<AccessData & { userRows: number; linkRows: number }> {
  const { title, values } = await fetchValues(id, [`'${USERS_TAB}'!A2:H`, `'${LINKS_TAB}'!A2:C`])
  const [u = [], l = []] = values
  const users = u
    .map((r) => ({
      email: norm(r[0]),
      name: (r[1] ?? '').trim(),
      role: ROLE_WORDS[(r[2] ?? '').trim()] ?? 'member',
      team: (r[3] ?? '').trim(),
      memo: (r[4] ?? '').trim(),
      addedBy: norm(r[5]),
      sendTo: (r[6] ?? '').trim(),
      invitedAt: (r[7] ?? '').trim(),
    }))
    .filter((x) => x.email.includes('@'))
  const links = l.map((r) => ({ team: (r[0] ?? '').trim(), url: (r[1] ?? '').trim(), note: (r[2] ?? '').trim() })).filter((x) => x.team && parseSheetUrl(x.url))
  return { id, title, fetchedAt: new Date().toISOString(), users, links, userRows: u.length, linkRows: l.length }
}

// ---- 앱에서 고쳐 저장
const userRow = (u: AccessUser) => [norm(u.email), u.name.trim(), ROLE_WORD[u.role], u.team.trim(), (u.memo ?? '').trim(), norm(u.addedBy), (u.sendTo ?? '').trim(), (u.invitedAt ?? '').trim()]
const userSig = (x: AccessUser[]) => JSON.stringify(x.map(userRow))
const linkSig = (x: AccessLink[]) => JSON.stringify(x.map((l) => [l.team.trim(), l.url.trim(), l.note.trim()]))
export const sameAccess = (a: { users: AccessUser[]; links: AccessLink[] }, b: { users: AccessUser[]; links: AccessLink[] }) =>
  userSig(a.users) === userSig(b.users) && linkSig(a.links) === linkSig(b.links)

// 바뀐 것을 사람이 읽을 말로(확인창 · 변경 기록)
export function describeChanges(before: { users: AccessUser[]; links: AccessLink[] }, users: AccessUser[], links: AccessLink[]): string[] {
  const out: string[] = []
  const old = new Map(before.users.map((u) => [norm(u.email), u]))
  const now = new Map(users.map((u) => [norm(u.email), u]))
  const who = (u: AccessUser) => (u.name ? `${u.name}(${u.email})` : u.email)
  for (const [e, u] of now) {
    const o = old.get(e)
    if (!o) out.push(`추가: ${who(u)} · ${ROLE_WORD[u.role]}${u.team ? ` · ${u.team}` : ''}`)
    else {
      const ch: string[] = []
      if (o.role !== u.role) ch.push(`역할 ${ROLE_WORD[o.role]} → ${ROLE_WORD[u.role]}`)
      if (o.team !== u.team.trim()) ch.push(`팀 ${o.team || '(없음)'} → ${u.team.trim() || '(없음)'}`)
      if (o.name !== u.name.trim()) ch.push(`이름 ${o.name || '(없음)'} → ${u.name.trim() || '(없음)'}`)
      if ((o.memo ?? '') !== (u.memo ?? '').trim()) ch.push('메모')
      if (ch.length) out.push(`변경: ${who(u)} · ${ch.join(' · ')}`)
    }
  }
  for (const [e, o] of old) if (!now.has(e)) out.push(`삭제: ${who(o)}`)
  const lk = (l: AccessLink) => `${l.team}|${l.url.trim()}|${l.note.trim()}`
  const oldL = new Set(before.links.map(lk))
  const nowL = new Set(links.map(lk))
  for (const l of links) if (!oldL.has(lk(l))) out.push(`연결 시트: ${l.team} → ${l.note || l.url}`)
  for (const l of before.links) if (!nowL.has(lk(l)) && !links.some((x) => x.team === l.team)) out.push(`연결 시트 삭제: ${l.team}`)
  return out
}

// 시트에 쓴다. 쓰기 직전에 다시 읽어, 앱에서 고치기 시작한 뒤 누가 시트를 바꿨으면 쓰지 않는다(덮어쓰기 방지).
// 줄 수가 줄면 남는 줄은 빈칸으로. 다 쓴 뒤 「변경 기록」에 한 줄(기록이 실패해도 저장은 된 것).
export class AccessConflictError extends Error {}
export async function saveAccess(base: AccessData, users: AccessUser[], links: AccessLink[], by: string): Promise<AccessData> {
  const fresh = await readSheet(base.id)
  if (!sameAccess(fresh, base)) {
    writeCache(fresh)
    throw new AccessConflictError('그사이 구글시트에서 권한이 바뀌었습니다. 시트 내용을 다시 읽었으니 확인한 뒤 다시 고쳐 저장해 주세요.')
  }
  return writeAccess(fresh, users, links, by, describeChanges(base, users, links))
}
// 팀원 탭처럼 몇 사람만 바꿀 때: 시트를 새로 읽어 그 위에 바꿔 쓴다(다른 사람이 그사이 고친 줄은 그대로)
export async function updateUsers(id: string, change: (users: AccessUser[]) => AccessUser[], by: string, what: string[]): Promise<AccessData> {
  const fresh = await readSheet(id)
  return writeAccess(fresh, change(fresh.users), fresh.links, by, what)
}
async function writeAccess(
  fresh: AccessData & { userRows: number; linkRows: number },
  users: AccessUser[],
  links: AccessLink[],
  by: string,
  changes: string[],
): Promise<AccessData> {
  const base = fresh
  const pad = (rows: string[][], n: number, w: number) => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => Array(w).fill(''))]
  const uRows = pad(
    users.map(userRow),
    fresh.userRows,
    8,
  )
  const lRows = pad(
    links.map((l) => [l.team.trim(), l.url.trim(), l.note.trim()]),
    fresh.linkRows,
    3,
  )
  await writeValues(base.id, [
    { range: `'${USERS_TAB}'!F1:H1`, values: [['추가한 사람', '받는 메일', '초대 보냄']] },
    ...(uRows.length ? [{ range: `'${USERS_TAB}'!A2:H${uRows.length + 1}`, values: uRows }] : []),
    ...(lRows.length ? [{ range: `'${LINKS_TAB}'!A2:C${lRows.length + 1}`, values: lRows }] : []),
  ])
  try {
    const at = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
    await appendRows(base.id, LOG_TAB, ['시각', '누가', '바꾼 것'], [[at, by, changes.join(' / ') || '(내용 변화 없음)']])
  } catch {
    // 기록 탭을 못 써도 권한은 저장됐다
  }
  return (await refreshAccess(base.id))!
}
// 과제 시트는 연구소에 하나: 「연결 시트」를 「전체」 한 줄로 바꿔 쓴다(예전 팀별 줄은 지움)
export async function setTaskSheet(id: string, url: string, title: string, by: string): Promise<AccessData> {
  const fresh = await readSheet(id)
  return writeAccess(fresh, fresh.users, [{ team: ALL_TEAMS, url, note: title }], by, [`과제 시트 바꿈: ${title}`])
}
export function taskSheetOf(d: AccessData | null): AccessLink | null {
  return d?.links.find((x) => x.team === ALL_TEAMS) ?? d?.links[0] ?? null
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
    ['이메일', '이름', '역할', '팀', '메모', '추가한 사람', '받는 메일', '초대 보냄'],
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
    [
      '4. 앱 › 관리 › 권한 시트에서 바로 고쳐 "구글시트에 저장"할 수도 있습니다(「변경 기록」 탭에 남음). 시트에서 고쳤다면 앱에서 "다시 읽기". 팀원은 로그인할 때 읽습니다.',
    ],
  ]
  const id = await createSpreadsheet('성과관리 앱 권한 관리', [
    { title: USERS_TAB, rows: users, widths: [240, 120, 90, 140, 200] },
    { title: LINKS_TAB, rows: links, widths: [140, 420, 220] },
    { title: '안내', rows: guide, widths: [720] },
    { title: LOG_TAB, rows: [['시각', '누가', '바꾼 것']], widths: [160, 220, 640] },
  ])
  setAccessSheetId(id)
  return id
}

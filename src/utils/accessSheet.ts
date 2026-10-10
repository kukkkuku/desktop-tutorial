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
export type SheetShare = '' | '편집자' | '뷰어'
export interface AccessUser {
  email: string
  name: string
  role: AccessRole
  team: string
  memo?: string
  addedBy?: string // 팀원 탭에서 추가한 사람(팀장은 자기가 추가한 사람만 보고 관리)
  sendTo?: string // 초대 메일 받는 곳(비우면 로그인 Gmail)
  invitedAt?: string // 마지막으로 초대 메일 보낸 날(YYYY-MM-DD HH:mm)
  // 실적관리 시트 권한(관리자가 공유하고 표시한 값 -- 구글에서 직접 읽지 않음): 편집자 · 뷰어 · 빈칸(공유 전)
  sheetShare?: SheetShare
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
  // 앱 설정(「연결 시트」 탭의 # 줄): contact = 로그인 문의 받는 사람('leader' 초대한 팀장 · 'admin' 관리자)
  settings?: Record<string, string>
}

export const USERS_TAB = '사용자'
export const LINKS_TAB = '연결 시트'
export const LOG_TAB = '변경 기록'
export const ALL_TEAMS = '전체'
export const ACCESS_EVENT = 'access-updated'
const ID_KEY = 'access-sheet-id'
const CACHE_KEY = 'access-sheet-cache'

const ROLE_WORDS: Record<string, AccessRole> = { 관리자: 'admin', admin: 'admin', 팀장: 'leader', leader: 'leader', 팀원: 'member', member: 'member' }
// Gmail을 아직 모르는 사람(평가 목록에서 이름만 불러옴): 자리표시 계정 '…@pending'. 표에서 Gmail을 넣으면 바뀐다.
// 로그인 · 초대 메일 · 시트 공유에서는 빠진다.
export const PENDING_SUFFIX = '@pending'
export const isPendingEmail = (e: string | null | undefined) => (e ?? '').endsWith(PENDING_SUFFIX)
export const newPendingEmail = (i = 0) => `p${Date.now().toString(36)}${i}${PENDING_SUFFIX}`
export const ROLE_WORD: Record<AccessRole, string> = { admin: '관리자', leader: '팀장', member: '팀원' }
const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

// 초대 링크(?access=ID · ?task=ID)로 들어오면 기억하고 주소에서는 지운다
function takeUrlParam(key: string): string | null {
  try {
    const u = new URL(window.location.href)
    const v = u.searchParams.get(key)
    if (!v) return null
    u.searchParams.delete(key)
    window.history.replaceState(null, '', u.toString())
    return parseSheetUrl(v)?.spreadsheetId ?? null
  } catch {
    return null
  }
}
const fromUrl = typeof window !== 'undefined' ? takeUrlParam('access') : null
if (fromUrl) setAccessSheetId(fromUrl)
// 팀원은 권한 시트(명단)를 공유받지 않는다 -- 과제 시트는 초대 링크로 알려 준 것을 기억해 쓴다
const TASK_HINT_KEY = 'task-sheet-hint'
const taskFromUrl = typeof window !== 'undefined' ? takeUrlParam('task') : null
if (taskFromUrl)
  try {
    localStorage.setItem(TASK_HINT_KEY, taskFromUrl)
  } catch {
    // 기억 못 하면 앱 기본 시트
  }
function taskHint(): string | null {
  try {
    const id = localStorage.getItem(TASK_HINT_KEY)
    return id ? sheetUrl(id) : null
  } catch {
    return null
  }
}

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
// 팀원에게 보낼 앱 주소(열면 이 권한 시트 · 과제 시트를 기억)
// 기본 권한 시트면 ?access= 없이(짧게). 과제 시트는 팀원이 권한 시트를 못 읽으므로 링크로 알려 준다.
export function appInviteUrl(id = getAccessSheetId(), taskUrl?: string | null): string {
  const base = `${window.location.origin}${window.location.pathname}`
  const q = new URLSearchParams()
  if (id && id !== DEFAULT_ACCESS_SHEET_ID) q.set('access', id)
  const task = parseSheetUrl(taskUrl ?? '')?.spreadsheetId
  if (task) q.set('task', task)
  const qs = q.toString()
  return qs ? `${base}?${qs}` : base
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
  const { title, values } = await fetchValues(id, [`'${USERS_TAB}'!A2:I`, `'${LINKS_TAB}'!A2:C`])
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
      sheetShare: (['편집자', '뷰어'].includes((r[8] ?? '').trim()) ? (r[8] ?? '').trim() : '') as SheetShare,
    }))
    .filter((x) => x.email.includes('@'))
  const links = l.map((r) => ({ team: (r[0] ?? '').trim(), url: (r[1] ?? '').trim(), note: (r[2] ?? '').trim() })).filter((x) => x.team && parseSheetUrl(x.url))
  const settings = Object.fromEntries(l.filter((r) => (r[0] ?? '').trim().startsWith('#')).map((r) => [(r[0] ?? '').trim().slice(1), (r[1] ?? '').trim()]))
  return { id, title, fetchedAt: new Date().toISOString(), users, links, settings, userRows: u.length, linkRows: l.length }
}

// ---- 앱에서 고쳐 저장
const userRow = (u: AccessUser) => [norm(u.email), u.name.trim(), ROLE_WORD[u.role], u.team.trim(), (u.memo ?? '').trim(), norm(u.addedBy), (u.sendTo ?? '').trim(), (u.invitedAt ?? '').trim(), u.sheetShare ?? '']
const userSig = (x: AccessUser[]) => JSON.stringify(x.map(userRow))
const linkSig = (x: AccessLink[]) => JSON.stringify(x.map((l) => [l.team.trim(), l.url.trim(), l.note.trim()]))
export const sameAccess = (a: { users: AccessUser[]; links: AccessLink[] }, b: { users: AccessUser[]; links: AccessLink[] }) =>
  userSig(a.users) === userSig(b.users) && linkSig(a.links) === linkSig(b.links)

// 바뀐 것을 사람이 읽을 말로(확인창 · 변경 기록)
export function describeChanges(before: { users: AccessUser[]; links: AccessLink[] }, users: AccessUser[], links: AccessLink[]): string[] {
  const out: string[] = []
  const old = new Map(before.users.map((u) => [norm(u.email), u]))
  const now = new Map(users.map((u) => [norm(u.email), u]))
  const who = (u: AccessUser) => (isPendingEmail(u.email) ? u.name || '(이름 없음)' : u.name ? `${u.name}(${u.email})` : u.email)
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
// 같은 사람이 두 줄: Gmail 없는 자리표시 줄(이름만)은 같은 팀 · 같은 이름의 다른 줄이 있으면 뺀다.
// 앱은 Gmail 없는 사람을 이름으로만 구분하므로(teamRoster), 둘을 남겨도 구분할 방법이 없다.
// Gmail 있는 줄이 있으면 그 줄을 남기고, 자리표시 줄끼리면 먼저 적힌 줄을 남긴다.
// (두 탭에서 거의 동시에 팀원 명단을 맞추면 둘 다 「아직 없음」을 보고 한 번씩 넣어 같은 이름이 두 줄이 됐다)
const dupKey = (u: AccessUser) => `${u.role}|${u.team.trim()}|${u.name.trim()}`
export function pendingDuplicates(users: AccessUser[]): AccessUser[] {
  const real = new Set(users.filter((u) => !isPendingEmail(u.email) && u.name.trim()).map(dupKey))
  const seen = new Set<string>()
  const out: AccessUser[] = []
  for (const u of users) {
    if (!isPendingEmail(u.email) || !u.name.trim()) continue
    const k = dupKey(u)
    if (real.has(k) || seen.has(k)) out.push(u)
    else seen.add(k)
  }
  return out
}
export function withoutPendingDuplicates(users: AccessUser[]): AccessUser[] {
  const drop = new Set(pendingDuplicates(users).map((u) => u.email))
  return drop.size ? users.filter((u) => !drop.has(u.email)) : users
}

async function writeAccess(
  fresh: AccessData & { userRows: number; linkRows: number },
  users: AccessUser[],
  links: AccessLink[],
  by: string,
  changes: string[],
  settings?: Record<string, string>,
): Promise<AccessData> {
  const base = fresh
  users = withoutPendingDuplicates(users)
  const pad = (rows: string[][], n: number, w: number) => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => Array(w).fill(''))]
  const uRows = pad(
    users.map(userRow),
    fresh.userRows,
    9,
  )
  const lRows = pad(
    [
      ...links.map((l) => [l.team.trim(), l.url.trim(), l.note.trim()]),
      ...Object.entries(settings ?? fresh.settings ?? {}).map(([k, v]) => [`#${k}`, v, '앱 설정']),
    ],
    fresh.linkRows,
    3,
  )
  await writeValues(base.id, [
    { range: `'${USERS_TAB}'!F1:I1`, values: [['추가한 사람', '받는 메일', '초대 보냄', '시트 권한']] },
    ...(uRows.length ? [{ range: `'${USERS_TAB}'!A2:I${uRows.length + 1}`, values: uRows }] : []),
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
  // 열 탭 선택은 예전 시트의 것이라 함께 비운다
  const { taskTab: _old, taskTabs: _old2, ...settings } = fresh.settings ?? {}
  void _old
  void _old2
  return writeAccess(fresh, fresh.users, [{ team: ALL_TEAMS, url, note: title }], by, [`과제 시트 바꿈: ${title}`], settings)
}
// 관리자가 정한, 앱을 열면 먼저 열 시트 탭(예: 2026 추진현황) -- 없으면 올해 탭
export const taskTabOf = (d: AccessData | null): string | null => d?.settings?.taskTab || null
// 관리자가 앱에 보이기로 한 탭들(연도 메뉴에는 이것만 뜬다) -- 정한 적이 없으면 null
export const taskTabsOf = (d: AccessData | null): string[] | null => {
  const v = d?.settings?.taskTabs
  return v ? v.split('|').map((x) => x.trim()).filter(Boolean) : null
}
// 보일 탭들과 그중 먼저 열 탭을 한 번에 저장
export async function setTaskTabs(id: string, tabs: string[], open: string, by: string): Promise<AccessData> {
  const fresh = await readSheet(id)
  const settings = { ...(fresh.settings ?? {}), taskTabs: tabs.join('|'), taskTab: open }
  return writeAccess(fresh, fresh.users, fresh.links, by, [`앱에 보일 탭: ${tabs.join(', ')} (먼저 열 탭: ${open})`], settings)
}
// 앱 설정 한 칸 바꾸기(예: 로그인 문의 받는 사람)
export async function setAccessSetting(id: string, key: string, value: string, by: string, what: string): Promise<AccessData> {
  const fresh = await readSheet(id)
  return writeAccess(fresh, fresh.users, fresh.links, by, [what], { ...(fresh.settings ?? {}), [key]: value })
}
export type ContactMode = 'leader' | 'admin'
export const contactModeOf = (d: AccessData | null): ContactMode => (d?.settings?.contact === 'admin' ? 'admin' : 'leader')
// 초대받은 사람의 로그인 문의를 받을 사람: 팀장 모드면 추가한 팀장(아니면 그 팀의 팀장), 관리자 모드면 첫 관리자
export function contactFor(d: AccessData, u: AccessUser, sender: string): { email: string; name: string } | null {
  const byEmail = (e: string) => d.users.find((x) => x.email === e)
  const pick = (x: AccessUser | undefined) => (x ? { email: x.email, name: x.name } : null)
  const admin = pick(d.users.find((x) => x.role === 'admin')) ?? (sender ? { email: sender, name: '' } : null)
  if (contactModeOf(d) === 'admin') return admin
  const adder = byEmail(u.addedBy ?? '') ?? byEmail(sender)
  if (adder && adder.role !== 'member') return pick(adder)
  return pick(d.users.find((x) => x.role === 'leader' && x.team && x.team === u.team)) ?? admin
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
  const hint = taskHint()
  if (!d) return hint ? { url: hint, team: ALL_TEAMS } : null
  // 관리자가 「관리 › 실적관리 시트」에서 정한 시트 하나(전체 줄)가 앱 전체의 기준이다. 예전 팀별 줄이 남아 있어도 따르지 않는다.
  void email
  const hit = taskSheetOf(d)
  return hit ? { url: hit.url, team: hit.team } : null
}

// 관리자가 처음 한 번: 머리글과 지금 아는 값으로 시트를 만든다(만든 사람 드라이브에).
export async function createAccessSheet(opts: { adminEmail: string; leaders: string[]; sheetLink: string }): Promise<string> {
  const users: string[][] = [
    ['이메일', '이름', '역할', '팀', '메모', '추가한 사람', '받는 메일', '초대 보냄', '시트 권한'],
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

// ---- 인수인계(팀 이동): 이전 팀장이 남긴 의견 · 맡았던 과제 → 새 팀장이 평가할 때 참고
// 권한 시트의 숨김 탭 「인수인계」(팀장 · 관리자만 공유받는 시트라 팀원 본인은 못 본다).
export const HANDOVER_TAB = '인수인계'
const HANDOVER_HEADER = ['시각', 'Gmail', '이름', '이전 팀', '새 팀', '이전 팀장', '의견', '맡았던 과제']
export interface Handover {
  at: string
  email: string
  name: string
  fromTeam: string
  toTeam: string
  by: string
  opinion: string
  tasks: string
}
export async function writeHandover(id: string, h: Omit<Handover, 'at'>): Promise<void> {
  const at = new Date().toLocaleString('sv-SE', { hour12: false }).slice(0, 16)
  await appendRows(id, HANDOVER_TAB, HANDOVER_HEADER, [[at, norm(h.email), h.name, h.fromTeam, h.toTeam, norm(h.by), h.opinion, h.tasks]], { hidden: true })
}
// 시트에는 「과제 이름 10% / 과제 이름 20%」 한 칸 글로 저장돼 있다 -- 화면에서는 줄마다 나눠 보여 주려고 되돌린다.
// 과제 이름 안에 「 / 」가 있어도 「%」 바로 뒤의 「 / 」에서만 자른다. 기여도 형식이 아니면 한 줄 그대로.
export function parseHandoverTasks(text: string): { name: string; percent: string | null; assigned: boolean }[] {
  return text
    .split(/(?<=%|\(담당\)) \/ /)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*\S)\s+(\d+(?:\.\d+)?)%$/)
      if (m) return { name: m[1], percent: m[2], assigned: false }
      // 기여도는 없지만 담당자로 맡았던 과제
      const a = part.match(/^(.*\S)\s+\(담당\)$/)
      return a ? { name: a[1], percent: null, assigned: true } : { name: part, percent: null, assigned: false }
    })
}
// 없으면(탭이 아직 없음 · 못 읽음) 빈 목록
export async function readHandovers(id = getAccessSheetId()): Promise<Handover[]> {
  if (!id) return []
  try {
    const { values } = await fetchValues(id, [`'${HANDOVER_TAB}'!A2:H`])
    return (values[0] ?? [])
      .map((r) => ({ at: r[0] ?? '', email: norm(r[1]), name: r[2] ?? '', fromTeam: r[3] ?? '', toTeam: r[4] ?? '', by: norm(r[5]), opinion: r[6] ?? '', tasks: r[7] ?? '' }))
      .filter((h) => h.email)
  } catch {
    return []
  }
}

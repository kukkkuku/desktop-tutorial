// 피어리뷰 요청: 팀장이 성과관리에서 요청을 열면 팀원이 과제 입력 › 피어리뷰에서 순위 · 근거를 제출한다.
// 둘은 다른 브라우저라서, 과제 입력이 연결한 구글시트의 숨은 탭 두 개로 주고받는다.
//   _피어리뷰_요청: 요청ID | 제목 | 대상 팀원(줄마다 '이름 <계정>', 계정은 없을 수 있음) | 마감일 | 상태(열림/마감) | 연 사람 | 연 시각
//   _피어리뷰_응답: 요청ID | 평가자 | 평가자 계정 | 대상 팀원 | 순위 | 근거 | 제출 시각
// 다시 제출하면 줄을 덧붙이고, 읽을 때 평가자마다 가장 늦은 제출만 쓴다.
import { v4 as uuidv4 } from 'uuid'
import { accountScope } from './accountScope'
import { appendSheetValues, ensureHiddenTab, parseSheetUrl, readSheetValues, updateSheetValue } from './sheetSources'
import { TASK_INPUT_SHEET_URL, isProtectedSheet, readLinkedSheet } from './progressBoard'

export const REQ_TAB = '_피어리뷰_요청'
export const RES_TAB = '_피어리뷰_응답'
const REQ_HEADER = ['요청ID', '제목', '대상 팀원', '마감일', '상태', '연 사람', '연 시각']
const RES_HEADER = ['요청ID', '평가자', '평가자 계정', '대상 팀원', '순위', '근거', '제출 시각']

export interface PeerRequest {
  id: string
  title: string
  roster: string[] // 평가에 참여하는 팀원 이름(서로 평가)
  emails: Record<string, string> // 이름 → 구글 계정(팀원 정보에 이메일이 있을 때). 로그인한 계정으로 '나'를 찾는다
  due: string // YYYY-MM-DD
  open: boolean
  openedBy: string
  openedAt: string
  row: number // 시트 줄 번호(1부터) -- 상태를 바꿀 때
}

export interface PeerEntry {
  target: string
  rank: number
  reason: string
}

export interface PeerSubmission {
  requestId: string
  reviewer: string
  email: string
  submittedAt: string
  entries: PeerEntry[]
}

// 피어리뷰를 주고받는 시트: 과제 입력이 연결한 시트(없으면 기본 테스트 시트)
export function peerSheetId(): string | null {
  return parseSheetUrl(readLinkedSheet() ?? TASK_INPUT_SHEET_URL)?.spreadsheetId ?? null
}
export function peerSheetWritable(id: string | null): boolean {
  return !!id && !isProtectedSheet(id)
}

// 탭이 아직 없으면(요청을 한 번도 안 열었으면) 빈 목록
async function readTab(id: string, tab: string): Promise<string[][] | null> {
  try {
    return await readSheetValues(id, tab, 'A:G')
  } catch (e) {
    if (e instanceof Error && /Unable to parse range|\(400\)/.test(e.message)) return null
    throw e
  }
}

export function parseRequests(rows: string[][]): PeerRequest[] {
  const out: PeerRequest[] = []
  rows.forEach((r, i) => {
    if (i === 0 || !r[0]) return
    const emails: Record<string, string> = {}
    const roster = (r[2] ?? '')
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = /^(.*?)\s*<([^>]+)>$/.exec(s)
        if (!m) return s
        emails[m[1]] = m[2].trim().toLowerCase()
        return m[1]
      })
    out.push({
      id: r[0],
      title: r[1] ?? '',
      roster,
      emails,
      due: r[3] ?? '',
      open: (r[4] ?? '') !== '마감',
      openedBy: r[5] ?? '',
      openedAt: r[6] ?? '',
      row: i + 1,
    })
  })
  return out.sort((a, b) => b.openedAt.localeCompare(a.openedAt))
}

// 평가자마다 가장 늦게 낸 한 번만 남긴다.
export function parseSubmissions(rows: string[][]): PeerSubmission[] {
  const byKey = new Map<string, PeerSubmission>()
  rows.forEach((r, i) => {
    if (i === 0 || !r[0] || !r[1]) return
    const [requestId, reviewer, email, target, rank, reason, at] = r
    const key = `${requestId}\u0000${reviewer}`
    const cur = byKey.get(key)
    if (cur && cur.submittedAt > (at ?? '')) return
    const sub = cur && cur.submittedAt === at ? cur : { requestId, reviewer, email: email ?? '', submittedAt: at ?? '', entries: [] }
    sub.entries.push({ target: target ?? '', rank: Number(rank), reason: reason ?? '' })
    byKey.set(key, sub)
  })
  for (const s of byKey.values()) s.entries.sort((a, b) => a.rank - b.rank)
  return Array.from(byKey.values())
}

export async function loadPeerBoard(id: string): Promise<{ requests: PeerRequest[]; submissions: PeerSubmission[] }> {
  const [req, res] = await Promise.all([readTab(id, REQ_TAB), readTab(id, RES_TAB)])
  return { requests: req ? parseRequests(req) : [], submissions: res ? parseSubmissions(res) : [] }
}

export async function openPeerRequest(
  id: string,
  r: { title: string; roster: { name: string; email?: string }[]; due: string; openedBy: string },
): Promise<void> {
  await ensureHiddenTab(id, REQ_TAB, REQ_HEADER)
  await ensureHiddenTab(id, RES_TAB, RES_HEADER)
  await appendSheetValues(id, REQ_TAB, [
    [
      uuidv4(),
      r.title,
      r.roster.map((p) => (p.email ? `${p.name} <${p.email.trim().toLowerCase()}>` : p.name)).join('\n'),
      r.due,
      '열림',
      r.openedBy,
      new Date().toISOString(),
    ],
  ])
}

export async function setPeerRequestOpen(id: string, req: PeerRequest, open: boolean): Promise<void> {
  await updateSheetValue(id, REQ_TAB, `E${req.row}`, open ? '열림' : '마감')
}

export async function submitPeerReview(id: string, requestId: string, reviewer: string, email: string, entries: PeerEntry[]): Promise<string> {
  const at = new Date().toISOString()
  await appendSheetValues(
    id,
    RES_TAB,
    entries.map((e) => [requestId, reviewer, email, e.target, e.rank, e.reason.trim(), at]),
  )
  return at
}

// 순위는 1..N 한 번씩, 근거는 모두 필수
export function checkEntries(entries: PeerEntry[]): string[] {
  const errors: string[] = []
  const n = entries.length
  const ranks = new Set(entries.map((e) => e.rank))
  if (ranks.size !== n || entries.some((e) => !Number.isInteger(e.rank) || e.rank < 1 || e.rank > n)) errors.push('순위가 겹치거나 빠졌습니다.')
  for (const e of entries) if (!e.reason.trim()) errors.push(`${e.target}의 근거를 적어 주세요.`)
  return errors
}

// 마감일까지 남은 날(오늘 마감이면 0, 지났으면 음수)
export function daysLeft(due: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

export function dueLabel(due: string): string {
  const n = daysLeft(due)
  if (n === null) return due ? `마감 ${due}` : '마감일 없음'
  return `마감 ${due.slice(5).replace('-', '/')} · ${n > 0 ? `D-${n}` : n === 0 ? '오늘 마감' : `${-n}일 지남`}`
}

// ---------- 팀원 화면: 나(이름) · 작성 중인 내용 기억 ----------
const meKey = () => `peer-request:me:${accountScope()}`
export function readMe(): string {
  try {
    return localStorage.getItem(meKey()) ?? ''
  } catch {
    return ''
  }
}
export function writeMe(name: string) {
  try {
    localStorage.setItem(meKey(), name)
  } catch {
    // 기억 못 해도 이번에는 그대로
  }
}
const draftKey = (requestId: string, me: string) => `peer-request:draft:${accountScope()}:${requestId}:${me}`
export function readDraft(requestId: string, me: string): PeerEntry[] | null {
  try {
    const v = localStorage.getItem(draftKey(requestId, me))
    return v ? (JSON.parse(v) as PeerEntry[]) : null
  } catch {
    return null
  }
}
export function writeDraft(requestId: string, me: string, entries: PeerEntry[] | null) {
  try {
    if (entries) localStorage.setItem(draftKey(requestId, me), JSON.stringify(entries))
    else localStorage.removeItem(draftKey(requestId, me))
  } catch {
    // 무시
  }
}

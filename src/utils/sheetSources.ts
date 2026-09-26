// 과제관리 시트를 RawSheet로 읽어 오는 두 경로.
//   A) Google Sheets API -- 링크만 붙여넣으면 로그인 계정 권한으로 읽는다(기본)
//   B) xlsx 파일 -- 시트에서 "파일 › 다운로드 › xlsx"로 받은 파일(대체 경로)
// 둘 다 같은 RawSheet를 돌려주고, 해석은 sheetImport.ts가 한다.

import * as XLSX from 'xlsx'
import type { DateCell, RawSheet, SheetMerge } from './sheetImport'
import { getConnectedEmail, loadGis, withAuthLock } from './googleDrive'

// ---------- 링크 ----------

// 디자인연구소 구글시트(추진현황·진척률 탭이 있는 파일)
export const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wnE6O8uIdCPPPHPYvQj5SBCSN9LlunkNT8dncA7NL2o/edit'

export function parseSheetUrl(input: string): { spreadsheetId: string; gid: number | null } | null {
  const text = input.trim()
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)
  const id = m ? m[1] : /^[a-zA-Z0-9_-]{30,}$/.test(text) ? text : null
  if (!id) return null
  const g = text.match(/[#&?]gid=(\d+)/)
  return { spreadsheetId: id, gid: g ? Number(g[1]) : null }
}

export function sheetUrl(spreadsheetId: string, gid?: number): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit${gid !== undefined ? `#gid=${gid}` : ''}`
}

// ---------- A) Sheets API ----------

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
// 읽기 전용. 로그인 때 받은 Drive/Calendar 토큰과는 따로, 시트를 처음
// 가져올 때 한 번 추가 동의를 받는다(기존 로그인에는 영향 없음).
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
// 과제 입력에서 시트에 저장할 때만 쓰기 권한을 따로 받는다(읽기만 하는 사람은 동의할 일 없음).
const SHEETS_WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

let sheetsToken: { token: string; expiresAt: number } | null = null
let sheetsWriteToken: { token: string; expiresAt: number } | null = null
// 다음 시트 권한 요청은 계정 힌트 없이 계정 선택 화면부터 연다. 브라우저에 구글 계정이
// 여러 개 로그인돼 있으면 힌트와 엇갈려 구글이 "400 · malformed"를 내는 경우가 있어서,
// 그때 사용자가 직접 계정을 고르게 하는 재시도 경로.
let chooseAccountNext = false
export function chooseSheetsAccountNext() {
  chooseAccountNext = true
  sheetsToken = null
}

export function isSheetsApiConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

let sheetsInflight: Promise<string> | null = null
async function getSheetsToken(write = false): Promise<string> {
  if (write) {
    if (sheetsWriteToken && sheetsWriteToken.expiresAt - 60_000 > Date.now()) return sheetsWriteToken.token
    return withAuthLock(() => openSheetsPopup(true))
  }
  // 쓰기 권한을 이미 받았으면 읽기에도 그대로 쓴다.
  if (sheetsWriteToken && sheetsWriteToken.expiresAt - 60_000 > Date.now()) return sheetsWriteToken.token
  if (sheetsToken && sheetsToken.expiresAt - 60_000 > Date.now()) return sheetsToken.token
  if (sheetsInflight) return sheetsInflight
  const p = withAuthLock(() => {
    if (sheetsToken && sheetsToken.expiresAt - 60_000 > Date.now()) return Promise.resolve(sheetsToken.token)
    return openSheetsPopup()
  }).finally(() => {
    sheetsInflight = null
  })
  sheetsInflight = p
  return p
}

async function openSheetsPopup(write = false): Promise<string> {
  if (!CLIENT_ID) throw new Error('Google Client ID가 설정되지 않았습니다. xlsx 파일로 올려 주세요.')
  await loadGis()
  const google = window.google
  if (!google) throw new Error('Google 로그인 스크립트가 로드되지 않았습니다.')
  const choose = chooseAccountNext
  chooseAccountNext = false
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: write ? SHEETS_WRITE_SCOPE : SHEETS_SCOPE,
      // 평소에는 이미 로그인한 계정으로 바로 동의 화면을 띄운다(계정 선택 생략).
      ...(choose ? {} : ({ login_hint: getConnectedEmail() ?? undefined } as object)),
      error_callback: (err) =>
        reject(
          new SheetsAuthError(
            err.type === 'popup_failed_to_open'
              ? '구글 로그인 창이 열리지 않았습니다(팝업 차단 확인).'
              : '구글 로그인 창이 닫혔습니다. 창에 "400 · That’s an error"가 떴다면 아래 "계정 골라서 다시 연결"을 눌러 주세요.',
          ),
        ),
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new Error(
              resp.error === 'access_denied' ? `시트 ${write ? '저장' : '읽기'} 권한을 허용하지 않았습니다.` : resp.error || '로그인이 취소되었습니다.',
            ),
          )
          return
        }
        const tok = { token: resp.access_token, expiresAt: Date.now() + (resp.expires_in ?? 3300) * 1000 }
        if (write) sheetsWriteToken = tok
        else sheetsToken = tok
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken(choose ? { prompt: 'select_account' } : undefined)
  })
}

// 로그인 창 문제(닫힘·400 등). 화면에서 "계정 골라서 다시 연결"을 보여 줄지 판단한다.
export class SheetsAuthError extends Error {}

// 구글이 돌려준 오류 이유를 사람이 할 일로 바꾼다. 403 하나에도 "API가 꺼져
// 있음"과 "이 계정에 시트 권한 없음"이 섞여 있어서, 뭉뚱그리면 뭘 고쳐야
// 할지 알 수 없다(실제로 그랬다).
interface GoogleApiError {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: { reason?: string; metadata?: { activationUrl?: string; consumer?: string }; links?: { url?: string }[] }[]
  }
}

async function sheetsFetch<T>(url: string, init?: { method: string; body: string }, write = false): Promise<T> {
  const token = await getSheetsToken(write)
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: { Authorization: `Bearer ${token}`, ...(init ? { 'Content-Type': 'application/json' } : {}) },
  })
  if (res.ok) return (await res.json()) as T
  if (res.status === 401) {
    sheetsToken = null
    sheetsWriteToken = null
  }
  const text = await res.text().catch(() => '')
  let parsed: GoogleApiError = {}
  try {
    parsed = JSON.parse(text) as GoogleApiError
  } catch {
    // 본문이 JSON이 아니면 원문 일부를 그대로 보여 준다.
  }
  const err = parsed.error
  const reasons = (err?.details ?? []).map((d) => d.reason).filter(Boolean)
  const activation =
    err?.details?.find((d) => d.metadata?.activationUrl)?.metadata?.activationUrl ??
    err?.details?.flatMap((d) => d.links ?? []).find((l) => l.url?.includes('console'))?.url
  const who = getConnectedEmail()
  if (reasons.includes('SERVICE_DISABLED') || /has not been used|is disabled/i.test(err?.message ?? '')) {
    throw new Error(
      `구글 클라우드 프로젝트에서 "Google Sheets API"가 꺼져 있습니다. 앱 관리자가 한 번 켜 주면 됩니다${activation ? `: ${activation}` : ' (구글 클라우드 콘솔 › API 및 서비스 › 라이브러리 › Google Sheets API › 사용)'}. 켠 뒤 몇 분 지나 다시 시도해 주세요.`,
    )
  }
  if (res.status === 404) throw new Error('시트를 찾지 못했습니다. 링크가 맞는지 확인해 주세요.')
  if (res.status === 403) {
    if (write)
      throw new Error(
        `${who ? `로그인한 계정(${who})` : '로그인한 계정'}에 이 시트를 편집할 권한이 없습니다. 시트 소유자에게 편집 권한을 요청해 주세요. (구글 응답: ${err?.message ?? res.status})`,
      )
    throw new Error(
      `${who ? `로그인한 계정(${who})` : '로그인한 계정'}에 이 시트를 볼 권한이 없습니다. 시트를 볼 수 있는 계정으로 로그인하거나, 시트 공유에 이 계정을 추가해 주세요. (구글 응답: ${err?.message ?? res.status})`,
    )
  }
  throw new Error(`시트를 읽지 못했습니다 (${res.status}) ${err?.message ?? text.slice(0, 200)}`)
}

export interface SheetTabInfo {
  title: string
  sheetId: number
  hidden: boolean
}

interface ApiSheet {
  properties: { sheetId: number; title: string; hidden?: boolean }
  merges?: { startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number }[]
}

export async function fetchSpreadsheetTabs(spreadsheetId: string): Promise<{ title: string; tabs: SheetTabInfo[] }> {
  const data = await sheetsFetch<{ properties: { title: string }; sheets: ApiSheet[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title,hidden)`,
  )
  return {
    title: data.properties.title,
    tabs: data.sheets.map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId, hidden: s.properties.hidden === true })),
  }
}

function quoteTab(title: string): string {
  return `'${title.replace(/'/g, "''")}'`
}

export async function fetchSheetTab(spreadsheetId: string, title: string): Promise<RawSheet> {
  const meta = await sheetsFetch<{ sheets: ApiSheet[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodeURIComponent(quoteTab(title))}&fields=sheets(properties(sheetId,title,hidden),merges)`,
  )
  const sheet = meta.sheets[0]
  // 값을 두 번 받는다: 표시 문자열(사람이 본 그대로)과 원래 값(날짜는 일련번호).
  // 날짜 서식 칸은 "1/31"처럼 연도 없이 보이는 경우가 많아 둘 다 있어야
  // xlsx 경로와 같은 결과가 나온다.
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(quoteTab(title))}`
  const [formatted, unformatted] = await Promise.all([
    sheetsFetch<{ values?: unknown[][] }>(`${base}?valueRenderOption=FORMATTED_VALUE`),
    sheetsFetch<{ values?: unknown[][] }>(`${base}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`),
  ])
  const rows = (formatted.values ?? []).map((row, r) =>
    row.map((text, c) => {
      const raw = unformatted.values?.[r]?.[c]
      // 숫자인데 표시가 숫자가 아니고 날짜처럼 생겼으면 날짜 칸이다.
      if (typeof raw === 'number' && typeof text === 'string' && text !== String(raw) && /\d[/.\-월]\s*\d/.test(text) && raw > 20000 && raw < 80000) {
        return { kind: 'date', serial: raw, text } satisfies DateCell
      }
      return text
    }),
  )
  const merges: SheetMerge[] = (sheet?.merges ?? []).map((m) => ({
    r1: m.startRowIndex ?? 0,
    c1: m.startColumnIndex ?? 0,
    r2: (m.endRowIndex ?? 1) - 1,
    c2: (m.endColumnIndex ?? 1) - 1,
  }))
  return { title, hidden: sheet?.properties.hidden === true, rows, merges }
}

// ---------- 칸 배경색 (추진현황 주차 칸: 회색 = 계획, 분홍 = 실적) ----------

function colLetter(c: number): string {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function toHex(c: { red?: number; green?: number; blue?: number } | undefined): string | null {
  if (!c) return null
  const h = (v?: number) =>
    Math.round((v ?? 0) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  const hex = `${h(c.red)}${h(c.green)}${h(c.blue)}`
  return hex === 'FFFFFF' ? null : hex
}

// 칸 글자 서식. 저장·비교는 문자열(fmtString)로: 'b|c:FF0000|s:12|a:center', '' = 기본
export type CellAlign = 'left' | 'center' | 'right'
export interface CellFmt {
  b?: boolean // 굵게
  i?: boolean // 기울임
  x?: boolean // 취소선
  c?: string // 글자색 RRGGBB
  s?: number // 글자 크기(pt)
  a?: CellAlign // 가로 정렬
}
export function parseFmt(v: string | undefined | null): CellFmt {
  const out: CellFmt = {}
  for (const part of (v ?? '').split('|')) {
    if (part === 'b') out.b = true
    else if (part === 'i') out.i = true
    else if (part === 'x') out.x = true
    else if (part.startsWith('c:') && /^[0-9A-F]{6}$/i.test(part.slice(2))) out.c = part.slice(2).toUpperCase()
    else if (part.startsWith('s:') && Number(part.slice(2)) > 0) out.s = Number(part.slice(2))
    else if (part === 'a:left' || part === 'a:center' || part === 'a:right') out.a = part.slice(2) as CellAlign
  }
  return out
}
export function fmtString(f: CellFmt): string {
  return [f.b && 'b', f.i && 'i', f.x && 'x', f.c && f.c !== '000000' && `c:${f.c}`, f.s && `s:${f.s}`, f.a && `a:${f.a}`].filter(Boolean).join('|')
}

// r1..r2, c1..c2(0-based, 끝 포함) 칸의 배경색(RRGGBB, 흰색·없음은 null)과 메모.
export async function fetchSheetFormats(
  spreadsheetId: string,
  title: string,
  r1: number,
  r2: number,
  c1: number,
  c2: number,
): Promise<{ fills: (string | null)[][]; notes: (string | null)[][]; fmts: (string | null)[][] }> {
  const range = `${quoteTab(title)}!${colLetter(c1)}${r1 + 1}:${colLetter(c2)}${r2 + 1}`
  const data = await sheetsFetch<{
    sheets: {
      data?: {
        rowData?: {
          values?: {
            note?: string
            effectiveFormat?: { backgroundColor?: { red?: number; green?: number; blue?: number } }
            userEnteredFormat?: {
              horizontalAlignment?: string
              textFormat?: {
                bold?: boolean
                italic?: boolean
                strikethrough?: boolean
                fontSize?: number
                foregroundColor?: { red?: number; green?: number; blue?: number }
              }
            }
          }[]
        }[]
      }[]
    }[]
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodeURIComponent(range)}&fields=sheets.data(rowData.values(note,effectiveFormat.backgroundColor,userEnteredFormat(horizontalAlignment,textFormat(bold,italic,strikethrough,fontSize,foregroundColor))))`,
  )
  const grid = data.sheets[0]?.data?.[0]
  const fills: (string | null)[][] = []
  const notes: (string | null)[][] = []
  const fmts: (string | null)[][] = []
  ;(grid?.rowData ?? []).forEach((row, i) => {
    const r = r1 + i
    fills[r] = []
    notes[r] = []
    fmts[r] = []
    ;(row.values ?? []).forEach((v, j) => {
      fills[r][c1 + j] = toHex(v.effectiveFormat?.backgroundColor)
      notes[r][c1 + j] = v.note ?? null
      const u = v.userEnteredFormat
      const t = u?.textFormat
      const al = u?.horizontalAlignment?.toLowerCase()
      const color = t?.foregroundColor ? toHex(t.foregroundColor) : null
      const s = fmtString({
        b: t?.bold || undefined,
        i: t?.italic || undefined,
        x: t?.strikethrough || undefined,
        c: color && color !== '000000' ? color : undefined,
        s: t?.fontSize,
        a: al === 'left' || al === 'center' || al === 'right' ? al : undefined,
      })
      fmts[r][c1 + j] = s || null
    })
  })
  return { fills, notes, fmts }
}

export interface SheetCellWrite {
  row: number // 0-based
  col: number // 0-based
  value?: string // '' = 지움. undefined면 값은 건드리지 않음
  num?: number // 있으면 숫자(날짜 일련번호)로 쓴다
  fill?: string | null // RRGGBB, null = 흰색. undefined면 배경은 건드리지 않음
  note?: string // 칸 메모. '' = 지움. undefined면 건드리지 않음
  fmt?: CellFmt // 글자 서식(굵게·색·크기·정렬). 빈 {} = 기본으로. undefined면 건드리지 않음
}

// 줄 끼워 넣기: at(0-based) 자리에 빈 줄을 넣고 그 줄의 칸들을 쓴다.
export interface SheetInsert {
  at: number
  cells: Omit<SheetCellWrite, 'row'>[]
  order: number
}

// 한 열의 병합 다시 잡기: r1~r2를 풀고, merge면 다시 한 칸으로 합친다(모두 끝난 뒤 행 번호).
export interface SheetMergeOp {
  col: number
  r1: number
  r2: number
  merge: boolean
}

// 줄 옮기기(한 줄): from 자리의 줄을 빼서 to 자리에 둔다(둘 다 그때의 행 번호, to는 뺀 뒤 기준)
export interface SheetMove {
  from: number
  to: number
}

// 칸 범위(0-based, 끝 포함) -- 여러 열 병합 · 병합 풀기
export interface SheetRange {
  r1: number
  r2: number
  c1: number
  c2: number
}

// 한 번에 보낼 저장 묶음
export interface SheetPlan {
  writes: SheetCellWrite[] // 지금 행 번호 기준
  unmergeFirst?: SheetMergeOp[] // 줄을 옮기기 전에 풀 병합(지금 행 번호)
  moves?: SheetMove[] // 칸 쓰기 뒤, 적힌 순서대로
  deletes?: number[] // 지울 줄(옮긴 뒤 행 번호)
  inserts?: SheetInsert[] // 적힌 순서대로(그때의 행 번호)
  after?: SheetCellWrite[] // 모두 끝난 뒤 행 번호 기준
  remerge?: SheetMergeOp[]
  unmergeCells?: SheetRange[] // 줄을 옮기기 전에 풀 입력 열 병합(지금 행 번호)
  mergeCells?: SheetRange[] // 모두 끝난 뒤 병합할 입력 열 칸(끝난 뒤 행 번호)
  colDeletes?: number[] // 맨 끝에 지울 열(오른쪽부터)
  colInserts?: number[] // 그다음 끼워 넣을 열 자리(적힌 순서대로)
  colAfter?: SheetCellWrite[] // 열 작업이 끝난 뒤 쓸 칸(새 열 머리글 · 값)
  colMerges?: SheetRange[] // 새 열 머리글 세로 병합
}

function fromHex(hex: string | null) {
  const v = hex ?? 'FFFFFF'
  return { red: parseInt(v.slice(0, 2), 16) / 255, green: parseInt(v.slice(2, 4), 16) / 255, blue: parseInt(v.slice(4, 6), 16) / 255 }
}

function cellRequest(sheetGid: number, c: SheetCellWrite) {
  const setValue = c.num !== undefined || c.value !== undefined
  const value = c.num !== undefined ? { numberValue: c.num } : c.value ? { stringValue: c.value } : null
  const fields = [
    setValue && 'userEnteredValue',
    c.fill !== undefined && 'userEnteredFormat.backgroundColor',
    c.fmt !== undefined &&
      'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.strikethrough,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment',
    c.note !== undefined && 'note',
  ]
    .filter(Boolean)
    .join(',')
  // 서식 마스크에 넣고 값을 비우면 기본으로 돌아간다
  const text = c.fmt
    ? {
        ...(c.fmt.b ? { bold: true } : {}),
        ...(c.fmt.i ? { italic: true } : {}),
        ...(c.fmt.x ? { strikethrough: true } : {}),
        ...(c.fmt.s ? { fontSize: c.fmt.s } : {}),
        ...(c.fmt.c ? { foregroundColor: fromHex(c.fmt.c) } : {}),
      }
    : null
  const format = {
    ...(c.fill !== undefined ? { backgroundColor: fromHex(c.fill) } : {}),
    ...(text && Object.keys(text).length ? { textFormat: text } : {}),
    ...(c.fmt?.a ? { horizontalAlignment: c.fmt.a.toUpperCase() } : {}),
  }
  return {
    updateCells: {
      range: { sheetId: sheetGid, startRowIndex: c.row, endRowIndex: c.row + 1, startColumnIndex: c.col, endColumnIndex: c.col + 1 },
      rows: [
        {
          values: [
            {
              ...(value ? { userEnteredValue: value } : {}),
              ...(Object.keys(format).length ? { userEnteredFormat: format } : {}),
              ...(c.note ? { note: c.note } : {}),
            },
          ],
        },
      ],
      fields,
    },
  }
}

// 한 번의 요청으로: 칸 쓰기(기존 행 번호) → 줄 옮기기 → 줄 지우기(아래부터) → 줄 끼워 넣기(주어진 순서대로)
// → 병합 풀기 → 이름 칸 쓰기 → 다시 병합. 쓰기 권한 동의를 한 번 받는다.
export function sheetWriteRequests(sheetGid: number, plan: SheetPlan) {
  const requests: object[] = plan.writes.map((c) => cellRequest(sheetGid, c))
  for (const m of plan.unmergeFirst ?? [])
    requests.push({
      unmergeCells: { range: { sheetId: sheetGid, startRowIndex: m.r1, endRowIndex: m.r2 + 1, startColumnIndex: m.col, endColumnIndex: m.col + 1 } },
    })
  const rect = (m: SheetRange) => ({ sheetId: sheetGid, startRowIndex: m.r1, endRowIndex: m.r2 + 1, startColumnIndex: m.c1, endColumnIndex: m.c2 + 1 })
  for (const m of plan.unmergeCells ?? []) requests.push({ unmergeCells: { range: rect(m) } })
  for (const m of plan.moves ?? []) {
    // destinationIndex는 줄을 빼기 전 기준이라, 아래로 옮길 때는 한 칸 더
    requests.push({
      moveDimension: {
        source: { sheetId: sheetGid, dimension: 'ROWS', startIndex: m.from, endIndex: m.from + 1 },
        destinationIndex: m.to > m.from ? m.to + 1 : m.to,
      },
    })
  }
  for (const r of [...(plan.deletes ?? [])].sort((a, b) => b - a)) {
    requests.push({ deleteDimension: { range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: r, endIndex: r + 1 } } })
  }
  for (const ins of plan.inserts ?? []) {
    requests.push({
      insertDimension: { range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: ins.at, endIndex: ins.at + 1 }, inheritFromBefore: ins.at > 0 },
    })
    for (const c of ins.cells) requests.push(cellRequest(sheetGid, { ...c, row: ins.at }))
  }
  const range = (m: SheetMergeOp) => ({ sheetId: sheetGid, startRowIndex: m.r1, endRowIndex: m.r2 + 1, startColumnIndex: m.col, endColumnIndex: m.col + 1 })
  for (const m of plan.remerge ?? []) requests.push({ unmergeCells: { range: range(m) } })
  for (const c of plan.after ?? []) requests.push(cellRequest(sheetGid, c))
  for (const m of plan.remerge ?? []) if (m.merge) requests.push({ mergeCells: { range: range(m), mergeType: 'MERGE_ALL' } })
  for (const m of plan.mergeCells ?? []) requests.push({ mergeCells: { range: rect(m), mergeType: 'MERGE_ALL' } })
  for (const c of [...(plan.colDeletes ?? [])].sort((a, b) => b - a))
    requests.push({ deleteDimension: { range: { sheetId: sheetGid, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 } } })
  for (const c of plan.colInserts ?? [])
    requests.push({ insertDimension: { range: { sheetId: sheetGid, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, inheritFromBefore: c > 0 } })
  for (const c of plan.colAfter ?? []) requests.push(cellRequest(sheetGid, c))
  for (const m of plan.colMerges ?? []) requests.push({ mergeCells: { range: rect(m), mergeType: 'MERGE_ALL' } })
  return requests
}

// 새 탭을 만들고(맨 뒤 · 머리글 두 줄과 이름 열 고정) 그 탭에 쓸 요청을 보낸다. 만든 탭 번호(sheetId)를 돌려준다.
export async function createSheetTab(
  spreadsheetId: string,
  title: string,
  size: { rows: number; cols: number; frozenRows: number; frozenCols: number },
  build: (sheetId: number) => object[],
): Promise<number> {
  const res = await sheetsFetch<{ replies: { addSheet?: { properties: { sheetId: number } } }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title,
                gridProperties: { rowCount: size.rows, columnCount: size.cols, frozenRowCount: size.frozenRows, frozenColumnCount: size.frozenCols },
              },
            },
          },
        ],
      }),
    },
    true,
  )
  const sheetId = res.replies[0]?.addSheet?.properties.sheetId
  if (sheetId === undefined) throw new Error('구글시트에 새 탭을 만들지 못했습니다.')
  const requests = build(sheetId)
  if (requests.length)
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests }) },
      true,
    )
  return sheetId
}

export async function writeSheetCells(spreadsheetId: string, sheetGid: number, plan: SheetPlan): Promise<void> {
  const requests = sheetWriteRequests(sheetGid, plan)
  if (requests.length === 0) return
  await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) }, true)
}

// ---------- B) xlsx ----------

export interface XlsxBook {
  title: string
  sheets: RawSheet[]
}

export function readXlsxBook(buffer: ArrayBuffer, fileName: string): XlsxBook {
  // cellNF: 칸 서식을 같이 읽어 날짜 서식 칸을 알아본다.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true, cellStyles: true })
  const sheets: RawSheet[] = wb.SheetNames.map((name, idx) => {
    const ws = wb.Sheets[name]
    const hidden = Boolean(wb.Workbook?.Sheets?.[idx]?.Hidden)
    const ref = ws['!ref']
    const rows: unknown[][] = []
    const fills: (string | null)[][] = []
    const notes: (string | null)[][] = []
    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      for (let r = 0; r <= range.e.r; r++) {
        const row: unknown[] = []
        fills[r] = []
        notes[r] = []
        for (let c = 0; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          const cm = (cell as { c?: { t?: string }[] } | undefined)?.c
          notes[r][c] = cm?.length
            ? cm
                .map((x) => x.t ?? '')
                .join('\n')
                .trim() || null
            : null
          const rgb = (cell?.s as { fgColor?: { rgb?: string } } | undefined)?.fgColor?.rgb
          fills[r][c] = rgb && /^[0-9A-F]{6,8}$/i.test(rgb) && !/^(FF)?FFFFFF$/i.test(rgb) ? rgb.slice(-6).toUpperCase() : null
          if (cell && cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
            row.push({ kind: 'date', serial: cell.v as number, text: cell.w ?? String(cell.v) } satisfies DateCell)
          } else row.push(cell ? cell.v : null)
        }
        rows.push(row)
      }
    }
    const merges: SheetMerge[] = (ws['!merges'] ?? []).map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }))
    return { title: name, hidden, rows, merges, fills, notes }
  })
  return { title: fileName.replace(/\.xlsx?$/i, ''), sheets }
}

// 기본으로 고를 탭: 평가연도의 「YYYY 추진현황」, 없으면 보이는 추진현황 중 가장 최근 연도.
export function pickDefaultTab(titles: { title: string; hidden: boolean }[], year: number | null): string | null {
  if (year) {
    const exact = titles.find((t) => t.title.replace(/\s/g, '') === `${year}추진현황`)
    if (exact) return exact.title
  }
  const candidates = titles
    .map((t) => ({ ...t, y: Number(t.title.match(/(20\d{2})/)?.[1] ?? 0) }))
    .filter((t) => t.title.includes('추진현황'))
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || b.y - a.y)
  return candidates[0]?.title ?? null
}

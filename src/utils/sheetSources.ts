// 과제관리 시트를 RawSheet로 읽어 오는 두 경로.
//   A) Google Sheets API -- 링크만 붙여넣으면 로그인 계정 권한으로 읽는다(기본)
//   B) xlsx 파일 -- 시트에서 "파일 › 다운로드 › xlsx"로 받은 파일(대체 경로)
// 둘 다 같은 RawSheet를 돌려주고, 해석은 sheetImport.ts가 한다.

import { googleErrorText, oauthErrorText } from './googleError'
import * as XLSX from 'xlsx'
import type { DateCell, RawSheet, SheetMerge } from './sheetImport'
import { getConnectedEmail, loadGis, peekLoginToken, withAuthLock, dropLoginToken } from './googleDrive'
import { loadToken, saveToken } from './tokenStore'

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

// 이 탭에 보관해 둔 시트 토큰이 있으면 이어 쓴다(tokenStore)
let sheetsToken: { token: string; expiresAt: number } | null = loadToken('sheets-read')
let sheetsWriteToken: { token: string; expiresAt: number } | null = loadToken('sheets-write')
// 다음 시트 권한 요청은 계정 힌트 없이 계정 선택 화면부터 연다. 브라우저에 구글 계정이
// 여러 개 로그인돼 있으면 힌트와 엇갈려 구글이 "400 · malformed"를 내는 경우가 있어서,
// 그때 사용자가 직접 계정을 고르게 하는 재시도 경로.
let chooseAccountNext = false
export function chooseSheetsAccountNext() {
  chooseAccountNext = true
  sheetsToken = null
  saveToken('sheets-read', null)
}

// 로그인 토큰으로 시트를 바로 읽고 쓸 수 있나(권한 창 없이)
export function hasLoginSheetsToken(): boolean {
  return !!peekLoginToken(SHEETS_WRITE_SCOPE)
}

// 지금 권한 창 없이 시트를 읽을 수 있나(로그인 토큰 또는 이미 받은 시트 토큰) -- 뒤에서 조용히 확인할 때만 쓴다
export function hasSheetsTokenNow(): boolean {
  const ok = (t: { expiresAt: number } | null) => !!t && t.expiresAt - 60_000 > Date.now()
  return hasLoginSheetsToken() || ok(sheetsWriteToken) || ok(sheetsToken)
}

export function isSheetsApiConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

let sheetsInflight: Promise<string> | null = null
async function getSheetsToken(write = false): Promise<string> {
  // 로그인 때 시트 읽기 · 쓰기 권한도 받았으면 권한 창 없이 그 토큰으로
  const login = peekLoginToken(SHEETS_WRITE_SCOPE)
  if (login) return login
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
              resp.error === 'access_denied' ? `시트 ${write ? '저장' : '읽기'} 권한을 허용하지 않았습니다.` : oauthErrorText(resp.error, '로그인이 취소되었습니다.'),
            ),
          )
          return
        }
        const tok = { token: resp.access_token, expiresAt: Date.now() + (resp.expires_in ?? 3300) * 1000 }
        if (write) sheetsWriteToken = tok
        else sheetsToken = tok
        saveToken(write ? 'sheets-write' : 'sheets-read', tok)
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
    saveToken('sheets-read', null)
    saveToken('sheets-write', null)
    dropLoginToken()
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
    // 켜는 곳(콘솔 주소)은 개발자 콘솔에만
    console.warn('[google sheets] SERVICE_DISABLED', activation ?? '')
    throw new Error('구글 시트 연결이 아직 준비되지 않았습니다. 앱 관리자에게 알려 주세요.')
  }
  if (res.status === 404) throw new Error('시트를 찾지 못했습니다. 링크가 맞는지 확인해 주세요.')
  if (res.status === 403) {
    if (write)
      throw new Error(
        `${who ? `로그인한 계정(${who})` : '로그인한 계정'}에 이 시트를 편집할 권한이 없습니다. 시트 소유자에게 편집 권한을 요청해 주세요.`,
      )
    throw new Error(
      `${who ? `로그인한 계정(${who})` : '로그인한 계정'}에 이 시트를 볼 권한이 없습니다. 시트를 볼 수 있는 계정으로 로그인하거나, 시트 공유에 이 계정을 추가해 주세요.`,
    )
  }
  throw new Error(googleErrorText(res.status, text, write ? '시트 저장' : '시트 읽기'))
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

// 여러 범위 값 읽기(권한 관리 시트 등). 빈 칸은 ''로.
export async function fetchValues(spreadsheetId: string, ranges: string[]): Promise<{ title: string; values: string[][][] }> {
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
  const [meta, data] = await Promise.all([
    sheetsFetch<{ properties: { title: string } }>(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`),
    sheetsFetch<{ valueRanges?: { values?: string[][] }[] }>(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${q}`),
  ])
  return { title: meta.properties.title, values: (data.valueRanges ?? []).map((v) => (v.values ?? []).map((row) => row.map((c) => String(c ?? '')))) }
}

// 새 스프레드시트(탭 · 머리글 · 처음 값까지). 쓰기 권한 창이 뜬다. 만든 파일 id를 돌려준다.
export async function createSpreadsheet(title: string, tabs: { title: string; rows: string[][]; widths?: number[] }[]): Promise<string> {
  const body = {
    properties: { title, locale: 'ko_KR' },
    sheets: tabs.map((t, i) => ({
      properties: { sheetId: i, title: t.title, gridProperties: { frozenRowCount: 1 } },
      data: [
        {
          startRow: 0,
          startColumn: 0,
          rowData: t.rows.map((r, ri) => ({
            values: r.map((v) => ({ userEnteredValue: { stringValue: v }, ...(ri === 0 ? { userEnteredFormat: { textFormat: { bold: true } } } : {}) })),
          })),
          columnMetadata: (t.widths ?? []).map((w) => ({ pixelSize: w })),
        },
      ],
    })),
  }
  const res = await sheetsFetch<{ spreadsheetId: string }>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    { method: 'POST', body: JSON.stringify(body) },
    true,
  )
  return res.spreadsheetId
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
): Promise<{ fills: (string | null)[][]; notes: (string | null)[][]; fmts: (string | null)[][]; heights: (number | null)[] }> {
  const range = `${quoteTab(title)}!${colLetter(c1)}${r1 + 1}:${colLetter(c2)}${r2 + 1}`
  const data = await sheetsFetch<{
    sheets: {
      data?: {
        rowMetadata?: { pixelSize?: number }[]
        rowData?: {
          values?: {
            note?: string
            effectiveFormat?: {
              backgroundColor?: { red?: number; green?: number; blue?: number }
              // 조건부 서식까지 반영된 글자 서식(회색으로 바뀐 줄 · 빨간 글자 등)
              textFormat?: {
                bold?: boolean
                italic?: boolean
                strikethrough?: boolean
                foregroundColor?: { red?: number; green?: number; blue?: number }
                foregroundColorStyle?: { rgbColor?: { red?: number; green?: number; blue?: number } }
              }
            }
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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodeURIComponent(range)}&fields=sheets.data(rowMetadata.pixelSize,rowData.values(note,effectiveFormat(backgroundColor,textFormat(bold,italic,strikethrough,foregroundColor,foregroundColorStyle)),userEnteredFormat(horizontalAlignment,textFormat(bold,italic,strikethrough,fontSize,foregroundColor))))`,
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
      const e = v.effectiveFormat?.textFormat
      const al = u?.horizontalAlignment?.toLowerCase()
      // 글자 색 · 굵게 · 기울임 · 취소선은 화면에 보이는 값(조건부 서식 · 테마 색 포함)을 우선, 크기 · 정렬은 직접 정한 값만
      const fg = e?.foregroundColorStyle?.rgbColor ?? e?.foregroundColor ?? t?.foregroundColor
      const color = fg ? toHex(fg) : null
      const s = fmtString({
        b: e?.bold || t?.bold || undefined,
        i: e?.italic || t?.italic || undefined,
        x: e?.strikethrough || t?.strikethrough || undefined,
        c: color && color !== '000000' ? color : undefined,
        s: t?.fontSize,
        a: al === 'left' || al === 'center' || al === 'right' ? al : undefined,
      })
      fmts[r][c1 + j] = s || null
    })
  })
  const heights: (number | null)[] = []
  ;(grid?.rowMetadata ?? []).forEach((m, i) => (heights[r1 + i] = m.pixelSize ?? null))
  return { fills, notes, fmts, heights }
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
                gridProperties: {
                  rowCount: size.rows,
                  columnCount: size.cols,
                  frozenRowCount: size.frozenRows,
                  frozenColumnCount: size.frozenCols,
                  hideGridlines: true, // 기존 추진현황 탭처럼 눈금선 숨김
                },
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

// 탭 하나를 통째로 새 내용으로(진척률 저장 등): 없으면 새로 만들고, 있으면 값 · 서식 · 병합을 지운 뒤 build 요청을 한 번에 보낸다.
// 한 번의 batchUpdate라 중간에 실패하면 아무것도 바뀌지 않는다.
export async function replaceSheetTab(
  spreadsheetId: string,
  title: string,
  size: { rows: number; cols: number },
  build: (sheetId: number) => object[],
): Promise<{ sheetId: number; created: boolean }> {
  const meta = await sheetsFetch<{
    sheets: { properties: { sheetId: number; title: string; index?: number; gridProperties?: { rowCount?: number; columnCount?: number } } }[]
  }>(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,index,gridProperties)`)
  const hit = meta.sheets.find((x) => x.properties.title === title)
  if (!hit) {
    const sheetId = await createSheetTab(spreadsheetId, title, { rows: Math.max(size.rows, 20), cols: size.cols, frozenRows: 0, frozenCols: 0 }, build)
    return { sheetId, created: true }
  }
  const sheetId = hit.properties.sheetId
  const g = hit.properties.gridProperties ?? {}
  const requests: object[] = [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { rowCount: Math.max(g.rowCount ?? 0, size.rows), columnCount: Math.max(g.columnCount ?? 0, size.cols) } },
        fields: 'gridProperties.rowCount,gridProperties.columnCount',
      },
    },
    // 고정 줄 · 열을 먼저 풀어 둔다(고정 경계에 걸친 병합은 구글이 400으로 거절한다)
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 0, frozenColumnCount: 0 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
    // 기존 탭의 필터가 남아 있으면 그 머리줄 위에 세로 병합을 만들 수 없다고 거절하므로 필터도 먼저 푼다
    { clearBasicFilter: { sheetId } },
    { unmergeCells: { range: { sheetId } } },
    { updateCells: { range: { sheetId }, fields: 'userEnteredValue,userEnteredFormat' } },
    ...build(sheetId),
  ]
  try {
    await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) }, true)
    return { sheetId, created: false }
  } catch (e) {
    // 탭에 표(구글시트 「표」) · 보호 범위 등이 있어 제자리에서 못 바꾸면: 새 탭에 쓰고 옛 탭을 지운 뒤 이름 · 순서를 옮긴다
    console.warn('[replaceSheetTab] 제자리 덮어쓰기 실패, 탭을 새로 만들어 교체', e)
    const tmp = `${title}__새로`
    const newId = await createSheetTab(spreadsheetId, tmp, { rows: Math.max(size.rows, 20), cols: size.cols, frozenRows: 0, frozenCols: 0 }, build)
    await sheetBatchUpdate(spreadsheetId, [
      { deleteSheet: { sheetId } },
      { updateSheetProperties: { properties: { sheetId: newId, title, index: hit.properties.index ?? 0 }, fields: 'title,index' } },
    ])
    return { sheetId: newId, created: false }
  }
}

// 값만 쓰기(RAW -- 수식 · 날짜로 바꾸지 않음). 여러 범위를 한 번에.
export async function writeValues(spreadsheetId: string, data: { range: string; values: string[][] }[]): Promise<void> {
  if (!data.length) return
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) },
    true,
  )
}
// 탭 맨 아래에 줄 더하기(변경 기록 등). 탭이 없으면 머리글과 함께 만든다.
// hidden: 새로 만들 때 숨김 탭으로(시트를 쓰는 사람 눈에 띄지 않게 -- 운영 시트의 변경 기록 등)
export async function appendRows(spreadsheetId: string, tab: string, header: string[], rows: string[][], opts: { hidden?: boolean } = {}): Promise<void> {
  const { tabs } = await fetchSpreadsheetTabs(spreadsheetId)
  if (!tabs.some((t) => t.title === tab)) {
    await sheetBatchUpdate(spreadsheetId, [
      { addSheet: { properties: { title: tab, hidden: opts.hidden === true, gridProperties: { frozenRowCount: 1 } } } },
    ])
    await writeValues(spreadsheetId, [{ range: `${quoteTab(tab)}!A1`, values: [header] }])
  }
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${quoteTab(tab)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) },
    true,
  )
}

// 요청 묶음을 그대로 보낸다(쓰기 권한)
export async function sheetBatchUpdate(spreadsheetId: string, requests: object[]): Promise<void> {
  if (!requests.length) return
  await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) }, true)
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

// 한컴오피스(HCell)로 저장한 xlsx는 엑셀 읽기(SheetJS)가 못 읽는 모양이 있어, 읽기 전에 그 부분만 표준 모양으로 고친다.
//   · 목록 파일의 속성에 빈칸(PartName = "…") → 시트를 하나도 못 찾음
//   · 글자 서식을 mc:AlternateContent(한컴 전용 hs: 태그 + 표준 Fallback)로 감쌈 → 공용 글자 목록을 못 읽어 모든 칸이 깨짐
//   · 메모 위치가 "D159:D159" → 없는 칸이 생기고 표 범위가 터무니없이 커짐
// 한컴 파일이 아니면 그대로 돌려준다.
export async function readXlsxBookAsync(buffer: ArrayBuffer, fileName: string, opts: { displayNumbers?: boolean } = {}): Promise<XlsxBook> {
  const fixed = await fixHancomXlsx(buffer)
  const book = readXlsxBook(fixed, fileName, opts)
  try {
    await attachXlsxFmts(book, fixed)
  } catch (e) {
    // 글자 서식은 덤: 못 읽어도 값 · 배경색 · 메모는 그대로 쓴다
    console.warn('엑셀 글자 서식을 읽지 못했습니다', e)
  }
  return book
}

// ---------- 엑셀 칸 글자 서식(굵게 · 기울임 · 취소선 · 글자색 · 크기 · 정렬) ----------
// SheetJS(무료판)는 배경색만 주고 글자 서식은 주지 않는다 -- styles.xml과 시트 XML을 직접 읽어 구글시트에서 읽을 때와 같은 문자열(fmtString)로 채운다.
// 추진현황 탭만(다른 탭은 서식을 쓰지 않는다). 기본 글꼴(첫 글꼴)과 같은 크기 · 검정 글자 · 가로 정렬 없음은 서식으로 치지 않는다.
const THEME_ORDER = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
const INDEXED_COLORS: Record<number, string> = { 8: '000000', 9: 'FFFFFF', 10: 'FF0000', 11: '00FF00', 12: '0000FF', 13: 'FFFF00', 14: 'FF00FF', 15: '00FFFF', 16: '800000', 17: '008000', 18: '000080', 19: '808000', 20: '800080', 21: '008080', 22: 'C0C0C0', 23: '808080' }
const xmlAttr = (tag: string, name: string): string | null => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1] ?? null

async function attachXlsxFmts(book: XlsxBook, buffer: ArrayBuffer): Promise<void> {
  const targets = book.sheets.filter((sh) => /추진현황/.test(sh.title))
  if (!targets.length) return
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? ''
  const styles = await read('xl/styles.xml')
  const theme = await read('xl/theme/theme1.xml')
  if (!styles) return
  // 테마 색(R G B 순서는 THEME_ORDER, 엑셀의 theme 번호는 0=lt1 · 1=dk1 · 2=lt2 · 3=dk2 · 4~=accent)
  const themeRgb: string[] = THEME_ORDER.map((k) => {
    const m = new RegExp(`<a:${k}>\\s*<a:(?:srgbClr val|sysClr[^>]*?lastClr)="([0-9A-Fa-f]{6})"`).exec(theme)
    return (m?.[1] ?? '000000').toUpperCase()
  })
  const themeColor = (i: number) => themeRgb[i === 0 ? 1 : i === 1 ? 0 : i === 2 ? 3 : i === 3 ? 2 : i]
  // 엑셀 「밝게 · 어둡게」(tint): 밝기(L)만 조절한다 -- 회색 글자는 대개 검정에 tint를 준 값
  const tinted = (hex: string, tint: number): string => {
    if (!tint) return hex
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let l = (max + min) / 2
    const d = max - min
    let h = 0
    let sat = 0
    if (d) {
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      h /= 6
    }
    l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
    const p = 2 * l - q
    const f = (t0: number) => {
      let t = t0
      if (t < 0) t += 1
      if (t > 1) t -= 1
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
    }
    const out = d || sat ? [f(h + 1 / 3), f(h), f(h - 1 / 3)] : [l, l, l]
    return out.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  const colorOf = (tag: string | undefined): string | null => {
    if (!tag) return null
    const rgb = xmlAttr(tag, 'rgb')
    if (rgb && /^[0-9A-Fa-f]{6,8}$/.test(rgb)) return rgb.slice(-6).toUpperCase()
    const th = xmlAttr(tag, 'theme')
    if (th !== null && themeColor(Number(th))) return tinted(themeColor(Number(th)), Number(xmlAttr(tag, 'tint') ?? 0) || 0)
    const ix = xmlAttr(tag, 'indexed')
    if (ix !== null && INDEXED_COLORS[Number(ix)]) return INDEXED_COLORS[Number(ix)]
    return null
  }
  // 글꼴 목록
  const fontsXml = /<(?:\w+:)?fonts\b[^>]*>([\s\S]*?)<\/(?:\w+:)?fonts>/.exec(styles)?.[1] ?? ''
  const fonts = [...fontsXml.matchAll(/<(?:\w+:)?font\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?font>)/g)].map((m) => {
    const x = m[1] ?? ''
    const flag = (t: string) => {
      const tag = new RegExp(`<(?:\\w+:)?${t}\\b[^>]*?\\/?>`).exec(x)?.[0]
      return !!tag && xmlAttr(tag, 'val') !== '0' && xmlAttr(tag, 'val') !== 'false'
    }
    const sz = Number(xmlAttr(/<(?:\w+:)?sz\b[^>]*?\/?>/.exec(x)?.[0] ?? '', 'val')) || 0
    return { b: flag('b'), i: flag('i'), x: flag('strike'), c: colorOf(/<(?:\w+:)?color\b[^>]*?\/?>/.exec(x)?.[0]), s: sz }
  })
  const baseSize = fonts[0]?.s ?? 0
  // 칸 서식(cellXfs): 글꼴 번호 + 가로 정렬
  const xfsXml = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(styles)?.[1] ?? ''
  const xfFmt: string[] = [...xfsXml.matchAll(/<(?:\w+:)?xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?xf>)/g)].map((m) => {
    const font = fonts[Number(xmlAttr(m[1], 'fontId') ?? 0)] ?? fonts[0]
    const al = /<(?:\w+:)?alignment\b[^>]*?\/?>/.exec(m[2] ?? '')?.[0]
    const h = al ? xmlAttr(al, 'horizontal') : null
    return fmtString({
      ...(font?.b ? { b: true } : {}),
      ...(font?.i ? { i: true } : {}),
      ...(font?.x ? { x: true } : {}),
      ...(font?.c && font.c !== '000000' ? { c: font.c } : {}),
      ...(font?.s && font.s !== baseSize ? { s: font.s } : {}),
      ...(h === 'left' || h === 'center' || h === 'right' ? { a: h as CellAlign } : {}),
    })
  })
  // 탭 이름 → 시트 XML 경로
  const wbXml = await read('xl/workbook.xml')
  const rels = await read('xl/_rels/workbook.xml.rels')
  const pathOfRid = new Map<string, string>()
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
    const id = xmlAttr(m[1], 'Id')
    const target = xmlAttr(m[1], 'Target')
    if (id && target) pathOfRid.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  const unesc = (t: string) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  for (const m of wbXml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const name = unesc(xmlAttr(m[1], 'name') ?? '')
    const rid = /\sr:id="([^"]*)"/.exec(m[1])?.[1]
    const sheet = targets.find((sh) => sh.title === name)
    const path = rid ? pathOfRid.get(rid) : undefined
    if (!sheet || !path) continue
    const xml = await read(path)
    const fmts: (string | null)[][] = []
    for (const c of xml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>)/g)) {
      const ref = /^([A-Z]+)(\d+)$/.exec(xmlAttr(c[1], 'r') ?? '')
      const si = xmlAttr(c[1], 's')
      if (!ref || si === null) continue
      const f = xfFmt[Number(si)]
      if (!f) continue
      const r = Number(ref[2]) - 1
      const col = ref[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
      if (r >= sheet.rows.length) continue
      ;(fmts[r] ||= [])[col] = f
    }
    for (let r = 0; r < sheet.rows.length; r++) {
      fmts[r] ||= []
      const w = Math.max(sheet.rows[r]?.length ?? 0, fmts[r].length)
      for (let c = 0; c < w; c++) fmts[r][c] = fmts[r][c] || null
    }
    sheet.fmts = fmts
    // 줄 높이(pt → px)
    const heights: (number | null)[] = []
    for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>/g)) {
      const rn = Number(xmlAttr(rm[1], 'r') ?? 0)
      const ht = Number(xmlAttr(rm[1], 'ht') ?? 0)
      if (rn > 0 && ht > 0 && rn <= sheet.rows.length) heights[rn - 1] = Math.round((ht * 4) / 3)
    }
    sheet.heights = heights
  }
}
async function fixHancomXlsx(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip')
  let zip: InstanceType<typeof JSZip>
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    return buffer // xls 등 zip이 아니면 그대로
  }
  const types = await zip.file('[Content_Types].xml')?.async('string')
  const book = await zip.file('xl/workbook.xml')?.async('string')
  if (!types || !(/\s=\s*"/.test(types) || book?.includes('appName="HCell"'))) return buffer
  let changed = false
  for (const name of Object.keys(zip.files)) {
    if (!/(\.rels|\[Content_Types\]\.xml|sharedStrings\.xml|styles\.xml|comments\d*\.xml)$/.test(name)) continue
    const t = await zip.file(name)!.async('string')
    const f = t
      .replace(/(\s[\w:]+)\s+=\s*(["'])/g, '$1=$2')
      .replace(/<mc:AlternateContent\b[^>]*>[\s\S]*?<mc:Fallback>([\s\S]*?)<\/mc:Fallback>\s*<\/mc:AlternateContent>/g, '$1')
      .replace(/<hs:[^>]*\/>/g, '')
      .replace(/(<(?:\w+:)?comment\b[^>]*\sref=")([A-Z]+\d+):\2"/g, '$1$2"')
    if (f !== t) {
      zip.file(name, f)
      changed = true
    }
  }
  return changed ? zip.generateAsync({ type: 'arraybuffer' }) : buffer
}

// 칸 배경색(흰색 · 없음은 null)
function cellFill(cell: XLSX.CellObject | undefined): string | null {
  const rgb = (cell?.s as { fgColor?: { rgb?: string } } | undefined)?.fgColor?.rgb
  return rgb && /^[0-9A-F]{6,8}$/i.test(rgb) && !/^(FF)?FFFFFF$/i.test(rgb) ? rgb.slice(-6).toUpperCase() : null
}
// 표 범위: !ref 대신 값 · 메모 · 배경색이 있는 칸에서 센다.
// (한컴 파일은 서식만 있는 칸이 XFD 열까지 있어, !ref대로 읽으면 칸이 천만 개가 넘는다)
function usedRange(ws: XLSX.WorkSheet): { rows: number; cols: number } {
  let rows = 0
  let cols = 0
  for (const k of Object.keys(ws)) {
    if (k[0] === '!' || !/^[A-Z]+\d+$/.test(k)) continue
    const cell = ws[k] as XLSX.CellObject & { c?: unknown[] }
    if ((cell.v === undefined || cell.v === null || cell.v === '') && !cell.c?.length && !cellFill(cell)) continue
    const a = XLSX.utils.decode_cell(k)
    if (a.r + 1 > rows) rows = a.r + 1
    if (a.c + 1 > cols) cols = a.c + 1
  }
  for (const m of ws['!merges'] ?? []) {
    rows = Math.max(rows, m.e.r + 1)
    cols = Math.max(cols, m.e.c + 1)
  }
  return { rows, cols }
}

// displayNumbers: 숫자 서식이 있는 소수는 엑셀에 보이는 모양 그대로(글자)로 읽는다(추진현황: 엑셀 화면과 같게). 꺼 두면 원래 숫자
export function readXlsxBook(buffer: ArrayBuffer, fileName: string, opts: { displayNumbers?: boolean } = {}): XlsxBook {
  // cellNF: 칸 서식을 같이 읽어 날짜 서식 칸을 알아본다.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true, cellStyles: true })
  const sheets: RawSheet[] = wb.SheetNames.map((name, idx) => {
    const ws = wb.Sheets[name] ?? {} // 못 읽은 시트는 빈 탭으로
    const hidden = Boolean(wb.Workbook?.Sheets?.[idx]?.Hidden)
    const rows: unknown[][] = []
    const fills: (string | null)[][] = []
    const notes: (string | null)[][] = []
    const used = usedRange(ws)
    if (used.rows) {
      const range = { e: { r: used.rows - 1, c: used.cols - 1 } }
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
          fills[r][c] = cellFill(cell)
          if (cell && cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
            // 추진현황 탭에서 탭 연도와 다른 해의 날짜는 「2025.11.24」처럼 연도를 붙여 둔다(월/일만 남기면 구글시트로 올릴 때 탭 연도로 읽힘)
            let text = cell.w ?? String(cell.v)
            const tabYear = /추진현황/.test(name) ? Number(name.match(/(20\d{2})/)?.[1]) : 0
            if (tabYear && !/\d{4}/.test(text)) {
              const dt = new Date(Math.round(((cell.v as number) - 25569) * 86400000))
              if (dt.getUTCFullYear() !== tabYear) text = `${dt.getUTCFullYear()}.${dt.getUTCMonth() + 1}.${dt.getUTCDate()}`
            }
            row.push({ kind: 'date', serial: cell.v as number, text } satisfies DateCell)
          } else if (opts.displayNumbers && cell && cell.t === 'n' && cell.w !== undefined && cell.z && cell.z !== 'General' && !Number.isInteger(cell.v as number)) {
            row.push(cell.w.trim())
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

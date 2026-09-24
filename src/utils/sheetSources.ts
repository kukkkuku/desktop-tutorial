// 과제관리 시트를 RawSheet로 읽어 오는 두 경로.
//   A) Google Sheets API -- 링크만 붙여넣으면 로그인 계정 권한으로 읽는다(기본)
//   B) xlsx 파일 -- 시트에서 "파일 › 다운로드 › xlsx"로 받은 파일(대체 경로)
// 둘 다 같은 RawSheet를 돌려주고, 해석은 sheetImport.ts가 한다.

import * as XLSX from 'xlsx'
import type { DateCell, RawSheet, SheetMerge } from './sheetImport'
import { getConnectedEmail, loadGis } from './googleDrive'

// ---------- 링크 ----------

export function parseSheetUrl(input: string): { spreadsheetId: string; gid: number | null } | null {
  const text = input.trim()
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)
  const id = m ? m[1] : /^[a-zA-Z0-9_-]{30,}$/.test(text) ? text : null
  if (!id) return null
  const g = text.match(/[#&?]gid=(\d+)/)
  return { spreadsheetId: id, gid: g ? Number(g[1]) : null }
}

export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
}

// ---------- A) Sheets API ----------

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
// 읽기 전용. 로그인 때 받은 Drive/Calendar 토큰과는 따로, 시트를 처음
// 가져올 때 한 번 추가 동의를 받는다(기존 로그인에는 영향 없음).
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

let sheetsToken: { token: string; expiresAt: number } | null = null

export function isSheetsApiConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

async function getSheetsToken(): Promise<string> {
  if (sheetsToken && sheetsToken.expiresAt - 60_000 > Date.now()) return sheetsToken.token
  if (!CLIENT_ID) throw new Error('Google Client ID가 설정되지 않았습니다. xlsx 파일로 올려 주세요.')
  await loadGis()
  const google = window.google
  if (!google) throw new Error('Google 로그인 스크립트가 로드되지 않았습니다.')
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SHEETS_SCOPE,
      // 이미 로그인한 계정으로 바로 동의 화면을 띄운다(계정 선택 생략).
      ...({ login_hint: getConnectedEmail() ?? undefined } as object),
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error === 'access_denied' ? '시트 읽기 권한을 허용하지 않았습니다.' : resp.error || '로그인이 취소되었습니다.'))
          return
        }
        sheetsToken = { token: resp.access_token, expiresAt: Date.now() + (resp.expires_in ?? 3300) * 1000 }
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken()
  })
}

// 구글이 돌려준 오류 이유를 사람이 할 일로 바꾼다. 403 하나에도 "API가 꺼져
// 있음"과 "이 계정에 시트 권한 없음"이 섞여 있어서, 뭉뚱그리면 뭘 고쳐야
// 할지 알 수 없다(실제로 그랬다).
interface GoogleApiError {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: { reason?: string; metadata?: { activationUrl?: string; consumer?: string } ; links?: { url?: string }[] }[]
  }
}

async function sheetsFetch<T>(url: string): Promise<T> {
  const token = await getSheetsToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.ok) return (await res.json()) as T
  if (res.status === 401) sheetsToken = null
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

// ---------- B) xlsx ----------

export interface XlsxBook {
  title: string
  sheets: RawSheet[]
}

export function readXlsxBook(buffer: ArrayBuffer, fileName: string): XlsxBook {
  // cellNF: 칸 서식을 같이 읽어 날짜 서식 칸을 알아본다.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true })
  const sheets: RawSheet[] = wb.SheetNames.map((name, idx) => {
    const ws = wb.Sheets[name]
    const hidden = Boolean(wb.Workbook?.Sheets?.[idx]?.Hidden)
    const ref = ws['!ref']
    const rows: unknown[][] = []
    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      for (let r = 0; r <= range.e.r; r++) {
        const row: unknown[] = []
        for (let c = 0; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (cell && cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
            row.push({ kind: 'date', serial: cell.v as number, text: cell.w ?? String(cell.v) } satisfies DateCell)
          } else row.push(cell ? cell.v : null)
        }
        rows.push(row)
      }
    }
    const merges: SheetMerge[] = (ws['!merges'] ?? []).map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }))
    return { title: name, hidden, rows, merges }
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

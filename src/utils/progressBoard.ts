// 과제 입력 › 추진현황 -- 구글시트 「YYYY 추진현황」 탭 전체(모든 L1)를 읽어 일정표로 보여 준다.
// 성과관리 쪽 과제리스트(팀장이 고른 L2만 담음)와는 따로 저장한다.
// 시트에서 읽은 값(base)과 이 화면에서 고친 값(edits)을 나눠 두어, 시트를 다시 불러와도
// 고친 내용이 덮이지 않고 "고친 칸"을 따로 표시하고, 저장할 때 바뀐 칸만 시트에 쓴다.
//
// 주차 칸 규칙(시트 그대로): 회색 배경 = 계획, 분홍 배경 = 실적.
//   회색 S = 착수 계획, 회색 F = 완료 계획, 분홍 S = 착수(시작함), 분홍 완 = 완료.
//   글자 없는 회색/분홍 칸은 그 사이 기간 막대.
import type { WeekColumn, WeekMark } from '../types'
import { accountScope } from './accountScope'
import type { ParsedRow, WeekFill } from './sheetImport'
import type { SheetCellWrite } from './sheetSources'

export interface ProgressRow {
  key: string // L2␟L3 (시트 행 번호는 행 삽입으로 바뀌므로 쓰지 않음)
  row: number // 불러올 때의 시트 행(0-based) -- 저장 때는 다시 읽어 키로 찾는다
  h: string | null
  l1: string
  l2: string
  l2Tag: string | null
  l3: string
  values: Record<string, string> // 앱 열 id -> 시트 원문 (status, category, assignees, note …)
  weeks: Record<string, WeekMark>
  fills: Record<string, WeekFill>
}

// 주차 칸 하나: 글자(S/완/F) + 배경(계획 회색 / 실적 분홍)
export interface CellState {
  m: WeekMark | ''
  f: WeekFill | null
}

export const FILL_HEX: Record<WeekFill, string> = { plan: 'D9D9D9', actual: 'F4CCCC' }

export interface ProgressData {
  spreadsheetId: string | null
  source: string // 탭 이름 또는 파일 이름
  tabTitle: string
  sheetGid: number | null
  year: number | null
  fetchedAt: string
  weekCols: (WeekColumn & { col: number })[]
  statusCol: number | null
  rows: ProgressRow[]
}

// 화면에서 고친 값(칸 단위). 시트 값과 같아지면 지운다.
export interface RowEdit {
  cells?: Record<string, CellState>
  status?: string
}
export type ProgressEdits = Record<string, RowEdit>

export const NO_L1 = '(L1 없음)'

export function rowKeyOf(l2: string, l3: string, n = 1): string {
  const base = `${l2}␟${l3}`
  return n > 1 ? `${base}␟${n}` : base
}

export function toProgressRows(rows: ParsedRow[]): ProgressRow[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = rowKeyOf(r.l2, r.l3)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return {
      key: rowKeyOf(r.l2, r.l3, n),
      row: r.row,
      h: r.h,
      l1: r.l1 ?? NO_L1,
      l2: r.l2,
      l2Tag: r.l2Tag,
      l3: r.l3,
      values: r.values,
      weeks: r.weeks,
      fills: r.fills ?? {},
    }
  })
}

// 운영 중인 팀 구글시트 -- 과제 입력은 여기서 읽기만 하고 절대 쓰지 않는다(테스트 시트를 따로 연결해 저장).
// 운영 시트에 저장을 허용하려면 이 목록에서 빼야 한다.
export const PROTECTED_SHEET_IDS = ['1wnE6O8uIdCPPPHPYvQj5SBCSN9LlunkNT8dncA7NL2o']
export function isProtectedSheet(id: string | null | undefined): boolean {
  return !!id && PROTECTED_SHEET_IDS.includes(id)
}

// 과제 입력이 연결한 시트(링크). 없으면 운영 시트를 읽기 전용으로 쓴다.
const sheetKey = () => `progress-board:sheet:${accountScope()}`
export function readLinkedSheet(): string | null {
  try {
    return localStorage.getItem(sheetKey())
  } catch {
    return null
  }
}
export function writeLinkedSheet(url: string | null) {
  try {
    if (url) localStorage.setItem(sheetKey(), url)
    else localStorage.removeItem(sheetKey())
  } catch {
    // 기억 못 해도 지금 화면에는 반영
  }
}

const dataKey = () => `progress-board:data:${accountScope()}`
const editsKey = () => `progress-board:edits:${accountScope()}`

export function loadProgress(): { data: ProgressData | null; edits: ProgressEdits } {
  try {
    const data = JSON.parse(localStorage.getItem(dataKey()) ?? 'null') as ProgressData | null
    const edits = JSON.parse(localStorage.getItem(editsKey()) ?? '{}') as ProgressEdits
    // 칸 색을 읽기 전 형식으로 저장된 것은 다시 불러오게 한다.
    const ok = data && Array.isArray(data.rows) && data.rows.every((r) => r.fills) && 'statusCol' in data
    return { data: ok ? data : null, edits: edits && typeof edits === 'object' ? edits : {} }
  } catch {
    return { data: null, edits: {} }
  }
}

export function saveProgressData(data: ProgressData) {
  try {
    localStorage.setItem(dataKey(), JSON.stringify(data))
  } catch {
    // 저장 공간이 모자라도 지금 화면은 그대로 쓴다.
  }
}

export function saveProgressEdits(edits: ProgressEdits) {
  try {
    localStorage.setItem(editsKey(), JSON.stringify(edits))
  } catch {
    // 위와 같음
  }
}

export function baseCell(row: ProgressRow, key: string): CellState {
  return { m: row.weeks[key] ?? '', f: row.fills[key] ?? null }
}

// 시트 값에 고친 값을 얹은 최종 칸 상태(글자나 배경이 있는 칸만)
export function effectiveCells(row: ProgressRow, edit: RowEdit | undefined): Record<string, CellState> {
  const out: Record<string, CellState> = {}
  for (const k of new Set([...Object.keys(row.weeks), ...Object.keys(row.fills)])) out[k] = baseCell(row, k)
  for (const [k, c] of Object.entries(edit?.cells ?? {})) {
    if (c.m || c.f) out[k] = c
    else delete out[k]
  }
  return out
}

export function effectiveStatus(row: ProgressRow, edit: RowEdit | undefined): string {
  return edit?.status ?? row.values.status ?? ''
}

// 칠하기 도구
export type PaintTool = 'plan' | 'S-plan' | 'F' | 'actual' | 'S' | '완' | 'erase'
export const TOOL_CELL: Record<PaintTool, CellState> = {
  'S-plan': { m: 'S', f: 'plan' },
  plan: { m: '', f: 'plan' },
  F: { m: 'F', f: 'plan' },
  S: { m: 'S', f: 'actual' },
  actual: { m: '', f: 'actual' },
  완: { m: '완', f: 'actual' },
  erase: { m: '', f: null },
}

export function setCellEdit(edits: ProgressEdits, row: ProgressRow, key: string, cell: CellState): ProgressEdits {
  const cur = { ...(edits[row.key] ?? {}) }
  const cells = { ...(cur.cells ?? {}) }
  const base = baseCell(row, key)
  if (base.m === cell.m && base.f === cell.f) delete cells[key]
  else cells[key] = cell
  cur.cells = Object.keys(cells).length ? cells : undefined
  return pruneEdit(edits, row.key, cur)
}

export function setStatusEdit(edits: ProgressEdits, row: ProgressRow, status: string): ProgressEdits {
  const cur = { ...(edits[row.key] ?? {}) }
  cur.status = (row.values.status ?? '') === status ? undefined : status
  return pruneEdit(edits, row.key, cur)
}

function pruneEdit(edits: ProgressEdits, key: string, cur: RowEdit): ProgressEdits {
  const next = { ...edits }
  if (!cur.cells && cur.status === undefined) delete next[key]
  else next[key] = cur
  return next
}

export function countEdits(edits: ProgressEdits): number {
  return Object.values(edits).reduce((n, e) => n + Object.keys(e.cells ?? {}).length + (e.status !== undefined ? 1 : 0), 0)
}

// 오늘이 몇 월 몇 주차인지(그 달 주 칸 수를 넘지 않게). 시트 연도와 올해가 다르면 null.
export function currentWeekKey(weekCols: WeekColumn[], year: number | null, today = new Date()): string | null {
  if (year !== null && year !== today.getFullYear()) return null
  const month = today.getMonth() + 1
  const inMonth = weekCols.filter((w) => w.month === month)
  if (inMonth.length === 0) return null
  const week = Math.min(Math.ceil(today.getDate() / 7), inMonth[inMonth.length - 1].week)
  return inMonth.find((w) => w.week === week)?.key ?? inMonth[inMonth.length - 1].key
}

// 계획·실적 시점(진척률 계산에 쓴다).
//   착수 계획 = 회색 S, 없으면 회색이 시작되는 칸 / 완료 계획 = F, 없으면 회색이 끝나는 칸
//   착수 = 분홍 S, 없으면 분홍이 시작되는 칸 / 완료 = 분홍 완
export function planRange(cells: Record<string, CellState>, weekCols: WeekColumn[]) {
  const keys = weekCols.map((w) => w.key).filter((k) => cells[k])
  const planKeys = keys.filter((k) => cells[k].f === 'plan' || cells[k].m === 'F')
  const actualKeys = keys.filter((k) => cells[k].f === 'actual')
  return {
    planStart: planKeys.find((k) => cells[k].m === 'S') ?? planKeys[0] ?? null,
    planEnd: [...planKeys].reverse().find((k) => cells[k].m === 'F') ?? planKeys[planKeys.length - 1] ?? null,
    started: actualKeys.find((k) => cells[k].m === 'S') ?? actualKeys[0] ?? null,
    done: actualKeys.find((k) => cells[k].m === '완') ?? null,
  }
}

// 저장할 칸 고르기: 방금 다시 읽은 시트(fresh)에서 행을 L2·L3 키로 다시 찾는다.
// 불러올 때(base)와 지금 시트 값이 다르면 그사이 누가 바꾼 것이므로 쓰지 않고 남긴다.
export function buildSheetWrites(base: ProgressData, fresh: ProgressData, edits: ProgressEdits) {
  const freshByKey = new Map(fresh.rows.map((r) => [r.key, r]))
  const baseByKey = new Map(base.rows.map((r) => [r.key, r]))
  const colOf = new Map(fresh.weekCols.map((w) => [w.key, w.col]))
  const writes: SheetCellWrite[] = []
  const kept: ProgressEdits = {}
  let conflicts = 0
  for (const [key, e] of Object.entries(edits)) {
    const b = baseByKey.get(key)
    const fr = freshByKey.get(key)
    if (!b || !fr) {
      kept[key] = e
      conflicts += Object.keys(e.cells ?? {}).length + (e.status !== undefined ? 1 : 0)
      continue
    }
    const keep: RowEdit = {}
    for (const [wk, cell] of Object.entries(e.cells ?? {})) {
      const col = colOf.get(wk)
      const before = baseCell(b, wk)
      const now = baseCell(fr, wk)
      if (col === undefined || before.m !== now.m || before.f !== now.f) {
        keep.cells = { ...(keep.cells ?? {}), [wk]: cell }
        conflicts++
        continue
      }
      writes.push({ row: fr.row, col, value: cell.m, fill: cell.f ? FILL_HEX[cell.f] : null })
    }
    if (e.status !== undefined) {
      if (fresh.statusCol === null || (fr.values.status ?? '') !== (b.values.status ?? '')) {
        keep.status = e.status
        conflicts++
      } else writes.push({ row: fr.row, col: fresh.statusCol, value: e.status })
    }
    if (keep.cells || keep.status !== undefined) kept[key] = keep
  }
  return { writes, kept, conflicts }
}

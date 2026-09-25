// 과제 입력 › 추진현황 -- 구글시트 「YYYY 추진현황」 탭 전체(모든 L1)를 읽어 일정표로 보여 주고,
// 시트에서 입력하던 것(L3 이름, 속성·분류·상태·담당자·날짜·단계 메모·비고… 모든 열, 주차 칸)을 그대로 입력한다.
// 성과관리 쪽 과제리스트(팀장이 고른 L2만 담음)와는 따로 저장한다.
// 시트에서 읽은 값(base)과 이 화면에서 고친 값(drafts)을 나눠 두어, 다시 불러와도 고친 내용이
// 덮이지 않고 "고친 칸"을 따로 표시하고, 저장할 때 바뀐 칸만 시트에 쓴다.
//
// 주차 칸 규칙(시트 그대로): 회색 배경 = 계획, 분홍 배경 = 실적.
//   회색 S = 착수 계획, 회색 F = 완료 계획, 분홍 S = 착수(시작함), 분홍 완 = 완료.
//   글자 없는 회색/분홍 칸은 그 사이 기간 막대.
import { v4 as uuidv4 } from 'uuid'
import type { WeekColumn, WeekMark } from '../types'
import { accountScope } from './accountScope'
import { cellText, type ParsedHeader, type ParsedRow, type RawSheet, type WeekFill } from './sheetImport'
import type { SheetCellWrite, SheetInsert } from './sheetSources'
import { COL_EVAL_GROUP, COL_NAME, SYSTEM_COLUMNS } from './workBoard'

export interface ProgressRow {
  key: string // L2␟L3 (시트 행 번호는 행 삽입으로 바뀌므로 쓰지 않음)
  row: number // 불러올 때의 시트 행(0-based) -- 저장 때는 다시 읽어 키로 찾는다
  h: string | null
  l1: string
  l2: string
  l2Tag: string | null
  l3: string
  values: Record<string, string> // 열 id -> 시트 원문 (status, category, assignees, note, col12 …)
  weeks: Record<string, WeekMark>
  fills: Record<string, WeekFill>
  // L3·입력 열 칸의 배경색(RRGGBB, 시트 그대로 · 흰색 제외). 키는 열 id('name' = L3)
  bg: Record<string, string>
  // 칸 메모. 키는 열 id 또는 주차 키
  notes: Record<string, string>
  isNew?: boolean // 이 화면에서 새로 추가(아직 시트에 없음)
}

// 주차 칸 하나: 글자(S/완/F) + 배경(계획 회색 / 실적 분홍)
export interface CellState {
  m: WeekMark | ''
  f: WeekFill | null
}

export const FILL_HEX: Record<WeekFill, string> = { plan: 'D9D9D9', actual: 'F4CCCC' }

// 시트의 입력 열 하나(L3 오른쪽, 주차 칸이 아닌 열)
export type FieldKind = 'text' | 'memo' | 'date' | 'select' | 'person' | 'link'
export interface FieldDef {
  id: string // 'name'(L3) · 시스템 열 id · 그 밖의 열은 'col<번호>'
  col: number
  label: string // 시트 머리글 그대로
  kind: FieldKind
  options?: string[]
}

// 머리글 색(시트 그대로, RRGGBB · 없으면 null)과 묶음 머리글(예: "CATCH UP 일정")
export interface HeaderStyle {
  l2: string | null
  l3: string | null
  months: Record<number, string | null>
  weeks: Record<string, string | null>
  fields: Record<string, string | null>
  groups: { label: string; fieldIds: string[]; bg: string | null }[]
}

export interface ProgressData {
  spreadsheetId: string | null
  source: string // 탭 이름 또는 파일 이름
  fileTitle?: string // 구글시트 파일 이름
  tabTitle: string
  sheetGid: number | null
  year: number | null
  fetchedAt: string
  weekCols: (WeekColumn & { col: number })[]
  fields: FieldDef[]
  headerStyle?: HeaderStyle
  rows: ProgressRow[]
}

// 기존 행에서 고친 값. 시트 값과 같아지면 지운다.
export interface RowEdit {
  cells?: Record<string, CellState>
  fields?: Record<string, string> // 'name'이면 L3 이름
  bg?: Record<string, string> // 칸 배경색. '' = 색 없음(흰색)
  notes?: Record<string, string> // 칸 메모. '' = 지움
}
export type ProgressEdits = Record<string, RowEdit>

// 새로 추가한 과제(시트에 아직 없음)
export interface NewRow {
  id: string
  l1: string
  l2: string
  l2Tag: string | null
  h: string | null
  fields: Record<string, string> // 'name' 포함
  cells: Record<string, CellState>
  bg?: Record<string, string>
  notes?: Record<string, string>
  // 어느 행의 위/아래에 넣었는지(행 키 · 새 과제면 'new:…'). 없으면 그 L2의 맨 아래
  anchor?: { key: string; where: 'above' | 'below' }
}

export interface Drafts {
  edits: ProgressEdits
  newRows: NewRow[]
}

export const NO_L1 = '(L1 없음)'
export const NEW_PREFIX = 'new:'

export function rowKeyOf(l2: string, l3: string, n = 1): string {
  const base = `${l2}␟${l3}`
  return n > 1 ? `${base}␟${n}` : base
}

// ---------- 시트 → 데이터 ----------

// 시트 머리글의 들쭉날쭉한 공백 정리: "비      고" → "비고", "URL,  LINK" → "URL, LINK"
export function cleanLabel(label: string): string {
  const t = label.replace(/\s+/g, ' ').trim()
  return t.split(' ').every((w) => w.length === 1) ? t.replace(/ /g, '') : t
}

const KIND_OF: Record<string, FieldKind> = { date: 'date', memo: 'memo', select: 'select', person: 'person', link: 'link', text: 'text' }

export function buildFieldDefs(header: ParsedHeader, columnMap: Record<string, number | null>): FieldDef[] {
  const defs: FieldDef[] = [{ id: COL_NAME, col: header.l3Col, label: cleanLabel(header.labels[header.l3Col] || 'L3'), kind: 'text' }]
  const used = new Set<number>([header.l3Col])
  for (const sys of SYSTEM_COLUMNS) {
    const col = columnMap[sys.id]
    if (sys.id === COL_NAME || sys.id === COL_EVAL_GROUP || col === null || col === undefined || used.has(col)) continue
    used.add(col)
    defs.push({ id: sys.id, col, label: cleanLabel(header.labels[col] ?? '') || sys.label, kind: KIND_OF[sys.type] ?? 'text', options: sys.options })
  }
  // 앱이 모르는 열도 머리글이 있으면 그대로 입력할 수 있게 한다.
  const weekSet = new Set(header.weekCols.map((w) => w.col))
  header.labels.forEach((label, col) => {
    if (col <= header.l3Col || used.has(col) || weekSet.has(col) || !label?.trim()) return
    used.add(col)
    defs.push({ id: `col${col}`, col, label: cleanLabel(label), kind: 'text' })
  })
  return defs.sort((a, b) => a.col - b.col)
}

export function buildHeaderStyle(header: ParsedHeader, raw: RawSheet, fields: FieldDef[]): HeaderStyle {
  const top = header.headerRow
  const sub = Math.max(top, header.dataStartRow - 1)
  const bg = (r: number, c: number) => raw.fills?.[r]?.[c] ?? null
  // 병합된 머리글은 첫 칸에만 색이 있을 수 있어 병합 첫 칸 색도 본다.
  const anchorBg = (r: number, c: number) => {
    const m = raw.merges.find((x) => x.r1 <= r && r <= x.r2 && x.c1 <= c && c <= x.c2)
    return m ? bg(m.r1, m.c1) : null
  }
  const at = (r: number, c: number) => bg(r, c) ?? anchorBg(r, c)
  const months: Record<number, string | null> = {}
  const weeks: Record<string, string | null> = {}
  for (const w of header.weekCols) {
    if (!(w.month in months)) months[w.month] = at(top, w.col)
    weeks[w.key] = at(sub, w.col) ?? at(top, w.col)
  }
  const fieldBg: Record<string, string | null> = {}
  for (const f of fields) fieldBg[f.id] = at(sub, f.col) ?? at(top, f.col)
  // 윗줄에서 여러 열을 합친 머리글 아래에 아랫줄 머리글이 따로 있으면 묶음 머리글이다.
  const groups: HeaderStyle['groups'] = []
  if (sub > top) {
    for (const m of raw.merges) {
      if (m.r1 !== top || m.r2 !== top || m.c2 <= m.c1) continue
      const label = cellText(raw.rows[top]?.[m.c1]).replace(/\s+/g, ' ').trim()
      const ids = fields.filter((f) => f.col >= m.c1 && f.col <= m.c2 && f.id !== 'name' && cellText(raw.rows[sub]?.[f.col])).map((f) => f.id)
      if (label && ids.length > 0) groups.push({ label, fieldIds: ids, bg: bg(top, m.c1) })
    }
  }
  return { l2: at(top, header.l2Col), l3: at(top, header.l3Col), months, weeks, fields: fieldBg, groups }
}

export function toProgressRows(rows: ParsedRow[], raw?: RawSheet, fields: FieldDef[] = [], weekCols: (WeekColumn & { col: number })[] = []): ProgressRow[] {
  const seen = new Map<string, number>()
  const extra = fields.filter((f) => f.id.startsWith('col'))
  return rows.map((r) => {
    const base = rowKeyOf(r.l2, r.l3)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const values = { ...r.values }
    for (const f of extra) {
      const t = cellText(raw?.rows[r.row]?.[f.col])
      if (t) values[f.id] = t
    }
    const bg: Record<string, string> = {}
    const notes: Record<string, string> = {}
    for (const f of fields) {
      const hex = raw?.fills?.[r.row]?.[f.col]
      if (hex && hex !== 'FFFFFF') bg[f.id] = hex
      const n = raw?.notes?.[r.row]?.[f.col]
      if (n) notes[f.id] = n
    }
    for (const w of weekCols) {
      const n = raw?.notes?.[r.row]?.[w.col]
      if (n) notes[w.key] = n
    }
    return {
      key: rowKeyOf(r.l2, r.l3, n),
      row: r.row,
      h: r.h,
      l1: r.l1 ?? NO_L1,
      l2: r.l2,
      l2Tag: r.l2Tag,
      l3: r.l3,
      values,
      weeks: r.weeks,
      fills: r.fills ?? {},
      bg,
      notes,
    }
  })
}

// ---------- 연결 시트 ----------

// 운영 중인 팀 구글시트 -- 과제 입력은 여기서 읽기만 하고 절대 쓰지 않는다(테스트 시트를 따로 연결해 저장).
// 운영 시트에 저장을 허용하려면 이 목록에서 빼야 한다.
export const PROTECTED_SHEET_IDS = ['1wnE6O8uIdCPPPHPYvQj5SBCSN9LlunkNT8dncA7NL2o']
export function isProtectedSheet(id: string | null | undefined): boolean {
  return !!id && PROTECTED_SHEET_IDS.includes(id)
}

// 과제 입력 기본 시트 -- 운영 시트의 사본(테스트용, jjy.osstem 소유). 읽기·저장 모두 여기로.
export const TASK_INPUT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1JK925VPx_t5HwPzKN0hWdu5zw0SqJHLQiyZTMLUA0AQ/edit'

// 과제 입력이 연결한 시트(링크). 없으면 위 기본 시트.
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

// ---------- 저장(브라우저) ----------

const dataKey = () => `progress-board:data:${accountScope()}`
const draftsKey = () => `progress-board:drafts:${accountScope()}`

export function loadProgress(): { data: ProgressData | null; drafts: Drafts } {
  try {
    const data = JSON.parse(localStorage.getItem(dataKey()) ?? 'null') as ProgressData | null
    const drafts = JSON.parse(localStorage.getItem(draftsKey()) ?? 'null') as Drafts | null
    // 열 정의가 없는 예전 형식은 다시 불러오게 한다.
    const ok = data && Array.isArray(data.rows) && Array.isArray(data.fields) && data.rows.every((r) => r.bg && r.notes)
    return { data: ok ? data : null, drafts: drafts && drafts.edits && Array.isArray(drafts.newRows) ? drafts : { edits: {}, newRows: [] } }
  } catch {
    return { data: null, drafts: { edits: {}, newRows: [] } }
  }
}

export function saveProgressData(data: ProgressData) {
  try {
    localStorage.setItem(dataKey(), JSON.stringify(data))
  } catch {
    // 저장 공간이 모자라도 지금 화면은 그대로 쓴다.
  }
}

export function saveDrafts(drafts: Drafts) {
  try {
    localStorage.setItem(draftsKey(), JSON.stringify(drafts))
  } catch {
    // 위와 같음
  }
}

// ---------- 값 읽기 ----------

export function baseCell(row: ProgressRow, key: string): CellState {
  return { m: row.weeks[key] ?? '', f: row.fills[key] ?? null }
}

export function baseField(row: ProgressRow, id: string): string {
  return id === COL_NAME ? row.l3 : (row.values[id] ?? '')
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

export function effectiveField(row: ProgressRow, edit: RowEdit | undefined, id: string): string {
  return edit?.fields?.[id] ?? baseField(row, id)
}

export function effectiveBg(row: ProgressRow, edit: RowEdit | undefined, id: string): string {
  const v = edit?.bg?.[id]
  return v !== undefined ? v : (row.bg[id] ?? '')
}

export function effectiveNote(row: ProgressRow, edit: RowEdit | undefined, key: string): string {
  const v = edit?.notes?.[key]
  return v !== undefined ? v : (row.notes[key] ?? '')
}

// 새 과제를 표에 그리기 위한 행 모양
export function newRowAsRow(n: NewRow): ProgressRow {
  const weeks: Record<string, WeekMark> = {}
  const fills: Record<string, WeekFill> = {}
  for (const [k, c] of Object.entries(n.cells)) {
    if (c.m) weeks[k] = c.m
    if (c.f) fills[k] = c.f
  }
  const { name = '', ...values } = n.fields
  return {
    key: NEW_PREFIX + n.id,
    row: -1,
    h: n.h,
    l1: n.l1,
    l2: n.l2,
    l2Tag: n.l2Tag,
    l3: name,
    values,
    weeks,
    fills,
    bg: { ...(n.bg ?? {}) },
    notes: { ...(n.notes ?? {}) },
    isNew: true,
  }
}

export function makeNewRow(from: { l1: string; l2: string; l2Tag: string | null; h: string | null }, anchor?: NewRow['anchor']): NewRow {
  return { id: uuidv4(), ...from, fields: { name: '' }, cells: {}, ...(anchor ? { anchor } : {}) }
}

// 시트 행 사이에 새 과제를 끼운 화면 순서. 새 과제는 추가한 순서대로 기준 행의 위/아래에 들어가고,
// 기준 행이 없어졌으면 그 L2의 맨 아래로 간다.
export function orderWithNewRows(base: ProgressRow[], newRows: NewRow[]): ProgressRow[] {
  const out = [...base]
  for (const n of newRows) {
    const row = newRowAsRow(n)
    const at = n.anchor ? out.findIndex((r) => r.key === n.anchor!.key) : -1
    if (at >= 0) {
      out.splice(n.anchor!.where === 'above' ? at : at + 1, 0, row)
      continue
    }
    let last = -1
    out.forEach((r, i) => {
      if (r.l2 === n.l2 && r.l1 === n.l1) last = i
    })
    out.splice(last >= 0 ? last + 1 : out.length, 0, row)
  }
  return out
}

// ---------- 고치기 ----------

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

function pruneEdit(edits: ProgressEdits, key: string, cur: RowEdit): ProgressEdits {
  const next = { ...edits }
  if (!cur.cells && !cur.fields && !cur.bg && !cur.notes) delete next[key]
  else next[key] = cur
  return next
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

export function setFieldEdit(edits: ProgressEdits, row: ProgressRow, id: string, value: string): ProgressEdits {
  const cur = { ...(edits[row.key] ?? {}) }
  const fields = { ...(cur.fields ?? {}) }
  if (baseField(row, id) === value) delete fields[id]
  else fields[id] = value
  cur.fields = Object.keys(fields).length ? fields : undefined
  return pruneEdit(edits, row.key, cur)
}

function setMapEdit(edits: ProgressEdits, row: ProgressRow, which: 'bg' | 'notes', id: string, value: string): ProgressEdits {
  const cur = { ...(edits[row.key] ?? {}) }
  const map = { ...(cur[which] ?? {}) }
  const base = (which === 'bg' ? row.bg[id] : row.notes[id]) ?? ''
  if (base === value) delete map[id]
  else map[id] = value
  cur[which] = Object.keys(map).length ? map : undefined
  return pruneEdit(edits, row.key, cur)
}
export function setBgEdit(edits: ProgressEdits, row: ProgressRow, id: string, hex: string): ProgressEdits {
  return setMapEdit(edits, row, 'bg', id, hex)
}
export function setNoteEdit(edits: ProgressEdits, row: ProgressRow, key: string, note: string): ProgressEdits {
  return setMapEdit(edits, row, 'notes', key, note.trim())
}

export function countDrafts(d: Drafts): number {
  return (
    Object.values(d.edits).reduce(
      (n, e) => n + Object.keys(e.cells ?? {}).length + Object.keys(e.fields ?? {}).length + Object.keys(e.bg ?? {}).length + Object.keys(e.notes ?? {}).length,
      0,
    ) + d.newRows.length
  )
}

// ---------- 기간 ----------

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

// ---------- 시트에 쓰기 ----------

// 날짜 열은 날짜(일련번호)로 써야 시트에서 날짜로 남는다.
export function fieldWrite(f: FieldDef, value: string): Pick<SheetCellWrite, 'value' | 'num'> {
  const m = f.kind === 'date' ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null
  if (m) return { value, num: Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569 }
  return { value }
}

// 저장할 칸 고르기: 방금 다시 읽은 시트(fresh)에서 행을 L2·L3 키로 다시 찾는다.
// 불러올 때(base)와 지금 시트 값이 다르면 그사이 누가 바꾼 것이므로 쓰지 않고 남긴다.
// 새 과제는 그 L2의 마지막 행 바로 아래에 줄을 끼워 넣는다(아래쪽 L2부터 넣어 행 번호가 밀리지 않게).
export function buildSheetWrites(base: ProgressData, fresh: ProgressData, drafts: Drafts) {
  const freshByKey = new Map(fresh.rows.map((r) => [r.key, r]))
  const baseByKey = new Map(base.rows.map((r) => [r.key, r]))
  const weekCol = new Map(fresh.weekCols.map((w) => [w.key, w.col]))
  const fieldById = new Map(fresh.fields.map((f) => [f.id, f]))
  const writes: SheetCellWrite[] = []
  const kept: Drafts = { edits: {}, newRows: [] }
  let conflicts = 0

  for (const [key, e] of Object.entries(drafts.edits)) {
    const b = baseByKey.get(key)
    const fr = freshByKey.get(key)
    if (!b || !fr) {
      kept.edits[key] = e
      conflicts += Object.keys(e.cells ?? {}).length + Object.keys(e.fields ?? {}).length + Object.keys(e.bg ?? {}).length + Object.keys(e.notes ?? {}).length
      continue
    }
    const keep: RowEdit = {}
    for (const [wk, cell] of Object.entries(e.cells ?? {})) {
      const col = weekCol.get(wk)
      const before = baseCell(b, wk)
      const now = baseCell(fr, wk)
      if (col === undefined || before.m !== now.m || before.f !== now.f) {
        keep.cells = { ...(keep.cells ?? {}), [wk]: cell }
        conflicts++
        continue
      }
      writes.push({ row: fr.row, col, value: cell.m, fill: cell.f ? FILL_HEX[cell.f] : null })
    }
    for (const [id, value] of Object.entries(e.fields ?? {})) {
      const f = fieldById.get(id)
      if (!f || baseField(fr, id) !== baseField(b, id)) {
        keep.fields = { ...(keep.fields ?? {}), [id]: value }
        conflicts++
        continue
      }
      writes.push({ row: fr.row, col: f.col, ...fieldWrite(f, value) })
    }
    for (const [id, hex] of Object.entries(e.bg ?? {})) {
      const f = fieldById.get(id)
      if (!f || (fr.bg[id] ?? '') !== (b.bg[id] ?? '')) {
        keep.bg = { ...(keep.bg ?? {}), [id]: hex }
        conflicts++
        continue
      }
      writes.push({ row: fr.row, col: f.col, fill: hex || null })
    }
    for (const [k, note] of Object.entries(e.notes ?? {})) {
      const col = fieldById.get(k)?.col ?? weekCol.get(k)
      if (col === undefined || (fr.notes[k] ?? '') !== (b.notes[k] ?? '')) {
        keep.notes = { ...(keep.notes ?? {}), [k]: note }
        conflicts++
        continue
      }
      writes.push({ row: fr.row, col, note })
    }
    if (keep.cells || keep.fields || keep.bg || keep.notes) kept.edits[key] = keep
  }

  // 새 과제: 화면 순서에서 같은 L2의 다음 시트 행 바로 위에 넣는다(없으면 그 L2 마지막 행 아래).
  const lastRowOfL2 = new Map<string, number>()
  for (const r of fresh.rows) lastRowOfL2.set(r.l2, Math.max(lastRowOfL2.get(r.l2) ?? -1, r.row))
  const order = orderWithNewRows(base.rows, drafts.newRows)
  const posOf = new Map(order.map((r, i) => [r.key, i]))
  const inserts: SheetInsert[] = []
  drafts.newRows.forEach((n) => {
    const idx = posOf.get(NEW_PREFIX + n.id) ?? 0
    let at: number | undefined
    for (let i = idx + 1; i < order.length && order[i].l2 === n.l2; i++) {
      if (order[i].isNew) continue
      const fr = freshByKey.get(order[i].key)
      if (fr) {
        at = fr.row
        break
      }
    }
    const last = lastRowOfL2.get(n.l2)
    if (at === undefined && last !== undefined) at = last + 1
    if (at === undefined || !n.fields.name?.trim()) {
      kept.newRows.push(n)
      conflicts++
      return
    }
    const cells: SheetInsert['cells'] = []
    for (const [id, value] of Object.entries(n.fields)) {
      const f = fieldById.get(id)
      if (f && value.trim()) cells.push({ col: f.col, ...fieldWrite(f, value.trim()) })
    }
    // 끼워 넣은 줄은 위 줄의 서식(배경색 포함)을 물려받으므로 칸 색을 전부 새로 정한다.
    for (const f of fresh.fields) {
      const hex = n.bg?.[f.id]
      const ex = cells.find((c) => c.col === f.col)
      if (ex) ex.fill = hex || null
      else cells.push({ col: f.col, fill: hex || null })
    }
    for (const [k, note] of Object.entries(n.notes ?? {})) {
      const col = fieldById.get(k)?.col ?? weekCol.get(k)
      if (col === undefined || !note) continue
      const ex = cells.find((c) => c.col === col)
      if (ex) ex.note = note
      else cells.push({ col, note })
    }
    // 주차 칸도 전부 새로 칠한다.
    for (const w of fresh.weekCols) {
      const c = n.cells[w.key]
      cells.push({ col: w.col, value: c?.m ?? '', fill: c?.f ? FILL_HEX[c.f] : null })
    }
    inserts.push({ at, cells, order: idx })
  })
  // 아래쪽부터 넣는다. 같은 자리면 화면에서 아래에 있는 것을 먼저 넣어야 최종 순서가 화면 순서와 같다.
  inserts.sort((a, b) => b.at - a.at || b.order - a.order)
  return { writes, inserts, kept, conflicts }
}

// ---------- 칠하기(회색 = 계획, 분홍 = 실적) ----------
// 빈 칸이나 다른 색 칸을 누르거나 끌면 그 색으로 칠하고, 이어진 묶음의 첫 칸에 S,
// 회색이면 끝 칸에 F를 자동으로 붙인다(묶음을 늘리면 따라 옮겨진다).
// 분홍 끝의 "완"은 끝났을 때만 직접 넣는다(진행 중인 과제에 자동으로 붙이지 않음).
// 이미 그 색인 칸을 다시 누르면(끌기 아님) S → 끝 글자(회색 F / 분홍 완) → 지움 순서로 바뀐다.
// 지우개('erase')는 누르거나 끈 칸을 비우고, 남은 묶음의 S/F를 다시 맞춘다.
export type PaintBrush = WeekFill | 'erase'
export function paintCells(cells: Record<string, CellState>, weekKeys: string[], key: string, color: PaintBrush, click: boolean): Record<string, CellState> {
  const out = { ...cells }
  const cur = out[key]
  if (color === 'erase') {
    if (!cur) return out
    delete out[key]
    return cur.f ? autoRunLetters(out, weekKeys, cur.f) : out
  }
  if (cur?.f === color) {
    if (!click) return out
    const end: WeekMark = color === 'plan' ? 'F' : '완'
    if (cur.m === '') out[key] = { m: 'S', f: color }
    else if (cur.m === 'S') out[key] = { m: end, f: color }
    else delete out[key]
    return out
  }
  out[key] = { m: '', f: color }
  return autoRunLetters(out, weekKeys, color)
}

function autoRunLetters(cells: Record<string, CellState>, weekKeys: string[], color: WeekFill): Record<string, CellState> {
  const out = { ...cells }
  let run: string[] = []
  const flush = () => {
    if (run.length === 0) return
    run.forEach((k, i) => {
      const c = out[k]
      const first = i === 0
      const last = i === run.length - 1 && run.length > 1
      if (first) {
        if (c.m === '' || (c.m === 'F' && run.length > 1)) out[k] = { ...c, m: 'S' }
      } else if (last && color === 'plan') {
        if (c.m === '' || c.m === 'S') out[k] = { ...c, m: 'F' }
      } else if (c.m === 'S' || (color === 'plan' && c.m === 'F')) {
        out[k] = { ...c, m: '' }
      }
    })
    run = []
  }
  for (const k of weekKeys) {
    if (out[k]?.f === color) run.push(k)
    else flush()
  }
  flush()
  return out
}

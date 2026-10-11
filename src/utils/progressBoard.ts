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
import { readAccessCache, sharedSheetFor, taskTabOf } from './accessSheet'
import { getConnectedEmail } from './googleDrive'
import { parseSheetUrl as parseSheetLink } from './sheetSources'
import { cellText, splitL2, type ParsedHeader, type ParsedRow, type RawSheet, type SheetMerge, type WeekFill } from './sheetImport'
import { parseFmt, type SheetCellWrite, type SheetInsert, type SheetMergeOp, type SheetMove, type SheetRange } from './sheetSources'
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
  // 칸 글자 서식(fmtString 모양, 기본은 없음). 키는 열 id
  fmt?: Record<string, string>
  // 이 행에 직접 적힌 H·L1·L2 칸 글자(병합이면 맨 위 칸에만 있음). 줄을 넣거나 지울 때 이름 칸을 옮기는 데 쓴다.
  labels?: Partial<Record<Level, string>>
  isNew?: boolean // 이 화면에서 새로 추가(아직 시트에 없음)
  // 읽어 올 때 이 줄 바로 앞에 있던 빈 줄 수(그룹 사이 여백 등). 시트로 올리거나 내보낼 때 같은 자리에 다시 넣어 줄 번호가 원본과 맞게 한다
  gapBefore?: number
  // 줄 높이(px, 시트 · 엑셀 그대로)와, 앞 빈 줄들의 높이. 올리거나 내보낼 때, 화면에서 원본 높이를 쓸 때 쓴다
  height?: number
  gapHeights?: number[]
  // 엑셀에 저장돼 있던 숫자 값 · 서식(열 id별). 값 글자(t)가 그대로일 때 올리면 숫자 그대로(날짜 일련번호 · 소수 등) 쓴다
  origNums?: Record<string, { v: number; z: string; t: string }>
  // 앞뒤 공백 · 줄바꿈 · 겹친 공백이 있던 글 칸의 원문(열 id별, t = 다듬어 읽은 글). 값을 안 고쳤으면 올릴 때 원문 그대로 쓴다
  origText?: Record<string, { raw: string; t: string }>
  // 소문자 s · f로 적었던 주차 칸 원문(주차 키별)
  weeksRaw?: Record<string, string>
  // 앞 빈 줄(gapBefore) 안에 적혀 있던 값(대분류 이름 · 이름 없는 줄의 메모 등). 키 = 빈 줄 순서(0부터), src = 시트 열 index
  gapCells?: Record<number, { src: number; v: string | number }[]>
  // 읽어 온 줄(이름 칸에 적힌 것만 올린다는 뜻 -- 앞 줄에서 이어받은 이름은 새로 쓰지 않는다)
  labelsExplicit?: boolean
}

export type Level = 'h' | 'l1' | 'l2'

// 주차 칸 하나: 글자(S/완/F) + 배경(계획 회색 / 실적 분홍)
export interface CellState {
  m: WeekMark | ''
  f: WeekFill | null
}

export { FILL_HEX } from './fillColors'
import { FILL_HEX } from './fillColors'

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
  // 엑셀 · 시트를 읽을 때 표로 옮기지 않은 줄: blank = 값이 하나도 없는 빈 줄 수, stray = 값은 있는데 과제 이름(L3)이 없는 줄의 시트 행 번호(1부터)
  skipped?: { blank: number; stray: number[]; preview?: string[] }
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
  levelCols?: Partial<Record<Level, number>> // H · L1 · L2 열 위치(0-based)
  levelMerges?: SheetMerge[] // H · L1 · L2 열의 병합 범위
  fieldMerges?: SheetMerge[] // 입력 열(속성·분류·상태…, L3 제외) 칸의 병합 범위
  headerRows?: { top: number; sub: number } // 머리글 줄(0-based): 위 줄 · 아래 줄(한 줄 머리글이면 같음)
  yearTabs?: string[] // 같은 파일 안의 「YYYY 추진현황」 탭들(최근 연도부터) -- 연도 고르기
  local?: boolean // 이 화면에서 새로 만든 연도(아직 구글시트에 없음 · 이 브라우저에 저장)
}

// 파일 안의 추진현황 탭 이름들을 최근 연도부터
export function progressYearTabs(titles: string[]): string[] {
  const y = (t: string) => Number(t.match(/(20\d{2})/)?.[1] ?? 0)
  return titles.filter((t) => t.includes('추진현황')).sort((a, b) => y(b) - y(a) || a.localeCompare(b))
}

// 기존 행에서 고친 값. 시트 값과 같아지면 지운다.
export interface RowEdit {
  cells?: Record<string, CellState>
  fields?: Record<string, string> // 'name'이면 L3 이름
  bg?: Record<string, string> // 칸 배경색. '' = 색 없음(흰색)
  notes?: Record<string, string> // 칸 메모. '' = 지움
  fmt?: Record<string, string> // 칸 글자 서식(fmtString). '' = 기본
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
  fmt?: Record<string, string>
  // 어느 행의 위/아래에 넣었는지(행 키 · 새 과제면 'new:…'). 없으면 그 L2의 맨 아래
  anchor?: { key: string; where: 'above' | 'below' }
}

// 기존 과제 줄 옮기기(같은 구분 안에서): 이 줄을 기준 줄의 위/아래로
export interface RowMove {
  key: string
  anchor: { key: string; where: 'above' | 'below' }
}

export interface Drafts {
  edits: ProgressEdits
  newRows: NewRow[]
  moves?: RowMove[] // 순서대로 적용
  deleted?: string[] // 지우기로 한 기존 행 키(저장하면 시트에서 그 줄을 지운다)
  merges?: MergeEdit[] // 입력 열 칸 병합 · 병합 해제(순서대로 적용)
  newCols?: NewCol[] // 새 입력 열(저장하면 시트에 열을 끼워 넣는다)
  delCols?: string[] // 지울 입력 열 id(저장하면 시트에서 열을 지운다)
  l2Renames?: Record<string, string> // 구분(L2) 이름 고치기: '그룹(L1)␟원래 L2␟원래 태그' → 새 이름("이름 [태그]")
  l2Splits?: L2Split[] // 구분(L2) 나누기: 이 줄부터 그 구분 끝까지 새 구분(순서대로 적용)
  colRenames?: Record<string, string> // 시트 입력 열 이름 바꾸기: 열 id → 새 머리글(저장하면 시트 머리글 칸에 쓴다)
}
// 이름을 바꿀 수 있는 열: 앱이 모르는(이름으로 알아보지 않는) 시트 열 · 새로 넣은 열. 상태 · 담당자 같은 기본 열은
// 앱이 머리글 이름으로 찾기 때문에 바꾸면 다음에 불러올 때 못 찾는다.
export const canRenameColumn = (id: string) => /^col\d+$/.test(id) || id.startsWith('newcol:')
// 구분 나누기: key = 새 구분의 첫 줄(시트 과제) · label = 새 구분 이름("이름 [태그]")
export interface L2Split {
  key: string
  label: string
}

const l2GroupKey = (r: { l1: string; l2: string; l2Tag: string | null }) => `${r.l1}␟${r.l2}␟${r.l2Tag ?? ''}`
// 고친 구분 이름을 행에 얹는다(행 키는 그대로)
export function applyL2Renames(rows: ProgressRow[], drafts: Pick<Drafts, 'l2Renames'>): ProgressRow[] {
  const map = drafts.l2Renames
  if (!map || !Object.keys(map).length) return rows
  return rows.map((r) => {
    const to = map[l2GroupKey(r)]
    if (to === undefined) return r
    const { name, tag } = splitL2(to)
    return { ...r, l2: name, l2Tag: tag }
  })
}
// 구분 나누기를 화면 순서에 얹는다(이름 고치기 뒤에). 나눈 줄부터 원래 구분이 끝날 때까지 새 이름으로.
export function applyL2Splits(rows: ProgressRow[], drafts: Pick<Drafts, 'l2Splits'>): ProgressRow[] {
  const splits = drafts.l2Splits
  if (!splits?.length) return rows
  const gk = (r: ProgressRow) => `${r.l1}␟${r.l2}␟${r.l2Tag ?? ''}`
  const out = [...rows]
  for (const sp of splits) {
    const i = out.findIndex((r) => r.key === sp.key)
    if (i <= 0) continue
    const g = gk(out[i])
    if (gk(out[i - 1]) !== g) continue // 이미 구분 경계
    const { name, tag } = splitL2(sp.label)
    const ng = `${out[i].l1}␟${name}␟${tag ?? ''}`
    for (let j = i; j < out.length && (gk(out[j]) === g || gk(out[j]) === ng); j++) out[j] = { ...out[j], l2: name, l2Tag: tag }
  }
  return out
}
export function renameL2(
  drafts: Drafts,
  row: { l1: string; l2: string; l2Tag: string | null },
  label: string,
  original?: { l1: string; l2: string; l2Tag: string | null },
): Drafts {
  // original = 이름을 처음 고치기 전의 값(이미 고친 구분을 다시 고칠 때)
  const k = l2GroupKey(original ?? row)
  const next = { ...(drafts.l2Renames ?? {}) }
  const { name, tag } = splitL2(label)
  const o = original ?? row
  if (o.l2 === name && (o.l2Tag ?? null) === (tag ?? null)) delete next[k]
  else next[k] = label
  return { ...drafts, l2Renames: next }
}

// 새 입력 열: 기준 열(시트 열 또는 먼저 만든 새 열)의 왼쪽/오른쪽
export const NEW_COL_PREFIX = 'newcol:'
export interface NewCol {
  id: string // 'newcol:…'
  label: string
  anchor: string
  side: 'left' | 'right'
}

// 화면에 보일 입력 열: 지운 열은 빼고 새 열은 기준 열 옆에(같은 기준 · 같은 쪽이면 만든 순서대로 바깥으로)
export function effectiveFields(fields: FieldDef[], headerStyle: HeaderStyle | undefined, drafts: Pick<Drafts, 'newCols' | 'delCols' | 'colRenames'>) {
  const del = new Set(drafts.delCols ?? [])
  const ren = drafts.colRenames ?? {}
  const list = fields.filter((f) => !del.has(f.id)).map((f) => (ren[f.id] ? { ...f, label: ren[f.id] } : f))
  const groupOf = new Map<string, string>() // 열 id → 묶음 이름
  for (const g of headerStyle?.groups ?? []) for (const id of g.fieldIds) groupOf.set(id, g.label)
  const byId = new Map((drafts.newCols ?? []).map((n) => [n.id, n]))
  for (const n of drafts.newCols ?? []) {
    const ai = list.findIndex((f) => f.id === n.anchor)
    if (ai < 0) continue
    let at = ai
    if (n.side === 'right') {
      at = ai + 1
      while (at < list.length && byId.get(list[at].id)?.anchor === n.anchor && byId.get(list[at].id)?.side === 'right') at++
    }
    const prev = list[at - 1]
    const next = list[at]
    const col = prev && next ? (prev.col + next.col) / 2 : prev ? prev.col + 0.5 : (next?.col ?? 0) - 0.5
    // 묶음 머리글 안쪽이면 그 묶음에 넣는다(묶음 맨 끝 바깥이면 넣지 않음)
    const g = prev && next && groupOf.get(prev.id) && groupOf.get(prev.id) === groupOf.get(next.id) ? groupOf.get(prev.id) : undefined
    if (g) groupOf.set(n.id, g)
    list.splice(at, 0, { id: n.id, col, label: n.label, kind: 'text' })
  }
  const hs = headerStyle
    ? {
        ...headerStyle,
        groups: headerStyle.groups
          .map((g) => ({ ...g, fieldIds: list.filter((f) => groupOf.get(f.id) === g.label).map((f) => f.id) }))
          .filter((g) => g.fieldIds.length),
      }
    : undefined
  return { fields: list, headerStyle: hs }
}

// 구분(L2) 칸의 색 · 서식을 묶음 첫 행의 bg · fmt에 두는 키(열 id 대신)
export const LEVEL_KEY_L2 = 'lvl:l2'

// 입력 열 칸 병합: 행 키(위→아래) × 열 id(왼→오른). L3(name)은 병합하지 않는다.
export interface CellMerge {
  rows: string[]
  ids: string[]
  src?: SheetMerge // 시트에서 읽은 병합이면 그 범위(시트 행 번호)
}
export interface MergeEdit {
  rows: string[]
  ids: string[]
  merge: boolean // false = 겹치는 병합 풀기
}

const mergesOverlap = (a: { rows: string[]; ids: string[] }, b: { rows: string[]; ids: string[] }) =>
  a.rows.some((r) => b.rows.includes(r)) && a.ids.some((i) => b.ids.includes(i))

// 시트 병합을 행 키 · 열 id로
export function baseMerges(data: ProgressData): CellMerge[] {
  const byRow = new Map(data.rows.map((r) => [r.row, r.key]))
  const out: CellMerge[] = []
  for (const m of data.fieldMerges ?? []) {
    const rows: string[] = []
    for (let i = m.r1; i <= m.r2; i++) {
      const k = byRow.get(i)
      if (k) rows.push(k)
    }
    const ids = data.fields
      .filter((f) => f.col >= m.c1 && f.col <= m.c2)
      .sort((a, b) => a.col - b.col)
      .map((f) => f.id)
    if (rows.length && ids.length && rows.length * ids.length > 1) out.push({ rows, ids, src: m })
  }
  return out
}

// 병합 고친 것을 얹는다. drop = 지운 줄(병합에서 뺀다)
export function applyMergeEdits(list: CellMerge[], edits: MergeEdit[], drop?: (key: string) => boolean): CellMerge[] {
  let out = [...list]
  for (const e of edits) {
    out = out.filter((m) => !mergesOverlap(m, e))
    if (e.merge) out.push({ rows: e.rows, ids: e.ids })
  }
  if (!drop) return out
  return out.map((m) => ({ ...m, rows: m.rows.filter((k) => !drop(k)) })).filter((m) => m.rows.length * m.ids.length > 1)
}

// 화면에 보일 병합(시트 병합 + 고친 것, 지운 줄 · 없어진 새 줄 빼고)
export function effectiveMerges(data: ProgressData, drafts: Drafts): CellMerge[] {
  const alive = new Set([...data.rows.map((r) => r.key), ...drafts.newRows.map((n) => NEW_PREFIX + n.id)])
  const del = new Set(drafts.deleted ?? [])
  return applyMergeEdits(baseMerges(data), drafts.merges ?? [], (k) => !alive.has(k) || del.has(k))
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

export function toProgressRows(
  rows: ParsedRow[],
  raw?: RawSheet,
  fields: FieldDef[] = [],
  weekCols: (WeekColumn & { col: number })[] = [],
  levelCols: Partial<Record<Level, number>> = {},
): ProgressRow[] {
  const seen = new Map<string, number>()
  const extra = fields.filter((f) => f.id.startsWith('col'))
  return rows.map((r, idx) => {
    const gap = idx > 0 ? r.row - rows[idx - 1].row - 1 : 0
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
    const fmt: Record<string, string> = {}
    for (const f of fields) {
      const hex = raw?.fills?.[r.row]?.[f.col]
      if (hex && hex !== 'FFFFFF') bg[f.id] = hex
      const n = raw?.notes?.[r.row]?.[f.col]
      if (n) notes[f.id] = n
      const t = raw?.fmts?.[r.row]?.[f.col]
      if (t) fmt[f.id] = t
    }
    for (const w of weekCols) {
      const n = raw?.notes?.[r.row]?.[w.col]
      if (n) notes[w.key] = n
    }
    // 엑셀 숫자 값 · 서식 (입력 열)
    const origNums: Record<string, { v: number; z: string; t: string }> = {}
    for (const f of fields) {
      const n = raw?.nums?.[r.row]?.[f.col]
      if (n && values[f.id] !== undefined) origNums[f.id] = { v: n.v, z: n.z, t: values[f.id] }
    }
    const origText: Record<string, { raw: string; t: string }> = {}
    for (const f of fields) {
      const rv = raw?.rows[r.row]?.[f.col]
      if (typeof rv !== 'string') continue
      const t = f.id === 'name' ? r.l3 : values[f.id]
      const rawText = rv.replace(/\r\n/g, '\n')
      if (t !== undefined && t !== '' && rawText !== t) origText[f.id] = { raw: rawText, t }
    }
    // 앞 빈 줄 안에 적힌 값(이름 없는 줄 · 대분류 이름만 있는 줄 등) -- 줄 번호를 지켜 다시 쓸 때 그대로 되살린다
    const gapCells: Record<number, { src: number; v: string | number }[]> = {}
    if (gap > 0 && raw) {
      for (let g = 0; g < gap; g++) {
        const gr = raw.rows[rows[idx - 1].row + 1 + g] ?? []
        const cells: { src: number; v: string | number }[] = []
        gr.forEach((cv, src) => {
          if (cv === null || cv === undefined) return
          const v = typeof cv === 'number' ? cv : typeof cv === 'object' && (cv as { kind?: string }).kind === 'date' ? (cv as { serial: number }).serial : typeof cv === 'string' ? cv : String(cv)
          if (typeof v === 'string' ? v.trim() === '' : false) return
          cells.push({ src, v })
        })
        if (cells.length) gapCells[g] = cells
      }
    }
    const labels: Partial<Record<Level, string>> = {}
    for (const [lv, col] of Object.entries(levelCols) as [Level, number][]) {
      const t = cellText(raw?.rows[r.row]?.[col])
      if (t.trim()) {
        labels[lv] = t
        // 대분류(H) · L1 · L2 칸에 달린 메모도 그 이름 칸에 그대로 둔다
        const n = raw?.notes?.[r.row]?.[col]
        if (n) notes[`lvl:${lv}`] = n
      }
    }
    // 구분(L2) 칸 색 · 서식: 이름이 적힌(묶음 맨 위) 칸에서 읽는다
    if (labels.l2 && levelCols.l2 !== undefined) {
      const hex = raw?.fills?.[r.row]?.[levelCols.l2]
      if (hex && hex !== 'FFFFFF') bg[LEVEL_KEY_L2] = hex
      const t = raw?.fmts?.[r.row]?.[levelCols.l2]
      if (t) fmt[LEVEL_KEY_L2] = t
    }
    return {
      key: rowKeyOf(r.l2, r.l3, n),
      row: r.row,
      ...(gap > 0 ? { gapBefore: gap } : {}),
      ...(raw?.heights?.[r.row] ? { height: raw.heights[r.row] as number } : {}),
      ...(gap > 0 && raw?.heights ? { gapHeights: Array.from({ length: gap }, (_, g) => (raw.heights?.[rows[idx - 1].row + 1 + g] as number | null) ?? 0) } : {}),
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
      ...(Object.keys(fmt).length ? { fmt } : {}),
      ...(Object.keys(labels).length ? { labels } : {}),
      labelsExplicit: true,
      ...(Object.keys(origNums).length ? { origNums } : {}),
      ...(Object.keys(origText).length ? { origText } : {}),
      ...(r.weeksRaw ? { weeksRaw: r.weeksRaw } : {}),
      ...(Object.keys(gapCells).length ? { gapCells } : {}),
    }
  })
}

// ---------- 연결 시트 ----------

// 읽기 전용으로 잠가 둘 시트(저장 막음). 지금은 없음 -- 운영 시트도 연구소가 앱에서 고쳐 쓴다.
export const PROTECTED_SHEET_IDS: string[] = []
export function isProtectedSheet(id: string | null | undefined): boolean {
  return !!id && PROTECTED_SHEET_IDS.includes(id)
}
// 디자인연구소 「실적관리」 운영 시트: 저장은 되지만 늘 확인 창을 거친다(「다음부터 묻지 않기」 없음) -- 실제 데이터라 실수를 막는다.
export const OPERATING_SHEET_IDS = ['1wnE6O8uIdCPPPHPYvQj5SBCSN9LlunkNT8dncA7NL2o']
export function isOperatingSheet(id: string | null | undefined): boolean {
  return !!id && OPERATING_SHEET_IDS.includes(id)
}

// 과제 입력 기본 시트 -- 디자인연구소 실적관리(운영 시트). 읽기·저장 모두 여기로(저장 전 확인 창).
export const TASK_INPUT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1wnE6O8uIdCPPPHPYvQj5SBCSN9LlunkNT8dncA7NL2o/edit'

// 과제 입력이 연결한 시트(링크). 없으면 위 기본 시트.
const sheetKey = () => `progress-board:sheet:${accountScope()}`
// 입력하는 시트 연도 탭(올해 이후 연도를 골랐으면 새로 불러와도 그 탭으로)
const activeTabKey = () => `progress-board:tab:${accountScope()}`
// 관리자가 정한 열 탭(관리 › 실적관리 시트)
function sharedTab(): string | null {
  try {
    return taskTabOf(readAccessCache())
  } catch {
    return null
  }
}
// 직접 고른 탭은 「그때 관리자가 정한 탭」과 함께 적어 둔다. 관리자가 열 탭을 바꿨으면(또는 예전 형식이면) 관리자가 정한 탭이 먼저 열린다.
export function readActiveTab(): string | null {
  try {
    const cur = sharedTab()
    const raw = localStorage.getItem(activeTabKey())
    if (!raw) return cur
    let title = raw
    let shared: string | null | undefined
    if (raw.startsWith('{')) {
      const o = JSON.parse(raw) as { title?: string; shared?: string | null }
      if (!o.title) return cur
      title = o.title
      shared = o.shared ?? null
    }
    if (!cur) return title
    return shared === cur ? title : cur
  } catch {
    return null
  }
}
export function writeActiveTab(title: string | null) {
  try {
    if (title) localStorage.setItem(activeTabKey(), JSON.stringify({ title, shared: sharedTab() }))
    else localStorage.removeItem(activeTabKey())
  } catch {
    // 무시
  }
}

// 구글시트 업데이트 전에 묻기(기본 묻기). 끄면 입력 끝내기 · 저장 버튼에서 바로 업데이트한다(과제를 지울 때는 늘 묻는다).
const askSaveKey = () => `progress-board:ask-save:${accountScope()}`
export function readAskBeforeSave(): boolean {
  try {
    return localStorage.getItem(askSaveKey()) !== '0'
  } catch {
    return true
  }
}
export function writeAskBeforeSave(ask: boolean) {
  try {
    if (ask) localStorage.removeItem(askSaveKey())
    else localStorage.setItem(askSaveKey(), '0')
  } catch {
    // 기억 못 하면 다음에도 묻는다
  }
}

// 관리자가 공유한 시트(권한 시트 「연결 시트」)의 id -- 모르면 null
export function currentSharedId(): string | null {
  try {
    const hit = sharedSheetFor(getConnectedEmail())
    return hit ? parseSheetLink(hit.url)?.spreadsheetId ?? null : null
  } catch {
    return null
  }
}
// 앱이 쓰는 시트는 관리자가 정한 하나뿐이다(이 브라우저에서 따로 고른 시트는 따르지 않는다). 예전에 남은 선택은 지운다.
export function readLinkedSheet(): string | null {
  try {
    if (localStorage.getItem(sheetKey())) localStorage.removeItem(sheetKey())
  } catch {
    // 무시
  }
  return null
}
export function writeLinkedSheet(_url: string | null) {
  void _url
  try {
    localStorage.removeItem(sheetKey())
  } catch {
    // 무시
  }
}

// ---------- 저장(브라우저) ----------

// 보기 모양(표 · 보드 · 타임라인) 기억: 계정마다 따로(다른 계정으로 로그인해도 앞 사람 설정이 따라오지 않게)
export const boardViewKey = () => `progress-board-view:${accountScope()}`
const dataKey = () => `progress-board:data:${accountScope()}`
const draftsKey = () => `progress-board:drafts:${accountScope()}`

export function loadProgress(): { data: ProgressData | null; drafts: Drafts } {
  try {
    const data = JSON.parse(localStorage.getItem(dataKey()) ?? 'null') as ProgressData | null
    const drafts = JSON.parse(localStorage.getItem(draftsKey()) ?? 'null') as Drafts | null
    // 열 정의가 없는 예전 형식은 다시 불러오게 한다.
    let ok = data && Array.isArray(data.rows) && Array.isArray(data.fields) && data.rows.every((r) => r.bg && r.notes)
    // 관리자가 정한 시트와 다른 시트에서 받아 둔 내용(예전 시트)은 버린다 -- 앱 어디서든 관리자가 정한 시트 하나만 보이게
    const shared = currentSharedId()
    if (ok && data && !data.local && shared && data.spreadsheetId && data.spreadsheetId !== shared) {
      localStorage.removeItem(dataKey())
      localStorage.removeItem(draftsKey())
      return { data: null, drafts: { edits: {}, newRows: [] } }
    }
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

export function clearProgressData() {
  try {
    localStorage.removeItem(dataKey())
  } catch {
    // 무시
  }
}

export function saveDrafts(drafts: Drafts) {
  try {
    localStorage.setItem(draftsKey(), JSON.stringify(drafts))
  } catch {
    // 위와 같음
  }
}

// 지금 보지 않는 연도(이 브라우저에서 만든 연도 · 잠시 내려 둔 시트 연도)를 탭 이름별로 둔다.
export interface ShelfItem {
  data: ProgressData
  drafts: Drafts
}
const shelfKey = () => `progress-board:shelf:${accountScope()}`
export function loadShelf(): Record<string, ShelfItem> {
  try {
    const v = JSON.parse(localStorage.getItem(shelfKey()) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
export function saveShelf(shelf: Record<string, ShelfItem>) {
  try {
    localStorage.setItem(shelfKey(), JSON.stringify(shelf))
  } catch {
    // 저장 공간이 모자라면 지금 화면에만 남는다
  }
}

// 새 연도의 주 칸: 그 달에 든 목요일 수(4~5주, 한 주는 목요일이 든 달에 속함)
export function yearWeeks(year: number): { month: number; week: number }[] {
  const out: { month: number; week: number }[] = []
  for (let m = 1; m <= 12; m++) {
    let n = 0
    const days = new Date(year, m, 0).getDate()
    for (let d = 1; d <= days; d++) if (new Date(year, m - 1, d).getDay() === 4) n++
    for (let w = 1; w <= n; w++) out.push({ month: m, week: w })
  }
  return out
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

export function effectiveFmt(row: ProgressRow, edit: RowEdit | undefined, id: string): string {
  const v = edit?.fmt?.[id]
  return v !== undefined ? v : (row.fmt?.[id] ?? '')
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
    fmt: { ...(n.fmt ?? {}) },
    isNew: true,
  }
}

export function makeNewRow(from: { l1: string; l2: string; l2Tag: string | null; h: string | null }, anchor?: NewRow['anchor']): NewRow {
  return { id: uuidv4(), ...from, fields: { name: '' }, cells: {}, ...(anchor ? { anchor } : {}) }
}

// 새 구분(L2): 이름에 "[태그]"를 붙이면 시트처럼 태그로 나눈다. 과제 한 줄로 시작한다.
export function makeNewGroup(name: string, from: { l1: string; h: string | null }, anchor: NonNullable<NewRow['anchor']>): NewRow {
  const { name: l2, tag } = splitL2(name)
  return makeNewRow({ l1: from.l1, h: from.h, l2, l2Tag: tag }, anchor)
}

// 시트 행 사이에 새 과제를 끼운 화면 순서. 새 과제는 추가한 순서대로 기준 행의 위/아래에 들어가고,
// 기준 행이 없어졌으면 그 L2의 맨 아래로 간다.
// 옮긴 줄은 새 과제까지 넣은 뒤 순서대로 기준 줄의 위/아래로 옮긴다(기준 줄이 없으면 그대로).
export function orderWithNewRows(base: ProgressRow[], newRows: NewRow[], moves: RowMove[] = []): ProgressRow[] {
  const out = placeNewRows(base, newRows)
  for (const m of moves) {
    const from = out.findIndex((r) => r.key === m.key)
    if (from < 0 || m.anchor.key === m.key) continue
    const [row] = out.splice(from, 1)
    const at = out.findIndex((r) => r.key === m.anchor.key)
    if (at < 0) {
      out.splice(from, 0, row)
      continue
    }
    out.splice(m.anchor.where === 'above' ? at : at + 1, 0, row)
  }
  return out
}

function placeNewRows(base: ProgressRow[], newRows: NewRow[]): ProgressRow[] {
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
  if (!cur.cells && !cur.fields && !cur.bg && !cur.notes && !cur.fmt) delete next[key]
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

function setMapEdit(edits: ProgressEdits, row: ProgressRow, which: 'bg' | 'notes' | 'fmt', id: string, value: string): ProgressEdits {
  const cur = { ...(edits[row.key] ?? {}) }
  const map = { ...(cur[which] ?? {}) }
  const base = (which === 'bg' ? row.bg[id] : which === 'fmt' ? row.fmt?.[id] : row.notes[id]) ?? ''
  if (base === value) delete map[id]
  else map[id] = value
  cur[which] = Object.keys(map).length ? map : undefined
  return pruneEdit(edits, row.key, cur)
}
export function setBgEdit(edits: ProgressEdits, row: ProgressRow, id: string, hex: string): ProgressEdits {
  return setMapEdit(edits, row, 'bg', id, hex)
}
export function setFmtEdit(edits: ProgressEdits, row: ProgressRow, id: string, fmt: string): ProgressEdits {
  return setMapEdit(edits, row, 'fmt', id, fmt)
}
export function setNoteEdit(edits: ProgressEdits, row: ProgressRow, key: string, note: string): ProgressEdits {
  return setMapEdit(edits, row, 'notes', key, note.trim())
}

export function countDrafts(d: Drafts): number {
  return (
    Object.values(d.edits).reduce(
      (n, e) =>
        n +
        Object.keys(e.cells ?? {}).length +
        Object.keys(e.fields ?? {}).length +
        Object.keys(e.bg ?? {}).length +
        Object.keys(e.notes ?? {}).length +
        Object.keys(e.fmt ?? {}).length,
      0,
    ) +
    d.newRows.length +
    (d.deleted?.length ?? 0) +
    (d.moves?.length ?? 0) +
    (d.merges?.length ?? 0) +
    (d.newCols?.length ?? 0) +
    (d.delCols?.length ?? 0) +
    Object.keys(d.l2Renames ?? {}).length +
    (d.l2Splits?.length ?? 0) +
    Object.keys(d.colRenames ?? {}).length
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
// 시트에 보내는 순서: 기존 칸 쓰기(지금 행 번호) → 줄 지우기(아래부터) → 새 과제 줄 넣기(아래부터)
//   → 구분 이름 칸 옮기기·병합 다시 잡기(다 끝난 뒤의 행 번호).
export function buildSheetWrites(base: ProgressData, fresh: ProgressData, draftsIn: Drafts) {
  // 새 열 · 지운 열의 칸은 따로 모은다(열은 맨 끝에 넣고 지우므로 그 뒤에 쓴다)
  const newColIds = new Set((draftsIn.newCols ?? []).map((n) => n.id))
  const delColIds = new Set(draftsIn.delCols ?? [])
  type ColCell = { key: string; id: string; value?: string; fill?: string | null; fmt?: string; note?: string }
  const colLater: ColCell[] = []
  function strip<T>(m: Record<string, T> | undefined, put: (id: string, v: T) => void): Record<string, T> | undefined {
    if (!m) return m
    const out: Record<string, T> = {}
    for (const [id, v] of Object.entries(m)) {
      if (newColIds.has(id)) put(id, v)
      else if (!delColIds.has(id)) out[id] = v
    }
    return Object.keys(out).length ? out : undefined
  }
  const drafts: Drafts = {
    ...draftsIn,
    edits: Object.fromEntries(
      Object.entries(draftsIn.edits).map(([key, e]) => [
        key,
        {
          ...e,
          fields: strip(e.fields, (id, value) => colLater.push({ key, id, value })),
          bg: strip(e.bg, (id, v) => colLater.push({ key, id, fill: v || null })),
          fmt: strip(e.fmt, (id, fmt) => colLater.push({ key, id, fmt })),
          notes: strip(e.notes, (id, note) => colLater.push({ key, id, note })),
        },
      ]),
    ),
  }
  for (const n of draftsIn.newRows) {
    const key = NEW_PREFIX + n.id
    for (const id of newColIds) {
      const value = n.fields[id]
      const fill = n.bg?.[id]
      const fmt = n.fmt?.[id]
      const note = n.notes?.[id]
      if (value?.trim() || fill || fmt || note)
        colLater.push({
          key,
          id,
          ...(value?.trim() ? { value: value.trim() } : {}),
          ...(fill ? { fill } : {}),
          ...(fmt ? { fmt } : {}),
          ...(note ? { note } : {}),
        })
    }
  }
  const freshByKey = new Map(fresh.rows.map((r) => [r.key, r]))
  const baseByKey = new Map(base.rows.map((r) => [r.key, r]))
  const weekCol = new Map(fresh.weekCols.map((w) => [w.key, w.col]))
  const fieldById = new Map(fresh.fields.map((f) => [f.id, f]))
  const writes: SheetCellWrite[] = []
  const kept: Drafts = { edits: {}, newRows: [], deleted: [], moves: [] }
  let conflicts = 0
  const editCount = (e: RowEdit) =>
    Object.keys(e.cells ?? {}).length +
    Object.keys(e.fields ?? {}).length +
    Object.keys(e.bg ?? {}).length +
    Object.keys(e.notes ?? {}).length +
    Object.keys(e.fmt ?? {}).length

  // 지울 줄: 시트에서 다시 찾지 못하면 남긴다.
  const delKeys = new Set(drafts.deleted ?? [])
  const delRows = new Set<number>()
  for (const key of delKeys) {
    const fr = freshByKey.get(key)
    if (fr) delRows.add(fr.row)
    else {
      kept.deleted!.push(key)
      conflicts++
    }
  }

  for (const [key, e] of Object.entries(drafts.edits)) {
    if (delKeys.has(key)) {
      // 지우는 줄의 고친 값은 버린다(지우기가 남으면 같이 남긴다).
      if (kept.deleted!.includes(key)) kept.edits[key] = e
      continue
    }
    const b = baseByKey.get(key)
    const fr = freshByKey.get(key)
    if (!b || !fr) {
      kept.edits[key] = e
      conflicts += editCount(e)
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
      const col = fieldById.get(id)?.col ?? (id === LEVEL_KEY_L2 ? fresh.levelCols?.l2 : undefined)
      if (col === undefined || (fr.bg[id] ?? '') !== (b.bg[id] ?? '')) {
        keep.bg = { ...(keep.bg ?? {}), [id]: hex }
        conflicts++
        continue
      }
      writes.push({ row: fr.row, col, fill: hex || null })
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
    for (const [id, v] of Object.entries(e.fmt ?? {})) {
      const col = fieldById.get(id)?.col ?? (id === LEVEL_KEY_L2 ? fresh.levelCols?.l2 : undefined)
      if (col === undefined || (fr.fmt?.[id] ?? '') !== (b.fmt?.[id] ?? '')) {
        keep.fmt = { ...(keep.fmt ?? {}), [id]: v }
        conflicts++
        continue
      }
      writes.push({ row: fr.row, col, fmt: parseFmt(v) })
    }
    if (keep.cells || keep.fields || keep.bg || keep.notes || keep.fmt) kept.edits[key] = keep
  }

  // 구분(L2) 이름 고치기: 그 구분의 이름 칸(이름이 적힌 맨 위 칸)에 새 이름
  if (fresh.levelCols?.l2 !== undefined) {
    for (const [k, label] of Object.entries(drafts.l2Renames ?? {})) {
      const [l1, l2, tag] = k.split('␟')
      const { name, tag: newTag } = splitL2(label)
      const text = newTag ? `${name}\n\n[${newTag}]` : name
      const hits = fresh.rows.filter((r) => r.l1 === l1 && r.l2 === l2 && (r.l2Tag ?? '') === tag && r.labels?.l2)
      if (!hits.length) {
        kept.l2Renames = { ...(kept.l2Renames ?? {}), [k]: label }
        conflicts++
        continue
      }
      for (const r of hits) writes.push({ row: r.row, col: fresh.levelCols.l2, value: text })
    }
  }

  // ---- 시트 줄을 흉내 내며 순서대로 바꾼다: arr[i] = 지금 i번째 줄에 있는 원래 줄(시트 행 번호) 또는 새 줄('n:…')
  const maxRow = Math.max(-1, ...fresh.rows.map((r) => r.row), ...(fresh.levelMerges ?? []).map((m) => m.r2))
  const arr: (number | string)[] = Array.from({ length: maxRow + 1 }, (_, i) => i)
  const order = orderWithNewRows(base.rows, drafts.newRows, drafts.moves ?? [])
  const gkey = (r: ProgressRow) => `${r.l1}␟${r.l2}␟${r.l2Tag ?? ''}`

  // 1) 같은 구분 안에서 줄 옮기기(구분의 줄이 시트에서 붙어 있을 때만 -- 사이에 다른 줄이 끼어 있으면 남긴다)
  const moves: SheetMove[] = []
  kept.moves = []
  const movedKeys = (drafts.moves ?? []).map((m) => m.key)
  const touched = new Set(order.filter((r) => movedKeys.includes(r.key)).map(gkey))
  for (const g of touched) {
    const want = order.filter((r) => !r.isNew && gkey(r) === g && freshByKey.has(r.key)).map((r) => freshByKey.get(r.key)!.row)
    const slots = [...want].sort((x, y) => x - y)
    const contiguous = slots.every((v, i) => i === 0 || v === slots[i - 1] + 1)
    if (!contiguous) {
      for (const m of drafts.moves ?? []) {
        const r = order.find((x) => x.key === m.key)
        if (r && gkey(r) === g) {
          kept.moves.push(m)
          conflicts++
        }
      }
      continue
    }
    want.forEach((orig, i) => {
      const to = slots[0] + i
      const from = arr.indexOf(orig)
      if (from === to) return
      arr.splice(from, 1)
      arr.splice(to, 0, orig)
      moves.push({ from, to })
    })
  }
  for (const m of drafts.moves ?? []) if (!order.some((r) => r.key === m.key)) kept.moves.push(m)
  // 옮긴 줄(원래 시트 행 번호)과, 옮기기 전에 풀어 둘 이름 칸 병합(구글시트는 병합 칸 일부만 옮기지 못한다)
  const movedRows = new Set<number>()
  for (const g of touched) {
    if (kept.moves.some((m) => gkey(order.find((x) => x.key === m.key)!) === g)) continue
    for (const r of order) if (!r.isNew && gkey(r) === g && freshByKey.has(r.key)) movedRows.add(freshByKey.get(r.key)!.row)
  }
  const unmergeFirst: SheetMergeOp[] = moves.length
    ? (fresh.levelMerges ?? []).filter((m) => [...movedRows].some((r) => r >= m.r1 && r <= m.r2)).map((m) => ({ col: m.c1, r1: m.r1, r2: m.r2, merge: false }))
    : []

  // 입력 열 칸 병합: 바뀐 시트 병합과 옮기는 줄에 걸친 병합은 옮기기 전에 풀고, 원하는 병합은 모두 끝난 뒤 다시 잡는다.
  const mergeEdits = drafts.merges ?? []
  const freshMerges = baseMerges(fresh)
  const wanted = applyMergeEdits(freshMerges, mergeEdits)
  const sigOf = (m: { rows: string[]; ids: string[] }) => `${m.rows.join('␞')}|${m.ids.join('␞')}`
  const wantedSig = new Set(wanted.map(sigOf))
  const freshSig = new Set(freshMerges.map(sigOf))
  const unmergeCells: SheetRange[] = []
  const mergeLater: CellMerge[] = wanted.filter((m) => !freshSig.has(sigOf(m)))
  for (const m of freshMerges) {
    const src = m.src!
    const moved = moves.length > 0 && [...movedRows].some((r) => r >= src.r1 && r <= src.r2)
    const stays = wantedSig.has(sigOf(m))
    if (stays && !moved) continue
    unmergeCells.push({ r1: src.r1, r2: src.r2, c1: src.c1, c2: src.c2 })
    if (stays) mergeLater.push(m)
  }

  // 2) 줄 지우기(아래부터)
  const delAt = [...delRows].map((r) => arr.indexOf(r)).sort((x, y) => y - x)
  for (const i of delAt) arr.splice(i, 1)
  const delSorted = delAt

  // 3) 새 과제 줄 넣기: 화면 순서대로, 같은 구분의 앞 줄 바로 아래(없으면 같은 구분의 다음 줄 바로 위).
  //    새 구분(L2)은 위에 넣었으면 다음 줄 위, 아니면 앞 줄 아래.
  const tokenOf = (r: ProgressRow): number | string | null =>
    r.isNew ? r.key : !delKeys.has(r.key) && freshByKey.has(r.key) ? freshByKey.get(r.key)!.row : null
  const inserts: SheetInsert[] = []
  const newByToken = new Map<string, NewRow>()
  order.forEach((item, idx) => {
    if (!item.isNew) return
    const n = drafts.newRows.find((x) => NEW_PREFIX + x.id === item.key)!
    let prev: { r: ProgressRow; t: number | string } | undefined
    let next: { r: ProgressRow; t: number | string } | undefined
    for (let i = idx - 1; i >= 0 && !prev; i--) {
      const t = tokenOf(order[i])
      if (t !== null && arr.includes(t)) prev = { r: order[i], t }
    }
    for (let i = idx + 1; i < order.length && !next; i++) {
      const t = tokenOf(order[i])
      if (t !== null && !order[i].isNew && arr.includes(t)) next = { r: order[i], t }
    }
    const same = (x?: { r: ProgressRow }) => !!x && x.r.l2 === n.l2 && x.r.l1 === n.l1
    let at: number | undefined
    if (prev && same(prev)) at = arr.indexOf(prev.t) + 1
    else if (next && same(next)) at = arr.indexOf(next.t)
    else if (n.anchor?.where === 'above' && next) at = arr.indexOf(next.t)
    else if (prev) at = arr.indexOf(prev.t) + 1
    else if (next) at = arr.indexOf(next.t)
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
      // 글자 서식은 이 화면에서 정했을 때만(아니면 위 줄 서식을 물려받는다)
      if (n.fmt?.[f.id] !== undefined) cells.find((c) => c.col === f.col)!.fmt = parseFmt(n.fmt[f.id])
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
    arr.splice(at, 0, item.key)
    newByToken.set(item.key, n)
    inserts.push({ at, cells, order: idx })
  })

  // 다 끝난 뒤의 행 번호
  const finalOf = (i: number) => arr.indexOf(i)

  // 다 끝난 뒤의 과제 줄 순서(시트에서 다시 읽은 행 기준 + 새 줄)
  type Item = { at: number; row: ProgressRow; fresh: boolean }
  const items: Item[] = [
    ...fresh.rows.filter((r) => !delRows.has(r.row)).map((r) => ({ at: finalOf(r.row), row: r, fresh: true })),
    ...[...newByToken].map(([t, n]) => ({ at: arr.indexOf(t), row: newRowAsRow(n), fresh: false })),
  ].sort((a, b) => a.at - b.at)

  // 구분 이름 칸(H · L1 · L2) 옮기기: 이름은 묶음 맨 위 칸에만 적혀 있으므로,
  // 맨 위에 새 줄을 넣었거나 이름이 있던 줄을 지웠으면 이름을 새 맨 위 줄로 옮기고, 병합했던 칸은 다시 병합한다.
  const after: SheetCellWrite[] = []
  const remerge: SheetMergeOp[] = []
  const levels: Level[] = ['h', 'l1', 'l2']
  const chain = (r: ProgressRow, lv: Level) =>
    lv === 'h' ? `${r.h ?? ''}` : lv === 'l1' ? `${r.h ?? ''}␟${r.l1}` : `${r.h ?? ''}␟${r.l1}␟${r.l2}␟${r.l2Tag ?? ''}`
  const freshSorted = [...fresh.rows].sort((a, b) => a.row - b.row)
  for (const lv of levels) {
    const col = fresh.levelCols?.[lv]
    if (col === undefined) continue
    // 시트의 이름 묶음: 이름이 적힌 줄(또는 윗줄과 이름이 다른 줄)에서 시작
    const blockOf = new Map<number, number>() // 시트 행 → 묶음 시작 행
    let cur = -1
    freshSorted.forEach((r, i) => {
      const prev = freshSorted[i - 1]
      if (!prev || r.labels?.[lv] || chain(prev, lv) !== chain(r, lv)) cur = r.row
      blockOf.set(r.row, cur)
    })
    const byRow = new Map(freshSorted.map((r) => [r.row, r]))
    // 새 줄은 바로 윗줄과 같은 이름이면 그 묶음, 아니면 바로 아랫줄 묶음, 둘 다 아니면 새 묶음
    const blockItems = new Map<string, Item[]>()
    const touched = new Set<string>()
    let prevBlock: string | null = null
    items.forEach((it, i) => {
      let b: string
      if (it.fresh) b = `f${blockOf.get(it.row.row)}`
      else {
        const prev = items[i - 1]
        const nextFresh = items.slice(i + 1).find((x) => x.fresh)
        if (prev && chain(prev.row, lv) === chain(it.row, lv) && prevBlock) b = prevBlock
        else if (nextFresh && chain(nextFresh.row, lv) === chain(it.row, lv)) b = `f${blockOf.get(nextFresh.row.row)}`
        else b = `n${it.at}`
        touched.add(b)
      }
      prevBlock = b
      blockItems.set(b, [...(blockItems.get(b) ?? []), it])
    })
    for (const r of fresh.rows) if (delRows.has(r.row) || (moves.length && movedRows.has(r.row))) touched.add(`f${blockOf.get(r.row)}`)

    for (const b of touched) {
      const list = blockItems.get(b)
      if (!list?.length) continue // 묶음이 통째로 지워짐
      const owner = list[0]
      const origRow = b.startsWith('f') ? Number(b.slice(1)) : null
      const orig = origRow !== null ? byRow.get(origRow) : undefined
      let label: string | undefined
      if (orig) label = orig.labels?.[lv]
      else {
        const r = owner.row
        label = lv === 'h' ? (r.h ?? undefined) : lv === 'l1' ? (r.l1 !== NO_L1 ? r.l1 : undefined) : r.l2Tag ? `${r.l2} [${r.l2Tag}]` : r.l2
      }
      if (!label) continue // 이름이 다른 줄(과제 없는 머리 줄 등)에 있으면 건드리지 않는다
      // 이름 칸이 병합돼 있었으면 새 범위로 다시 병합하고, 이름은 병합 맨 윗칸에 둔다.
      const m = orig ? fresh.levelMerges?.find((x) => x.c1 === col && x.c2 === col && x.r1 === orig.row) : undefined
      let target = owner.at
      if (m) {
        const survivors: number[] = []
        for (let i = m.r1; i <= m.r2; i++) if (!delRows.has(i)) survivors.push(finalOf(i))
        const r1 = Math.min(owner.at, ...survivors)
        const r2 = Math.max(list[list.length - 1].at, ...survivors)
        remerge.push({ col, r1, r2, merge: r2 > r1 })
        target = r1
      }
      const origAt = orig && !delRows.has(orig.row) ? finalOf(orig.row) : null
      if (target !== origAt) {
        after.push({ row: target, col, value: label })
        if (origAt !== null) after.push({ row: origAt, col, value: '' })
      }
    }
  }
  // 구분(L2) 나누기: 나눈 줄에 새 이름을 쓰고, 이름 칸 병합을 둘로 나눈다.
  // 그 구분 안에서 줄을 넣거나 지우거나 옮기지 않았을 때만(아니면 남겨 두고 다음 저장 때)
  kept.l2Splits = []
  const l2Col = fresh.levelCols?.l2
  for (const sp of draftsIn.l2Splits ?? []) {
    const fr = freshByKey.get(sp.key)
    const keep = () => {
      kept.l2Splits!.push(sp)
      conflicts++
    }
    if (l2Col === undefined || !fr || delRows.has(fr.row)) {
      keep()
      continue
    }
    const { name, tag } = splitL2(sp.label)
    const text = tag ? `${name}\n\n[${tag}]` : name
    const m = (fresh.levelMerges ?? []).find((x) => x.c1 === l2Col && x.c2 === l2Col && x.r1 <= fr.row && fr.row <= x.r2)
    if (!m) {
      after.push({ row: finalOf(fr.row), col: l2Col, value: text })
      continue
    }
    if (m.r1 === fr.row) {
      // 이미 경계: 이름만
      after.push({ row: finalOf(fr.row), col: l2Col, value: text })
      continue
    }
    const r1 = finalOf(m.r1)
    const r2 = finalOf(m.r2)
    const at = finalOf(fr.row)
    let intact = r1 >= 0 && r2 - r1 === m.r2 - m.r1
    for (let i = m.r1; i <= m.r2 && intact; i++) if (delRows.has(i) || finalOf(i) !== r1 + (i - m.r1)) intact = false
    if (!intact || remerge.some((x) => x.col === l2Col && x.r1 <= r2 && x.r2 >= r1)) {
      keep()
      continue
    }
    unmergeFirst.push({ col: l2Col, r1: m.r1, r2: m.r2, merge: false })
    remerge.push({ col: l2Col, r1, r2: at - 1, merge: at - 1 > r1 })
    remerge.push({ col: l2Col, r1: at, r2, merge: r2 > at })
    after.push({ row: at, col: l2Col, value: text })
  }
  // 병합은 맨 끝에(모두 끝난 뒤 행 번호). 줄이나 열이 붙어 있지 않으면 남긴다.
  const mergeCells: SheetRange[] = []
  kept.merges = []
  for (const m of mergeLater) {
    const at = m.rows
      .filter((k) => !delKeys.has(k))
      .map((k) => (k.startsWith(NEW_PREFIX) ? arr.indexOf(k) : freshByKey.has(k) ? finalOf(freshByKey.get(k)!.row) : -1))
    const cols = m.ids.map((id) => fieldById.get(id)?.col ?? -1)
    const ok = (xs: number[]) => xs.length > 0 && xs.every((x) => x >= 0) && Math.max(...xs) - Math.min(...xs) + 1 === new Set(xs).size
    if (at.length * cols.length < 2) continue
    if (!ok(at) || !ok(cols)) {
      kept.merges.push({ rows: m.rows, ids: m.ids, merge: true })
      conflicts++
      continue
    }
    mergeCells.push({ r1: Math.min(...at), r2: Math.max(...at), c1: Math.min(...cols), c2: Math.max(...cols) })
  }
  // ---- 열: 모든 줄 작업이 끝난 뒤 지우고(오른쪽부터) 끼워 넣는다. 새 열 칸은 그다음에 쓴다.
  const lastCol = Math.max(0, ...fresh.fields.map((f) => f.col), ...fresh.weekCols.map((w) => w.col), ...Object.values(fresh.levelCols ?? {}))
  const colArr: (number | string)[] = Array.from({ length: lastCol + 1 }, (_, i) => i)
  const colDeletes = [...delColIds]
    .map((id) => fieldById.get(id)?.col)
    .filter((c): c is number => c !== undefined && fieldById.get(fresh.fields.find((f) => f.col === c)!.id)?.id !== 'name')
    .sort((a, b) => b - a)
  for (const c of colDeletes) colArr.splice(colArr.indexOf(c), 1)
  const colInserts: number[] = []
  const colAfter: SheetCellWrite[] = []
  const colMerges: SheetRange[] = []
  kept.newCols = []
  const newColMeta = new Map((draftsIn.newCols ?? []).map((n) => [n.id, n]))
  const top = fresh.headerRows?.top
  const sub = fresh.headerRows?.sub ?? top
  const eff = effectiveFields(fresh.fields, fresh.headerStyle, draftsIn)
  const inGroup = new Set((eff.headerStyle?.groups ?? []).flatMap((g) => g.fieldIds))
  for (const n of draftsIn.newCols ?? []) {
    const anchorTok = newColIds.has(n.anchor) ? n.anchor : fieldById.get(n.anchor)?.col
    const ai = anchorTok === undefined ? -1 : colArr.indexOf(anchorTok)
    if (ai < 0) {
      kept.newCols.push(n)
      conflicts++
      continue
    }
    let at = ai
    if (n.side === 'right') {
      at = ai + 1
      while (
        at < colArr.length &&
        typeof colArr[at] === 'string' &&
        newColMeta.get(colArr[at] as string)?.anchor === n.anchor &&
        newColMeta.get(colArr[at] as string)?.side === 'right'
      )
        at++
    }
    colArr.splice(at, 0, n.id)
    colInserts.push(at)
  }
  // 시트 열 이름 바꾸기: 그 열의 머리글 칸(묶음 안이면 아래 줄, 아니면 위 줄)에 새 이름 -- 열 작업 전 열 번호 기준
  if (top !== undefined && sub !== undefined)
    for (const [id, label] of Object.entries(draftsIn.colRenames ?? {})) {
      const f = fieldById.get(id)
      if (!f || delColIds.has(id) || !label.trim()) continue
      writes.push({ row: inGroup.has(id) ? sub : top, col: f.col, value: label.trim() })
    }
  // 머리글 이름(묶음 안이면 아래 줄, 아니면 위 줄 · 두 줄 머리글이면 세로로 병합)
  if (top !== undefined && sub !== undefined) {
    for (const n of draftsIn.newCols ?? []) {
      const c = colArr.indexOf(n.id)
      if (c < 0) continue
      if (inGroup.has(n.id)) colAfter.push({ row: sub, col: c, value: n.label })
      else {
        colAfter.push({ row: top, col: c, value: n.label })
        if (sub > top) colMerges.push({ r1: top, r2: sub, c1: c, c2: c })
      }
    }
  }
  for (const x of colLater) {
    const c = colArr.indexOf(x.id)
    if (c < 0) continue
    const r = x.key.startsWith(NEW_PREFIX) ? arr.indexOf(x.key) : delKeys.has(x.key) ? -1 : freshByKey.has(x.key) ? finalOf(freshByKey.get(x.key)!.row) : -1
    if (r < 0) continue
    colAfter.push({
      row: r,
      col: c,
      ...(x.value !== undefined ? { value: x.value } : {}),
      ...(x.fill !== undefined ? { fill: x.fill } : {}),
      ...(x.fmt !== undefined ? { fmt: parseFmt(x.fmt) } : {}),
      ...(x.note !== undefined ? { note: x.note } : {}),
    })
  }
  return {
    writes,
    unmergeFirst,
    unmergeCells,
    moves,
    deletes: delSorted,
    inserts,
    after,
    remerge,
    mergeCells,
    colDeletes,
    colInserts,
    colAfter,
    colMerges,
    kept,
    conflicts,
  }
}

// ---------- 칠하기(회색 = 계획, 분홍 = 실적) ----------
// 빈 칸이나 다른 색 칸을 누르거나 끌면 그 색으로 칠하고, 이어진 묶음의 첫 칸에 S,
// 회색이면 끝 칸에 F를 자동으로 붙인다(묶음을 늘리면 따라 옮겨진다).
// 분홍은 첫 칸 S만 자동이고, 끝 칸 "완"은 그 칸을 한 번 더 눌러 붙인다(진행 중인 실적에 완이 먼저 찍히지 않게).
// 이미 그 색인 칸을 다시 누르면(끌기 아님) 회색은 S → F → 지움, 분홍은 끝 칸 한 번에 완 · 다시 누르면 진행(글자 없음).
// 지우개('erase')는 누르거나 끈 칸을 비우고, 남은 묶음의 S/F를 다시 맞춘다.
export type PaintBrush = WeekFill | 'erase'
export function paintCells(cells: Record<string, CellState>, weekKeys: string[], key: string, color: PaintBrush, click: boolean): Record<string, CellState> {
  const out = { ...cells }
  const cur = out[key]
  if (color === 'erase') {
    if (!cur) return out
    delete out[key]
    // 지운 칸 양옆 묶음만 다시 맞춘다
    const i = weekKeys.indexOf(key)
    return cur.f ? autoRunLetters(out, weekKeys, cur.f, [weekKeys[i - 1], weekKeys[i + 1]]) : out
  }
  if (cur?.f === color) {
    if (!click) return out
    const end: WeekMark = color === 'plan' ? 'F' : '완'
    if (color === 'actual') {
      // 분홍: 묶음 중간 · 끝 칸을 누르면 완, 완을 다시 누르면 진행(글자 없음). 첫 칸은 S → 완
      const i = weekKeys.indexOf(key)
      const first = i <= 0 || out[weekKeys[i - 1]]?.f !== color
      if (cur.m === '') out[key] = { m: first ? 'S' : '완', f: color }
      else if (cur.m === 'S') out[key] = { m: '완', f: color }
      else if (cur.m === '완') out[key] = { m: '', f: color }
      else delete out[key]
      return out
    }
    if (cur.m === '') out[key] = { m: 'S', f: color }
    else if (cur.m === 'S') out[key] = { m: end, f: color }
    else delete out[key]
    return out
  }
  out[key] = { m: '', f: color }
  return autoRunLetters(out, weekKeys, color, [key])
}

// touched: 방금 칠하거나 지운 자리 -- 그 칸이 든 묶음만 S/F를 맞춘다(같은 줄의 다른 묶음 · 예전 기록은 그대로)
function autoRunLetters(cells: Record<string, CellState>, weekKeys: string[], color: WeekFill, touched: (string | undefined)[]): Record<string, CellState> {
  const out = { ...cells }
  const hit = new Set(touched.filter(Boolean))
  // 묶음의 첫 칸 S, 끝 칸은 회색이면 F 자동 · 분홍 완은 직접 눌러서(자동으로 붙이지 않음)
  const end: WeekMark = color === 'plan' ? 'F' : '완'
  const autoEnd = color === 'plan'
  let run: string[] = []
  const flush = () => {
    if (run.length === 0 || !run.some((k) => hit.has(k))) {
      run = []
      return
    }
    run.forEach((k, i) => {
      const c = out[k]
      const first = i === 0
      const last = i === run.length - 1 && run.length > 1
      if (first) {
        if (c.m === '' || (c.m === end && run.length > 1)) out[k] = { ...c, m: 'S' }
      } else if (last) {
        if (autoEnd && (c.m === '' || c.m === 'S')) out[k] = { ...c, m: end }
        else if (!autoEnd && c.m === 'S') out[k] = { ...c, m: '' }
      } else if (c.m === 'S' || c.m === end) {
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

// 과제 입력 데이터(이 브라우저에 저장된 추진현황 · 고친 내용 · 만든 연도 · 진척률 수정값)를 지운다.
// 구글시트와 연결 설정(어느 시트를 쓰는지)은 그대로 둔다 -- 다시 불러오면 시트 내용으로 시작한다.
export function clearTaskInputData() {
  const scope = accountScope()
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      const mine = k.endsWith(`:${scope}`) || k.includes(`:${scope}:`)
      if (mine && (k.startsWith('progress-rate:') || (k.startsWith('progress-board:') && !k.startsWith('progress-board:sheet:')))) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // 무시
  }
}

// 연도 메뉴에서 숨긴 시트 탭(목록에서만 뺀다 · 구글시트 탭은 그대로). 시트 파일마다 따로.
const hiddenTabsKey = () => `progress-board:hidden-tabs:${accountScope()}`
export function readHiddenTabs(spreadsheetId: string | null | undefined): string[] {
  if (!spreadsheetId) return []
  try {
    const v = JSON.parse(localStorage.getItem(hiddenTabsKey()) ?? '{}') as Record<string, string[]>
    return Array.isArray(v[spreadsheetId]) ? v[spreadsheetId] : []
  } catch {
    return []
  }
}
export function writeHiddenTabs(spreadsheetId: string, titles: string[]) {
  try {
    const v = JSON.parse(localStorage.getItem(hiddenTabsKey()) ?? '{}') as Record<string, string[]>
    if (titles.length) v[spreadsheetId] = titles
    else delete v[spreadsheetId]
    localStorage.setItem(hiddenTabsKey(), JSON.stringify(v))
  } catch {
    // 기억 못 해도 지금 화면에는 반영
  }
}

// ---------- 변경 기록 ----------
// 저장할 때 시트의 숨김 탭 「변경 기록」에 한 줄씩: 무엇을(과제 · 칸) 무엇에서 무엇으로 바꿨나.
// 시트에 실제로 쓴 것만(그사이 시트에서 먼저 바뀌어 남긴 것 = kept는 빼고) 적는다.
export const CHANGE_LOG_TAB = '변경 기록'
export const CHANGE_LOG_HEADER = ['시각', '누가', '연도 탭', '과제', '바꾼 칸', '이전 값', '새 값']
export type ChangeLogEntry = { task: string; what: string; before: string; after: string }

const FILL_WORD: Record<WeekFill, string> = { plan: '계획', actual: '실적' }
const cellWord = (c: CellState | undefined) => (c ? [c.m, c.f ? FILL_WORD[c.f] : ''].filter(Boolean).join(' ') : '') || '(빈칸)'
const orBlank = (v: string | undefined) => (v ?? '').trim() || '(빈칸)'

export function describeChanges(base: ProgressData, drafts: Drafts, kept: Drafts): ChangeLogEntry[] {
  const out: ChangeLogEntry[] = []
  const rowOf = new Map(base.rows.map((r) => [r.key, r]))
  const label = new Map(base.fields.map((f) => [f.id, f.label]))
  for (const c of drafts.newCols ?? []) label.set(c.id, c.label)
  const weekLabel = (k: string) => {
    const w = base.weekCols.find((x) => x.key === k)
    return w ? `${w.month}월 ${w.week}주` : k
  }
  const colLabel = (id: string) => (id === LEVEL_KEY_L2 ? '구분(L2)' : label.get(id) || '이름 없는 열')
  const taskOf = (r: { l2: string; l3: string }) => `${r.l2} › ${r.l3 || '(이름 없음)'}`
  const deleted = new Set(drafts.deleted ?? [])
  const keptDel = new Set(kept.deleted ?? [])

  for (const [key, e] of Object.entries(drafts.edits)) {
    const r = rowOf.get(key)
    if (!r || deleted.has(key)) continue
    const k = kept.edits[key] ?? {}
    const task = taskOf(r)
    for (const [wk, cell] of Object.entries(e.cells ?? {}))
      if (!k.cells?.[wk]) out.push({ task, what: weekLabel(wk), before: cellWord(baseCell(r, wk)), after: cellWord(cell) })
    for (const [id, v] of Object.entries(e.fields ?? {}))
      if (k.fields?.[id] === undefined) out.push({ task, what: colLabel(id), before: orBlank(baseField(r, id)), after: orBlank(v) })
    for (const [id, v] of Object.entries(e.bg ?? {}))
      if (k.bg?.[id] === undefined) out.push({ task, what: `배경색 · ${colLabel(id)}`, before: orBlank(r.bg[id]), after: orBlank(v) })
    for (const [id, v] of Object.entries(e.notes ?? {}))
      if (k.notes?.[id] === undefined)
        out.push({ task, what: `메모 · ${label.has(id) ? colLabel(id) : weekLabel(id)}`, before: orBlank(r.notes[id]), after: orBlank(v) })
    for (const [id, v] of Object.entries(e.fmt ?? {}))
      if (k.fmt?.[id] === undefined) out.push({ task, what: `글자 서식 · ${colLabel(id)}`, before: orBlank(r.fmt?.[id]), after: orBlank(v) })
  }
  const keptNew = new Set(kept.newRows.map((n) => n.id))
  for (const n of drafts.newRows) {
    if (keptNew.has(n.id)) continue
    const filled = Object.entries(n.fields)
      .filter(([id, v]) => id !== COL_NAME && v.trim())
      .map(([id, v]) => `${colLabel(id)}: ${v.trim()}`)
    out.push({ task: taskOf({ l2: n.l2, l3: n.fields[COL_NAME] ?? '' }), what: '새 과제', before: '', after: filled.join(' / ') || '(추가)' })
  }
  for (const key of deleted) {
    const r = rowOf.get(key)
    if (!r || keptDel.has(key)) continue
    const vals = Object.entries(r.values)
      .filter(([, v]) => v.trim())
      .map(([id, v]) => `${colLabel(id)}: ${v.trim()}`)
    const weeks = Object.keys(r.weeks).map(weekLabel)
    out.push({ task: taskOf(r), what: '과제 삭제', before: [...vals, weeks.length ? `일정: ${weeks.join(', ')}` : ''].filter(Boolean).join(' / ') || '(내용 없음)', after: '' })
  }
  const keptMoves = new Set((kept.moves ?? []).map((m) => m.key))
  for (const m of drafts.moves ?? []) {
    const r = rowOf.get(m.key)
    if (r && !keptMoves.has(m.key)) out.push({ task: taskOf(r), what: '줄 옮김', before: '', after: '같은 구분 안에서 순서 바꿈' })
  }
  for (const c of drafts.newCols ?? []) out.push({ task: '(열)', what: '새 열', before: '', after: c.label })
  for (const id of drafts.delCols ?? []) out.push({ task: '(열)', what: '열 삭제', before: colLabel(id), after: '' })
  for (const [id, v] of Object.entries(drafts.colRenames ?? {})) out.push({ task: '(열)', what: '열 이름', before: colLabel(id), after: v })
  for (const [k, v] of Object.entries(drafts.l2Renames ?? {}))
    if (kept.l2Renames?.[k] === undefined) out.push({ task: `${k.split('␟')[1]}`, what: '구분(L2) 이름', before: k.split('␟')[1], after: v })
  for (const sp of drafts.l2Splits ?? [])
    if (!kept.l2Splits?.some((x) => x.key === sp.key)) {
      const r = rowOf.get(sp.key)
      out.push({ task: r ? taskOf(r) : '(과제)', what: '구분 나누기', before: r?.l2 ?? '', after: sp.label })
    }
  return out
}

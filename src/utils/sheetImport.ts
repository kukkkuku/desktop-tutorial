// 회사 과제관리 시트(「YYYY 추진현황」 탭)를 읽어 과제관리 보드로 바꾼다.
// 구글 Sheets API로 받든, 사용자가 올린 xlsx든 같은 RawSheet 모양으로 맞춘 뒤
// 이 파일의 순수 함수만 거친다. 시트의 함정(병합 셀, 연도마다 다른 열 위치,
// 4·5주가 섞인 달, 한 칸에 여러 담당자)은 docs/PLAN-TASK-MANAGEMENT.md 1.3.

import { v4 as uuidv4 } from 'uuid'
import type { SheetLink, TaskCategory, TaskGroup, TeamMember, WeekColumn, WeekMark, WorkBoard, WorkItem } from '../types'
import {
  COL_ASSIGNEES,
  COL_CATEGORY,
  COL_EVAL_GROUP,
  COL_NAME,
  EDIT_L2,
  SYSTEM_COLUMNS,
  isTaskCategory,
  isWeekMark,
  matchAssignees,
  normalizeSpaces,
  splitNames,
  deriveDates,
  normalizeStatus,
  startAfterDone,
} from './workBoard'
export { deriveDates, yearFromTitle } from './workBoard'

// 0부터 세는 행·열, 끝 포함.
export interface SheetMerge {
  r1: number
  c1: number
  r2: number
  c2: number
}

// 날짜 서식이 걸린 칸. 시트에는 "1/31"처럼 연도 없이 보이는 서식이 많아서
// 표시 문자열만으로는 날짜를 복원할 수 없다 -- 일련번호와 표시 문자열을 같이 들고
// 온다. 날짜 열(완료요청 등)은 일련번호로 YYYY-MM-DD를, 메모 열은 사람이 본
// 그대로의 표시 문자열을 쓴다.
export interface DateCell {
  kind: 'date'
  serial: number
  text: string
}

function isDateCell(v: unknown): v is DateCell {
  return typeof v === 'object' && v !== null && (v as DateCell).kind === 'date'
}

export interface RawSheet {
  title: string
  hidden?: boolean
  rows: unknown[][]
  merges: SheetMerge[]
}

export interface ParsedHeader {
  headerRow: number // 0-based. 'L2'/'L3'가 있는 행
  dataStartRow: number
  // 열 index -> 헤더 표시 이름(두 줄 헤더를 합친 것)
  labels: string[]
  // H/L1/L2/L3 열 index
  hCol: number | null
  l1Col: number | null
  l2Col: number
  l3Col: number
  weekCols: (WeekColumn & { col: number })[]
}

export interface ParsedRow {
  row: number // 0-based 시트 행 (화면에는 +1)
  h: string | null
  l1: string | null
  l2: string
  l2Tag: string | null
  l3: string
  hierarchyInferred: boolean
  // 앱 열 id -> 원문 텍스트 (담당자는 원문 그대로)
  values: Record<string, string>
  weeks: Record<string, WeekMark>
}

export interface ParsedSheet {
  title: string
  header: ParsedHeader
  columnMap: Record<string, number | null> // 앱 열 id -> 시트 열 index
  rows: ParsedRow[]
}

// ---------- 셀 값 ----------

// 엑셀 일련번호(1900 날짜 체계) -> YYYY-MM-DD
function serialToIso(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// "2025. 1. 31", "2025-01-31", "2025/1/31" 을 YYYY-MM-DD로. 모르면 원문 그대로.
export function normalizeDateText(s: string): string {
  const m = s.trim().match(/^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?(?:\s.*)?$/)
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
  return s.trim()
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (isDateCell(v)) return v.text.trim()
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v).replace(/\r\n/g, '\n').trim()
}

function dateCellText(v: unknown): string {
  if (isDateCell(v)) return serialToIso(v.serial)
  if (typeof v === 'number' && v > 20000 && v < 80000) return serialToIso(v)
  return normalizeDateText(cellText(v))
}

// 병합 범위를 풀어 모든 칸에 첫 칸 값을 채운 격자를 만든다.
export function fillMerges(rows: unknown[][], merges: SheetMerge[]): unknown[][] {
  const out = rows.map((r) => [...r])
  for (const m of merges) {
    const v = rows[m.r1]?.[m.c1]
    for (let r = m.r1; r <= m.r2; r++) {
      if (!out[r]) out[r] = []
      for (let c = m.c1; c <= m.c2; c++) {
        if (r === m.r1 && c === m.c1) continue
        out[r][c] = v
      }
    }
  }
  return out
}

function headerKey(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase()
}

// ---------- 헤더 ----------

export function parseHeader(filled: unknown[][]): ParsedHeader | null {
  const scan = Math.min(filled.length, 15)
  for (let r = 0; r < scan; r++) {
    const row = filled[r] ?? []
    const keys = row.map((v) => headerKey(cellText(v)))
    const l2Col = keys.indexOf('L2')
    const l3Col = keys.indexOf('L3')
    if (l2Col < 0 || l3Col < 0) continue
    const l1Idx = keys.indexOf('L1')
    const l1Col = l1Idx >= 0 ? l1Idx : null
    // H 열: L1 바로 왼쪽. 연도마다 'H', 'ㅗ'(오타), '구분' 등 이름이 달라서 위치로 잡는다.
    const hCol = l1Col !== null && l1Col > 0 ? l1Col - 1 : null

    // 두 줄 헤더: 다음 행의 L2 칸도 'L2'(병합)이거나 '속성'/'담당자' 같은 이름이 있으면 헤더.
    const next = filled[r + 1] ?? []
    const nextKeys = next.map((v) => headerKey(cellText(v)))
    const twoRow =
      nextKeys[l2Col] === 'L2' || nextKeys.some((k) => ['속성', '담당자', '담당팀', '상태', '분류'].includes(k))
    const labels: string[] = []
    const width = Math.max(row.length, next.length)
    for (let c = 0; c < width; c++) {
      const top = cellText(row[c])
      const bottom = twoRow ? cellText(next[c]) : ''
      // 아래 줄이 주차 숫자면 위 줄(월)과 합치고, 아래 줄이 이름이면 그걸 쓴다.
      if (bottom && /^\d$/.test(bottom) && /^\d{1,2}월$/.test(top.replace(/\s/g, ''))) labels.push(`${top.replace(/\s/g, '')} ${bottom}주`)
      else labels.push(normalizeSpaces(bottom || top))
    }

    const weekCols: (WeekColumn & { col: number })[] = []
    if (twoRow) {
      for (let c = 0; c < width; c++) {
        const top = cellText(row[c]).replace(/\s/g, '')
        const bottom = cellText(next[c])
        const mm = top.match(/^(\d{1,2})월$/)
        if (mm && /^\d$/.test(bottom)) {
          const month = Number(mm[1])
          const week = Number(bottom)
          weekCols.push({ key: `${month}-${week}`, month, week, col: c })
        }
      }
    }
    return { headerRow: r, dataStartRow: r + (twoRow ? 2 : 1), labels, hCol, l1Col, l2Col, l3Col, weekCols }
  }
  return null
}

// 앱 열 id -> 시트 열 index. 헤더 이름(공백 무시)으로 찾는다.
export function autoColumnMap(header: ParsedHeader): Record<string, number | null> {
  const map: Record<string, number | null> = {}
  const keys = header.labels.map(headerKey)
  const weekColSet = new Set(header.weekCols.map((w) => w.col))
  for (const col of SYSTEM_COLUMNS) {
    if (col.id === COL_NAME) {
      map[col.id] = header.l3Col
      continue
    }
    let found: number | null = null
    for (const alias of col.sheetHeaders) {
      const k = headerKey(alias)
      const idx = keys.findIndex((x, i) => x === k && !weekColSet.has(i) && i > header.l3Col)
      if (idx >= 0) {
        found = idx
        break
      }
    }
    map[col.id] = found
  }
  return map
}

// 저장해 둔 매핑(헤더 이름 기준)을 이번에 읽은 헤더의 열 index로 바꾼다.
export function columnMapFromNames(header: ParsedHeader, names: Record<string, string>): Record<string, number | null> {
  const auto = autoColumnMap(header)
  const keys = header.labels.map(headerKey)
  for (const [colId, name] of Object.entries(names)) {
    if (!name) {
      auto[colId] = null
      continue
    }
    const idx = keys.indexOf(headerKey(name))
    if (idx >= 0) auto[colId] = idx
  }
  return auto
}

export function columnMapToNames(header: ParsedHeader, map: Record<string, number | null>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [colId, idx] of Object.entries(map)) out[colId] = idx === null ? '' : header.labels[idx] ?? ''
  return out
}

// ---------- 행 ----------

const TAG_RE = /\[([^\]]+)\]\s*$/

export function splitL2(raw: string): { name: string; tag: string | null } {
  const text = normalizeSpaces(raw)
  const m = text.match(TAG_RE)
  if (!m) return { name: text, tag: null }
  return { name: normalizeSpaces(text.slice(0, m.index)), tag: m[1].trim() }
}

const DATE_COLS = new Set(SYSTEM_COLUMNS.filter((c) => c.type === 'date').map((c) => c.id))

export function parseRows(filled: unknown[][], header: ParsedHeader, columnMap: Record<string, number | null>): ParsedRow[] {
  const rows: ParsedRow[] = []
  let prevH: string | null = null
  let prevL1: string | null = null
  let prevL2: string | null = null
  for (let r = header.dataStartRow; r < filled.length; r++) {
    const row = filled[r] ?? []
    const l3 = normalizeSpaces(cellText(row[header.l3Col]))
    const l2Raw = cellText(row[header.l2Col])
    let h = header.hCol !== null ? normalizeSpaces(cellText(row[header.hCol])) || null : null
    let l1 = header.l1Col !== null ? normalizeSpaces(cellText(row[header.l1Col])) || null : null
    let inferred = false
    let l2 = l2Raw ? l2Raw : null
    if (!l3) {
      if (l2) {
        prevL2 = l2
        prevH = h ?? prevH
        prevL1 = l1 ?? prevL1
      }
      continue
    }
    // 병합이 끊겨 비어 있으면 위 행 값을 이어받는다(추정 표시).
    if (!l2 && prevL2) {
      l2 = prevL2
      inferred = true
    }
    if (!l2) continue
    if (!h && header.hCol !== null && prevH) {
      h = prevH
      inferred = true
    }
    if (!l1 && prevL1 && header.l1Col !== null) {
      l1 = prevL1
      inferred = true
    }
    prevH = h
    prevL1 = l1
    prevL2 = l2

    const values: Record<string, string> = {}
    for (const [colId, idx] of Object.entries(columnMap)) {
      if (idx === null || colId === COL_NAME) continue
      const text = DATE_COLS.has(colId) ? dateCellText(row[idx]) : cellText(row[idx])
      if (text) values[colId] = text
    }
    const weeks: Record<string, WeekMark> = {}
    for (const w of header.weekCols) {
      const v = cellText(row[w.col])
      if (isWeekMark(v)) weeks[w.key] = v
    }
    const { name, tag } = splitL2(l2)
    rows.push({ row: r, h, l1, l2: name, l2Tag: tag, l3, hierarchyInferred: inferred, values, weeks })
  }
  return rows
}

export function parseSheet(raw: RawSheet): ParsedSheet | { error: string } {
  const filled = fillMerges(raw.rows, raw.merges)
  const header = parseHeader(filled)
  if (!header) return { error: `「${raw.title}」 탭에서 'L2'·'L3' 헤더를 찾지 못했습니다. 추진현황 탭이 맞는지 확인해 주세요.` }
  const columnMap = autoColumnMap(header)
  return { title: raw.title, header, columnMap, rows: parseRows(filled, header, columnMap) }
}

// ---------- L2 요약 (고르기 화면) ----------

export interface GroupSummary {
  name: string
  tag: string | null
  h: string | null
  l1: string | null
  count: number
  teams: { team: string; count: number }[]
  // 담당자 이름(많이 맡은 순)과 L3 과제명(시트 순서) -- 고르기 화면 미리보기용
  assignees: string[]
  l3Names: string[]
  inferred: boolean
}

export function summarizeGroups(rows: ParsedRow[]): GroupSummary[] {
  const map = new Map<string, GroupSummary & { teamMap: Map<string, number>; personMap: Map<string, number> }>()
  for (const r of rows) {
    let g = map.get(r.l2)
    if (!g) {
      g = { name: r.l2, tag: r.l2Tag, h: r.h, l1: r.l1, count: 0, teams: [], assignees: [], l3Names: [], inferred: false, teamMap: new Map(), personMap: new Map() }
      map.set(r.l2, g)
    }
    g.count += 1
    g.l3Names.push(r.l3)
    for (const n of splitNames(r.values[COL_ASSIGNEES] ?? '')) g.personMap.set(n, (g.personMap.get(n) ?? 0) + 1)
    if (r.hierarchyInferred) g.inferred = true
    const t = r.values.team
    if (t) g.teamMap.set(t, (g.teamMap.get(t) ?? 0) + 1)
  }
  return Array.from(map.values()).map(({ teamMap, personMap, ...g }) => ({
    ...g,
    assignees: Array.from(personMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => n),
    teams: Array.from(teamMap.entries())
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count),
  }))
}

export function distinctTeams(rows: ParsedRow[]): { team: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) if (r.values.team) m.set(r.values.team, (m.get(r.values.team) ?? 0) + 1)
  return Array.from(m.entries())
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count)
}

export function filterRows(rows: ParsedRow[], selectedGroups: string[], teamFilter: string | null): ParsedRow[] {
  const set = new Set(selectedGroups)
  return rows.filter((r) => set.has(r.l2) && (!teamFilter || r.values.team === teamFilter))
}

// ---------- 미리보기 경고 ----------

export interface ImportWarnings {
  inferredRows: ParsedRow[]
  oddCategory: { row: ParsedRow; value: string }[]
  emptyCategory: ParsedRow[]
  unknownAssignees: { name: string; count: number; team: string | null }[]
}

export function collectWarnings(rows: ParsedRow[], members: TeamMember[]): ImportWarnings {
  const inferredRows = rows.filter((r) => r.hierarchyInferred)
  const oddCategory: ImportWarnings['oddCategory'] = []
  const emptyCategory: ParsedRow[] = []
  const unknown = new Map<string, { count: number; teams: Map<string, number> }>()
  for (const r of rows) {
    const cat = r.values[COL_CATEGORY]
    if (!cat) emptyCategory.push(r)
    else if (!isTaskCategory(cat)) oddCategory.push({ row: r, value: cat })
    const raw = r.values[COL_ASSIGNEES]
    if (raw) {
      const { unmatched } = matchAssignees(splitNames(raw), members)
      for (const n of unmatched) {
        const e = unknown.get(n) ?? { count: 0, teams: new Map() }
        e.count += 1
        if (r.values.team) e.teams.set(r.values.team, (e.teams.get(r.values.team) ?? 0) + 1)
        unknown.set(n, e)
      }
    }
  }
  const unknownAssignees = Array.from(unknown.entries())
    .map(([name, e]) => ({ name, count: e.count, team: [...e.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }))
    .sort((a, b) => b.count - a.count)
  return { inferredRows, oddCategory, emptyCategory, unknownAssignees }
}

// 시작일·완료일 추정은 utils/workBoard.ts (저장본을 읽을 때도 같은 규칙을 쓴다)

// ---------- 보드에 반영 ----------

export function sheetKeyOf(l2: string, l3: string): string {
  return `${l2}␟${l3}`
}

export interface ImportResult {
  board: WorkBoard
  added: number
  updated: number
  keptEdits: number // 앱에서 고친 값이라 시트 값으로 안 덮은 칸 수
  missing: number // 이번 시트에 없어서 "시트에 없음" 표시한 행
  skippedDeleted: number // 앱에서 지운 행이라 건너뜀
  newGroups: number
}

// 시트에서 읽은 행을 보드에 합친다.
// - 같은 행(sheetKey)이 있으면: 앱에서 고친 적 없는 필드만 시트 값으로 갱신
// - 새 행은 추가, 선택한 L2 범위에서 시트에 없어진 행은 지우지 않고 missingInSheet
// - 앱에서 직접 만든 행(source 'app')은 건드리지 않는다
export function applySheetImport(
  board: WorkBoard,
  rows: ParsedRow[],
  header: ParsedHeader,
  members: TeamMember[],
  link: SheetLink,
  year: number | null = null,
): ImportResult {
  let groups = [...board.groups]
  let newGroups = 0
  const groupByName = new Map(groups.map((g) => [g.name, g]))
  for (const r of rows) {
    const existing = groupByName.get(r.l2)
    if (existing) {
      if (existing.source === 'sheet') {
        const patch: Partial<TaskGroup> = { tag: r.l2Tag, h: r.h, l1: r.l1, hierarchyInferred: r.hierarchyInferred || undefined }
        const next = { ...existing, ...patch }
        groups = groups.map((g) => (g.id === existing.id ? next : g))
        groupByName.set(r.l2, next)
      }
      continue
    }
    const g: TaskGroup = { id: uuidv4(), name: r.l2, tag: r.l2Tag, h: r.h, l1: r.l1, hierarchyInferred: r.hierarchyInferred || undefined, source: 'sheet' }
    groups.push(g)
    groupByName.set(r.l2, g)
    newGroups += 1
  }

  const byKey = new Map(board.items.filter((i) => i.sheetKey).map((i) => [i.sheetKey!, i]))
  const excluded = new Set(board.excludedSheetKeys)
  let skippedDeleted = 0
  const seen = new Set<string>()
  let added = 0
  let updated = 0
  let keptEdits = 0
  const updates = new Map<string, WorkItem>()
  const additions: WorkItem[] = []

  for (const r of rows) {
    const key = sheetKeyOf(r.l2, r.l3)
    if (seen.has(key)) continue // 시트에 같은 L2·L3가 두 번 있으면 첫 행만
    seen.add(key)
    if (excluded.has(key) && !byKey.has(key)) {
      skippedDeleted += 1
      continue
    }
    const group = groupByName.get(r.l2)!
    const catRaw = r.values[COL_CATEGORY] ?? ''
    const category: TaskCategory | null = isTaskCategory(catRaw) ? catRaw : null
    const { ids, unmatched } = matchAssignees(splitNames(r.values[COL_ASSIGNEES] ?? ''), members)
    const sheetFields: Record<string, string> = {}
    for (const [k, v] of Object.entries(r.values)) if (k !== COL_CATEGORY && k !== COL_ASSIGNEES) sheetFields[k] = v
    // 시트에 날짜가 없으면 주차 표시로 추정해서 채우고 추정이라고 표시해 둔다.
    const derived: string[] = []
    const guess = deriveDates(r.weeks, header.weekCols, year)
    if (!sheetFields.startDate && guess.startDate && !startAfterDone(guess.startDate, sheetFields.doneDate ?? guess.doneDate)) {
      sheetFields.startDate = guess.startDate
      derived.push('startDate')
    }
    if (!sheetFields.doneDate && guess.doneDate) {
      sheetFields.doneDate = guess.doneDate
      derived.push('doneDate')
    }
    // 상태는 네 가지로 정리하고(완·F 표시나 완료일이 있으면 완료) 시트 원문은 statusRaw에 둔다.
    const rawStatus = sheetFields.status ?? ''
    sheetFields.status = normalizeStatus(rawStatus, r.weeks, sheetFields.doneDate)
    if (rawStatus) sheetFields.statusRaw = rawStatus

    const prev = byKey.get(key)
    if (!prev) {
      additions.push({
        id: uuidv4(),
        groupId: group.id,
        name: r.l3,
        source: 'sheet',
        sheetKey: key,
        category,
        categoryRaw: category ? undefined : catRaw || undefined,
        assigneeIds: ids,
        unmatchedAssignees: unmatched,
        fields: sheetFields,
        weeks: r.weeks,
        derivedFields: derived.length ? derived : undefined,
      })
      added += 1
      continue
    }
    const edited = prev.editedAt ?? {}
    // 앱에서 다른 L2로 옮긴 행은 그 자리를 지킨다.
    const keepL2 = !!edited[EDIT_L2] && prev.groupId !== group.id && groups.some((g) => g.id === prev.groupId)
    let next: WorkItem = { ...prev, groupId: keepL2 ? prev.groupId : group.id, missingInSheet: undefined }
    let changed = prev.missingInSheet === true || (!keepL2 && prev.groupId !== group.id)
    if (edited[COL_CATEGORY]) keptEdits += (prev.category ?? prev.categoryRaw ?? '') !== catRaw ? 1 : 0
    else if (prev.category !== category || (prev.categoryRaw ?? '') !== (category ? '' : catRaw)) {
      next = { ...next, category, categoryRaw: category ? undefined : catRaw || undefined }
      changed = true
    }
    const assigneesDiffer = ids.join() !== prev.assigneeIds.join() || unmatched.join() !== prev.unmatchedAssignees.join()
    if (assigneesDiffer && edited[COL_ASSIGNEES]) keptEdits += 1
    else if (assigneesDiffer) {
      next = { ...next, assigneeIds: ids, unmatchedAssignees: unmatched }
      changed = true
    }
    const fields = { ...prev.fields }
    const mappedIds = SYSTEM_COLUMNS.map((c) => c.id).filter((id) => id !== COL_NAME && id !== COL_CATEGORY && id !== COL_ASSIGNEES && id !== COL_EVAL_GROUP)
    for (const id of mappedIds) {
      const sv = sheetFields[id] ?? ''
      const pv = fields[id] ?? ''
      if (sv === pv) continue
      if (edited[id]) {
        keptEdits += 1
        continue
      }
      if (sv) fields[id] = sv
      else delete fields[id]
      changed = true
    }
    // 주차 기호는 시트가 원본이다(1단계에서는 앱에서 편집하지 않는다).
    if (JSON.stringify(prev.weeks) !== JSON.stringify(r.weeks)) changed = true
    // 추정 표시: 앱에서 고친 날짜는 사람이 넣은 값이므로 추정 목록에서 뺀다.
    const nextDerived = derived.filter((f) => !edited[f])
    if ((prev.derivedFields ?? []).join() !== nextDerived.join()) changed = true
    next = { ...next, fields, weeks: r.weeks, derivedFields: nextDerived.length ? nextDerived : undefined }
    if (changed) {
      updates.set(prev.id, next)
      updated += 1
    }
  }

  // 이번에 고른 L2 범위 안의 시트 행 중 이번 시트에 없던 것
  const scope = new Set(rows.map((r) => r.l2))
  let missing = 0
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]))
  for (const i of board.items) {
    if (i.source !== 'sheet' || !i.sheetKey || seen.has(i.sheetKey) || updates.has(i.id)) continue
    if (!scope.has(groupNameById.get(i.groupId) ?? '')) continue
    if (!i.missingInSheet) {
      updates.set(i.id, { ...i, missingInSheet: true })
      missing += 1
    }
  }

  // 새 행은 그룹별로 그 그룹 끝에 붙인다(시트 순서 유지).
  let items = board.items.map((i) => updates.get(i.id) ?? i)
  for (const a of additions) {
    let lastIdx = -1
    items.forEach((i, idx) => {
      if (i.groupId === a.groupId) lastIdx = idx
    })
    items = lastIdx < 0 ? [...items, a] : [...items.slice(0, lastIdx + 1), a, ...items.slice(lastIdx + 1)]
  }

  // 주차 축은 시트 헤더 그대로(연도마다 4·5주 구성이 다르다).
  const weekAxis = header.weekCols.map(({ key, month, week }) => ({ key, month, week }))

  return {
    board: { ...board, groups, items, weekAxis: weekAxis.length > 0 ? weekAxis : board.weekAxis, sheetLink: link },
    added,
    updated,
    keptEdits,
    missing,
    skippedDeleted,
    newGroups,
  }
}

// 과제관리(L2/L3) 보드의 순수 함수 모음. 화면(WorkStage)은 여기 함수로 새
// 보드를 만들어 SET_WORK_BOARD로 통째로 넣고, 되돌리기는 이전 보드 스냅샷을
// 다시 넣는 식이다(일정표 빌더의 gApply 패턴). 필드 의미는 docs/DATA-MODEL.md.

import { v4 as uuidv4 } from 'uuid'
import type {
  ColumnDef,
  ColumnType,
  TaskCategory,
  TaskGroup,
  TeamMember,
  WeekColumn,
  WeekMark,
  WorkBoard,
  WorkItem,
} from '../types'
import { TASK_CATEGORY_OPTIONS } from '../types'

// 이름·담당자·분류는 WorkItem의 전용 필드에, 나머지 시스템 열은 fields[id]에 산다.
export const COL_NAME = 'name'
export const COL_ASSIGNEES = 'assignees'
export const COL_CATEGORY = 'category'

// 시트 「추진현황」 탭의 열 순서를 따른다. sheetHeaders는 헤더 자동 매칭용
// 별칭(공백 제거 후 비교).
// 기본으로 보이는 열은 과제명·분류·상태·담당자·시작일·완료일뿐이고, 나머지는
// 가져오되 숨겨 둔다("열 표시"에서 켤 수 있다). 시작일은 시트에 열이 없어
// 주차 칸의 첫 표시(S)로 추정한다(sheetImport.ts의 deriveDates).
export const SYSTEM_COLUMNS: (ColumnDef & { sheetHeaders: string[] })[] = [
  { id: COL_NAME, label: 'L3 과제명', type: 'text', system: true, width: 360, sheetHeaders: ['L3'] },
  { id: COL_CATEGORY, label: '분류', type: 'select', system: true, width: 76, options: [...TASK_CATEGORY_OPTIONS], sheetHeaders: ['분류'] },
  { id: 'status', label: '상태', type: 'select', system: true, width: 84, sheetHeaders: ['상태', '진행상태'] },
  { id: COL_ASSIGNEES, label: '담당자', type: 'person', system: true, width: 180, sheetHeaders: ['담당자'] },
  { id: 'startDate', label: '시작일', type: 'date', system: true, width: 132, sheetHeaders: ['시작일', '착수일'] },
  { id: 'doneDate', label: '완료일', type: 'date', system: true, width: 132, sheetHeaders: ['완료일'] },
  { id: 'attr', label: '속성', type: 'select', system: true, width: 90, hidden: true, sheetHeaders: ['속성'] },
  { id: 'team', label: '담당팀', type: 'select', system: true, width: 130, hidden: true, sheetHeaders: ['담당팀'] },
  { id: 'demandDept', label: '수요부서', type: 'text', system: true, width: 100, hidden: true, sheetHeaders: ['수요부서'] },
  { id: 'inout', label: '내/외', type: 'select', system: true, width: 70, hidden: true, sheetHeaders: ['내/외'] },
  { id: 'dueDate', label: '완료요청', type: 'date', system: true, width: 110, hidden: true, sheetHeaders: ['완료요청'] },
  { id: 'stageIntake', label: '디자인접수/start', type: 'memo', system: true, width: 180, hidden: true, sheetHeaders: ['디자인접수/start'] },
  { id: 'stageDev', label: '디자인개발', type: 'memo', system: true, width: 220, hidden: true, sheetHeaders: ['디자인개발'] },
  { id: 'stageHandoff', label: '디자인이관', type: 'memo', system: true, width: 160, hidden: true, sheetHeaders: ['디자인이관'] },
  { id: 'dbUpload', label: 'DB 업로드', type: 'text', system: true, width: 90, hidden: true, sheetHeaders: ['DB업로드'] },
  { id: 'note', label: '비고', type: 'memo', system: true, width: 180, hidden: true, sheetHeaders: ['비고'] },
  { id: 'url', label: 'URL, LINK', type: 'link', system: true, width: 160, hidden: true, sheetHeaders: ['URL,LINK', 'URL', 'LINK'] },
]

export function defaultColumns(): ColumnDef[] {
  return SYSTEM_COLUMNS.map(({ sheetHeaders, ...c }) => ({ ...c, options: c.options ? [...c.options] : undefined }))
}

export function createEmptyBoard(): WorkBoard {
  return { groups: [], items: [], columns: defaultColumns(), weekAxis: [], sheetLink: null, excludedSheetKeys: [] }
}

export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function isTaskCategory(v: unknown): v is TaskCategory {
  return typeof v === 'string' && (TASK_CATEGORY_OPTIONS as string[]).includes(v)
}

export function isWeekMark(v: unknown): v is WeekMark {
  return v === 'S' || v === '완' || v === 'F'
}

// ---------- 셀 읽기/쓰기 ----------

export function memberNamesOf(item: WorkItem, members: TeamMember[]): string[] {
  const byId = new Map(members.map((m) => [m.id, m.name]))
  return item.assigneeIds.map((id) => byId.get(id)).filter((n): n is string => Boolean(n))
}

// "조은총/ 구도이", "천명진\n김재겸", "조은총, 이주영" 모두 받는다.
export function splitNames(raw: string): string[] {
  return raw
    .split(/[/,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function matchAssignees(names: string[], members: TeamMember[]): { ids: string[]; unmatched: string[] } {
  const byName = new Map(members.map((m) => [m.name.trim(), m.id]))
  const ids: string[] = []
  const unmatched: string[] = []
  for (const n of names) {
    const id = byName.get(n)
    if (id) {
      if (!ids.includes(id)) ids.push(id)
    } else if (!unmatched.includes(n)) unmatched.push(n)
  }
  return { ids, unmatched }
}

export function getCellText(item: WorkItem, colId: string, members: TeamMember[]): string {
  if (colId === COL_NAME) return item.name
  if (colId === COL_CATEGORY) return item.category ?? item.categoryRaw ?? ''
  if (colId === COL_ASSIGNEES) return [...memberNamesOf(item, members), ...item.unmatchedAssignees].join(', ')
  return item.fields[colId] ?? ''
}

function stamp(item: WorkItem, colId: string): Record<string, string> {
  return { ...(item.editedAt ?? {}), [colId]: new Date().toISOString() }
}

// 사람이 앱에서 값을 바꿀 때만 쓴다(가져오기는 applySheetImport). editedAt을 찍는다.
export function setCellText(item: WorkItem, colId: string, text: string, members: TeamMember[]): WorkItem {
  if (getCellText(item, colId, members) === text) return item
  const editedAt = stamp(item, colId)
  if (colId === COL_NAME) return { ...item, name: text.trim(), editedAt }
  if (colId === COL_CATEGORY) {
    const v = text.trim()
    return isTaskCategory(v)
      ? { ...item, category: v, categoryRaw: undefined, editedAt }
      : { ...item, category: null, categoryRaw: v || undefined, editedAt }
  }
  if (colId === COL_ASSIGNEES) {
    const { ids, unmatched } = matchAssignees(splitNames(text), members)
    return { ...item, assigneeIds: ids, unmatchedAssignees: unmatched, editedAt }
  }
  const fields = { ...item.fields }
  if (text === '') delete fields[colId]
  else fields[colId] = text
  // 사람이 고친 값은 더 이상 추정값이 아니다.
  const derivedFields = item.derivedFields?.filter((f) => f !== colId)
  return { ...item, fields, editedAt, derivedFields: derivedFields?.length ? derivedFields : undefined }
}

// ---------- 보드 조작 ----------

export function newWorkItem(groupId: string): WorkItem {
  return { id: uuidv4(), groupId, name: '', source: 'app', category: null, assigneeIds: [], unmatchedAssignees: [], fields: {}, weeks: {} }
}

export function itemsOfGroup(board: WorkBoard, groupId: string): WorkItem[] {
  return board.items.filter((i) => i.groupId === groupId)
}

export function addGroup(board: WorkBoard, name: string): { board: WorkBoard; group: TaskGroup } {
  const group: TaskGroup = { id: uuidv4(), name, tag: null, h: null, l1: null, source: 'app' }
  return { board: { ...board, groups: [...board.groups, group] }, group }
}

export function updateGroup(board: WorkBoard, groupId: string, patch: Partial<TaskGroup>): WorkBoard {
  return { ...board, groups: board.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) }
}

// 시트에서 온 L2를 지우면 시트 연결의 선택 목록에서도 빼서, 다시 가져오기가
// 되살리지 않게 한다. 다시 필요하면 데이터 관리에서 L2를 다시 고르면 된다.
export function deleteGroup(board: WorkBoard, groupId: string): WorkBoard {
  const group = board.groups.find((g) => g.id === groupId)
  const sheetLink =
    board.sheetLink && group ? { ...board.sheetLink, selectedGroups: board.sheetLink.selectedGroups.filter((n) => n !== group.name) } : board.sheetLink
  return {
    ...board,
    groups: board.groups.filter((g) => g.id !== groupId),
    items: board.items.filter((i) => i.groupId !== groupId),
    sheetLink,
  }
}

export function moveGroup(board: WorkBoard, groupId: string, toIndex: number): WorkBoard {
  const from = board.groups.findIndex((g) => g.id === groupId)
  if (from < 0) return board
  const groups = [...board.groups]
  const [g] = groups.splice(from, 1)
  groups.splice(Math.max(0, Math.min(groups.length, toIndex)), 0, g)
  return { ...board, groups }
}

// 한 그룹 안에서의 위치(index)로 행을 끼워 넣는다. items 배열 전체 순서에서
// 그 그룹의 index번째 행 앞자리를 찾아 넣으므로 다른 그룹 순서는 그대로다.
export function insertItems(board: WorkBoard, groupId: string, index: number, newItems: WorkItem[]): WorkBoard {
  const groupItems = itemsOfGroup(board, groupId)
  const items = [...board.items]
  let at: number
  if (index < groupItems.length) at = items.indexOf(groupItems[index])
  else if (groupItems.length > 0) at = items.indexOf(groupItems[groupItems.length - 1]) + 1
  else at = items.length
  items.splice(at, 0, ...newItems)
  return { ...board, items }
}

// 시트에서 온 행을 지우면 그 키를 기억해 두고 다시 가져올 때 건너뛴다.
export function deleteItems(board: WorkBoard, ids: string[]): WorkBoard {
  const set = new Set(ids)
  const keys = board.items.filter((i) => set.has(i.id) && i.sheetKey && !i.missingInSheet).map((i) => i.sheetKey!)
  return {
    ...board,
    items: board.items.filter((i) => !set.has(i.id)),
    excludedSheetKeys: keys.length ? Array.from(new Set([...board.excludedSheetKeys, ...keys])) : board.excludedSheetKeys,
  }
}

export function moveItems(board: WorkBoard, groupId: string, ids: string[], toIndex: number): WorkBoard {
  const groupItems = itemsOfGroup(board, groupId)
  const set = new Set(ids)
  const moving = groupItems.filter((i) => set.has(i.id))
  if (moving.length === 0) return board
  const before = groupItems.slice(0, toIndex).filter((i) => !set.has(i.id)).length
  const remaining = board.items.filter((i) => !set.has(i.id))
  return insertItems({ ...board, items: remaining }, groupId, before, moving)
}

export function updateItems(board: WorkBoard, updates: Map<string, WorkItem>): WorkBoard {
  if (updates.size === 0) return board
  return { ...board, items: board.items.map((i) => updates.get(i.id) ?? i) }
}

export function addColumn(board: WorkBoard, index: number, label = '새 열', type: ColumnType = 'text'): { board: WorkBoard; column: ColumnDef } {
  const column: ColumnDef = { id: `u_${uuidv4().slice(0, 8)}`, label, type, system: false, width: 140 }
  const columns = [...board.columns]
  columns.splice(Math.max(0, Math.min(columns.length, index)), 0, column)
  return { board: { ...board, columns }, column }
}

export function updateColumn(board: WorkBoard, colId: string, patch: Partial<ColumnDef>): WorkBoard {
  return { ...board, columns: board.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)) }
}

// 사용자 열만 지운다. 시스템 열은 숨기기만 가능(다시 가져오면 생기므로).
export function deleteColumns(board: WorkBoard, colIds: string[]): WorkBoard {
  const removable = new Set(board.columns.filter((c) => !c.system && colIds.includes(c.id)).map((c) => c.id))
  if (removable.size === 0) return board
  return {
    ...board,
    columns: board.columns.filter((c) => !removable.has(c.id)),
    items: board.items.map((i) => {
      if (!Object.keys(i.fields).some((k) => removable.has(k))) return i
      const fields = { ...i.fields }
      removable.forEach((k) => delete fields[k])
      return { ...i, fields }
    }),
  }
}

export function moveColumns(board: WorkBoard, colIds: string[], toIndex: number): WorkBoard {
  const set = new Set(colIds)
  const moving = board.columns.filter((c) => set.has(c.id))
  if (moving.length === 0) return board
  const before = board.columns.slice(0, toIndex).filter((c) => !set.has(c.id)).length
  const rest = board.columns.filter((c) => !set.has(c.id))
  rest.splice(before, 0, ...moving)
  return { ...board, columns: rest }
}

// 선택형 열의 선택지 = 정의된 선택지 + 실제로 들어 있는 값(시트의 이상값 포함).
export function optionsForColumn(board: WorkBoard, col: ColumnDef): string[] {
  const set = new Set<string>(col.options ?? [])
  if (col.id !== COL_CATEGORY) {
    for (const i of board.items) {
      const v = i.fields[col.id]
      if (v) set.add(v)
    }
  }
  return Array.from(set)
}

// 팀원을 지우면 담당자 연결도 끊는다. 이름은 unmatched로 남겨 정보를 잃지 않는다.
export function detachMember(board: WorkBoard, member: TeamMember): WorkBoard {
  if (!board.items.some((i) => i.assigneeIds.includes(member.id))) return board
  return {
    ...board,
    items: board.items.map((i) =>
      i.assigneeIds.includes(member.id)
        ? {
            ...i,
            assigneeIds: i.assigneeIds.filter((id) => id !== member.id),
            unmatchedAssignees: i.unmatchedAssignees.includes(member.name) ? i.unmatchedAssignees : [...i.unmatchedAssignees, member.name],
          }
        : i,
    ),
  }
}

// 팀원 목록이 바뀌면(추가·이름 변경) 미등록 담당자 이름을 다시 맞춰 본다.
export function rematchAssignees(board: WorkBoard, members: TeamMember[]): WorkBoard {
  let changed = false
  const items = board.items.map((i) => {
    if (i.unmatchedAssignees.length === 0) return i
    const { ids, unmatched } = matchAssignees(i.unmatchedAssignees, members)
    if (ids.length === 0) return i
    changed = true
    return { ...i, assigneeIds: [...i.assigneeIds, ...ids.filter((id) => !i.assigneeIds.includes(id))], unmatchedAssignees: unmatched }
  })
  return changed ? { ...board, items } : board
}

// 과제관리에 담당자로 나오지만 팀원 목록에 없는 이름(건수 많은 순).
export function unmatchedAssigneeSummary(board: WorkBoard): { name: string; count: number; team: string | null }[] {
  const counts = new Map<string, { count: number; teams: Map<string, number> }>()
  for (const i of board.items) {
    for (const n of i.unmatchedAssignees) {
      const e = counts.get(n) ?? { count: 0, teams: new Map() }
      e.count += 1
      const t = i.fields.team
      if (t) e.teams.set(t, (e.teams.get(t) ?? 0) + 1)
      counts.set(n, e)
    }
  }
  return Array.from(counts.entries())
    .map(([name, e]) => ({ name, count: e.count, team: [...e.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }))
    .sort((a, b) => b.count - a.count)
}

// ---------- 시작일·완료일 추정 ----------

// 시트에는 시작일 열이 없고 완료일도 비어 있는 행이 많다. 주차 칸 표시로
// 대신 채운다: 시작일 = 가장 이른 주차 표시(보통 S)가 있는 주의 첫날, 완료일 =
// 마지막 완·F가 있는 주의 마지막 날. 한 달을 7일씩 나눈 근사라 "추정"이다.
function weekRange(month: number, week: number, weeksInMonth: number, year: number): { start: string; end: string } {
  const days = new Date(year, month, 0).getDate()
  const startDay = Math.min(days, 1 + (week - 1) * 7)
  const endDay = week >= weeksInMonth ? days : Math.min(days, week * 7)
  const mm = String(month).padStart(2, '0')
  return { start: `${year}-${mm}-${String(startDay).padStart(2, '0')}`, end: `${year}-${mm}-${String(endDay).padStart(2, '0')}` }
}

export function deriveDates(
  weeks: Record<string, WeekMark>,
  weekCols: WeekColumn[],
  year: number | null,
): { startDate?: string; doneDate?: string } {
  if (!year) return {}
  const perMonth = new Map<number, number>()
  for (const w of weekCols) perMonth.set(w.month, Math.max(perMonth.get(w.month) ?? 0, w.week))
  const marked = weekCols.filter((w) => weeks[w.key])
  if (marked.length === 0) return {}
  // 가장 이른 표시. 시트에는 완료 뒤에 S를 다시 찍은 행도 있어서 "첫 S"로 잡으면
  // 시작일이 완료일보다 늦어진다.
  const first = marked[0]
  const done = [...marked].reverse().find((w) => weeks[w.key] === '완' || weeks[w.key] === 'F')
  return {
    startDate: weekRange(first.month, first.week, perMonth.get(first.month) ?? 4, year).start,
    doneDate: done ? weekRange(done.month, done.week, perMonth.get(done.month) ?? 4, year).end : undefined,
  }
}

export function yearFromTitle(title: string): number | null {
  const m = title.match(/(20\d{2})/)
  return m ? Number(m[1]) : null
}


// 이 규칙이 생기기 전에 가져온 행도 다시 가져오지 않고 채워지게, 저장본을 읽을 때
// 비어 있는(그리고 사람이 고친 적 없는) 시작일·완료일만 추정으로 채운다.
function fillDerivedDates(items: WorkItem[], weekAxis: WeekColumn[], year: number | null): WorkItem[] {
  if (!year || weekAxis.length === 0) return items
  return items.map((i) => {
    const guess = deriveDates(i.weeks, weekAxis, year)
    const add: Record<string, string> = {}
    for (const f of ['startDate', 'doneDate'] as const) {
      const v = guess[f]
      if (v && !i.fields[f] && !i.editedAt?.[f]) add[f] = v
    }
    const keys = Object.keys(add)
    if (keys.length === 0) return i
    return { ...i, fields: { ...i.fields, ...add }, derivedFields: Array.from(new Set([...(i.derivedFields ?? []), ...keys])) }
  })
}

// ---------- 저장 데이터 읽기 ----------

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function strRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === 'string') out[k] = val
  }
  return out
}

export function migrateWorkBoard(raw: unknown): WorkBoard {
  if (!raw || typeof raw !== 'object') return createEmptyBoard()
  const r = raw as Record<string, unknown>
  const groups: TaskGroup[] = Array.isArray(r.groups)
    ? (r.groups as Record<string, unknown>[])
        .filter((g) => typeof g.id === 'string' && typeof g.name === 'string')
        .map((g) => ({
          id: g.id as string,
          name: g.name as string,
          tag: str(g.tag),
          h: str(g.h),
          l1: str(g.l1),
          hierarchyInferred: g.hierarchyInferred === true ? true : undefined,
          source: g.source === 'sheet' ? 'sheet' : 'app',
        }))
    : []
  const groupIds = new Set(groups.map((g) => g.id))
  const items: WorkItem[] = Array.isArray(r.items)
    ? (r.items as Record<string, unknown>[])
        .filter((i) => typeof i.id === 'string' && typeof i.groupId === 'string' && groupIds.has(i.groupId as string))
        .map((i) => {
          const weeks: Record<string, WeekMark> = {}
          if (i.weeks && typeof i.weeks === 'object') {
            for (const [k, v] of Object.entries(i.weeks as Record<string, unknown>)) if (isWeekMark(v)) weeks[k] = v
          }
          const editedAt = strRecord(i.editedAt)
          return {
            id: i.id as string,
            groupId: i.groupId as string,
            name: typeof i.name === 'string' ? i.name : '',
            source: i.source === 'sheet' ? 'sheet' : 'app',
            sheetKey: str(i.sheetKey) ?? undefined,
            category: isTaskCategory(i.category) ? i.category : null,
            categoryRaw: str(i.categoryRaw) ?? undefined,
            assigneeIds: Array.isArray(i.assigneeIds) ? (i.assigneeIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
            unmatchedAssignees: Array.isArray(i.unmatchedAssignees)
              ? (i.unmatchedAssignees as unknown[]).filter((x): x is string => typeof x === 'string')
              : [],
            fields: strRecord(i.fields),
            weeks,
            editedAt: Object.keys(editedAt).length > 0 ? editedAt : undefined,
            missingInSheet: i.missingInSheet === true ? true : undefined,
            derivedFields: Array.isArray(i.derivedFields)
              ? (i.derivedFields as unknown[]).filter((x): x is string => typeof x === 'string')
              : undefined,
          } satisfies WorkItem
        })
    : []
  // 시스템 열은 저장본에 빠져 있어도 항상 있게 한다(새 버전에서 추가된 열 포함).
  const savedCols: ColumnDef[] = Array.isArray(r.columns)
    ? (r.columns as Record<string, unknown>[])
        .filter((c) => typeof c.id === 'string' && typeof c.label === 'string')
        .map((c) => ({
          id: c.id as string,
          label: c.label as string,
          type: (['text', 'memo', 'select', 'date', 'person', 'link'] as ColumnType[]).includes(c.type as ColumnType) ? (c.type as ColumnType) : 'text',
          system: SYSTEM_COLUMNS.some((s) => s.id === c.id),
          width: typeof c.width === 'number' ? c.width : undefined,
          hidden: c.hidden === true ? true : undefined,
          options: Array.isArray(c.options) ? (c.options as unknown[]).filter((x): x is string => typeof x === 'string') : undefined,
        }))
    : []
  let columns = savedCols.length > 0 ? savedCols : defaultColumns()
  // 시작일 열이 없는 저장본은 "기본 표시 열 6개" 규칙 이전 것이다 -- 시스템 열의
  // 순서·표시 여부를 새 기본값으로 한 번 맞추고, 사용자 열은 뒤에 그대로 둔다.
  if (savedCols.length > 0 && !savedCols.some((c) => c.id === 'startDate')) {
    const byId = new Map(savedCols.map((c) => [c.id, c]))
    columns = [
      ...defaultColumns().map((d) => ({ ...d, width: byId.get(d.id)?.width ?? d.width })),
      ...savedCols.filter((c) => !c.system),
    ]
  }
  for (const def of defaultColumns()) if (!columns.some((c) => c.id === def.id)) columns.push(def)
  const weekAxis: WeekColumn[] = Array.isArray(r.weekAxis)
    ? (r.weekAxis as Record<string, unknown>[])
        .filter((w) => typeof w.key === 'string' && typeof w.month === 'number' && typeof w.week === 'number')
        .map((w) => ({ key: w.key as string, month: w.month as number, week: w.week as number }))
    : []
  let sheetLink: WorkBoard['sheetLink'] = null
  if (r.sheetLink && typeof r.sheetLink === 'object') {
    const s = r.sheetLink as Record<string, unknown>
    if (typeof s.spreadsheetId === 'string' && typeof s.tabName === 'string') {
      sheetLink = {
        spreadsheetId: s.spreadsheetId,
        tabName: s.tabName,
        columnMap: strRecord(s.columnMap),
        selectedGroups: Array.isArray(s.selectedGroups) ? (s.selectedGroups as unknown[]).filter((x): x is string => typeof x === 'string') : [],
        teamFilter: str(s.teamFilter),
        lastFetchedAt: str(s.lastFetchedAt) ?? undefined,
      }
    }
  }
  const excludedSheetKeys = Array.isArray(r.excludedSheetKeys)
    ? (r.excludedSheetKeys as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  const filledItems = fillDerivedDates(items, weekAxis, sheetLink ? yearFromTitle(sheetLink.tabName) : null)
  return { groups, items: filledItems, columns, weekAxis, sheetLink, excludedSheetKeys }
}

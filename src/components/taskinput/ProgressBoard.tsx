// 과제 입력 › 추진현황 -- 구글시트 「YYYY 추진현황」 탭을 통째로 읽어 L1마다 탭을 만들고,
// 탭마다 일정표(구분=L2, 항목=L3, 월·주 칸)를 시트와 같은 색으로 그린다.
// 입력한 칸은 "구글시트에 저장"으로 시트의 같은 칸(글자 + 배경색)에 쓴다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, CloudUpload, Eraser, Pencil, Redo2, RefreshCw, RotateCcw, Rows3, Search, Undo2, Upload } from 'lucide-react'
import IconButton from '../IconButton'
import Button from '../Button'
import ConfirmDialog from '../ConfirmDialog'
import Spinner from '../Spinner'
import { ic, icSm } from '../ui/icon'
import { parseSheet, splitL2, type ParsedSheet, type RawSheet } from '../../utils/sheetImport'
import {
  chooseSheetsAccountNext,
  fetchSheetFormats,
  fetchSheetTab,
  fetchSpreadsheetTabs,
  isSheetsApiConfigured,
  parseSheetUrl,
  pickDefaultTab,
  readXlsxBook,
  sheetUrl,
  writeSheetCells,
} from '../../utils/sheetSources'
import {
  NO_L1,
  TOOL_CELL,
  buildSheetWrites,
  isProtectedSheet,
  TASK_INPUT_SHEET_URL,
  readLinkedSheet,
  writeLinkedSheet,
  NEW_PREFIX,
  buildFieldDefs,
  buildHeaderStyle,
  countDrafts,
  currentWeekKey,
  effectiveCells,
  effectiveBg,
  effectiveField,
  effectiveNote,
  loadProgress,
  makeNewRow,
  makeNewGroup,
  orderWithNewRows,
  type PaintBrush,
  saveDrafts,
  saveProgressData,
  setCellEdit,
  setBgEdit,
  setFieldEdit,
  paintCells,
  setNoteEdit,
  toProgressRows,
  type Drafts,
  type FieldDef,
  type PaintTool,
  type ProgressData,
  type ProgressRow,
} from '../../utils/progressBoard'
import SheetLinkChip from '../SheetLinkChip'
import { withGoogleAccount } from '../../utils/googleDrive'
import ScheduleTable, { CellSwatch, cellLabel, type ScheduleMode, type ScheduleRowView } from './ScheduleTable'

// 보기 기간: 전체 · 상반기 · 하반기 · 분기 · 월
type Period = { start: number; months: number }
const PERIOD_BUTTONS: { label: string; p: Period }[] = [
  { label: '전체', p: { start: 1, months: 12 } },
  { label: '상반기', p: { start: 1, months: 6 } },
  { label: '하반기', p: { start: 7, months: 6 } },
]
const QUARTERS: { label: string; p: Period }[] = [1, 2, 3, 4].map((q) => ({ label: `${q}분기`, p: { start: (q - 1) * 3 + 1, months: 3 } }))
const MONTHS: { label: string; p: Period }[] = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, p: { start: i + 1, months: 1 } }))
function periodLabel(p: Period): string {
  return [...PERIOD_BUTTONS, ...QUARTERS, ...MONTHS].find((x) => x.p.start === p.start && x.p.months === p.months)?.label ?? `${p.start}월~`
}
// 범례에 보이는 칸 종류(착수 계획 · 계획 기간 · 완료 계획 · 착수 · 진행 기간 · 완료)
const LEGEND: PaintTool[] = ['S-plan', 'plan', 'F', 'S', 'actual', '완']

function splitPeople(raw: string): string[] {
  return raw
    .split(/[/,·\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.round(h / 24)}일 전`
}

function fmt(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function toData(parsed: ParsedSheet, raw: RawSheet, meta: Pick<ProgressData, 'spreadsheetId' | 'source' | 'tabTitle' | 'sheetGid'>): ProgressData {
  const fields = buildFieldDefs(parsed.header, parsed.columnMap)
  const { hCol, l1Col, l2Col } = parsed.header
  const levelCols: ProgressData['levelCols'] = { l2: l2Col, ...(l1Col !== null ? { l1: l1Col } : {}), ...(hCol !== null ? { h: hCol } : {}) }
  const lc = Object.values(levelCols)
  return {
    ...meta,
    year: Number(meta.tabTitle.match(/(20\d{2})/)?.[1]) || null,
    fetchedAt: new Date().toISOString(),
    weekCols: parsed.header.weekCols.map(({ key, month, week, col }) => ({ key, month, week, col })),
    fields,
    headerStyle: buildHeaderStyle(parsed.header, raw, fields),
    rows: toProgressRows(parsed.rows, raw, fields, parsed.header.weekCols, levelCols),
    levelCols,
    levelMerges: raw.merges.filter((m) => m.c1 === m.c2 && lc.includes(m.c1)),
  }
}

// 시트에서 추진현황 탭을 값 + 주차 칸 배경색까지 읽는다.
async function readFromSheet(spreadsheetId: string, year: number): Promise<ProgressData> {
  const { title: fileTitle, tabs } = await fetchSpreadsheetTabs(spreadsheetId)
  const title = pickDefaultTab(tabs, year)
  const tab = tabs.find((t) => t.title === title)
  if (!title || !tab) throw new Error('시트에서 「추진현황」 탭을 찾지 못했습니다.')
  const raw: RawSheet = await fetchSheetTab(spreadsheetId, title)
  const first = parseSheet(raw)
  if ('error' in first) throw new Error(first.error)
  const cols = first.header.weekCols.map((w) => w.col)
  const lastCol = Math.max(
    0,
    ...cols,
    ...Object.values(first.columnMap).filter((v): v is number => v !== null),
    (raw.rows[first.header.headerRow]?.length ?? 1) - 1,
  )
  // 머리글 색 · 칸 색(계획/실적, 행·칸 강조) · 메모를 한 번에 읽는다.
  const fmt = await fetchSheetFormats(spreadsheetId, title, 0, Math.max(0, raw.rows.length - 1), 0, lastCol)
  raw.fills = fmt.fills
  raw.notes = fmt.notes
  const parsed = parseSheet(raw)
  if ('error' in parsed) throw new Error(parsed.error)
  return { ...toData(parsed, raw, { spreadsheetId, source: title, tabTitle: title, sheetGid: tab.sheetId }), fileTitle }
}

export default function ProgressBoard() {
  const initial = useMemo(() => loadProgress(), [])
  const [data, setData] = useState<ProgressData | null>(initial.data)
  const [drafts, setDrafts] = useState<Drafts>(initial.drafts)
  const edits = drafts.edits
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const l1s = useMemo(() => Array.from(new Set((data?.rows ?? []).map((r) => r.l1))), [data])
  const [activeL1, setActiveL1] = useState<string | null>(null)
  const l1 = activeL1 && l1s.includes(activeL1) ? activeL1 : (l1s[0] ?? null)

  const now = new Date()
  const [period, setPeriod] = useState<Period>({ start: 1, months: 12 })
  // 머리글 필터: 열 id → 숨길 값들(구글시트 필터처럼 체크 해제한 값)
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  // 칠하기 도구: 회색(계획) / 분홍(실적)
  const [tool, setTool] = useState<PaintBrush>('plan')
  // 행 지브라(기본 흰색) · 열 폭 -- 이 브라우저에 기억
  const [zebra, setZebraState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('progress-board:zebra') === '1'
    } catch {
      return false
    }
  })
  function setZebra(v: boolean) {
    setZebraState(v)
    try {
      localStorage.setItem('progress-board:zebra', v ? '1' : '0')
    } catch {
      // 기억 못 해도 지금 화면에는 반영
    }
  }
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('progress-board:widths') ?? '{}') as Record<string, number>
    } catch {
      return {}
    }
  })
  function resizeCol(key: string, w: number) {
    setWidths((cur) => {
      const next = { ...cur, [key]: w }
      try {
        localStorage.setItem('progress-board:widths', JSON.stringify(next))
      } catch {
        // 위와 같음
      }
      return next
    })
  }
  // 일정(주차 칸) 접기 -- 접으면 계획·실적 기간 요약 한 칸만 보인다
  // 일정 보기 단계: 전체 펴기 / 줄여보기 / 숨기기 -- 이 브라우저에 기억
  const [scheduleMode, setScheduleModeState] = useState<ScheduleMode>(() => {
    try {
      const v = localStorage.getItem('progress-board:schedule-view')
      return v === 'compact' || v === 'hidden' ? v : 'full'
    } catch {
      return 'full'
    }
  })
  const lastShownMode = useRef<ScheduleMode>(scheduleMode === 'hidden' ? 'full' : scheduleMode)
  function setScheduleMode(m: ScheduleMode) {
    if (m !== 'hidden') lastShownMode.current = m
    setScheduleModeState(m)
    try {
      localStorage.setItem('progress-board:schedule-view', m)
    } catch {
      // 기억 못 해도 지금 화면에는 반영
    }
  }
  // 일정 머리글 우클릭 메뉴(보기 단계 · 기간)
  const [schMenu, setSchMenu] = useState<{ x: number; y: number } | null>(null)
  // 표 글자 크기(가▲/가▼) -- 이 브라우저에 기억
  const [fontSize, setFontSizeState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('progress-board:font'))
      return v >= 10 && v <= 18 ? v : 13
    } catch {
      return 13
    }
  })
  function setFontSize(v: number) {
    const n = Math.max(10, Math.min(18, v))
    setFontSizeState(n)
    try {
      localStorage.setItem('progress-board:font', String(n))
    } catch {
      // 기억 못 해도 지금 화면에는 반영
    }
  }

  function accept(next: ProgressData) {
    setData(next)
    saveProgressData(next)
    setError('')
  }

  const [sheetLink, setSheetLink] = useState<string>(() => readLinkedSheet() ?? TASK_INPUT_SHEET_URL)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  // 다른 시트를 연결하면 그 시트에서 다시 불러온다. 고친 칸은 이전 시트 기준이라 비운다.
  async function connectSheet(url: string) {
    const link = parseSheetUrl(url)
    if (!link) {
      setError('구글시트 링크를 확인해 주세요. (https://docs.google.com/spreadsheets/d/…)')
      return
    }
    const clean = sheetUrl(link.spreadsheetId)
    setSheetLink(clean)
    writeLinkedSheet(clean === TASK_INPUT_SHEET_URL ? null : clean)
    setLinkOpen(false)
    setOpenKey(null)
    updateDrafts({ edits: {}, newRows: [] })
    clearHistory()
    await loadFromSheet(false, clean)
  }

  async function loadFromSheet(pickAccount = false, url = sheetLink) {
    const link = parseSheetUrl(url)
    if (!link) return
    if (pickAccount) chooseSheetsAccountNext()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      accept(await readFromSheet(link.spreadsheetId, now.getFullYear()))
    } catch (e) {
      setError(e instanceof Error ? e.message : '시트를 읽지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function loadFromFile(file: File) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const book = readXlsxBook(await file.arrayBuffer(), file.name)
      const title = pickDefaultTab(
        book.sheets.map((s) => ({ title: s.title, hidden: !!s.hidden })),
        now.getFullYear(),
      )
      const sheet = book.sheets.find((s) => s.title === title)
      if (!sheet) throw new Error('파일에서 「추진현황」 탭을 찾지 못했습니다.')
      const parsed = parseSheet(sheet)
      if ('error' in parsed) throw new Error(parsed.error)
      accept(toData(parsed, sheet, { spreadsheetId: null, source: `${file.name} · ${sheet.title}`, tabTitle: sheet.title, sheetGid: null }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 되돌리기/다시 하기: 고칠 때마다 직전 상태를 쌓는다. 끌어 칠하기처럼 잇따른 같은 동작은 한 번으로 묶는다.
  const draftsRef = useRef(drafts)
  const past = useRef<Drafts[]>([])
  const future = useRef<Drafts[]>([])
  const lastStep = useRef({ kind: '', at: 0 })
  const [, setHistoryTick] = useState(0)
  function applyDrafts(v: Drafts) {
    draftsRef.current = v
    setDrafts(v)
    saveDrafts(v)
    setHistoryTick((n) => n + 1)
  }
  function updateDrafts(next: Drafts | ((cur: Drafts) => Drafts), kind = '') {
    const cur = draftsRef.current
    const v = typeof next === 'function' ? next(cur) : next
    if (v === cur) return
    const now = Date.now()
    if (!(kind && kind === lastStep.current.kind && now - lastStep.current.at < 800)) {
      past.current.push(cur)
      if (past.current.length > 200) past.current.shift()
    }
    lastStep.current = { kind, at: now }
    future.current = []
    applyDrafts(v)
  }
  function clearHistory() {
    past.current = []
    future.current = []
    lastStep.current = { kind: '', at: 0 }
    setHistoryTick((n) => n + 1)
  }
  function undo() {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(draftsRef.current)
    lastStep.current = { kind: '', at: 0 }
    applyDrafts(prev)
  }
  function redo() {
    const next = future.current.pop()
    if (!next) return
    past.current.push(draftsRef.current)
    lastStep.current = { kind: '', at: 0 }
    applyDrafts(next)
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 한 줄의 칸·열 값 고치기(기존 행은 edits, 새 과제는 newRows에)
  // 칠하기: 누른 칸부터 끈 칸까지 한 번의 되돌리기 단계로 묶는다.
  const stroke = useRef(0)
  const isDeleted = (row: ProgressRow) => (drafts.deleted ?? []).includes(row.key)
  function paintCell(row: ProgressRow, key: string, click: boolean) {
    if (isDeleted(row)) return
    if (click) stroke.current += 1
    const weekKeys = data?.weekCols.map((w) => w.key) ?? []
    updateDrafts((d) => {
      if (row.isNew) {
        const id = row.key.slice(NEW_PREFIX.length)
        return { ...d, newRows: d.newRows.map((n) => (n.id === id ? { ...n, cells: paintCells(n.cells, weekKeys, key, tool, click) } : n)) }
      }
      const before = effectiveCells(row, d.edits[row.key])
      const after = paintCells(before, weekKeys, key, tool, click)
      let edits = d.edits
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const x = before[k]
        const y = after[k]
        if (x?.m === y?.m && x?.f === y?.f) continue
        edits = setCellEdit(edits, row, k, y ?? { m: '', f: null })
      }
      return { ...d, edits }
    }, `paint:${stroke.current}`)
  }
  function setField(row: ProgressRow, id: string, value: string) {
    if (isDeleted(row)) return
    updateDrafts((d) => {
      if (row.isNew) {
        const nid = row.key.slice(NEW_PREFIX.length)
        return { ...d, newRows: d.newRows.map((n) => (n.id === nid ? { ...n, fields: { ...n.fields, [id]: value } } : n)) }
      }
      return { ...d, edits: setFieldEdit(d.edits, row, id, value) }
    })
  }
  function setBg(row: ProgressRow, ids: string[], hex: string) {
    updateDrafts((d) => {
      if (row.isNew) {
        const nid = row.key.slice(NEW_PREFIX.length)
        return {
          ...d,
          newRows: d.newRows.map((n) => (n.id === nid ? { ...n, bg: { ...(n.bg ?? {}), ...Object.fromEntries(ids.map((id) => [id, hex])) } } : n)),
        }
      }
      let edits = d.edits
      for (const id of ids) edits = setBgEdit(edits, row, id, hex)
      return { ...d, edits }
    })
  }
  function setNote(row: ProgressRow, key: string, note: string) {
    updateDrafts((d) => {
      if (row.isNew) {
        const nid = row.key.slice(NEW_PREFIX.length)
        return { ...d, newRows: d.newRows.map((n) => (n.id === nid ? { ...n, notes: { ...(n.notes ?? {}), [key]: note.trim() } } : n)) }
      }
      return { ...d, edits: setNoteEdit(d.edits, row, key, note) }
    })
  }
  // 과제 지우기: 새 과제는 바로 빼고, 시트 과제는 지울 줄로 표시(저장할 때 시트에서 줄을 지운다)
  function deleteRows(rows: ProgressRow[]) {
    const newIds = new Set(rows.filter((r) => r.isNew).map((r) => r.key.slice(NEW_PREFIX.length)))
    const keys = rows.filter((r) => !r.isNew).map((r) => r.key)
    updateDrafts((d) => ({ ...d, newRows: d.newRows.filter((n) => !newIds.has(n.id)), deleted: Array.from(new Set([...(d.deleted ?? []), ...keys])) }))
  }
  function restoreRows(rows: ProgressRow[]) {
    const keys = new Set(rows.map((r) => r.key))
    updateDrafts((d) => ({ ...d, deleted: (d.deleted ?? []).filter((k) => !keys.has(k)) }))
  }
  // 우클릭한 구분의 위(맨 윗줄 위)/아래(맨 아랫줄 아래)에 새 구분(L2) + 빈 과제 한 줄
  function addGroup(row: ProgressRow, where: 'above' | 'below', name: string) {
    const n = makeNewGroup(name, { l1: row.l1, h: row.h }, { key: row.key, where })
    updateDrafts((d) => ({ ...d, newRows: [...d.newRows, n] }))
    setOpenKey(NEW_PREFIX + n.id)
  }
  // 우클릭한 행의 위/아래에 새 과제
  function addRow(row: ProgressRow, where: 'above' | 'below') {
    const n = makeNewRow({ l1: row.l1, l2: row.l2, l2Tag: row.l2Tag, h: row.h }, { key: row.key, where })
    updateDrafts((d) => ({ ...d, newRows: [...d.newRows, n] }))
    setOpenKey(NEW_PREFIX + n.id)
  }

  // 고친 칸만 시트에 쓴다. 쓰기 직전에 시트를 다시 읽어 행을 L2·L3로 다시 찾고,
  // 그사이 누군가 같은 칸을 바꿨으면(불러올 때와 다르면) 그 칸은 쓰지 않고 남겨 둔다.
  async function saveToSheet() {
    setConfirmSave(false)
    if (!data?.spreadsheetId || data.sheetGid === null) return
    if (isProtectedSheet(data.spreadsheetId)) {
      setError('운영 중인 팀 시트에는 저장하지 않습니다. 테스트 시트를 연결해 주세요.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const fresh = await readFromSheet(data.spreadsheetId, data.year ?? now.getFullYear())
      if (fresh.tabTitle !== data.tabTitle) throw new Error(`시트의 추진현황 탭이 「${fresh.tabTitle}」로 바뀌었습니다. 다시 불러온 뒤 입력해 주세요.`)
      const { writes, deletes, inserts, after, remerge, kept, conflicts } = buildSheetWrites(data, fresh, drafts)
      await writeSheetCells(data.spreadsheetId, data.sheetGid, { writes, deletes, inserts, after, remerge })
      // 저장한 뒤 시트를 다시 읽어 화면을 시트와 맞춘다.
      accept(await readFromSheet(data.spreadsheetId, data.year ?? now.getFullYear()))
      updateDrafts(kept)
      clearHistory()
      setOpenKey(null)
      setMessage(
        `구글시트에 저장했습니다 · 고친 칸 ${writes.length}${inserts.length ? ` · 새 과제 ${inserts.length}건` : ''}${deletes.length ? ` · 지운 과제 ${deletes.length}건` : ''}.` +
          (conflicts
            ? ` ${conflicts}건은 불러온 뒤 시트에서 먼저 바뀌었거나(또는 이름이 비어) 저장하지 않았습니다(주황 점으로 남겨 둠 · 확인 후 다시 저장).`
            : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '시트에 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const tabRows = useMemo(() => (data?.rows ?? []).filter((r) => r.l1 === l1), [data, l1])
  const people = useMemo(
    () => Array.from(new Set((data?.rows ?? []).flatMap((r) => splitPeople(r.values.assignees ?? '')))).sort((a, b) => a.localeCompare(b, 'ko')),
    [data],
  )

  if (!data) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-[14px] border border-separator bg-white p-8 text-center">
        <h2 className="text-[17px] font-bold text-label">추진현황을 불러오세요</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-label-2">
          구글시트의 「{now.getFullYear()} 추진현황」 탭을 읽어 L1마다 일정표를 만듭니다.
          <br />
          시트를 볼 수 있는 구글 계정으로 한 번 권한을 허용하면 됩니다.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {isSheetsApiConfigured() && (
            <Button variant="primary" onClick={() => loadFromSheet()} disabled={loading}>
              {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw {...icSm} />}
              구글시트에서 불러오기
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            title="시트에서 파일 › 다운로드 › xlsx로 받은 파일(보기 전용)"
          >
            <Upload {...icSm} />
            xlsx 올리기
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
        <p className="mt-4 text-[12px] text-label-3">
          {isProtectedSheet(parseSheetUrl(sheetLink)?.spreadsheetId)
            ? '지금 연결: 운영 팀 시트(읽기 전용 · 저장 안 함)'
            : sheetLink === TASK_INPUT_SHEET_URL
              ? '지금 연결: 테스트 시트(운영 시트의 사본)'
              : `지금 연결: ${sheetLink}`}{' '}
          <button onClick={() => setLinkOpen((v) => !v)} className="font-medium text-accent hover:underline">
            시트 바꾸기
          </button>
        </p>
        {linkOpen && <SheetLinkForm value={linkInput} onChange={setLinkInput} onSubmit={() => connectSheet(linkInput)} onCancel={() => setLinkOpen(false)} />}
        {error && <ErrorBox error={error} onRetryAccount={() => loadFromSheet(true)} />}
      </div>
    )
  }

  const weekCols = data.weekCols.filter((w) => w.month >= period.start && w.month < period.start + period.months)
  const currentKey = currentWeekKey(data.weekCols, data.year, now)
  const q = query.trim().toLowerCase()
  // 새 과제는 그 L2의 마지막 줄 바로 아래에 보여 준다(저장하면 시트에서도 그 자리).
  // 새 과제는 우클릭한 행의 위/아래에(저장하면 시트에서도 그 자리)
  const ordered: ProgressRow[] = orderWithNewRows(
    tabRows,
    drafts.newRows.filter((n) => n.l1 === l1),
  )
  // 이 행이 든 구분(L2) 전체(필터와 상관없이 이 탭에서 이어진 같은 L2 줄)
  const groupRowsOf = (row: ProgressRow): ProgressRow[] => {
    const i = ordered.findIndex((r) => r.key === row.key)
    if (i < 0) return [row]
    let a = i
    let b = i
    while (a > 0 && ordered[a - 1].l2 === row.l2) a--
    while (b < ordered.length - 1 && ordered[b + 1].l2 === row.l2) b++
    return ordered.slice(a, b + 1)
  }
  const deletedSet = new Set(drafts.deleted ?? [])
  const fieldIds = data.fields.map((f) => f.id)
  const viewOf = (row: ProgressRow): ScheduleRowView => {
    const e = row.isNew ? undefined : edits[row.key]
    const vals: Record<string, string> = {}
    for (const id of fieldIds) vals[id] = effectiveField(row, e, id)
    const bg: Record<string, string> = {}
    for (const id of fieldIds) {
      const hex = effectiveBg(row, e, id)
      if (hex) bg[id] = hex
    }
    const notes: Record<string, string> = {}
    for (const k of new Set([...Object.keys(row.notes), ...Object.keys(e?.notes ?? {})])) {
      const n = effectiveNote(row, e, k)
      if (n) notes[k] = n
    }
    return {
      row,
      cells: effectiveCells(row, e),
      vals,
      bg,
      notes,
      editedCells: new Set(Object.keys(e?.cells ?? {})),
      editedFields: new Set([...Object.keys(e?.fields ?? {}), ...Object.keys(e?.bg ?? {}), ...Object.keys(e?.notes ?? {})]),
      deleted: deletedSet.has(row.key),
    }
  }
  // 필터에서 쓰는 칸 값: 담당자는 사람마다 따로, 빈 칸은 "(빈 칸)"
  const filterValuesOf = (f: FieldDef, vals: Record<string, string>): string[] => {
    const v = (vals[f.id] ?? '').trim()
    if (f.kind === 'person') {
      const ps = splitPeople(v)
      return ps.length ? ps : ['(빈 칸)']
    }
    return [v ? v.replace(/\s*\n\s*/g, ' · ') : '(빈 칸)']
  }
  const fieldById = new Map(data.fields.map((f) => [f.id, f]))
  const allViews = ordered.map(viewOf)
  const passes = (v: ScheduleRowView, skip?: string) =>
    Object.entries(filters).every(([id, hidden]) => {
      const f = fieldById.get(id)
      if (!f || id === skip || hidden.length === 0) return true
      return filterValuesOf(f, v.vals).some((x) => !hidden.includes(x))
    })
  const views: ScheduleRowView[] = allViews.filter((v) => {
    if (v.row.isNew) return true
    if (!passes(v)) return false
    if (q && !`${v.row.l2} ${v.vals.name} ${v.vals.assignees ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
  // 필터 목록: 다른 열 필터를 통과한 행의 값과 개수(구글시트처럼)
  const filterOptions = (f: FieldDef) => {
    const count = new Map<string, number>()
    for (const v of allViews) {
      if (v.row.isNew || !passes(v, f.id)) continue
      for (const x of filterValuesOf(f, v.vals)) count.set(x, (count.get(x) ?? 0) + 1)
    }
    for (const x of filters[f.id] ?? []) if (!count.has(x)) count.set(x, 0)
    return Array.from(count, ([value, c]) => ({ value, count: c })).sort((a, b) =>
      a.value === '(빈 칸)' ? 1 : b.value === '(빈 칸)' ? -1 : a.value.localeCompare(b.value, 'ko'),
    )
  }
  const sheetColors = Array.from(new Set(data.rows.flatMap((r) => Object.values(r.bg)))).slice(0, 20)
  const activeFilters = Object.values(filters).filter((h) => h.length > 0).length
  // 입력 칸 제안값: 시스템 선택지 + 시트에 이미 있는 값(서로 다른 값이 너무 많으면 제안하지 않음)
  const optionsOf = (f: FieldDef): string[] => {
    if (f.kind === 'memo' || f.kind === 'date' || f.id === 'name') return []
    if (f.kind === 'person') return people
    const seen = new Set<string>(f.options ?? [])
    for (const r of data.rows) {
      const v = r.values[f.id]
      if (v && v.length <= 30) seen.add(v)
    }
    return seen.size <= 60 ? Array.from(seen).sort((a, b) => a.localeCompare(b, 'ko')) : []
  }
  const editCount = countDrafts(drafts)
  const protectedSheet = isProtectedSheet(data.spreadsheetId)
  const canSave = !!data.spreadsheetId && data.sheetGid !== null && isSheetsApiConfigured() && !protectedSheet

  return (
    <div>
      {linkOpen && (
        <SheetLinkForm
          value={linkInput}
          onChange={setLinkInput}
          onSubmit={() => connectSheet(linkInput)}
          onReset={sheetLink !== TASK_INPUT_SHEET_URL ? () => connectSheet(TASK_INPUT_SHEET_URL) : undefined}
          onCancel={() => setLinkOpen(false)}
        />
      )}
      {error && <ErrorBox error={error} onRetryAccount={() => loadFromSheet(true)} />}
      {message && <p className="mt-3 rounded-card bg-success/10 px-3 py-2 text-[13px] text-success">{message}</p>}

      {/* L1 탭 + 오른쪽에 연결된 시트(과제관리와 같은 모양) */}
      <div className="flex items-end gap-2 border-b border-separator">
        <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {l1s.map((name) => {
            const n = data.rows.filter((r) => r.l1 === name).length
            const on = name === l1
            return (
              <button
                key={name}
                onClick={() => setActiveL1(name)}
                className={`flex shrink-0 items-center gap-1.5 rounded-t-[9px] border border-b-0 px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  on ? '-mb-px border-separator bg-white text-label' : 'border-transparent bg-black/[0.04] text-label-2 hover:bg-black/[0.07] hover:text-label'
                }`}
              >
                {name === NO_L1 ? 'L1 없음' : name}
                <span className="text-[11px] font-medium text-label-3">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="shrink-0 pb-1.5">
          <SheetLinkChip
            label={data.fileTitle || data.source}
            sub={data.fileTitle ? data.tabTitle : undefined}
            meta={
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-label-2" title={`${fmt(data.fetchedAt)} 불러옴`}>
                  {timeAgo(data.fetchedAt)}
                </span>
                {protectedSheet && (
                  <span className="mac-badge bg-black/[0.06] text-label-2" title="운영 중인 팀 시트라 읽기만 하고 저장하지 않습니다">
                    읽기 전용
                  </span>
                )}
              </span>
            }
            currentUrl={data.spreadsheetId ? sheetUrl(data.spreadsheetId, data.sheetGid ?? undefined) : null}
            openUrl={data.spreadsheetId ? withGoogleAccount(sheetUrl(data.spreadsheetId, data.sheetGid ?? undefined)) : null}
            note="다른 시트 링크를 넣고 연결하면 그 시트의 「YYYY 추진현황」 탭을 읽고, 저장도 그 시트에 합니다. 운영 팀 시트는 읽기만 합니다."
            onConnect={(url) => connectSheet(url)}
            onReload={isSheetsApiConfigured() && data.spreadsheetId ? () => loadFromSheet() : undefined}
            reloadDisabled={saving}
            reloading={loading}
            extra={
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading || saving}
                className="flex items-center gap-1 text-[12px] font-medium text-label-2 hover:text-accent disabled:opacity-40"
                title="시트에서 파일 › 다운로드 › xlsx로 받은 파일(보기 전용)"
              >
                <Upload {...icSm} />
                xlsx 파일로 보기
              </button>
            }
          />
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
        </div>
      </div>

      {/* 도구 한 줄: 찾기·거르기 │ 보기(지브라·글자) │ 범례(입력 중엔 칠하기 도구) │ 되돌리기·저장·과제 추가·입력하기 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        <label className="relative">
          <Search {...icSm} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-label-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="L2 · L3 · 담당자 찾기"
            className="h-8 w-48 rounded-control border border-hairline pl-7 pr-2"
          />
        </label>
        {activeFilters > 0 && (
          <button
            onClick={() => setFilters({})}
            className="flex h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[12px] font-medium text-accent"
            title="머리글 필터 모두 해제"
          >
            필터 {activeFilters} ✕
          </button>
        )}
        {!(period.start === 1 && period.months === 12) && (
          <button
            onClick={() => setPeriod({ start: 1, months: 12 })}
            className="flex h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[12px] font-medium text-accent"
            title="일정 기간을 전체로(일정 머리글 우클릭으로 바꿀 수 있음)"
          >
            기간 {periodLabel(period)} ✕
          </button>
        )}
        <span className="h-5 w-px shrink-0 bg-separator" />
        <button
          onClick={() => setZebra(!zebra)}
          title={zebra ? '지브라 끄기(행 흰색)' : '지브라 켜기(한 줄씩 연한 회색)'}
          aria-pressed={zebra}
          className={`flex h-8 w-8 items-center justify-center rounded-control border ${zebra ? 'border-accent bg-accent-soft text-accent' : 'border-hairline text-label-2 hover:bg-black/[0.04]'}`}
        >
          <Rows3 {...ic} />
        </button>
        <span className="flex overflow-hidden rounded-control border border-hairline" title={`표 글자 크기 ${fontSize}px`}>
          <button
            onClick={() => setFontSize(fontSize + 1)}
            disabled={fontSize >= 18}
            className="flex h-8 items-center gap-0.5 px-2 text-[15px] font-semibold text-label hover:bg-black/[0.04] disabled:opacity-30"
            aria-label="표 글자 크게"
          >
            가<span className="text-[9px] text-accent">▲</span>
          </button>
          <button
            onClick={() => setFontSize(fontSize - 1)}
            disabled={fontSize <= 10}
            className="flex h-8 items-center gap-0.5 border-l border-hairline px-2 text-[12px] font-semibold text-label hover:bg-black/[0.04] disabled:opacity-30"
            aria-label="표 글자 작게"
          >
            가<span className="text-[9px] text-accent">▼</span>
          </button>
        </span>
        <span className="h-5 w-px shrink-0 bg-separator" />
        {/* 입력하기 · 범례(입력 중엔 칠하기 도구): 색 아이콘만, 이름은 마우스를 올리면 */}
        <Button
          variant={editing ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setEditing((v) => !v)}
          title="주차 칸 칠하기 켜기/끄기(칸 입력은 언제든 칸을 눌러서)"
        >
          <Pencil {...icSm} />
          {editing ? '입력 끝내기' : '입력하기'}
        </Button>
        <span className="flex items-center gap-1">
          {editing ? (
            <>
              {(
                [
                  ['plan', '계획(회색) 칠하기'],
                  ['actual', '실적(분홍) 칠하기'],
                  ['erase', '지우개'],
                ] as const
              ).map(([c, label]) => (
                <button
                  key={c}
                  onClick={() => setTool(c)}
                  title={
                    c === 'erase'
                      ? '지우개 · 누르거나 끌어서 칸을 비움(남은 묶음의 S/F는 다시 맞춤)'
                      : `${label} · 누르거나 끌어서 칠함(첫 칸 S${c === 'plan' ? ', 끝 칸 F' : ''} 자동) · 같은 칸을 다시 누르면 S → ${c === 'plan' ? 'F' : '완'} → 지움`
                  }
                  aria-label={label}
                  className={`flex h-8 w-8 items-center justify-center rounded-control border ${tool === c ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-hairline hover:bg-black/[0.05]'}`}
                >
                  {c === 'erase' ? <Eraser size={17} strokeWidth={1.75} className="text-label-2" /> : <CellSwatch cell={{ m: '', f: c }} size={18} />}
                </button>
              ))}
            </>
          ) : (
            <>
              {LEGEND.map((t) => (
                <span key={t} title={cellLabel(TOOL_CELL[t])} className="flex h-8 w-8 items-center justify-center rounded-control border border-hairline">
                  <CellSwatch cell={TOOL_CELL[t]} size={18} />
                </span>
              ))}
              <span title="현재 주" className="flex h-8 w-5 items-center justify-center">
                <span className="h-4 border-l border-dashed border-[#E8342A]" />
              </span>
              <span title="고쳤지만 아직 저장 안 한 칸" className="flex h-8 w-5 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              </span>
            </>
          )}
          {scheduleMode === 'hidden' && (
            <Button variant="secondary" size="sm" onClick={() => setScheduleMode('full')} title="숨긴 일정 열기(전체 펴기)">
              <CalendarRange {...icSm} />
              일정 열기
            </Button>
          )}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="flex items-center">
            <IconButton onClick={undo} disabled={past.current.length === 0} title="되돌리기 (⌘Z)" aria-label="되돌리기">
              <Undo2 {...ic} />
            </IconButton>
            <IconButton onClick={redo} disabled={future.current.length === 0} title="다시 하기 (⌘⇧Z)" aria-label="다시 하기">
              <Redo2 {...ic} />
            </IconButton>
          </span>
          {editCount > 0 && (
            <>
              <span className="whitespace-nowrap text-label-2" title="고친 내용과 새 과제는 구글시트에 저장하기 전까지 이 브라우저에만 남습니다">
                변경 <b className="text-orange-600">{editCount}</b>
              </span>
              <IconButton
                onClick={() => updateDrafts({ edits: {}, newRows: [] })}
                disabled={saving}
                title="모두 되돌리기 -- 고친 내용과 새 과제를 모두 지우고 시트 값으로"
                aria-label="모두 되돌리기"
              >
                <RotateCcw {...ic} />
              </IconButton>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmSave(true)}
                disabled={!canSave || saving}
                title={
                  canSave
                    ? '고친 칸을 연결된 시트에 씁니다'
                    : protectedSheet
                      ? '운영 중인 팀 시트에는 저장하지 않습니다. 위 "시트 바꾸기"로 테스트 시트를 연결하세요.'
                      : 'xlsx로 불러온 경우에는 시트에 저장할 수 없습니다. 구글시트에서 불러오세요.'
                }
              >
                {saving ? <Spinner className="h-3.5 w-3.5" /> : <CloudUpload {...icSm} />}
                구글시트에 저장
              </Button>
            </>
          )}
        </span>
      </div>

      <div className="mt-2 max-h-[calc(100vh-11.5rem)] overflow-auto rounded-[4px] border border-[#D3D3D3]">
        {
          <ScheduleTable
            weekCols={weekCols}
            rows={views}
            editing={editing}
            currentKey={currentKey}
            onPaint={paintCell}
            onField={setField}
            editNameKey={openKey}
            onDeleteRow={(row) => deleteRows([row])}
            onRestoreRow={(row) => restoreRows([row])}
            onDeleteGroup={(row) => deleteRows(groupRowsOf(row))}
            onRestoreGroup={(row) => restoreRows(groupRowsOf(row))}
            onAddGroup={addGroup}
            onRenameGroup={(row, name) => {
              const ids = new Set(groupRowsOf(row).map((r) => r.key.slice(NEW_PREFIX.length)))
              const { name: l2, tag } = splitL2(name)
              updateDrafts((d) => ({ ...d, newRows: d.newRows.map((n) => (ids.has(n.id) ? { ...n, l2, l2Tag: tag } : n)) }))
            }}
            onRevertRow={(row) =>
              updateDrafts((d) => {
                const next = { ...d.edits }
                delete next[row.key]
                return { ...d, edits: next }
              })
            }
            onAddRow={addRow}
            fontSize={fontSize}
            fields={data.fields}
            optionsOf={optionsOf}
            headerStyle={data.headerStyle}
            scheduleMode={scheduleMode}
            onToggleSchedule={() => setScheduleMode(scheduleMode === 'full' ? 'compact' : 'full')}
            onScheduleMenu={(e) => setSchMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: Math.min(e.clientY, window.innerHeight - 380) })}
            allWeekCols={data.weekCols}
            onBg={setBg}
            onNote={setNote}
            zebra={zebra}
            sheetColors={sheetColors}
            filterOptions={filterOptions}
            hiddenOf={(id) => filters[id] ?? []}
            onFilter={(id, hidden) => setFilters((cur) => ({ ...cur, [id]: hidden }))}
            widths={widths}
            onResize={resizeCol}
          />
        }
      </div>
      {schMenu && (
        <div
          className="fixed inset-0 z-50"
          onMouseDown={() => setSchMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setSchMenu(null)
          }}
        >
          <div className="mac-pop absolute w-[220px] py-1 text-[13px]" style={{ left: schMenu.x, top: schMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-label-3">일정 보기</p>
            {(
              [
                ['full', '전체 펴기'],
                ['compact', '줄여보기'],
                ['hidden', '숨기기'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => {
                  setScheduleMode(m)
                  setSchMenu(null)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]"
              >
                <span className="w-3 text-accent">{scheduleMode === m ? '✓' : ''}</span>
                {label}
              </button>
            ))}
            <div className="mac-menu-sep" />
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold text-label-3">기간</p>
            {/* 전체·상반기·하반기 │ 1~4분기 │ 1~12월(한 줄이 한 분기) */}
            {(
              [
                [PERIOD_BUTTONS, 'grid-cols-3'],
                [QUARTERS, 'grid-cols-4'],
                [MONTHS, 'grid-cols-3'],
              ] as const
            ).map(([list, cols], gi) => (
              <div key={gi}>
                {gi > 0 && <div className="mac-menu-sep" />}
                <div className={`grid ${cols} gap-1 px-2 py-1`}>
                  {list.map(({ label, p }) => {
                    const on = period.start === p.start && period.months === p.months
                    return (
                      <button
                        key={label}
                        onClick={() => {
                          setPeriod(p)
                          if (scheduleMode === 'hidden') setScheduleMode(lastShownMode.current)
                          setSchMenu(null)
                        }}
                        className={`h-7 rounded-control text-[12px] ${on ? 'bg-label font-semibold text-white' : 'text-label-2 hover:bg-black/[0.05]'}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSave}
        title="구글시트에 저장"
        message={`저장 안 한 변경 ${editCount}건${drafts.newRows.length ? `(새 과제 ${drafts.newRows.length}건 포함)` : ''}${drafts.deleted?.length ? `, 지울 과제 ${drafts.deleted.length}건` : ''}을 아래 시트에 씁니다. 처음 한 번은 구글 시트 편집 권한을 허용해야 합니다.`}
        confirmLabel="저장"
        tone="accent"
        onConfirm={saveToSheet}
        onCancel={() => setConfirmSave(false)}
      >
        {/* 어느 파일·탭에 쓰는지 크게 보여 줘 다른 시트에 쓰는 실수를 막는다 */}
        <div className="mt-3 rounded-card border border-separator bg-[#F7F7F9] px-3 py-2.5">
          <p className="text-[11px] font-medium text-label-3">저장할 곳</p>
          <p className="mt-0.5 break-all text-[14px] font-bold text-label">
            {data.fileTitle || '(시트 이름 없음)'} <span className="text-label-3">›</span> {data.tabTitle}
          </p>
          {drafts.newRows.length > 0 && <p className="mt-1 text-[12px] text-label-2">새 과제·새 구분은 화면에 보이는 자리에 줄을 넣어 씁니다.</p>}
          {(drafts.deleted?.length ?? 0) > 0 && (
            <p className="mt-1 text-[12px] font-semibold text-danger">삭제로 표시한 과제 {drafts.deleted!.length}건은 시트에서 그 줄을 지웁니다.</p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  )
}

function SheetLinkForm({
  value,
  onChange,
  onSubmit,
  onReset,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onReset?: () => void
  onCancel?: () => void
}) {
  return (
    <div className="mt-3 rounded-card border border-separator bg-[#F7F7F9] p-3 text-left text-[13px]">
      <p className="font-semibold text-label">불러오고 저장할 구글시트</p>
      <p className="mt-0.5 text-label-2">
        기본은 운영 시트의 사본(테스트 시트)입니다. 다른 시트를 쓰려면 링크를 붙여 넣으세요. 「YYYY 추진현황」 탭을 찾아 읽고, 저장도 그 시트에만 합니다. 운영
        팀 시트는 연결해도 읽기만 합니다.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="mt-2 flex flex-wrap gap-2"
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="h-8 min-w-[320px] flex-1 rounded-control border border-hairline bg-white px-2.5"
        />
        <Button variant="primary" size="sm" type="submit" disabled={!value.trim()}>
          연결
        </Button>
        {onReset && (
          <Button variant="secondary" size="sm" type="button" onClick={onReset}>
            기본 테스트 시트로 되돌리기
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
            닫기
          </Button>
        )}
      </form>
    </div>
  )
}

function ErrorBox({ error, onRetryAccount }: { error: string; onRetryAccount: () => void }) {
  return (
    <div className="mt-3 rounded-card bg-danger/[0.06] px-3 py-2 text-left text-[13px] text-danger">
      {error}
      <button onClick={onRetryAccount} className="ml-2 font-medium underline">
        다른 계정으로 다시 시도
      </button>
    </div>
  )
}

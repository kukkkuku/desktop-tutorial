// 과제 입력 › 추진현황 -- 구글시트 「YYYY 추진현황」 탭을 통째로 읽어 L1마다 탭을 만들고,
// 탭마다 일정표(구분=L2, 항목=L3, 월·주 칸)를 시트와 같은 색으로 그린다.
// 입력한 칸은 "구글시트에 저장"으로 시트의 같은 칸(글자 + 배경색)에 쓴다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTabFit } from '../../hooks/useTabFit'
import { SHEET_ADMIN_ONLY, useCanManageSheets } from '../../hooks/useSheetManager'
import YearSwitcher from './YearSwitcher'
import {
  CalendarRange,
  CloudUpload,
  Eraser,
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  Send,
  Settings2,
  UnfoldVertical,
  FileDown,
  FoldVertical,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
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
  type XlsxBook,
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
  newRowAsRow,
  orderWithNewRows,
  progressYearTabs,
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
import { downloadProgressExcel } from '../../utils/progressExport'
import SheetImportPanel from '../work/SheetImportPanel'
import { AppProvider } from '../../state/AppContext'
import { useAppMode } from '../../state/AppMode'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { withGoogleAccount } from '../../utils/googleDrive'
import ScheduleTable, { CellSwatch, HEAD_DEFAULT, cellLabel, type ScheduleMode, type ScheduleRowView } from './ScheduleTable'
import ColorPalette from './ColorPalette'

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
// pick을 주면 그 탭(지난 연도 보기), 없으면 올해 탭을 읽는다.
async function readFromSheet(spreadsheetId: string, year: number, pick?: string): Promise<ProgressData> {
  const { title: fileTitle, tabs } = await fetchSpreadsheetTabs(spreadsheetId)
  const title = pick ?? pickDefaultTab(tabs, year)
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
  return {
    ...toData(parsed, raw, { spreadsheetId, source: title, tabTitle: title, sheetGid: tab.sheetId }),
    fileTitle,
    yearTabs: progressYearTabs(tabs.map((t) => t.title)),
  }
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

  // L1 탭: 시트 순서 + 새로 만든 L1(기준 행의 L1 바로 뒤)
  const l1s = useMemo(() => {
    const list = Array.from(new Set((data?.rows ?? []).map((r) => r.l1)))
    for (const n of drafts.newRows) {
      if (list.includes(n.l1)) continue
      const k = n.anchor?.key
      const a = k ? ((data?.rows ?? []).find((r) => r.key === k)?.l1 ?? drafts.newRows.find((x) => NEW_PREFIX + x.id === k)?.l1) : undefined
      const i = a ? list.indexOf(a) : -1
      list.splice(i >= 0 ? i + 1 : list.length, 0, n.l1)
    }
    return list
  }, [data, drafts.newRows])
  const [exportOpen, setExportOpen] = useState(false) // 성과관리 과제리스트로 내보내기 창
  const { setMode } = useAppMode()
  // 보낼 곳: 성과관리 프로젝트(팀 · 평가기간). 기본은 지금 성과관리에서 열려 있는 것, 없으면 최근에 고친 것
  const { workspaces, currentWorkspaceId } = useWorkspaces()
  const [exportTo, setExportTo] = useState<string>('')
  // 내보내기 창이 읽는 추진현황(저장 안 한 변경 포함) -- 창을 연 동안 같은 것을 쓴다
  const exportSource = useMemo(() => (exportOpen && data ? { data, drafts } : null), [exportOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const defaultTarget = currentWorkspaceId ?? [...workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? ''
  const target = workspaces.some((w) => w.id === exportTo) ? exportTo : defaultTarget
  const [tabAdd, setTabAdd] = useState<{ l1: string; l2: string; x: number; y: number } | null>(null)
  const [activeL1, setActiveL1] = useState<string | null>(null)
  // 보기: 숨긴 그룹(L1) 탭 -- 시트는 그대로, 이 브라우저에서만 안 보이게
  const [hiddenL1, setHiddenL1State] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('progress-board:hidden-l1') ?? '[]')
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  })
  function setHiddenL1(next: string[]) {
    setHiddenL1State(next)
    try {
      localStorage.setItem('progress-board:hidden-l1', JSON.stringify(next))
    } catch {
      // 기억 못 해도 지금 화면엔 반영
    }
  }
  const [viewOpen, setViewOpen] = useState<{ x: number; y: number } | null>(null)
  const shownL1s = l1s.filter((x) => !hiddenL1.includes(x))
  const l1 = activeL1 && shownL1s.includes(activeL1) ? activeL1 : (shownL1s[0] ?? l1s[0] ?? null)
  // 브라우저 탭처럼 줄어드는 L1 탭 줄(좁으면 개수를 숨기고 여백을 줄임)
  const tabStripRef = useRef<HTMLDivElement>(null)
  const tabsCompact = useTabFit(tabStripRef, shownL1s.length + 1)
  // 고른 탭이 가려져 있으면 보이게 옮긴다(새 탭을 만든 직후 등)
  useEffect(() => {
    if (!l1) return
    document.querySelector(`[data-l1-tab="${CSS.escape(l1)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [l1])

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
  const [schMenu, setSchMenuState] = useState<{ x: number; y: number } | null>(null)
  const setSchMenu = (v: { x: number; y: number } | null) => {
    setSchMenuState(v)
    setSchPalette(false)
  }
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

  // 머리글 색(우클릭으로 바꿈) -- 이 브라우저에 기억
  const [headColors, setHeadColors] = useState<Record<string, string>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('progress-board:head-colors') ?? '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  function setHeadColor(key: string, hex: string) {
    setHeadColors((cur) => {
      const next = { ...cur }
      if (hex) next[key] = hex
      else delete next[key]
      try {
        localStorage.setItem('progress-board:head-colors', JSON.stringify(next))
      } catch {
        // 기억 못 해도 지금 화면엔 반영
      }
      return next
    })
  }
  const [schPalette, setSchPalette] = useState(false)

  // 행간(칸 위아래 여백 0~8px) -- 이 브라우저에 기억
  const [rowPad, setRowPadState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('progress-board:row-pad'))
      return v >= 0 && v <= 8 ? v : 0
    } catch {
      return 0
    }
  })
  function setRowPad(v: number) {
    const n = Math.max(0, Math.min(8, v))
    setRowPadState(n)
    try {
      localStorage.setItem('progress-board:row-pad', String(n))
    } catch {
      // 기억 못 해도 지금 화면에는 반영
    }
  }

  function accept(next: ProgressData) {
    leaveArchive()
    setData(next)
    saveProgressData(next)
    setError('')
  }

  // 지난 연도 보기(보기 전용): 올해 데이터와 고친 내용은 옆에 맡겨 두고, 지난 연도 탭을 그대로 보여 준다.
  // 이 동안 고친 내용은 브라우저 저장에도 손대지 않는다(돌아오면 그대로).
  const [archive, setArchiveState] = useState<{ data: ProgressData; drafts: Drafts } | null>(null)
  const archiveRef = useRef(archive)
  function setArchive(v: { data: ProgressData; drafts: Drafts } | null) {
    archiveRef.current = v
    setArchiveState(v)
  }
  const readOnly = archive !== null
  const bookRef = useRef<XlsxBook | null>(null) // xlsx로 불러왔을 때 지난 연도 탭을 읽는 데 씀(이 화면에서만)
  const [yearLoading, setYearLoading] = useState(false)
  function leaveArchive() {
    const a = archiveRef.current
    if (!a) return
    draftsRef.current = a.drafts
    setDrafts(a.drafts)
    setArchive(null)
  }
  async function viewYear(title: string) {
    if (!data) return
    const cur = archiveRef.current ?? { data, drafts: draftsRef.current }
    if (title === cur.data.tabTitle) {
      // 올해로 돌아가기
      if (archiveRef.current) {
        setData(cur.data)
        leaveArchive()
      }
      return
    }
    setYearLoading(true)
    setError('')
    try {
      let past: ProgressData
      if (cur.data.spreadsheetId) past = await readFromSheet(cur.data.spreadsheetId, now.getFullYear(), title)
      else {
        const sheet = bookRef.current?.sheets.find((x) => x.title === title)
        if (!sheet) throw new Error('지난 연도를 보려면 xlsx 파일을 다시 올려 주세요.')
        const parsed = parseSheet(sheet)
        if ('error' in parsed) throw new Error(parsed.error)
        past = { ...toData(parsed, sheet, { spreadsheetId: null, source: sheet.title, tabTitle: sheet.title, sheetGid: null }), yearTabs: cur.data.yearTabs }
      }
      setArchive(cur)
      draftsRef.current = { edits: {}, newRows: [] }
      setDrafts(draftsRef.current)
      setData(past)
      setEditing(false)
      setFilters({})
      setActiveL1(null)
      setOpenKey(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : `「${title}」 탭을 읽지 못했습니다.`)
    } finally {
      setYearLoading(false)
    }
  }

  // 시트 연결을 바꾸는 것(링크 · xlsx)은 관리자만
  const canManage = useCanManageSheets()
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
      bookRef.current = book
      const title = pickDefaultTab(
        book.sheets.map((s) => ({ title: s.title, hidden: !!s.hidden })),
        now.getFullYear(),
      )
      const sheet = book.sheets.find((s) => s.title === title)
      if (!sheet) throw new Error('파일에서 「추진현황」 탭을 찾지 못했습니다.')
      const parsed = parseSheet(sheet)
      if ('error' in parsed) throw new Error(parsed.error)
      accept({
        ...toData(parsed, sheet, { spreadsheetId: null, source: `${file.name} · ${sheet.title}`, tabTitle: sheet.title, sheetGid: null }),
        yearTabs: progressYearTabs(book.sheets.map((x) => x.title)),
      })
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
    if (archiveRef.current) return // 지난 연도는 보기 전용
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
    if (archiveRef.current) return
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(draftsRef.current)
    lastStep.current = { kind: '', at: 0 }
    applyDrafts(prev)
  }
  function redo() {
    if (archiveRef.current) return
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
  // 새 탭(L1): 지금 탭의 맨 아래 뒤에 새 L1 · 첫 구분(L2) · 빈 과제 한 줄
  function addTab(name: string, l2name: string) {
    if (!data || !l1) return
    const cur = orderWithNewRows(
      data.rows.filter((r) => r.l1 === l1),
      drafts.newRows.filter((n) => n.l1 === l1),
      drafts.moves,
    )
    const last = cur[cur.length - 1]
    const g = makeNewGroup(l2name, { l1: name, h: last?.h ?? null }, { key: last?.key ?? '', where: 'below' })
    updateDrafts((d) => ({ ...d, newRows: [...d.newRows, g] }))
    setActiveL1(name)
    setOpenKey(NEW_PREFIX + g.id)
  }
  // 줄 옮기기(같은 구분 안에서): 새 과제는 기준 줄만 바꾸고, 시트 과제는 옮기기로 적어 둔다(저장하면 시트에서 줄을 옮김)
  function moveRow(row: ProgressRow, target: ProgressRow, where: 'above' | 'below') {
    if (row.key === target.key) return
    updateDrafts((d) => {
      if (row.isNew) {
        const nid = row.key.slice(NEW_PREFIX.length)
        const n = d.newRows.find((x) => x.id === nid)
        if (!n) return d
        // 새 과제는 목록 맨 뒤로 보내 이번 기준이 마지막에 적용되게 한다
        return { ...d, newRows: [...d.newRows.filter((x) => x.id !== nid), { ...n, anchor: { key: target.key, where } }] }
      }
      return { ...d, moves: [...(d.moves ?? []).filter((m) => m.key !== row.key), { key: row.key, anchor: { key: target.key, where } }] }
    })
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
      const { writes, unmergeFirst, moves, deletes, inserts, after, remerge, kept, conflicts } = buildSheetWrites(data, fresh, drafts)
      await writeSheetCells(data.spreadsheetId, data.sheetGid, { writes, unmergeFirst, moves, deletes, inserts, after, remerge })
      // 저장한 뒤 시트를 다시 읽어 화면을 시트와 맞춘다.
      accept(await readFromSheet(data.spreadsheetId, data.year ?? now.getFullYear()))
      updateDrafts(kept)
      clearHistory()
      setOpenKey(null)
      setMessage(
        `구글시트에 저장했습니다 · 고친 칸 ${writes.length}${inserts.length ? ` · 새 과제 ${inserts.length}건` : ''}${deletes.length ? ` · 지운 과제 ${deletes.length}건` : ''}${moves.length ? ` · 옮긴 줄 ${moves.length}` : ''}.` +
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
      <>
        <MenuSlot>
          <YearSwitcher title={`${now.getFullYear()} 추진현황`} tabs={[]} editableTitle={`${now.getFullYear()} 추진현황`} onPick={() => {}} />
        </MenuSlot>
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
            {canManage && (
              <Button
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                title="시트에서 파일 › 다운로드 › xlsx로 받은 파일(보기 전용)"
              >
                <Upload {...icSm} />
                xlsx 올리기
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
          <p className="mt-4 text-[12px] text-label-3">
            {isProtectedSheet(parseSheetUrl(sheetLink)?.spreadsheetId)
              ? '지금 연결: 운영 팀 시트(읽기 전용 · 저장 안 함)'
              : sheetLink === TASK_INPUT_SHEET_URL
                ? '지금 연결: 테스트 시트(운영 시트의 사본)'
                : `지금 연결: ${sheetLink}`}{' '}
            {canManage ? (
              <button onClick={() => setLinkOpen((v) => !v)} className="font-medium text-accent hover:underline">
                시트 바꾸기
              </button>
            ) : (
              <span>· 시트 연결은 관리자가 정합니다</span>
            )}
          </p>
          {canManage && linkOpen && (
            <SheetLinkForm value={linkInput} onChange={setLinkInput} onSubmit={() => connectSheet(linkInput)} onCancel={() => setLinkOpen(false)} />
          )}
          {error && <ErrorBox error={error} onRetryAccount={() => loadFromSheet(true)} />}
        </div>
      </>
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
    drafts.moves,
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
      <MenuSlot>
        <YearSwitcher
          title={data.tabTitle}
          tabs={data.yearTabs ?? [data.tabTitle]}
          editableTitle={archive?.data.tabTitle ?? data.tabTitle}
          loading={yearLoading}
          disabled={loading || saving}
          onPick={(t) => void viewYear(t)}
        />
      </MenuSlot>
      {canManage && linkOpen && (
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

      {/* 연도 ▾ + L1 탭(과제관리와 같은 모양: 마우스를 올리면 ×로 삭제, 끝의 +로 추가) + 오른쪽에 연결된 시트 */}
      <div className="flex items-end gap-2 shadow-[inset_0_-1px_0_#E3E3E8]">
        {/* 브라우저 탭처럼: 폭이 모자라면 탭이 함께 줄고 이름은 말줄임(가려지거나 옆으로 밀리지 않게) */}
        <div ref={tabStripRef} className="flex min-w-0 flex-1 items-end gap-1 overflow-hidden pt-1">
          {shownL1s.map((name) => {
            const rowsOf = data.rows.filter((r) => r.l1 === name)
            const newOf = drafts.newRows.filter((n) => n.l1 === name)
            const alive = rowsOf.filter((r) => !deletedSet.has(r.key)).length + newOf.length
            const gone = alive === 0 && rowsOf.length > 0
            const on = name === l1
            return (
              <div
                key={name}
                onClick={() => setActiveL1(name)}
                data-l1-tab={name}
                className={`group flex min-w-[44px] max-w-[240px] flex-[0_1_auto] cursor-pointer select-none items-center overflow-hidden rounded-t-[9px] border py-2 text-[13px] font-semibold transition-colors ${
                  tabsCompact ? 'gap-1 px-2' : 'gap-1.5 px-3.5'
                } ${
                  on
                    ? 'border-[#E3E3E8] border-b-white bg-white text-label'
                    : 'border-transparent bg-black/[0.04] text-label-2 hover:bg-black/[0.07] hover:text-label'
                }`}
                title={gone ? `${name} · 삭제로 표시함(저장하면 시트에서 지움)` : name}
              >
                {newOf.length > 0 && rowsOf.length === 0 && <span className="shrink-0 rounded-[3px] bg-accent px-1 text-[10px] font-bold text-white">새</span>}
                <span className={`min-w-0 truncate break-all ${gone ? 'text-label-3 line-through' : ''}`}>{name === NO_L1 ? 'L1 없음' : name}</span>
                {!tabsCompact && <span className="shrink-0 text-[11px] font-medium text-label-3">{alive}</span>}
                {!readOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (gone) restoreRows(rowsOf)
                      else deleteRows([...rowsOf, ...newOf.map(newRowAsRow)])
                    }}
                    title={gone ? '그룹(L1) 삭제 취소' : `그룹(L1) 삭제 · 과제 ${alive}건(저장하면 시트에서 줄을 지움)`}
                    aria-label={gone ? '그룹 삭제 취소' : '그룹 삭제'}
                    className={`-mr-1.5 h-5 w-5 shrink-0 items-center justify-center rounded text-label-3 hover:bg-black/[0.07] hover:text-label ${
                      on || gone ? 'flex' : 'hidden group-hover:flex'
                    }`}
                  >
                    {gone ? <Undo2 size={12} strokeWidth={2} /> : <X size={12} strokeWidth={2} />}
                  </button>
                )}
              </div>
            )
          })}
          {!readOnly && (
            <button
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setTabAdd({ l1: '', l2: '', x: Math.min(r.left, window.innerWidth - 330), y: r.bottom + 4 })
              }}
              title="그룹(L1) 추가"
              className="flex shrink-0 items-center gap-1 rounded-t-[9px] px-3 py-2 text-[13px] font-semibold text-label-3 hover:bg-black/[0.05] hover:text-label"
            >
              <Plus {...icSm} />
              그룹 추가
            </button>
          )}
        </div>
        {/* 지금 그룹(L1)을 성과관리 과제리스트로 내보내기(성과관리의 구글시트 연결과 같은 화면이 열린다) */}
        <div className="shrink-0 pb-1.5">
          <IconButton
            onClick={() => setExportOpen(true)}
            disabled={!l1 || readOnly}
            title={
              data.spreadsheetId ? '그룹(L1)을 골라 성과관리 과제리스트로 내보내기' : '구글시트로 불러왔을 때만 내보낼 수 있습니다(xlsx로 불러온 경우 제외)'
            }
            aria-label="성과관리 과제리스트로 내보내기"
          >
            <Send {...icSm} />
          </IconButton>
        </div>
        {/* 보기: 표에서 열을 켜고 끄듯 그룹(L1) 탭을 켜고 끈다 */}
        <div className="relative shrink-0 pb-1.5">
          <IconButton
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setViewOpen(viewOpen ? null : { x: Math.min(r.left, window.innerWidth - 264), y: r.bottom + 4 })
            }}
            title="보이는 그룹 고르기"
            aria-label="보이는 그룹 고르기"
            className={viewOpen || hiddenL1.some((x) => l1s.includes(x)) ? 'bg-black/[0.05] text-label' : ''}
          >
            <Settings2 {...icSm} />
          </IconButton>
          {viewOpen && (
            <div className="fixed inset-0 z-40" onMouseDown={() => setViewOpen(null)}>
              <div
                className="mac-pop absolute z-50 max-h-[70vh] w-64 overflow-y-auto py-1 text-[13px]"
                style={{ left: viewOpen.x, top: viewOpen.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[12px] font-semibold text-label-2">보이는 그룹</span>
                  {hiddenL1.length > 0 && (
                    <button onClick={() => setHiddenL1([])} className="text-[12px] font-medium text-accent hover:underline">
                      모두 보기
                    </button>
                  )}
                </div>
                {l1s.map((name) => {
                  const shown = !hiddenL1.includes(name)
                  const last = shown && shownL1s.length === 1
                  return (
                    <label key={name} className={`flex items-center gap-2 px-3 py-1.5 ${last ? 'opacity-50' : 'cursor-pointer hover:bg-black/[0.04]'}`}>
                      <input
                        type="checkbox"
                        checked={shown}
                        disabled={last}
                        onChange={() => setHiddenL1(shown ? [...hiddenL1, name] : hiddenL1.filter((x) => x !== name))}
                      />
                      <span className="truncate">{name === NO_L1 ? 'L1 없음' : name}</span>
                      <span className="ml-auto text-[11px] text-label-3">
                        {data.rows.filter((r) => r.l1 === name).length + drafts.newRows.filter((n) => n.l1 === name).length}
                      </span>
                    </label>
                  )
                })}
                <p className="mt-1 border-t border-separator px-3 pt-1.5 text-[11px] leading-snug text-label-3">
                  숨겨도 시트에서는 지워지지 않습니다. 이 브라우저에서만 안 보입니다.
                </p>
              </div>
            </div>
          )}
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
            note={
              canManage
                ? '다른 시트 링크를 넣고 연결하면 그 시트의 「YYYY 추진현황」 탭을 읽고, 저장도 그 시트에 합니다. 운영 팀 시트는 읽기만 합니다.'
                : SHEET_ADMIN_ONLY
            }
            onConnect={canManage ? (url) => connectSheet(url) : undefined}
            onReload={isSheetsApiConfigured() && data.spreadsheetId ? () => loadFromSheet() : undefined}
            reloadDisabled={saving}
            reloading={loading}
            extra={
              canManage && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={loading || saving}
                  className="flex items-center gap-1 text-[12px] font-medium text-label-2 hover:text-accent disabled:opacity-40"
                  title="시트에서 파일 › 다운로드 › xlsx로 받은 파일(보기 전용)"
                >
                  <Upload {...icSm} />
                  xlsx 파일로 보기
                </button>
              )
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
        <span className="flex overflow-hidden rounded-control border border-hairline" title={`행간(칸 위아래 여백) ${rowPad}px`}>
          <button
            onClick={() => setRowPad(rowPad + 2)}
            disabled={rowPad >= 8}
            className="flex h-8 w-8 items-center justify-center text-label hover:bg-black/[0.04] disabled:opacity-30"
            aria-label="행간 넓게"
            title={`행간 넓게 (지금 ${rowPad}px)`}
          >
            <UnfoldVertical {...icSm} />
          </button>
          <button
            onClick={() => setRowPad(rowPad - 2)}
            disabled={rowPad <= 0}
            className="flex h-8 w-8 items-center justify-center border-l border-hairline text-label hover:bg-black/[0.04] disabled:opacity-30"
            aria-label="행간 좁게"
            title={`행간 좁게 (지금 ${rowPad}px)`}
          >
            <FoldVertical {...icSm} />
          </button>
        </span>
        <span className="h-5 w-px shrink-0 bg-separator" />
        {/* 입력하기 · 범례(입력 중엔 칠하기 도구): 색 아이콘만, 이름은 마우스를 올리면. 지난 연도는 보기 전용 표시 */}
        {readOnly ? (
          <span className="flex items-center gap-2 rounded-control bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-orange-800 ring-1 ring-orange-200">
            {data.tabTitle.replace(/추진현황/, '실적관리')} · 보기 전용
            <button
              onClick={() => archive && void viewYear(archive.data.tabTitle)}
              className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-accent hover:bg-white"
            >
              {archive?.data.tabTitle.replace(/추진현황/, '실적관리')}로 돌아가기
            </button>
          </span>
        ) : (
          <Button
            variant={editing ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setEditing((v) => !v)}
            title="주차 칸 칠하기 켜기/끄기(칸 입력은 언제든 칸을 눌러서)"
          >
            <Pencil {...icSm} />
            {editing ? '입력 끝내기' : '입력하기'}
          </Button>
        )}
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
              {/* 범례(누르는 버튼이 아님): 칸 모양 + 이름 */}
              {(
                [
                  ['계획', LEGEND.slice(0, 3), ['착수', '기간', '완료']],
                  ['실적', LEGEND.slice(3), ['착수', '진행', '완료']],
                ] as const
              ).map(([group, tools, names], gi) => (
                <span key={group} className={`flex items-center gap-2 text-[12px] text-label-2 ${gi ? 'border-l border-separator pl-2.5' : 'ml-1.5'}`}>
                  <span className="font-semibold text-label-3">{group}</span>
                  {tools.map((t, i) => (
                    <span key={t} className="flex items-center gap-1" title={cellLabel(TOOL_CELL[t])}>
                      <CellSwatch cell={TOOL_CELL[t]} size={16} />
                      {names[i]}
                    </span>
                  ))}
                </span>
              ))}
              <span className="flex items-center gap-1 border-l border-separator pl-2.5 text-[12px] text-label-2">
                <span className="h-4 border-l border-dashed border-[#E8342A]" />
                현재 주
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
          <span className={`flex items-center ${readOnly ? 'hidden' : ''}`}>
            <IconButton onClick={undo} disabled={past.current.length === 0} title="되돌리기 (⌘Z)" aria-label="되돌리기">
              <Undo2 {...ic} />
            </IconButton>
            <IconButton onClick={redo} disabled={future.current.length === 0} title="다시 하기 (⌘⇧Z)" aria-label="다시 하기">
              <Redo2 {...ic} />
            </IconButton>
          </span>
          <IconButton
            onClick={() => void downloadProgressExcel(data, drafts, l1s)}
            title={`엑셀 파일로 받기 -- 시트 모양 그대로(칸 색·메모 포함)${editCount ? ', 저장 안 한 변경도 반영' : ''}`}
            aria-label="엑셀 파일로 받기"
          >
            <FileDown {...ic} />
          </IconButton>
          {editCount > 0 && (
            <>
              <span
                className="flex items-center gap-1.5 whitespace-nowrap text-label-2"
                title="주황 점 = 고쳤지만 아직 저장 안 한 칸. 구글시트에 저장하기 전까지 이 브라우저에만 남습니다"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
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

      <div className="mt-2 max-h-[calc(100vh-11.5rem)] overflow-auto">
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
            onMoveRow={readOnly ? undefined : moveRow}
            fontSize={fontSize}
            rowPad={rowPad}
            readOnly={readOnly}
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
            headColors={headColors}
            onHeadColor={setHeadColor}
            filterOptions={filterOptions}
            hiddenOf={(id) => filters[id] ?? []}
            onFilter={(id, hidden) => setFilters((cur) => ({ ...cur, [id]: hidden }))}
            widths={widths}
            onResize={resizeCol}
          />
        }
      </div>
      {exportOpen && (
        // 성과관리의 가져오기 화면(추진현황에서)과 같은 화면 -- 보낼 프로젝트를 고르고 L2를 골라 바로 넣는다
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="flex h-[min(900px,92vh)] w-[min(1180px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[12px] bg-white shadow-dialog">
            <div className="flex items-start justify-between gap-4 border-b border-separator px-6 pb-3 pt-5">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-label">성과관리 과제리스트로 내보내기</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-label-2">보낼 곳</span>
                  {workspaces.length > 0 ? (
                    <select
                      value={target}
                      onChange={(e) => setExportTo(e.target.value)}
                      aria-label="보낼 성과관리 프로젝트"
                      className="h-8 rounded-control border border-hairline bg-white px-2 text-[13px] font-semibold text-label"
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.teamName} {w.evaluationYear} {w.periodName}
                          {w.id === currentWorkspaceId ? ' (지금 열린 프로젝트)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-label-2">
                      성과관리에 아직 프로젝트(팀 · 평가기간)가 없습니다.{' '}
                      <button onClick={() => setMode('perf')} className="font-semibold text-accent hover:underline">
                        성과관리에서 프로젝트 만들기
                      </button>
                    </span>
                  )}
                </div>
              </div>
              <IconButton onClick={() => setExportOpen(false)} aria-label="닫기" className="shrink-0">
                <X {...ic} />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {target && (
                <AppProvider key={target} workspaceId={target}>
                  <ExportTargetSync id={target} />
                  <SheetImportPanel
                    source="progress"
                    progress={exportSource}
                    verb="export"
                    initialL1s={l1 ? [l1] : undefined}
                    onCancel={() => setExportOpen(false)}
                    onDone={() => {
                      setExportOpen(false)
                      setMode('perf')
                    }}
                  />
                </AppProvider>
              )}
            </div>
          </div>
        </div>
      )}
      {tabAdd && (
        <div className="fixed inset-0 z-50" onMouseDown={() => setTabAdd(null)}>
          <form
            className="mac-pop absolute w-[320px] p-3"
            style={{ left: tabAdd.x, top: tabAdd.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              const name = tabAdd.l1.trim()
              if (!name || !tabAdd.l2.trim() || l1s.includes(name)) return
              addTab(name, tabAdd.l2.trim())
              setTabAdd(null)
            }}
          >
            <p className="text-[13px] font-semibold text-label">그룹(L1) 추가</p>
            <p className="mt-0.5 text-[11px] text-label-3">「{l1 === NO_L1 ? 'L1 없음' : l1}」 그룹 뒤에 넣습니다. 첫 구분(L2)과 과제 한 줄로 시작합니다.</p>
            <input
              autoFocus
              value={tabAdd.l1}
              onChange={(e) => setTabAdd({ ...tabAdd, l1: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && setTabAdd(null)}
              placeholder="L1 이름"
              className="mt-2 h-8 w-full rounded-control border border-hairline px-2 text-[13px]"
            />
            {l1s.includes(tabAdd.l1.trim()) && <p className="mt-1 text-[11px] text-danger">이미 있는 L1입니다.</p>}
            <input
              value={tabAdd.l2}
              onChange={(e) => setTabAdd({ ...tabAdd, l2: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && setTabAdd(null)}
              placeholder="첫 구분(L2) 이름 (태그는 끝에 [태그])"
              className="mt-1.5 h-8 w-full rounded-control border border-hairline px-2 text-[13px]"
            />
            <div className="mt-2.5 flex justify-end gap-1.5">
              <Button variant="secondary" size="sm" type="button" onClick={() => setTabAdd(null)}>
                취소
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={!tabAdd.l1.trim() || !tabAdd.l2.trim() || l1s.includes(tabAdd.l1.trim())}>
                추가
              </Button>
            </div>
          </form>
        </div>
      )}
      {schMenu && (
        <div
          className="fixed inset-0 z-50"
          onMouseDown={() => setSchMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setSchMenu(null)
          }}
        >
          <div
            className={`mac-pop absolute py-1 text-[13px] ${schPalette ? 'w-[268px]' : 'w-[220px]'}`}
            style={{ left: Math.min(schMenu.x, window.innerWidth - 276), top: schMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {schPalette ? (
              <div className="px-3 py-1.5">
                <button onClick={() => setSchPalette(false)} className="mb-1 flex items-center gap-1 text-[12px] font-medium text-label-2 hover:text-label">
                  ‹ 일정 머리글 색
                </button>
                <ColorPalette
                  current={headColors.schedule ?? ''}
                  sheetColors={sheetColors}
                  onPick={(hex) => {
                    setHeadColor('schedule', hex)
                    setSchMenu(null)
                  }}
                />
              </div>
            ) : (
              <>
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
                <div className="mac-menu-sep" />
                <button onClick={() => setSchPalette(true)} className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-black/[0.05]">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-[3px] ring-1 ring-inset ring-black/15"
                      style={{ background: `#${headColors.schedule || HEAD_DEFAULT.schedule}` }}
                    />
                    일정 머리글 색
                  </span>
                  <span className="text-label-3">▸</span>
                </button>
              </>
            )}
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

// 내보낼 프로젝트를 성과관리에서 "열린 프로젝트"로 맞춘다 -- 가져오기 화면이 그 프로젝트의 평가연도를 쓰고,
// 다 가져온 뒤 "과제관리에서 보기"를 누르면 그 프로젝트가 열린다.
function ExportTargetSync({ id }: { id: string }) {
  const { currentWorkspaceId, selectWorkspace } = useWorkspaces()
  useEffect(() => {
    if (currentWorkspaceId !== id) selectWorkspace(id)
  }, [id, currentWorkspaceId, selectWorkspace])
  return null
}

// 머리글 메뉴의 "추진현황" 자리(TaskInputApp이 비워 둔 칸)에 연도 고르기를 그린다.
export const PROGRESS_MENU_SLOT = 'progress-menu-slot'
function MenuSlot({ children }: { children: React.ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => setNode(document.getElementById(PROGRESS_MENU_SLOT)), [])
  return node ? createPortal(children, node) : null
}

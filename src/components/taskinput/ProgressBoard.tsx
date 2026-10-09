// 과제 입력 › 추진현황 -- 구글시트 「YYYY 추진현황」 탭을 통째로 읽어 L1마다 탭을 만들고,
// 탭마다 일정표(구분=L2, 항목=L3, 월·주 칸)를 시트와 같은 색으로 그린다.
// 입력한 칸은 "구글시트에 저장"으로 시트의 같은 칸(글자 + 배경색)에 쓴다.
import { errText } from '../../utils/googleError'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../ui/Toast'
import { useFitHeight } from '../../hooks/useFitHeight'
import { createPortal } from 'react-dom'
import { useTabFit } from '../../hooks/useTabFit'
import { fillHex, setFillHex } from '../../utils/fillColors'
import type { WeekFill } from '../../utils/sheetImport'
import { useCanManageSheets } from '../../hooks/useSheetManager'
import YearSwitcher from './YearSwitcher'
import FileMenu from '../ui/PopMenu'
import SharedSheetPrompt, { writeSheetMeta } from './SharedSheetPrompt'
import { ACCESS_EVENT, sharedSheetFor } from '../../utils/accessSheet'
import {
  CloudUpload,
  ChartGantt,
  Eraser,
  Pencil,
  Check,
  Plus,
  Redo2,
  RefreshCw,
  FilePlus2,
  Save,
  RotateCcw,
  PanelTop,
  RotateCw,
  Rows3,
  AlignVerticalSpaceAround,
  Search,
  Send,
  SquareKanban,
  Table2,
  Settings2,
  Eye,
  EyeOff,
  ExternalLink,
  UnfoldVertical,
  FileDown,
  FoldVertical,
  Undo2,
  Upload,
  X,
  FolderOpen,
  CircleCheck,
  FileSpreadsheet,
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
  hasLoginSheetsToken,
  hasSheetsTokenNow,
  isSheetsApiConfigured,
  parseSheetUrl,
  pickDefaultTab,
  readXlsxBookAsync,
  type XlsxBook,
  sheetUrl,
  writeSheetCells,
  appendRows,
  createSheetTab,
  replaceSheetTab,
  parseFmt,
  fmtString,
  type CellFmt,
} from '../../utils/sheetSources'
import {
  NO_L1,
  buildSheetWrites,
  describeChanges,
  CHANGE_LOG_TAB,
  CHANGE_LOG_HEADER,
  isProtectedSheet,
  isOperatingSheet,
  readHiddenTabs,
  writeHiddenTabs,
  TASK_INPUT_SHEET_URL,
  readLinkedSheet,
  writeLinkedSheet,
  NEW_PREFIX,
  countDrafts,
  currentWeekKey,
  effectiveCells,
  effectiveBg,
  effectiveField,
  effectiveNote,
  effectiveFmt,
  effectiveMerges,
  effectiveFields,
  applyL2Renames,
  applyL2Splits,
  renameL2,
  NEW_COL_PREFIX,
  type NewCol,
  type NewRow,
  loadProgress,
  makeNewRow,
  makeNewGroup,
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
  setFmtEdit,
  readActiveTab,
  readAskBeforeSave,
  writeAskBeforeSave,
  writeActiveTab,
  loadShelf,
  clearProgressData,
  saveShelf,
  type ShelfItem,
  type CellState,
  type Drafts,
  type FieldDef,
  type ProgressData,
  type ProgressRow,
} from '../../utils/progressBoard'
import { buildProgressWorkbook, downloadProgressExcel } from '../../utils/progressExport'
import { blankProgress, materialize, sheetToData, worksheetRequests } from '../../utils/progressLocal'
import NewYearDialog, { type NewYearOptions } from './NewYearDialog'
import ProgressRate from './ProgressRate'
import SheetImportPanel from '../work/SheetImportPanel'
import { AppProvider } from '../../state/AppContext'
import { useAppMode } from '../../state/AppMode'
import { useGoogleAccount } from '../../hooks/useGoogleAccount'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { LOGIN_EVENT, getConnectedEmail, withGoogleAccount } from '../../utils/googleDrive'
import { KanbanBoard, TimelineView, ALL_FILTER, ViewFilterBar, scheduleListOf, type ViewFilter } from './BoardViews'
import ScheduleTable, { CellSwatch, HEAD_DEFAULT, L2_KEY, type ScheduleMode, type ScheduleRowView } from './ScheduleTable'
import ColorPalette from './ColorPalette'
import Select from '../ui/Select'
import { SHELL_LAYOUT_EVENT } from '../shell/AppShell'

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

const ROW_PAD_KEY = 'progress-board:row-pad-v3'
// 이 탭에서 시트의 최신 내용을 받았는지(로그인 · 앱을 새로 열 때마다 다시 받는다)
const SYNC_KEY = 'progress-board:synced'
const ROW_PAD_DEFAULT = 1
// 구글시트 보기에서 구글 머리 줄(제목 · 메뉴 · 공유 · 로그인) 높이(px) -- 도구 모음을 켠 때 이만큼 위로 밀어 가린다
const SHEET_HEAD_H = 64
// 구글 화면 아래 시트 탭 줄 높이(px) -- 시트 아래쪽을 이만큼 잘라 안 보이게 한다(과제 입력에서는 앱이 고른 탭 하나만 쓰므로)
const SHEET_TABS_H = 40
const ROW_PAD_MAX = 40 // 행간 늘이기 한계(칸 위아래 여백 px)
const ROW_PAD_MIN = -3 // 마이너스 = 기본보다 얇게(글자가 온전히 보이는 한계, 내용은 그 높이에서 잘림)

function toData(parsed: ParsedSheet, raw: RawSheet, meta: Pick<ProgressData, 'spreadsheetId' | 'source' | 'tabTitle' | 'sheetGid'>): ProgressData {
  return sheetToData(parsed, raw, meta)
}

// 다른 팀원이 저장했는지 알아보려는 비교용 지문(값 · 주차 칸 · 색 · 메모 · 서식 · 열 구성)
function sheetSig(d: ProgressData): string {
  return JSON.stringify([
    d.fields.map((f) => [f.id, f.label]),
    d.weekCols.map((w) => w.key),
    d.rows.map((r) => [r.key, r.h, r.l1, r.l2Tag, r.values, r.weeks, r.fills, r.bg, r.notes, r.fmt ?? null]),
  ])
}
// 저장 안 한 내 변경 중, 그사이 다른 팀원이 시트에서도 바꾼 칸 수(새 내용을 받으면 저장 때 내 값으로 덮어쓰게 되는 칸)
function overlapCount(cur: ProgressData, fresh: ProgressData, drafts: Drafts): number {
  const a = new Map(cur.rows.map((r) => [r.key, r]))
  const b = new Map(fresh.rows.map((r) => [r.key, r]))
  let n = 0
  for (const [key, e] of Object.entries(drafts.edits)) {
    const x = a.get(key)
    const y = b.get(key)
    if (!x || !y) continue
    for (const id of Object.keys(e.fields ?? {})) if ((id === 'name' ? x.l3 !== y.l3 : x.values[id] !== y.values[id])) n++
    for (const k of Object.keys(e.cells ?? {})) if (JSON.stringify([x.weeks[k], x.fills[k]]) !== JSON.stringify([y.weeks[k], y.fills[k]])) n++
    for (const id of Object.keys(e.bg ?? {})) if (x.bg[id] !== y.bg[id]) n++
    for (const id of Object.keys(e.notes ?? {})) if (x.notes[id] !== y.notes[id]) n++
  }
  return n
}
// 열어 둔 동안 시트를 다시 확인하는 간격
const POLL_MS = 5 * 60 * 1000
// 이보다 오래전에 받은 내용이면 다시 열 때 최신인지 먼저 확인한다(권한이 없으면 「최신 내용 안 받음」)
const STALE_MS = 60 * 60 * 1000
const FILE_LABEL = (
  <>
    <FolderOpen size={15} strokeWidth={1.8} />
    {/* 머리 줄이 좁으면 아이콘만 */}
    <span className="hidden xl:inline">파일</span>
  </>
)

// 시트에서 추진현황 탭을 값 + 주차 칸 배경색까지 읽는다.
// pick을 주면 그 탭(지난 연도 보기), 없으면 올해 탭을 읽는다.
async function readFromSheet(spreadsheetId: string, year: number, pick?: string): Promise<ProgressData> {
  const { title: fileTitle, tabs } = await fetchSpreadsheetTabs(spreadsheetId)
  // 고른 탭이 없으면(지워졌거나 이름이 바뀜) 올해 탭으로
  const title = (pick && tabs.some((t) => t.title === pick) ? pick : null) ?? pickDefaultTab(tabs, year)
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
  raw.fmts = fmt.fmts
  const parsed = parseSheet(raw)
  if ('error' in parsed) throw new Error(parsed.error)
  return {
    ...toData(parsed, raw, { spreadsheetId, source: title, tabTitle: title, sheetGid: tab.sheetId }),
    fileTitle,
    yearTabs: progressYearTabs(tabs.map((t) => t.title)),
  }
}

export default function ProgressBoard({ view = 'progress' }: { view?: 'progress' | 'rate' }) {
  // 표 틀 높이 = 창 높이에 맞춤(아래 여백 = 본문 아래 32px + 판 바깥 8px + 4px). 가로 스크롤 막대가 늘 화면 안에 보이게
  const [tableBoxRef, tableBoxH] = useFitHeight(44)
  const initial = useMemo(() => loadProgress(), [])
  const [data, setData] = useState<ProgressData | null>(initial.data)
  // 구글시트 보기는 시트에 연결된 연도에서만(엑셀 · 이 브라우저 연도로 바뀌면 표로)
  useEffect(() => {
    if (data && !data.spreadsheetId && localStorage.getItem('progress-board-view') === 'sheet') {
      try {
        localStorage.setItem('progress-board-view', 'table')
      } catch {
        // 기억 못 해도 아래 줄이 바로 바꾼다
      }
      setBoardView('table')
    }
  }, [data])
  const [drafts, setDrafts] = useState<Drafts>(initial.drafts)
  const edits = drafts.edits
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [error, setError] = useState('')
  // 알림(저장했습니다 등)은 화면 아래 토스트로(ui/Toast)
  const setMessage = (t: string) => {
    if (t) toast(t, 'ok')
  }
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
  // 숨긴 열(속성 · 분류 · 상태 …): 머리글 우클릭 › 열 숨기기. 이 브라우저에만 기억(시트는 그대로)
  const [hiddenCols, setHiddenColsState] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('progress-board:hidden-cols') ?? '[]')
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  })
  function setHiddenCols(next: string[]) {
    setHiddenColsState(next)
    try {
      localStorage.setItem('progress-board:hidden-cols', JSON.stringify(next))
    } catch {
      // 기억 못 해도 지금 화면엔 반영
    }
  }
  // 그룹(L1) 탭 우클릭 메뉴: 숨기기 · 이 그룹만 보기
  const [tabMenu, setTabMenu] = useState<{ name: string; x: number; y: number } | null>(null)
  const shownL1s = l1s.filter((x) => !hiddenL1.includes(x))
  const hiddenL1Count = l1s.length - shownL1s.length
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
  // 추진현황 보기 모양(이 브라우저에 기억)
  const [boardView, setBoardView] = useState<'table' | 'board' | 'timeline' | 'sheet'>(() => {
    try {
      const v = localStorage.getItem('progress-board-view')
      return v === 'board' || v === 'timeline' || v === 'sheet' ? v : 'table'
    } catch {
      return 'table'
    }
  })
  function changeBoardView(v: 'table' | 'board' | 'timeline' | 'sheet') {
    setBoardView(v)
    try {
      localStorage.setItem('progress-board-view', v)
    } catch {
      // 기억 못 해도 지금은 바뀐다
    }
  }
  const [searchFocus, setSearchFocus] = useState(false)
  // 구글시트 그대로 보기: 구글의 메뉴 · 서식 도구 모음을 보일지(끄면 칸만 보이는 최소 화면) -- 이 브라우저에 기억. 새로고침 = iframe을 다시 그린다
  const [sheetFull, setSheetFullState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('progress-board:sheet-toolbar') === '1'
    } catch {
      return false
    }
  })
  const [sheetReload, setSheetReload] = useState(0)
  const [viewMenu, setViewMenu] = useState(false) // 보기 전환(아래 줄)이 펼쳐져 있는지
  const [sheetJump, setSheetJump] = useState<number | null>(null) // 그룹 탭으로 옮겨 갈 시트 행(1-based)
  const [sheetBoxRef, sheetBoxH] = useFitHeight(12, 360)
  function setSheetFull(v: boolean) {
    setSheetFullState(v)
    try {
      localStorage.setItem('progress-board:sheet-toolbar', v ? '1' : '0')
    } catch {
      // 기억 못 해도 지금 화면에는 반영
    }
  }
  const searchRef = useRef<HTMLInputElement>(null)
  const searchOpen = searchFocus || query.trim() !== ''
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
  // 행 높이(끌어서 정한 값) -- 이 브라우저에 기억
  const [rowHeights, setRowHeightsState] = useState<Record<string, number>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('progress-board:row-heights') ?? '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  const widthsRef = useRef(widths)
  const heightsRef = useRef(rowHeights)
  // 열 폭 · 행 높이 바꾸기(되돌리기에 들어감)
  function setView(w: Record<string, number>, h: Record<string, number>) {
    if (w !== widthsRef.current) {
      widthsRef.current = w
      setWidths(w)
      try {
        localStorage.setItem('progress-board:widths', JSON.stringify(w))
      } catch {
        // 기억 못 해도 지금 화면엔 반영
      }
    }
    if (h !== heightsRef.current) {
      heightsRef.current = h
      setRowHeightsState(h)
      try {
        localStorage.setItem('progress-board:row-heights', JSON.stringify(h))
      } catch {
        // 위와 같음
      }
    }
  }
  function resizeCol(key: string, w: number) {
    if (widthsRef.current[key] === w) return
    pushHistory(`w:${key}`)
    setView({ ...widthsRef.current, [key]: w }, heightsRef.current)
  }
  function changeRowHeights(changes: Record<string, number | null>, kind = 'h') {
    const next = { ...heightsRef.current }
    let changed = false
    for (const [k, v] of Object.entries(changes)) {
      if (v === null ? !(k in next) : next[k] === v) continue
      changed = true
      if (v === null) delete next[k]
      else next[k] = v
    }
    if (!changed) return
    pushHistory(kind)
    setView(widthsRef.current, next)
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
  // 머리글 글자 서식(글자 색 · 크기 · 굵게 · 정렬) -- 머리글 색처럼 이 브라우저에 기억(열 key → fmtString)
  const [headFmts, setHeadFmts] = useState<Record<string, string>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('progress-board:head-fmts') ?? '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  function setHeadFmt(key: string, patch: CellFmt | null) {
    setHeadFmts((cur) => {
      const nextFmt = patch ? fmtString({ ...parseFmt(cur[key] ?? ''), ...patch }) : ''
      const next = { ...cur }
      if (nextFmt) next[key] = nextFmt
      else delete next[key]
      try {
        localStorage.setItem('progress-board:head-fmts', JSON.stringify(next))
      } catch {
        // 기억 못 해도 지금 화면엔 반영
      }
      return next
    })
  }
  const [schPalette, setSchPalette] = useState(false)
  // 칠하기 색(계획 · 실적) 바꾸기 팝업
  const [fillMenu, setFillMenu] = useState<{ which: WeekFill; x: number; y: number } | null>(null)
  const [, setFillTick] = useState(0)
  useEffect(() => {
    if (!fillMenu) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFillMenu(null)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [fillMenu])
  function openFillMenu(el: HTMLElement, which: WeekFill) {
    const r = el.getBoundingClientRect()
    setFillMenu({ which, x: Math.max(8, Math.min(r.left - 8, window.innerWidth - 290)), y: r.bottom + 6 })
  }

  // 행간(칸 위아래 여백 -3~40px, 기본 ROW_PAD_DEFAULT) -- 이 브라우저에 기억
  const [rowPad, setRowPadState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(ROW_PAD_KEY)
      const v = Number(raw)
      return raw !== null && v >= ROW_PAD_MIN && v <= ROW_PAD_MAX ? v : ROW_PAD_DEFAULT
    } catch {
      return ROW_PAD_DEFAULT
    }
  })
  // 모두 기본 높이로: 행간을 기본으로, 끌어서 정한 행 높이는 모두 지운다
  function setRowPad(v: number) {
    const n = Math.max(ROW_PAD_MIN, Math.min(ROW_PAD_MAX, v))
    setRowPadState(n)
    try {
      localStorage.setItem(ROW_PAD_KEY, String(n))
    } catch {
      // 기억 못 해도 지금 화면에는 반영
    }
  }

  // 행간을 한 단계 바꾸면 끌어서 정한 행 높이는 지워 모든 행이 같은 높이를 따르게 한다(한 행만 따로 높거나 낮지 않게)
  function stepRowPad(d: number) {
    setRowPad(rowPad + d)
    if (Object.keys(heightsRef.current).length) {
      pushHistory('')
      setView(widthsRef.current, {})
    }
  }

  function accept(next: ProgressData) {
    // 시트 이름을 기억해 두면 다음에 "「파일 › 탭」 시트로 연결할까요?"로 바로 보여 준다
    if (!next.local && next.spreadsheetId && next.fileTitle) writeSheetMeta(next.spreadsheetId, next.fileTitle, next.tabTitle)
    parkLocal()
    leaveArchive()
    setRemote(null)
    setData(next)
    dataRef.current = next
    saveProgressData(next)
    setError('')
  }

  // ---- 이 화면에서 만든 연도(이 브라우저) · 잠시 내려 둔 연도(선반) ----
  const dataRef = useRef(data)
  dataRef.current = data
  const [shelf, setShelfState] = useState<Record<string, ShelfItem>>(() => loadShelf())
  const shelfRef = useRef(shelf)
  function setShelf(next: Record<string, ShelfItem>) {
    shelfRef.current = next
    setShelfState(next)
    saveShelf(next)
  }
  const [newYearOpen, setNewYearOpen] = useState(false)
  // 지금 입력하는 연도(지난 연도 보기 중이면 맡겨 둔 올해)
  function currentProject(): ShelfItem | null {
    const a = archiveRef.current
    if (a) return a
    const d = dataRef.current
    return d ? { data: d, drafts: draftsRef.current } : null
  }
  // 앱 안의 확인 창(브라우저 기본 확인 창은 막혀 있는 환경이 있어 쓰지 않는다)
  const [ask, setAsk] = useState<{ title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'accent'; resolve: (ok: boolean) => void } | null>(
    null,
  )
  function askConfirm(o: { title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'accent' }): Promise<boolean> {
    return new Promise((resolve) => setAsk({ ...o, resolve }))
  }
  // 시트 연도를 이 브라우저 연도로(시트에서 탭이 지워졌을 때)
  const asLocal = (d: ProgressData): ProgressData => ({
    ...d,
    local: true,
    spreadsheetId: null,
    sheetGid: null,
    source: 'local',
    yearTabs: undefined,
    fileTitle: undefined,
  })
  // 선반 키: 이 브라우저 연도 'local:탭', 시트 연도 'sheet:탭'(같은 연도가 둘 다 있을 수 있음)
  const shelfKeyOf = (d: ProgressData) => `${d.local ? 'local' : 'sheet'}:${d.tabTitle}`
  // 지금 연도가 이 브라우저에서 만든 연도면 선반에 올려 둔다(시트를 불러오기 전에)
  function parkLocal() {
    const cur = currentProject()
    if (!cur?.data.local) return
    setShelf({ ...shelfRef.current, [shelfKeyOf(cur.data)]: cur })
    dataRef.current = null
  }
  function activate(p: ShelfItem, rest: Record<string, ShelfItem>) {
    if (!p.data.local && p.data.spreadsheetId) writeActiveTab(p.data.tabTitle)
    setArchive(null)
    setShelf(rest)
    setData(p.data)
    dataRef.current = p.data
    saveProgressData(p.data)
    draftsRef.current = p.drafts
    setDrafts(p.drafts)
    saveDrafts(p.drafts)
    clearHistory()
    setEditing(false)
    setFilters({})
    setActiveL1(null)
    setOpenKey(null)
    setError('')
    setMessage('')
  }
  // 선반의 연도로 바꾸기(지금 연도는 선반에)
  function switchProject(title: string) {
    const next = shelfRef.current[title]
    if (!next) return
    const rest = { ...shelfRef.current }
    delete rest[title]
    const cur = currentProject()
    if (cur) rest[shelfKeyOf(cur.data)] = cur
    activate(next, rest)
  }
  const pendingView = useRef<string | null>(null)
  useEffect(() => {
    const t = pendingView.current
    if (t && data && !data.local) {
      pendingView.current = null
      if (t !== data.tabTitle) void viewYear(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  // 올해 이후 시트 연도: 그 탭을 입력하는 연도로 불러온다(지금 연도는 선반에). 지난 연도는 보기 전용.
  const yearOf = (t: string) => Number(t.match(/(20\d{2})/)?.[1] ?? 0)
  async function openSheetYear(t: string) {
    const cur = currentProject()
    const id = (cur && !cur.data.local ? cur.data.spreadsheetId : null) ?? parseSheetUrl(sheetLink)?.spreadsheetId
    if (!id) return viewYear(t)
    // 이미 선반에 있으면(전에 입력하던 연도) 그대로
    if (shelfRef.current[`sheet:${t}`]) return switchProject(`sheet:${t}`)
    setYearLoading(true)
    setError('')
    try {
      const fresh = await readFromSheet(id, yearOf(t) || now.getFullYear(), t)
      const rest = { ...shelfRef.current }
      if (cur) rest[shelfKeyOf(cur.data)] = cur
      activate({ data: fresh, drafts: { edits: {}, newRows: [] } }, rest)
    } catch (e) {
      setError(errText(e, `「${t}」 탭을 읽지 못했습니다.`))
    } finally {
      setYearLoading(false)
    }
  }
  // 연도 메뉴를 열 때 시트의 탭 목록을 다시 읽는다(구글시트에서 탭을 지우거나 이름을 바꿨으면 목록에서도 빠지게).
  const tabsCheckedAt = useRef(0)
  async function refreshYearTabs() {
    const d = dataRef.current
    const a = archiveRef.current
    const sheetData = d && !d.local ? d : (Object.values(shelfRef.current).find((x) => !x.data.local)?.data ?? null)
    const id = sheetData?.spreadsheetId
    if (!id || Date.now() - tabsCheckedAt.current < 5000) return
    tabsCheckedAt.current = Date.now()
    let tabs: string[]
    try {
      tabs = progressYearTabs((await fetchSpreadsheetTabs(id)).tabs.map((t) => t.title))
    } catch {
      return // 못 읽으면 지금 목록 그대로
    }
    const same = (x?: string[]) => !!x && x.length === tabs.length && x.every((t, i) => t === tabs[i])
    const fix = (x: ProgressData): ProgressData => (!x.local && x.spreadsheetId === id && !same(x.yearTabs) ? { ...x, yearTabs: tabs } : x)
    const cur = dataRef.current
    if (cur && fix(cur) !== cur) {
      const next = fix(cur)
      setData(next)
      dataRef.current = next
      saveProgressData(next)
    }
    if (a && fix(a.data) !== a.data) setArchive({ ...a, data: fix(a.data) })
    const shelfNow = shelfRef.current
    if (Object.values(shelfNow).some((x) => fix(x.data) !== x.data))
      setShelf(Object.fromEntries(Object.entries(shelfNow).map(([k, x]) => [k, fix(x.data) === x.data ? x : { ...x, data: fix(x.data) }])))
  }
  function pickYear(t: string) {
    if (shelfRef.current[t]) return switchProject(t)
    const cur = currentProject()
    if (cur?.data.local) {
      // 시트 연도: 내려 둔 시트 연도를 다시 올린 뒤 그 탭을 본다
      const parked = Object.values(shelfRef.current).find((x) => !x.data.local && (x.data.yearTabs ?? [x.data.tabTitle]).includes(t))
      if (parked) {
        pendingView.current = t
        switchProject(shelfKeyOf(parked.data))
      }
      return
    }
    void viewYear(t)
  }
  // 이 브라우저에서 만든 연도 지우기(id = 'local:탭'). 지금 보던 연도면 다른 연도로 옮긴다.
  async function deleteLocal(id: string) {
    const name = id.slice(6).replace(/추진현황/, '실적관리')
    if (
      !(await askConfirm({
        title: '이 브라우저 연도 삭제',
        message: `이 브라우저에서 만든 「${name}」을(를) 지웁니다.\n되돌릴 수 없습니다(구글시트에는 영향 없음).`,
      }))
    )
      return
    const rest = { ...shelfRef.current }
    delete rest[id]
    const cur = currentProject()
    if (cur?.data.local && `local:${cur.data.tabTitle}` === id) {
      // 시트 연도(연결했던 것 우선) → 다른 이 브라우저 연도 → 빈 화면
      const keys = Object.keys(rest)
      const next = keys.find((k) => k.startsWith('sheet:')) ?? keys[0]
      if (next) {
        const p = rest[next]
        delete rest[next]
        activate(p, rest)
      } else {
        setShelf(rest)
        setArchive(null)
        setData(null)
        dataRef.current = null
        clearProgressData()
        draftsRef.current = { edits: {}, newRows: [] }
        setDrafts(draftsRef.current)
        saveDrafts(draftsRef.current)
        clearHistory()
      }
    } else setShelf(rest)
    setMessage(`「${id.slice(6).replace(/추진현황/, '실적관리')}」(이 브라우저)를 지웠습니다.`)
  }
  function createYear(o: NewYearOptions) {
    setNewYearOpen(false)
    try {
      const cur = currentProject()
      let base = blankProgress(o.year)
      let rows: NewRow[] = []
      if (o.mode === 'inherit' && cur) {
        const srcL1s = Array.from(new Set([...cur.data.rows.map((r) => r.l1), ...cur.drafts.newRows.map((n) => n.l1)]))
        const m = materialize(cur.data, cur.drafts, srcL1s).data
        base = blankProgress(
          o.year,
          m.fields.filter((f) => f.id !== 'name').map((f) => f.label),
        )
        const idByLabel = new Map(base.fields.map((f) => [f.label, f.id]))
        const mapId = (id: string) => (id === 'name' ? 'name' : idByLabel.get(m.fields.find((f) => f.id === id)?.label ?? ''))
        const remap = (rec: Record<string, string> | undefined) =>
          Object.fromEntries(Object.entries(rec ?? {}).flatMap(([id, v]) => (mapId(id) && v ? [[mapId(id)!, v]] : [])))
        const done = (st: string) => /완료|취소|중단|drop/i.test(st)
        const seen = new Set<string>()
        for (const r of m.rows) {
          if (o.carry === 'open' && done(r.values.status ?? '')) continue
          const g = `${r.l1}␟${r.l2}␟${r.l2Tag ?? ''}`
          if (o.carry === 'structure') {
            if (seen.has(g)) continue
            seen.add(g)
            rows.push(makeNewRow({ l1: r.l1, l2: r.l2, l2Tag: r.l2Tag, h: r.h }))
            continue
          }
          const n = makeNewRow({ l1: r.l1, l2: r.l2, l2Tag: r.l2Tag, h: r.h })
          n.fields = { ...remap(r.values), name: r.l3 }
          n.bg = remap(r.bg)
          n.fmt = remap(r.fmt)
          rows.push(n)
        }
        if (!rows.length) rows = [makeNewRow({ l1: srcL1s[0] ?? o.l1, l2: '새 구분', l2Tag: null, h: null })]
      } else rows = [makeNewRow({ l1: o.l1, l2: '새 구분', l2Tag: null, h: null })]
      const order = Array.from(new Set(rows.map((n) => n.l1)))
      const made = materialize(base, { edits: {}, newRows: rows }, order)
      const project: ShelfItem = { data: { ...made.data, local: true, yearTabs: undefined }, drafts: { edits: {}, newRows: made.left } }
      const rest = { ...shelfRef.current }
      if (cur) rest[shelfKeyOf(cur.data)] = cur
      activate(project, rest)
      if (o.target === 'sheet') return void createInSheet(project) // 이어서 연결된 시트에 탭을 만든다(실패하면 이 브라우저 연도로 남음)
      if (made.left[0]) setOpenKey(NEW_PREFIX + made.left[0].id) // 첫 과제 이름부터 입력
      setMessage(
        `「${o.year} 실적관리」를 만들었습니다. 이 브라우저에 저장됩니다${canManage ? ' · 오른쪽 위 ⋯ 파일 메뉴의 "구글시트로 만들기"로 시트에 탭을 만들 수 있습니다' : ''}.`,
      )
    } catch (e) {
      setError(errText(e, '새 연도를 만들지 못했습니다.'))
    }
  }
  // 이 브라우저에서 만든 연도: 고친 내용을 표에 굳혀 저장
  function commitLocal() {
    if (!data?.local) return
    try {
      const m = materialize(data, drafts, l1s)
      const next = { ...m.data, local: true, yearTabs: undefined }
      setData(next)
      dataRef.current = next
      saveProgressData(next)
      updateDrafts({ edits: {}, newRows: m.left })
      clearHistory()
      setMessage(`이 브라우저에 저장했습니다${m.left.length ? ` · 이름이 빈 과제 ${m.left.length}건은 이름을 넣으면 저장됩니다` : ''}.`)
    } catch (e) {
      setError(errText(e, '저장하지 못했습니다.'))
    }
  }
  // 이 브라우저에서 만든 연도 → 연결된 구글시트 파일에 「YYYY 추진현황」 탭을 만들어 통째로 쓴다(관리자)
  // proj: 방금 만든 연도(아직 화면 상태에 반영되기 전)를 바로 올릴 때
  async function createInSheet(proj?: ShelfItem) {
    const d = proj?.data ?? data
    const dr = proj?.drafts ?? drafts
    const order = proj ? Array.from(new Set([...proj.data.rows.map((r) => r.l1), ...proj.drafts.newRows.map((n) => n.l1)])) : l1s
    // 이 브라우저 연도(local) · 엑셀 파일로 연 표(시트 없음)를 연결된 구글시트에 새 탭으로 올린다
    const fromXlsx = !!d && !d.local && !d.spreadsheetId
    if (!d || !(d.local || fromXlsx)) return
    const link = parseSheetUrl(sheetLink)
    if (!link) return setError('연결된 구글시트가 없습니다. ⋯ 파일 메뉴 › "시트 연결 설정"에서 먼저 연결해 주세요.')
    if (isProtectedSheet(link.spreadsheetId)) return setError('운영 중인 팀 시트에는 탭을 만들지 않습니다. 테스트 시트를 연결해 주세요.')
    // 이름이 빈 과제는 시트에 올라가지 않는다(시트는 L3 이름이 있는 줄만 과제로 읽음) -- 미리 알리고, 만든 뒤에는 화면에서도 뺀다
    const nameless = dr.newRows.filter((n) => !n.fields.name?.trim()).length
    if (
      nameless &&
      !(await askConfirm({
        title: '이름이 빈 과제',
        message: `이름(L3)이 빈 과제 ${nameless}건은 구글시트에 올라가지 않고 화면에서도 빠집니다.\n남기려면 취소하고 이름을 먼저 넣어 주세요.`,
        confirmLabel: '빼고 만들기',
        tone: 'accent',
      }))
    )
      return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const m = materialize(d, dr, order)
      const { tabs } = await fetchSpreadsheetTabs(link.spreadsheetId)
      const taken = (t: string) => tabs.some((x) => x.title.replace(/\s/g, '') === t.replace(/\s/g, ''))
      // 엑셀에서 올릴 때 같은 이름 탭이 이미 있으면 덮어쓰지 않고 「… (엑셀 10.03)」 탭으로 따로 만든다
      // 이전에 엑셀로 올린 탭(「… (엑셀 10.09)」 · 「… (엑셀 10.09) 2」)이 있으면 새로 만들지 않고 가장 최근 것을 이번 내용으로 갱신한다.
      // 팀이 쓰는 원래 탭은 건드리지 않는다.
      let tabTitle = d.tabTitle
      let updateExisting = false
      if (fromXlsx && taken(tabTitle)) {
        const esc = d.tabTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`^${esc}\\s*\\(엑셀 (\\d+)\\.(\\d+)\\)(?:\\s+(\\d+))?$`)
        const prev = tabs
          .map((x) => ({ title: x.title, m: re.exec(x.title.trim()) }))
          .filter((x): x is { title: string; m: RegExpExecArray } => !!x.m)
          .map((x) => ({ title: x.title, k: Number(x.m[1]) * 10000 + Number(x.m[2]) * 100 + Number(x.m[3] ?? 1) }))
          .sort((a, b) => a.k - b.k)
        if (prev.length) {
          tabTitle = prev[prev.length - 1].title
          updateExisting = true
        } else {
          const t = new Date()
          tabTitle = `${d.tabTitle} (엑셀 ${t.getMonth() + 1}.${String(t.getDate()).padStart(2, '0')})`
        }
      }
      // 올라가지 않는 줄 · 기존 탭 갱신은 올리기 전에 알리고 확인받는다
      const sk = d.skipped
      const skippedMsg = sk && (sk.blank || sk.stray.length)
        ? `엑셀의 ${[sk.blank ? `빈 줄 ${sk.blank}개` : '', sk.stray.length ? `과제 이름이 없고 값만 있는 줄 ${sk.stray.length}개(${sk.stray.slice(0, 6).join(' · ')}${sk.stray.length > 6 ? ' …' : ''}행)` : ''].filter(Boolean).join(', ')}은 올라가지 않습니다.`
        : ''
      if (
        (updateExisting || skippedMsg) &&
        !(await askConfirm({
          title: updateExisting ? `「${tabTitle}」 탭 갱신` : '구글시트로 올리기',
          message: [
            updateExisting ? `이미 엑셀로 올린 「${tabTitle}」 탭을 이번 엑셀 내용으로 갱신합니다.\n그 탭의 기존 내용(거기서 고친 것 포함)은 바뀌고, 원래 「${d.tabTitle}」 탭은 그대로입니다.` : '',
            skippedMsg,
          ]
            .filter(Boolean)
            .join('\n\n'),
          confirmLabel: updateExisting ? '갱신하기' : '올리기',
          tone: 'accent',
        }))
      )
        return
      if (!updateExisting && taken(tabTitle))
        throw new Error(`연결된 시트에 이미 「${d.tabTitle}」 탭이 있습니다. 시트에서 탭 이름을 바꾸거나 지운 뒤 다시 해 주세요.`)
      const wb = buildProgressWorkbook(m.data, { edits: {}, newRows: [] }, order)
      const ws = wb.worksheets[0]
      const frozenCols = Object.keys(m.data.levelCols ?? {}).length + 1
      if (updateExisting) await replaceSheetTab(link.spreadsheetId, tabTitle, { rows: ws.rowCount + 100, cols: ws.columnCount + 5 }, (id) => worksheetRequests(ws, id))
      else
        await createSheetTab(link.spreadsheetId, tabTitle, { rows: ws.rowCount + 100, cols: ws.columnCount + 5, frozenRows: 2, frozenCols }, (id) =>
          worksheetRequests(ws, id),
        )
      const fresh = await readFromSheet(link.spreadsheetId, d.year ?? now.getFullYear(), tabTitle)
      // 시트 연도가 됐으니 이 브라우저 연도와 예전에 내려 둔 시트 연도는 정리한다
      const rest = Object.fromEntries(Object.entries(shelfRef.current).filter(([, x]) => x.data.local))
      activate({ data: fresh, drafts: { edits: {}, newRows: [] } }, rest)
      setMessage(
        fromXlsx && updateExisting
          ? `엑셀 내용으로 「${tabTitle}」 탭을 갱신했습니다. 이 탭과 연결됩니다(원래 「${d.tabTitle}」 탭은 그대로).`
          : fromXlsx && tabTitle !== d.tabTitle
          ? `시트에 이미 「${d.tabTitle}」 탭이 있어 엑셀 내용을 「${tabTitle}」 탭으로 올렸습니다. 이제 이 탭과 연결됩니다(원래 탭은 그대로).`
          : `구글시트에 「${tabTitle}」 탭을 만들었습니다. 이제 이 연도는 시트와 연결됩니다.`,
      )
    } catch (e) {
      setError(errText(e, '구글시트에 탭을 만들지 못했습니다.'))
    } finally {
      setSaving(false)
    }
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
      setError(errText(e, `「${title}」 탭을 읽지 못했습니다.`))
    } finally {
      setYearLoading(false)
    }
  }

  // 시트 연결을 바꾸는 것(링크 · xlsx)은 팀장 · 관리자만
  const canManage = useCanManageSheets()
  const { canPerf } = useGoogleAccount() // 팀원은 성과관리로 내보내기 없음
  // 관리자가 공유한 시트: 권한 관리 시트의 「연결 시트」(내 팀 → 없으면 "전체"), 그것도 없으면 앱 기본(테스트 시트)
  const [sharedLink, setSharedLink] = useState(() => sharedSheetFor(getConnectedEmail())?.url ?? TASK_INPUT_SHEET_URL)
  const [sheetLink, setSheetLink] = useState<string>(() => readLinkedSheet() ?? sharedLink)
  useEffect(() => {
    const on = () => {
      const next = sharedSheetFor(getConnectedEmail())?.url ?? TASK_INPUT_SHEET_URL
      setSharedLink(next)
      // 직접 고른 시트가 없으면 공유 시트를 따라간다
      if (!readLinkedSheet()) setSheetLink(next)
    }
    window.addEventListener(ACCESS_EVENT, on)
    return () => window.removeEventListener(ACCESS_EVENT, on)
  }, [])
  const [linkOpen, setLinkOpen] = useState(false)
  // 업데이트 전에 묻기(저장 창의 「다음부터 묻지 않기」 · 파일 메뉴에서 다시 켬)
  const [askSave, setAskSave] = useState(readAskBeforeSave)
  const [noAskNext, setNoAskNext] = useState(false)
  const setAskSavePref = (v: boolean) => {
    setAskSave(v)
    writeAskBeforeSave(v)
  }

  // 다른 시트를 연결하면 그 시트에서 다시 불러온다. 고친 칸은 이전 시트 기준이라 비운다.
  async function connectSheet(url: string) {
    const link = parseSheetUrl(url)
    if (!link) {
      setError('구글시트 링크를 확인해 주세요. (https://docs.google.com/spreadsheets/d/…)')
      return
    }
    parkLocal()
    writeActiveTab(null) // 다른 파일이면 올해 탭부터
    const clean = sheetUrl(link.spreadsheetId)
    setSheetLink(clean)
    writeLinkedSheet(parseSheetUrl(sharedLink)?.spreadsheetId === link.spreadsheetId ? null : clean)
    setLinkOpen(false)
    setOpenKey(null)
    updateDrafts({ edits: {}, newRows: [] })
    clearHistory()
    setLoadingNote('새로 연결한 시트')
    const ok = await loadFromSheet(false, clean)
    const d = dataRef.current
    if (ok && d && d.spreadsheetId === link.spreadsheetId)
      setMessage(`「${d.fileTitle ?? '구글시트'} › ${d.tabTitle}」에 연결했습니다. 그룹 ${new Set(d.rows.map((r) => r.l1)).size}개 · 과제 ${d.rows.length}건을 불러왔습니다.`)
  }

  // 로그인할 때마다 시트의 최신 내용(다른 팀원이 저장한 것)을 받는다. 이 탭에서 한 번 받았으면 표시해 둔다.
  // 로그인 토큰이 있으면 바로 받고, 없으면(새로고침 · 로그인 유지로 들어옴) "최신으로 업데이트" 한 번 누르게 한다.
  const [stale, setStale] = useState(false)
  // 불러오는 동안 탭 위에 보일 대상(시트 연결을 바꿨을 때 등) -- 멈춘 것처럼 보이지 않게
  const [loadingNote, setLoadingNote] = useState('')
  // 열어 둔 동안 다른 팀원이 새로 저장한 시트 내용(저장 안 한 내 변경이 있어 바로 받지 않고 기다리는 것)
  const [remote, setRemote] = useState<ProgressData | null>(null)
  // 시트와 같은지 마지막으로 확인한 때(받은 때 fetchedAt과 견줘 늦은 쪽을 「n분 전 확인」으로 보인다)
  const [confirmedAt, setConfirmedAt] = useState(0)
  // 「n분 전」 글자가 멈춰 있지 않게 1분마다 다시 그린다
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60 * 1000)
    return () => window.clearInterval(t)
  }, [])
  const busyRef = useRef(false)
  busyRef.current = loading || saving
  const lastCheckRef = useRef(0)
  // 5분마다(이 화면을 보고 있을 때만, 이미 받은 토큰이 있을 때만 -- 권한 창이 뜨지 않게) 시트를 조용히 다시 읽는다.
  // 달라졌으면: 저장 안 한 변경이 없고 칸을 입력하는 중이 아니면 바로 받고, 아니면 "새 내용 · 받기"만 띄운다.
  useEffect(() => {
    async function check() {
      const d = dataRef.current
      if (!d || d.local || !d.spreadsheetId || archiveRef.current || busyRef.current) return
      if (document.visibilityState !== 'visible' || !hasSheetsTokenNow()) return
      if (Date.now() - lastCheckRef.current < POLL_MS - 5000) return
      if (Date.now() - new Date(d.fetchedAt).getTime() < POLL_MS - 5000) return // 방금 받은 내용
      lastCheckRef.current = Date.now()
      try {
        const fresh = await readFromSheet(d.spreadsheetId, d.year ?? new Date().getFullYear(), d.tabTitle)
        const cur = dataRef.current
        if (!cur || cur !== d || busyRef.current || fresh.tabTitle !== cur.tabTitle) return
        if (sheetSig(fresh) === sheetSig(cur)) return setConfirmedAt(Date.now())
        const typing = document.activeElement?.matches('input, textarea, [contenteditable="true"]')
        if (countDrafts(draftsRef.current) === 0 && !typing) {
          accept(fresh)
          markSynced()
          setMessage(`다른 팀원이 저장한 새 내용을 받았습니다 (${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`)
        } else setRemote(fresh)
      } catch {
        // 확인 못 하면 다음 차례에 다시
      }
    }
    const t = window.setInterval(() => void check(), 60 * 1000)
    // 화면을 열면 바로 한 번(받은 지 오래된 내용이면 -- 오랜만에 들어와도 최신인지 알 수 있게)
    const first = window.setTimeout(() => void check(), 1500)
    const onBack = () => void check() // 다른 창에 있다 돌아오면 바로(5분이 지났으면)
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    return () => {
      window.clearInterval(t)
      window.clearTimeout(first)
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function markSynced() {
    try {
      sessionStorage.setItem(SYNC_KEY, '1')
    } catch {
      // 표시 못 해도 받은 내용은 그대로
    }
    setStale(false)
  }
  useEffect(() => {
    const d = dataRef.current
    if (!d || d.local || !d.spreadsheetId || !isSheetsApiConfigured()) return
    let synced = false
    try {
      synced = sessionStorage.getItem(SYNC_KEY) === '1'
    } catch {
      // 모르면 받는다
    }
    // 이 탭에서 받았어도 오래전이고 조용히 확인할 권한이 없으면 「최신 내용 안 받음」(권한이 있으면 위 확인이 맡는다)
    if (synced) {
      if (Date.now() - new Date(d.fetchedAt).getTime() > STALE_MS && !hasSheetsTokenNow()) setStale(true)
      return
    }
    if (hasLoginSheetsToken()) void loadFromSheet()
    else setStale(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.spreadsheetId])
  useEffect(() => {
    const on = () => {
      const d = dataRef.current
      if (d && !d.local && d.spreadsheetId) void loadFromSheet()
    }
    window.addEventListener(LOGIN_EVENT, on)
    return () => window.removeEventListener(LOGIN_EVENT, on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 구글시트에 저장 안 한 변경이 있으면 창을 닫기 전에 한 번 묻는다(고친 내용은 이 브라우저에 남지만 팀원은 못 본다)
  useEffect(() => {
    const on = (e: BeforeUnloadEvent) => {
      const d = dataRef.current
      if (d && !d.local && countDrafts(draftsRef.current) > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', on)
    return () => window.removeEventListener('beforeunload', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadFromSheet(pickAccount = false, url = sheetLink): Promise<boolean> {
    const link = parseSheetUrl(url)
    if (!link) return false
    if (pickAccount) chooseSheetsAccountNext()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      // 입력하던 시트 연도 탭이 시트에서 지워졌으면 그 연도(고친 내용 포함)를 이 브라우저 연도로 옮겨 둔다
      const cur = currentProject()
      let moved = ''
      if (cur && !cur.data.local && cur.data.spreadsheetId === link.spreadsheetId) {
        const { tabs } = await fetchSpreadsheetTabs(link.spreadsheetId)
        if (!tabs.some((t) => t.sheetId === cur.data.sheetGid || t.title === cur.data.tabTitle)) {
          setShelf({ ...shelfRef.current, [`local:${cur.data.tabTitle}`]: { data: asLocal(cur.data), drafts: cur.drafts } })
          writeActiveTab(null)
          dataRef.current = null
          draftsRef.current = { edits: {}, newRows: [] }
          setDrafts(draftsRef.current)
          saveDrafts(draftsRef.current)
          clearHistory()
          moved = cur.data.tabTitle
        }
      }
      accept(await readFromSheet(link.spreadsheetId, now.getFullYear(), readActiveTab() ?? undefined))
      markSynced()
      if (moved)
        setMessage(
          `시트에서 「${moved}」 탭이 없어져 그 연도를 "이 브라우저" 연도로 옮겨 두었습니다. 연도 메뉴에서 고른 뒤 "구글시트로 만들기"로 다시 만들 수 있습니다.`,
        )
      return true
    } catch (e) {
      setError(errText(e, '시트를 읽지 못했습니다.'))
      return false
    } finally {
      setLoading(false)
      setLoadingNote('')
    }
  }

  async function loadFromFile(file: File) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const book = await readXlsxBookAsync(await file.arrayBuffer(), file.name)
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
      setError(errText(e, '파일을 읽지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  // 되돌리기/다시 하기: 고칠 때마다 직전 상태를 쌓는다. 끌어 칠하기처럼 잇따른 같은 동작은 한 번으로 묶는다.
  // 기록 한 칸 = 고친 내용 + 열 폭 + 행 높이(크기 조절도 되돌린다)
  type Snap = { d: Drafts; w: Record<string, number>; h: Record<string, number> }
  const draftsRef = useRef(drafts)
  const past = useRef<Snap[]>([])
  const future = useRef<Snap[]>([])
  const snap = (): Snap => ({ d: draftsRef.current, w: widthsRef.current, h: heightsRef.current })
  function pushHistory(kind: string) {
    const now = Date.now()
    if (!(kind && kind === lastStep.current.kind && now - lastStep.current.at < 800)) {
      past.current.push(snap())
      if (past.current.length > 200) past.current.shift()
    }
    lastStep.current = { kind, at: now }
    future.current = []
    setHistoryTick((n) => n + 1)
  }
  function restore(v: Snap) {
    lastStep.current = { kind: '', at: 0 }
    if (v.d !== draftsRef.current) applyDrafts(v.d)
    else setHistoryTick((n) => n + 1)
    setView(v.w, v.h)
  }
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
    pushHistory(kind)
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
    future.current.push(snap())
    restore(prev)
  }
  function redo() {
    if (archiveRef.current) return
    const next = future.current.pop()
    if (!next) return
    past.current.push(snap())
    restore(next)
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      // 칸을 고른 상태(글자 입력 전)의 숨은 입력창에서는 되돌리기 단축키를 표에 쓴다
      if (t && !t.dataset.cellSelect && !t.dataset.weekSelect && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
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
  // 주 칸 여러 개를 한 번에(붙여넣기 · 지우기 · 채우기)
  function setWeekCells(list: { row: ProgressRow; key: string; cell: CellState }[]) {
    const live = list.filter((x) => !isDeleted(x.row))
    if (!live.length) return
    updateDrafts((d) =>
      live.reduce((acc, { row, key, cell }) => {
        if (row.isNew) {
          const id = row.key.slice(NEW_PREFIX.length)
          return {
            ...acc,
            newRows: acc.newRows.map((n) => {
              if (n.id !== id) return n
              const cells = { ...n.cells }
              if (cell.m || cell.f) cells[key] = cell
              else delete cells[key]
              return { ...n, cells }
            }),
          }
        }
        return { ...acc, edits: setCellEdit(acc.edits, row, key, cell) }
      }, d),
    )
  }
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
  const withFields = (d: Drafts, list: { row: ProgressRow; id: string; value: string }[]) =>
    list.reduce((acc, { row, id, value }) => {
      if (row.isNew) {
        const nid = row.key.slice(NEW_PREFIX.length)
        return { ...acc, newRows: acc.newRows.map((n) => (n.id === nid ? { ...n, fields: { ...n.fields, [id]: value } } : n)) }
      }
      return { ...acc, edits: setFieldEdit(acc.edits, row, id, value) }
    }, d)
  function setFields(list: { row: ProgressRow; id: string; value: string }[]) {
    const live = list.filter((x) => !isDeleted(x.row))
    if (!live.length) return
    updateDrafts((d) => withFields(d, live))
  }
  // 칸 병합 · 병합 해제. 병합하면 칸마다 적힌 글을 (같은 글은 한 번만) 줄을 바꿔 이어 맨 위 왼쪽 칸에 넣고 나머지 칸은 비운다.
  // 구글시트는 맨 위 왼쪽 값만 남기지만, 여기서는 글이 사라지지 않게 한다.
  function mergeCells(list: ProgressRow[], ids: string[], merge: boolean) {
    updateDrafts((d) => {
      const next = { ...d, merges: [...(d.merges ?? []), { rows: list.map((r) => r.key), ids, merge }] }
      if (!merge) return next
      const valueOf = (row: ProgressRow, id: string) => effectiveField(row, row.isNew ? undefined : d.edits?.[row.key], id).trim()
      const texts: string[] = []
      for (const row of list)
        for (const id of ids) {
          const v = valueOf(row, id)
          if (v && !texts.includes(v)) texts.push(v)
        }
      const joined = texts.join('\n')
      const set = list.flatMap((row, i) => ids.filter((_, j) => i || j).map((id) => ({ row, id, value: '' })))
      if (joined !== valueOf(list[0], ids[0])) set.unshift({ row: list[0], id: ids[0], value: joined })
      return withFields(next, set)
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
  // 고른 칸들 글자 서식: patch에 적힌 항목만 바꾼다(undefined = 그 항목 기본으로), null = 모두 기본으로
  function setFmt(list: { row: ProgressRow; id: string }[], patch: CellFmt | null) {
    const live = list.filter((x) => !isDeleted(x.row))
    if (!live.length) return
    updateDrafts((d) =>
      live.reduce((acc, { row, id }) => {
        const nid = row.isNew ? row.key.slice(NEW_PREFIX.length) : ''
        const cur = row.isNew ? (acc.newRows.find((n) => n.id === nid)?.fmt?.[id] ?? '') : effectiveFmt(row, acc.edits[row.key], id)
        const next = patch ? fmtString({ ...parseFmt(cur), ...patch }) : ''
        if (row.isNew) return { ...acc, newRows: acc.newRows.map((n) => (n.id === nid ? { ...n, fmt: { ...(n.fmt ?? {}), [id]: next } } : n)) }
        return { ...acc, edits: setFmtEdit(acc.edits, row, id, next) }
      }, d),
    )
  }
  // 열 전체 서식 · 칸 색: 지금 탭(그룹 L1)의 그 열 전체(필터로 거른 행 · 새 과제 포함, 지울 과제는 빼고). 다른 탭은 건드리지 않는다
  const allRowsOf = () =>
    data
      ? orderWithNewRows(
          data.rows.filter((r) => r.l1 === l1),
          drafts.newRows.filter((n) => n.l1 === l1),
          drafts.moves,
        )
      : []
  function setScopeFmt(ids: string[], patch: CellFmt | null) {
    setFmt(
      allRowsOf().flatMap((row) => ids.map((id) => ({ row, id }))),
      patch,
    )
  }
  function setScopeBg(ids: string[], hex: string) {
    const rows = allRowsOf().filter((r) => !isDeleted(r))
    updateDrafts((d) =>
      rows.reduce((acc, row) => {
        if (row.isNew) {
          const nid = row.key.slice(NEW_PREFIX.length)
          return { ...acc, newRows: acc.newRows.map((n) => (n.id === nid ? { ...n, bg: { ...(n.bg ?? {}), ...Object.fromEntries(ids.map((id) => [id, hex])) } } : n)) }
        }
        let edits = acc.edits
        for (const id of ids) edits = setBgEdit(edits, row, id, hex)
        return { ...acc, edits }
      }, d),
    )
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
  // 위/아래에 과제 여러 줄(values가 있으면 그 값 · 색 · 서식으로 채운다: 복사한 줄 끼워 넣기)
  type RowValues = { fields: Record<string, string>; bg: Record<string, string>; fmt: Record<string, string> }
  function addRows(row: ProgressRow, where: 'above' | 'below', count: number, values?: RowValues[]) {
    const list = buildNewRows(row, where, count, values)
    if (!list.length) return
    updateDrafts((d) => ({ ...d, newRows: [...d.newRows, ...list] }))
    if (!values) setOpenKey(NEW_PREFIX + list[0].id)
  }
  function buildNewRows(row: ProgressRow, where: 'above' | 'below', count: number, values?: RowValues[]): NewRow[] {
    const list: NewRow[] = []
    const ids = ['name', ...(data?.fields.map((f) => f.id) ?? [])]
    const nid = row.isNew ? row.key.slice(NEW_PREFIX.length) : ''
    const fmtOf = (id: string) => (row.isNew ? (drafts.newRows.find((x) => x.id === nid)?.fmt?.[id] ?? '') : effectiveFmt(row, drafts.edits[row.key], id))
    const inherited = Object.fromEntries(ids.map((id) => [id, fmtOf(id)]).filter(([, f]) => f))
    const inheritFmt = Object.keys(inherited).length ? inherited : null
    const n = values?.length ?? count
    for (let i = 0; i < n; i++) {
      const anchor = i === 0 ? { key: row.key, where } : { key: NEW_PREFIX + list[i - 1].id, where: 'below' as const }
      const r = makeNewRow({ l1: row.l1, ...baseGroupOf(row), h: row.h }, anchor)
      const v = values?.[i]
      if (v) Object.assign(r, { fields: { name: '', ...v.fields }, bg: v.bg, fmt: v.fmt })
      // 붙여넣기가 아니면 옆 행(기준 행)의 글자 서식을 이어받는다(시트처럼 -- 열 서식이 새 행에도 이어지게)
      else if (inheritFmt) r.fmt = { ...inheritFmt }
      list.push(r)
    }
    return list
  }
  // 입력 열 끼워 넣기(저장하면 시트에 열을 넣는다) · 지우기
  function addColumns(anchor: string, side: 'left' | 'right', labels: string[]) {
    const cols: NewCol[] = labels.map((label) => ({ id: NEW_COL_PREFIX + crypto.randomUUID(), label, anchor, side }))
    updateDrafts((d) => ({ ...d, newCols: [...(d.newCols ?? []), ...cols] }))
  }
  async function deleteColumns(ids: string[]) {
    const newIds = ids.filter((id) => id.startsWith(NEW_COL_PREFIX))
    const oldIds = ids.filter((id) => !id.startsWith(NEW_COL_PREFIX) && id !== 'name')
    if (oldIds.length) {
      const names = oldIds.map((id) => data?.fields.find((f) => f.id === id)?.label || '이름 없는 열').join(', ')
      if (
        !(await askConfirm({
          title: '열 삭제',
          message: `「${names}」 열을 지웁니다.\n저장하면 구글시트에서 이 열이 통째로(모든 그룹의 값까지) 지워집니다.`,
          confirmLabel: '열 삭제',
        }))
      )
        return
    }
    updateDrafts((d) => {
      // 지우는 새 열에 붙어 있던 새 열은 그 자리(지운 열의 기준)로 옮긴다
      let nc = d.newCols ?? []
      for (const id of newIds) {
        const gone = nc.find((c) => c.id === id)
        nc = nc.filter((c) => c.id !== id).map((c) => (gone && c.anchor === id ? { ...c, anchor: gone.anchor, side: gone.side } : c))
      }
      return { ...d, newCols: nc, delCols: Array.from(new Set([...(d.delCols ?? []), ...oldIds])) }
    })
  }
  // 여러 칸 한 번에: 값 · 서식 · 칸 색(준 것만)
  // append: 같은 한 번(되돌리기 한 번)에 끝에 새 과제 줄도 더한다(셀 삽입으로 밀려난 값)
  function setCells(list: { row: ProgressRow; id: string; value?: string; fmt?: string; bg?: string }[], append?: { row: ProgressRow; values: RowValues[] }) {
    const live = list.filter((x) => !isDeleted(x.row))
    const extra = append ? buildNewRows(append.row, 'below', append.values.length, append.values) : []
    if (!live.length && !extra.length) return
    updateDrafts((d0) =>
      live.reduce(
        (acc, { row, id, value, fmt, bg }) => {
          if (row.isNew) {
            const nid = row.key.slice(NEW_PREFIX.length)
            return {
              ...acc,
              newRows: acc.newRows.map((n) =>
                n.id === nid
                  ? {
                      ...n,
                      fields: value !== undefined ? { ...n.fields, [id]: value } : n.fields,
                      fmt: fmt !== undefined ? { ...(n.fmt ?? {}), [id]: fmt } : n.fmt,
                      bg: bg !== undefined ? { ...(n.bg ?? {}), [id]: bg } : n.bg,
                    }
                  : n,
              ),
            }
          }
          let edits = acc.edits
          if (value !== undefined) edits = setFieldEdit(edits, row, id, value)
          if (fmt !== undefined) edits = setFmtEdit(edits, row, id, fmt)
          if (bg !== undefined) edits = setBgEdit(edits, row, id, bg)
          return { ...acc, edits }
        },
        extra.length ? { ...d0, newRows: [...d0.newRows, ...extra] } : d0,
      ),
    )
  }
  // 새 과제의 구분: 기준 줄의 원래 구분(시트 값 · 새 과제면 그 과제의 구분). 고친 이름 · 나누기는 화면에서 다시 얹힌다
  function baseGroupOf(row: ProgressRow): { l2: string; l2Tag: string | null } {
    const b = data?.rows.find((r) => r.key === row.key) ?? drafts.newRows.find((n) => NEW_PREFIX + n.id === row.key)
    return b ? { l2: b.l2, l2Tag: b.l2Tag } : { l2: row.l2, l2Tag: row.l2Tag }
  }
  function addRow(row: ProgressRow, where: 'above' | 'below') {
    const n = makeNewRow({ l1: row.l1, ...baseGroupOf(row), h: row.h }, { key: row.key, where })
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
      // 연결된 탭이 시트에서 지워졌으면: 저장 대신 이 브라우저 연도로 바꿔 "구글시트로 만들기"를 다시 할 수 있게
      const { tabs } = await fetchSpreadsheetTabs(data.spreadsheetId)
      if (!tabs.some((t) => t.sheetId === data.sheetGid || t.title === data.tabTitle)) {
        const next = asLocal(data)
        setData(next)
        dataRef.current = next
        saveProgressData(next)
        writeActiveTab(null)
        setMessage(
          `시트에서 「${data.tabTitle}」 탭이 없어졌습니다. 이 연도를 "이 브라우저" 연도로 바꿨습니다(고친 내용 그대로) · "구글시트로 만들기"로 탭을 다시 만들 수 있습니다.`,
        )
        return
      }
      const fresh = await readFromSheet(data.spreadsheetId, data.year ?? now.getFullYear(), data.tabTitle)
      if (fresh.tabTitle !== data.tabTitle) throw new Error(`시트의 추진현황 탭이 「${fresh.tabTitle}」로 바뀌었습니다. 다시 불러온 뒤 입력해 주세요.`)
      const { kept, conflicts, ...plan } = buildSheetWrites(data, fresh, drafts)
      await writeSheetCells(data.spreadsheetId, data.sheetGid, plan)
      // 변경 기록(숨김 탭): 못 남겨도 저장은 된 것
      let logNote = ''
      try {
        const at = new Date().toLocaleString('sv-SE', { hour12: false }).slice(0, 16)
        const by = getConnectedEmail() ?? ''
        const log = describeChanges(data, drafts, kept).map((c) => [at, by, data.tabTitle, c.task, c.what, c.before, c.after])
        if (log.length) await appendRows(data.spreadsheetId, CHANGE_LOG_TAB, CHANGE_LOG_HEADER, log, { hidden: true })
      } catch {
        logNote = ' (변경 기록은 남기지 못했습니다)'
      }
      // 저장한 뒤 시트를 다시 읽어 화면을 시트와 맞춘다.
      accept(await readFromSheet(data.spreadsheetId, data.year ?? now.getFullYear(), data.tabTitle))
      updateDrafts(kept)
      clearHistory()
      setOpenKey(null)
      setMessage(
        `구글시트에 저장했습니다 · 고친 칸 ${plan.writes.length}${plan.inserts.length ? ` · 새 과제 ${plan.inserts.length}건` : ''}${plan.deletes.length ? ` · 지운 과제 ${plan.deletes.length}건` : ''}${plan.moves.length ? ` · 옮긴 줄 ${plan.moves.length}` : ''}${plan.colInserts.length ? ` · 새 열 ${plan.colInserts.length}` : ''}${plan.colDeletes.length ? ` · 지운 열 ${plan.colDeletes.length}` : ''}.` +
          (conflicts
            ? ` ${conflicts}건은 불러온 뒤 시트에서 먼저 바뀌었거나(또는 이름이 비어) 저장하지 않았습니다(주황 점으로 남겨 둠 · 확인 후 다시 저장).`
            : '') +
          logNote,
      )
    } catch (e) {
      setError(errText(e, '시트에 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  const tabRows = useMemo(() => (data?.rows ?? []).filter((r) => r.l1 === l1), [data, l1])
  const people = useMemo(
    () => Array.from(new Set((data?.rows ?? []).flatMap((r) => splitPeople(r.values.assignees ?? '')))).sort((a, b) => a.localeCompare(b, 'ko')),
    [data],
  )

  // 연도 고르기 목록: 시트 연도(지금 또는 내려 둔 시트 연도) + 이 브라우저에서 만든 연도
  const curProject = archive ?? (data ? { data, drafts } : null)
  const parkedSheet = Object.values(shelf).find((x) => !x.data.local)
  const localTabs = [
    ...Object.values(shelf)
      .filter((x) => x.data.local)
      .map((x) => `local:${x.data.tabTitle}`),
    ...(curProject?.data.local ? [`local:${curProject.data.tabTitle}`] : []),
  ]
  const allSheetTabs = data && !data.local ? (data.yearTabs ?? [data.tabTitle]) : parkedSheet ? (parkedSheet.data.yearTabs ?? [parkedSheet.data.tabTitle]) : []
  // 연도 메뉴에서 숨긴 탭(목록에서만 뺌). 지금 연결된 탭 · 보고 있는 탭은 숨기지 않는다.
  const sheetFileId = (data && !data.local ? data.spreadsheetId : parkedSheet?.data.spreadsheetId) ?? null
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(() => readHiddenTabs(sheetFileId))
  useEffect(() => setHiddenTabs(readHiddenTabs(sheetFileId)), [sheetFileId])
  const hideTab = (t: string) => {
    if (!sheetFileId) return
    const next = Array.from(new Set([...hiddenTabs, t]))
    setHiddenTabs(next)
    writeHiddenTabs(sheetFileId, next)
  }
  const showHiddenTabs = () => {
    if (!sheetFileId) return
    setHiddenTabs([])
    writeHiddenTabs(sheetFileId, [])
  }
  const allYears = [...localTabs, ...allSheetTabs].map((t) => Number(t.match(/(20\d{2})/)?.[1] ?? 0)).filter(Boolean)
  // 연도 메뉴: 연결된(입력하는) 시트 연도 · 연결하기(관리자) · 아래에 연결된 시트
  const connectedTitle = curProject && !curProject.data.local ? curProject.data.tabTitle : (readActiveTab() ?? parkedSheet?.data.tabTitle)
  const sheetTabs = allSheetTabs.filter((t) => !hiddenTabs.includes(t) || t === connectedTitle || t === data?.tabTitle)
  const hiddenCount = allSheetTabs.length - sheetTabs.length
  const sheetFileTitle = (curProject && !curProject.data.local ? curProject.data.fileTitle : parkedSheet?.data.fileTitle) ?? null
  const protectedLink = isProtectedSheet(parseSheetUrl(sheetLink)?.spreadsheetId)
  const sheetName = sheetFileTitle ?? (isOperatingSheet(parseSheetUrl(sheetLink)?.spreadsheetId) ? '디자인연구소 실적관리(운영 시트)' : '연결된 시트')
  const sheetOpenUrl = withGoogleAccount(data?.spreadsheetId && !data.local ? sheetUrl(data.spreadsheetId, data.sheetGid ?? undefined) : sheetLink)
  // 시트 링크를 그 행으로: 고른 과제가 있으면 그 행, 없으면 지금 그룹(L1)의 첫 행(불러온 때의 행 번호 기준)
  const activeRowRef = useRef<string | null>(null)
  // 보드 · 타임라인 공통 거르기(단계 + 지연 · 이번 달 마감). 보기를 바꿔도 그대로, 그룹(L1) 탭을 바꾸면 전체로
  const [viewFilter, setViewFilter] = useState<ViewFilter>(ALL_FILTER)
  useEffect(() => setViewFilter(ALL_FILTER), [l1])
  const pickedRowRef = useRef<string | null>(null)
  function sheetRowUrl(key: string | null): string {
    if (!data?.spreadsheetId || data.local || data.sheetGid == null) return sheetOpenUrl
    const hit = key ? data.rows.find((r) => r.key === key) : null
    const inGroup = data.rows.filter((r) => r.l1 === l1).map((r) => r.row)
    const n = hit ? hit.row : inGroup.length ? Math.min(...inGroup) : null
    return n == null ? sheetOpenUrl : withGoogleAccount(`${sheetUrl(data.spreadsheetId, data.sheetGid)}&range=A${n + 1}`)
  }
  // 링크를 누르는 순간 표의 선택이 풀리므로 누르기 시작할 때의 선택을 잡아 둔다
  const sheetLinkProps = {
    onMouseDown: () => {
      pickedRowRef.current = activeRowRef.current
    },
    onClick: (e: React.MouseEvent) => {
      e.preventDefault()
      window.open(sheetRowUrl(pickedRowRef.current), '_blank', 'noopener')
    },
  }
  // 연도 메뉴 = 무엇을 보나(연도 고르기 · 새 연도). 아래에는 숨긴 연도 되돌리기만.
  const yearMenuFooter =
    hiddenCount > 0 ? (
      <button onClick={showHiddenTabs} className="mac-menu-item text-label-2" title="목록에서 숨긴 연도를 다시 보입니다">
        <Eye {...icSm} className="shrink-0" />
        숨긴 연도 {hiddenCount}개 다시 보이기
      </button>
    ) : undefined
  // 파일 메뉴(머리 오른쪽 「파일」) = 불러오기 · 내보내기 · 시트 연결. 오랜만에 와서 불러오기를 찾을 때 맨 위에 보이게.
  const fileMenuItems = (
    <>
      <p className="px-3.5 pb-1 pt-1 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-3">불러오기</p>
      {isSheetsApiConfigured() && (
        <button onClick={() => loadFromSheet()} disabled={loading || saving} className="mac-menu-item disabled:opacity-40">
          <RefreshCw {...icSm} className="shrink-0" />
          {data && !data.local && data.spreadsheetId ? '구글시트에서 다시 불러오기' : '구글시트에서 불러오기'}
          {data && !data.local && data.spreadsheetId && (
            <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] font-normal text-label-3" title={`${fmt(data.fetchedAt)} 불러옴`}>
              {timeAgo(data.fetchedAt)}
            </span>
          )}
        </button>
      )}
      {canManage && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading || saving}
          className="mac-menu-item disabled:opacity-40"
          title="시트에서 파일 › 다운로드 › xlsx로 받은 파일"
        >
          <Upload {...icSm} className="shrink-0" />
          엑셀 파일 열기
          <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] font-normal text-label-3">보기 전용</span>
        </button>
      )}
      <div className="mac-menu-sep" />
      <p className="px-3.5 pb-1 pt-1 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-3">내보내기</p>
      {data && (
        <button
          onClick={() => void downloadProgressExcel(data, drafts, l1s)}
          className="mac-menu-item"
          title={`시트 모양 그대로(칸 색·메모 포함)${countDrafts(drafts) ? ', 저장 안 한 변경도 반영' : ''}`}
        >
          <FileDown {...icSm} className="shrink-0" />
          엑셀로 받기
        </button>
      )}
      {((data?.local && canManage) || (data && !data.local && !data.spreadsheetId)) && (
        <button
          onClick={() => void createInSheet()}
          disabled={saving}
          className="mac-menu-item disabled:opacity-40"
          title="연결된 구글시트 파일에 이 연도 탭을 새로 만들어 표를 통째로 씁니다(고친 내용 포함). 그 뒤로는 시트와 연결됩니다."
        >
          <CloudUpload {...icSm} className="shrink-0" />
          {data?.local ? '구글시트로 만들기' : '구글시트로 올리기'}
          <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] font-normal text-label-3">{data?.local ? '이 브라우저 → 시트' : '엑셀 → 시트'}</span>
        </button>
      )}
      <div className="mac-menu-sep" />
      <p className="px-3.5 pb-1 pt-1 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-3">구글시트</p>
      <a href={sheetOpenUrl} target="_blank" rel="noreferrer" className="mac-menu-item" title={sheetLink}>
        <ExternalLink {...icSm} className="shrink-0" />
        <span className="min-w-0 truncate">{sheetName} 열기</span>
        {protectedLink && <span className="mac-badge ml-auto shrink-0 bg-black/[0.06] text-label-2">읽기 전용</span>}
      </a>
      {/* 팀원도 팀장이 공유한 시트 링크로 연다(이 브라우저에 기억 · 운영 팀 시트는 읽기만) */}
      <button onClick={openSheetSettings} className="mac-menu-item">
        <Settings2 {...icSm} className="shrink-0" />
        {canManage ? '시트 연결 설정…' : '공유받은 시트 링크로 열기…'}
      </button>
      <button onClick={() => setAskSavePref(!askSave)} className="mac-menu-item" title="끄면 입력 끝내기 · 저장 때 묻지 않고 바로 구글시트에 업데이트합니다(과제를 지울 때는 늘 묻습니다)">
        <Check {...icSm} className={`shrink-0 ${askSave ? '' : 'opacity-0'}`} />
        업데이트 전에 묻기
      </button>
    </>
  )
  function openSheetSettings() {
    setLinkOpen(true)
  }
  // 시트 연결 설정: 어디에 연결하나(팀원은 팀장이 공유한 시트 링크를 넣는다 -- 이 브라우저에 기억)
  const sheetSettings = linkOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={() => setLinkOpen(false)}>
      <div className="w-[min(560px,calc(100vw-2rem))] rounded-[14px] bg-white p-6 shadow-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-[length:calc(17px*var(--ui-fs,1))] font-bold text-label">
            <Settings2 size={18} strokeWidth={1.9} className="text-accent" />
            시트 연결 설정
          </h2>
          <button onClick={() => setLinkOpen(false)} className="-mr-2 -mt-1 rounded-full p-1.5 text-label-3 hover:bg-black/[0.06]" aria-label="닫기">
            <X size={16} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[length:calc(14px*var(--ui-fs,1))]">
          <span className="text-label-3">지금 연결</span>
          <a href={sheetOpenUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            {sheetName} ↗
          </a>
          {protectedLink && <span className="mac-badge bg-black/[0.06] text-label-2">읽기 전용 · 저장 안 함</span>}
        </div>
        <div className="mt-4 rounded-card border border-separator p-3">
          <SharedSheetPrompt
            url={sharedLink}
            label="관리자가 공유한 시트"
            tab={sheetLink === sharedLink ? readActiveTab() : null}
            year={now.getFullYear()}
            busy={loading}
            onConnect={(u) => void connectSheet(u)}
          />
        </div>
        {/* 「관리자가 공유한 시트」가 어디서 오는지: 권한 시트의 「연결 시트」 표(내 팀 줄 → 없으면 「전체」 줄) */}
        <p className="mt-2.5 text-[length:calc(13px*var(--ui-fs,1))] leading-relaxed text-label-3">
          관리자가 공유한 시트는 <b className="font-semibold text-label-2">관리 › 권한 · 시트 설정 › ② 팀별 과제 시트</b>에서 정합니다. 내 팀 줄의 시트, 없으면 「전체」 줄의 시트가
          보입니다.
        </p>
      </div>
    </div>
  )
  const confirmDialog = ask && (
    <ConfirmDialog
      open
      title={ask.title}
      message={ask.message}
      confirmLabel={ask.confirmLabel}
      tone={ask.tone}
      onConfirm={() => {
        ask.resolve(true)
        setAsk(null)
      }}
      onCancel={() => {
        ask.resolve(false)
        setAsk(null)
      }}
    />
  )
  const newYearDialog = newYearOpen && (
    <NewYearDialog
      defaultYear={allYears.length ? Math.max(...allYears) + 1 : now.getFullYear()}
      taken={[...localTabs.map((t) => t.slice(6)), ...allSheetTabs]}
      inheritFrom={curProject?.data.tabTitle ?? null}
      onCreate={createYear}
      onClose={() => setNewYearOpen(false)}
      sheetName={canManage && isSheetsApiConfigured() && parseSheetUrl(sheetLink) && !protectedLink ? sheetName : undefined}
    />
  )

  if (!data) {
    return (
      <>
        <MenuSlot>
          <YearSwitcher
            title={`${now.getFullYear()} 추진현황`}
            tabs={sheetTabs}
            editableTitle={`${now.getFullYear()} 추진현황`}
            localTabs={localTabs}
            onPick={pickYear}
            onCreate={canManage ? () => setNewYearOpen(true) : undefined}
            footer={yearMenuFooter}
            onDeleteLocal={(id) => void deleteLocal(id)}
            onOpenMenu={() => void refreshYearTabs()}
            onHide={hideTab}
          />
        </MenuSlot>
        <MenuSlot id={PROGRESS_ACTIONS_SLOT}>
          <FileMenu label={FILE_LABEL} title="불러오기 · 내보내기 · 시트 연결">{fileMenuItems}</FileMenu>
        </MenuSlot>
        {newYearDialog}
        {confirmDialog}
        {sheetSettings}
        <div className="mx-auto mt-10 max-w-[940px] text-center">
          <h2 className="text-[length:calc(20px*var(--ui-fs,1))] font-semibold tracking-[-0.01em] text-label">추진현황을 시작하세요</h2>
          <p className="mt-1.5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
            그룹(L1)마다 일정표를 만듭니다. 시작한 뒤에는 오른쪽 위 「파일」 메뉴에서 다시 불러오거나 엑셀로 받습니다.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-left">
            {isSheetsApiConfigured() && (
              // 먼저 관리자가 공유한(지금 연결된) 시트를 이름으로 보여 주고 연결할지 묻는다. 아니면 공유받은 링크 붙여넣기
              <div className="w-[380px] rounded-card border border-accent/40 bg-white p-4">
                <span className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-control bg-subtle text-accent">
                    <RefreshCw size={17} strokeWidth={1.8} />
                  </span>
                  <span className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">구글시트에서 불러오기</span>
                  {canManage && <span className="mac-badge ml-auto bg-accent-soft text-accent">추천</span>}
                </span>
                <div className="mt-3">
                  <SharedSheetPrompt
                    url={sheetLink}
                    label={sheetLink === sharedLink ? '관리자가 공유한 시트' : '지금 연결된 시트'}
                    tab={readActiveTab()}
                    year={now.getFullYear()}
                    busy={loading}
                    readOnlyNote={isProtectedSheet(parseSheetUrl(sheetLink)?.spreadsheetId) ? '운영 팀 시트라 읽기만 합니다(저장 안 함).' : undefined}
                    onConnect={(u) => (u === sheetLink ? void loadFromSheet() : void connectSheet(u))}
                  />
                </div>
              </div>
            )}
            {canManage && (
              <StartCard
                Icon={Upload}
                title="엑셀 파일 열기"
                desc="구글시트에서 xlsx로 받은 파일을 봅니다(보기 전용)."
                disabled={loading}
                onClick={() => fileRef.current?.click()}
              />
            )}
            {/* 팀원은 공유된 구글시트로 시작만 한다 -- 새 연도는 관리자 */}
            {canManage && (
              <StartCard
                Icon={FilePlus2}
                title="새 연도 만들기"
                desc="이전 연도 구성을 이어받거나 빈 표로 시작합니다."
                disabled={loading}
                onClick={() => setNewYearOpen(true)}
              />
            )}
          </div>
          {!canManage && !isSheetsApiConfigured() && (
            <p className="mt-4 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">구글 연동이 켜져 있지 않습니다. 관리자에게 공유된 추진현황 시트를 요청해 주세요.</p>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
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
  const ordered: ProgressRow[] = applyL2Splits(
    applyL2Renames(
      orderWithNewRows(
        tabRows,
        drafts.newRows.filter((n) => n.l1 === l1),
        drafts.moves,
      ),
      drafts,
    ),
    drafts,
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
  // 새 열 · 지운 열을 얹은 입력 열
  const eff = effectiveFields(data.fields, data.headerStyle, drafts)
  const fieldIds = eff.fields.map((f) => f.id)
  const viewOf = (row: ProgressRow): ScheduleRowView => {
    const e = row.isNew ? undefined : edits[row.key]
    const vals: Record<string, string> = {}
    for (const id of fieldIds) vals[id] = effectiveField(row, e, id)
    const bg: Record<string, string> = {}
    for (const id of [...fieldIds, L2_KEY]) {
      const hex = effectiveBg(row, e, id)
      if (hex) bg[id] = hex
    }
    const notes: Record<string, string> = {}
    for (const k of new Set([...Object.keys(row.notes), ...Object.keys(e?.notes ?? {})])) {
      const n = effectiveNote(row, e, k)
      if (n) notes[k] = n
    }
    const fmt: Record<string, string> = {}
    for (const k of new Set([...Object.keys(row.fmt ?? {}), ...Object.keys(e?.fmt ?? {})])) {
      const t = effectiveFmt(row, e, k)
      if (t) fmt[k] = t
    }
    return {
      row,
      cells: effectiveCells(row, e),
      vals,
      bg,
      notes,
      fmt,
      editedCells: new Set(Object.keys(e?.cells ?? {})),
      editedFields: new Set([...Object.keys(e?.fields ?? {}), ...Object.keys(e?.bg ?? {}), ...Object.keys(e?.notes ?? {}), ...Object.keys(e?.fmt ?? {})]),
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
  const fieldById = new Map(eff.fields.map((f) => [f.id, f]))
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
  // 저장 안 한 변경이 있는 그룹(L1): 고친 줄 · 새 과제 · 지울 과제 · 옮긴 줄 · 구분 이름 · 구분 나누기
  const dirtyL1 = (() => {
    const l1Of = new Map(data.rows.map((r) => [r.key, r.l1]))
    const out = new Set<string>()
    const add = (k: string) => {
      const v = l1Of.get(k)
      if (v !== undefined) out.add(v)
    }
    for (const [k, e] of Object.entries(drafts.edits)) if (e.cells || e.fields || e.bg || e.notes || e.fmt) add(k)
    for (const n of drafts.newRows) out.add(n.l1)
    for (const k of drafts.deleted ?? []) add(k)
    for (const m of drafts.moves ?? []) add(m.key)
    for (const k of Object.keys(drafts.l2Renames ?? {})) out.add(k.split('␟')[0])
    for (const sp of drafts.l2Splits ?? []) add(sp.key)
    return out
  })()
  const merges = effectiveMerges(data, drafts)
  const protectedSheet = isProtectedSheet(data.spreadsheetId)
  const seenAt = Math.max(new Date(data.fetchedAt).getTime(), confirmedAt)
  const canSave = !!data.spreadsheetId && data.sheetGid !== null && isSheetsApiConfigured() && !protectedSheet

  // ---- 탭 위 알림 줄: 지금 보는 표가 어디서 언제 왔나 · 저장 안 한 변경 · 새 내용 받기 (머리 구석에 작게 두지 않고 크게)
  const fromXlsx = !data.local && !data.spreadsheetId
  // 입력을 끝낼 때 저장 안 한 변경이 있으면 바로 구글시트 저장을 권한다(저장해야 다른 팀원이 본다)
  function finishEditing() {
    if (editCount > 0 && !data!.local && canSave) requestSave()
    setEditing(false)
  }
  // 업데이트 요청: 묻기를 껐으면 바로(과제를 지울 때는 늘 묻는다)
  function requestSave() {
    // 운영 시트(디자인연구소 실적관리)는 늘 확인을 거친다
    if (askSave || (drafts.deleted?.length ?? 0) > 0 || isOperatingSheet(data?.spreadsheetId)) setConfirmSave(true)
    else void saveToSheet()
  }
  async function acceptRemote() {
    if (!remote) return
    const n = overlapCount(data!, remote, draftsRef.current)
    if (
      n > 0 &&
      !(await askConfirm({
        title: '같은 칸을 다른 팀원도 고쳤습니다',
        message: `저장 안 한 내 변경 중 ${n}칸을 다른 팀원도 시트에서 바꿨습니다. 받으면 그 칸은 저장할 때 내 값으로 덮어씁니다. 먼저 내 변경을 저장하면 겹치는 칸은 저장하지 않고 알려 줍니다.`,
        confirmLabel: '받기',
      }))
    )
      return
    accept(remote)
    markSynced()
  }
  const excelButton = (
    <Button variant="secondary" size="sm" onClick={() => void downloadProgressExcel(data, drafts, l1s)} title="고친 내용까지 넣어 시트 모양 그대로 엑셀로 받습니다">
      <FileDown {...icSm} />
      엑셀로 받기
    </Button>
  )
  // 보기 전환(표 · 보드 · 타임라인 · 구글시트): 도구 줄과, 구글시트 모드의 아래 떠 있는 줄에서 같이 쓴다
  const viewItems = [
    ['table', '표', Table2],
    ['board', '보드', SquareKanban],
    ['timeline', '타임라인', ChartGantt],
    ...(data?.spreadsheetId ? ([['sheet', '구글시트 그대로(바로 편집)', FileSpreadsheet]] as const) : []),
  ] as const
  const CurViewIcon = (viewItems.find((v) => v[0] === boardView) ?? viewItems[0])[2]
  // 평소에는 고른 보기 아이콘 하나만 보이고, 마우스를 올리면(또는 누르면) 옆으로 펼쳐져 바꿀 수 있다(옆 그룹 탭이 잘리지 않게)
  const viewSwitchEl = (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setViewMenu(true)}
      onMouseLeave={() => setViewMenu(false)}
      onFocus={() => setViewMenu(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setViewMenu(false)
      }}
    >
      <button
        onClick={() => setViewMenu((v) => !v)}
        title="보기 바꾸기"
        aria-label="보기 바꾸기"
        aria-haspopup="true"
        aria-expanded={viewMenu}
        className="flex h-8 w-9 items-center justify-center rounded-[9px] bg-black/[0.05] text-label"
      >
        <CurViewIcon size={16} strokeWidth={1.8} />
      </button>
      {viewMenu && (
        <div
          className="absolute left-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-0.5 rounded-[10px] bg-white p-0.5 shadow-pop ring-1 ring-black/[0.06]"
          role="tablist"
          aria-label="보기"
        >
          {viewItems.map(([k, label, Icon]) => (
            <button
              key={k}
              role="tab"
              aria-selected={boardView === k}
              onClick={() => {
                changeBoardView(k)
                setViewMenu(false)
              }}
              title={label}
              aria-label={label}
              className={`flex h-7 w-8 items-center justify-center rounded-[7px] ${boardView === k ? 'bg-black/[0.07] text-label' : 'text-label-2 hover:bg-black/[0.04] hover:text-label'}`}
            >
              <Icon size={16} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // 위 줄(모든 보기 공통): 보기 전환 │ 그룹(L1) 탭 │ (구글시트 보기일 때) 구글 도구 모음 · 새로고침 · 새 창
  function jumpToGroup(name: string) {
    if (!data) return
    const first = Math.min(...data.rows.filter((r) => r.l1 === name).map((r) => r.row + 1))
    if (Number.isFinite(first)) setSheetJump(first)
  }
  const dockBar = (
    <div className="flex h-11 items-center gap-2 border-b border-separator px-1 text-[length:calc(13px*var(--ui-fs,1))]">
      {!(editing && boardView === 'table') && viewSwitchEl}
      {!(editing && boardView === 'table') && <span className="h-5 w-px shrink-0 bg-separator" />}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {/* 브라우저 탭처럼: 폭이 모자라면 탭이 함께 줄고 이름은 말줄임(가려지거나 옆으로 밀리지 않게) */}
        <div ref={tabStripRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {shownL1s.map((name) => {
            const dirty = dirtyL1.has(name)
            const rowsOf = data.rows.filter((r) => r.l1 === name)
            const newOf = drafts.newRows.filter((n) => n.l1 === name)
            const alive = rowsOf.filter((r) => !deletedSet.has(r.key)).length + newOf.length
            const gone = alive === 0 && rowsOf.length > 0
            const on = name === l1
            return (
              <div
                key={name}
                onClick={() => {
                  setActiveL1(name)
                  if (boardView === 'sheet') jumpToGroup(name)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setTabMenu({ name, x: Math.min(e.clientX, window.innerWidth - 230), y: e.clientY + 4 })
                }}
                data-l1-tab={name}
                className={`group flex h-7 min-w-[44px] max-w-[240px] flex-[0_1_auto] cursor-pointer select-none items-center overflow-hidden rounded-control text-[length:calc(13.5px*var(--ui-fs,1))] transition-colors ${
                  tabsCompact ? 'gap-1 px-2' : 'gap-1.5 px-2.5'
                } ${
                  on
                    ? 'bg-black/[0.07] font-semibold text-label'
                    : 'font-medium text-label-2 hover:bg-black/[0.04] hover:text-label'
                }`}
                title={gone ? `${name} · 삭제로 표시함(저장하면 시트에서 지움)` : `${name}${dirty ? ' · 저장 안 한 변경 있음' : ''} · 우클릭하면 숨기기`}
              >
                {newOf.length > 0 && rowsOf.length === 0 && (
                  <span className="shrink-0 rounded-[3px] bg-accent px-1 text-[10px] font-bold text-white">새</span>
                )}
                <span className={`min-w-0 truncate break-all ${gone ? 'text-label-3 line-through' : ''}`}>{name === NO_L1 ? 'L1 없음' : name}</span>
                {/* 과제 수: 저장 안 한 변경이 있으면 오른쪽 위 주황 점, 과제가 늘거나 줄었으면 숫자도 주황 */}
                {!tabsCompact ? (
                  <span
                    className={`relative shrink-0 text-[length:calc(12px*var(--ui-fs,1))] tabular-nums ${alive !== rowsOf.length ? 'font-bold text-orange-600' : 'font-medium text-label-3'}`}
                  >
                    {alive}
                    {dirty && <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-orange-500" aria-label="저장 안 한 변경 있음" />}
                  </span>
                ) : (
                  dirty && <span className="h-1.5 w-1.5 shrink-0 self-start rounded-full bg-orange-500" aria-label="저장 안 한 변경 있음" />
                )}
                {/* 탭 ✕ 삭제는 없앴다(우리 팀이 아닌 그룹은 우클릭 › 숨기기). 줄을 모두 지워 빈 그룹이 되면 되살리기만 */}
                {!readOnly && gone && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      restoreRows(rowsOf)
                    }}
                    title="그룹(L1) 삭제 취소"
                    aria-label="그룹 삭제 취소"
                    className="-mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-label-3 hover:bg-black/[0.07] hover:text-label"
                  >
                    <Undo2 size={12} strokeWidth={2} />
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
              className="flex h-7 shrink-0 items-center gap-1 rounded-control px-2.5 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium text-label-3 hover:bg-black/[0.04] hover:text-label"
            >
              <Plus {...icSm} />
              그룹 추가
            </button>
          )}
        </div>
        {/* 보기: 표에서 열을 켜고 끄듯 그룹(L1) 탭을 켜고 끈다 */}
        <div className="relative shrink-0">
          {/* 우리 팀이 아닌 그룹은 숨긴다(이 브라우저에서만). 숨긴 게 있으면 개수를 보여 되돌리기 쉽게 */}
          <button
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setViewOpen(viewOpen ? null : { x: Math.min(r.right - 264, window.innerWidth - 272), y: r.bottom + 4 })
            }}
            title={`${hiddenL1Count > 0 ? `숨긴 그룹 ${hiddenL1Count}개 · ` : ''}보이는 그룹 고르기 · 탭을 우클릭해도 숨길 수 있습니다`}
            aria-label={hiddenL1Count > 0 ? `숨긴 그룹 ${hiddenL1Count}개` : '그룹 숨기기'}
            className={`flex h-7 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium hover:bg-black/[0.05] hover:text-label ${
              viewOpen || hiddenL1Count > 0 ? 'bg-black/[0.05] text-label' : 'text-label-2'
            }`}
          >
            <EyeOff size={14} strokeWidth={1.8} />
            {hiddenL1Count > 0 && <span className="tabular-nums">{hiddenL1Count}</span>}
          </button>
          {viewOpen && (
            <div className="fixed inset-0 z-40" onMouseDown={() => setViewOpen(null)}>
              <div
                className="mac-pop absolute z-50 max-h-[70vh] w-64 overflow-y-auto py-1 text-[length:calc(14px*var(--ui-fs,1))]"
                style={{ left: viewOpen.x, top: viewOpen.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-2">보이는 그룹</span>
                  {hiddenL1.length > 0 && (
                    <button onClick={() => setHiddenL1([])} className="text-[length:calc(13px*var(--ui-fs,1))] font-medium text-accent hover:underline">
                      모두 보기
                    </button>
                  )}
                </div>
                {l1s.map((name) => {
                  const shown = !hiddenL1.includes(name)
                  const last = shown && shownL1s.length === 1
                  return (
                    <label key={name} className={`flex items-center gap-2 px-3 py-1.5 ${last ? 'opacity-50' : 'cursor-pointer hover:bg-black/[0.04]'}`}>
                      {/* 체크 대신 눈: 뜬 눈 = 보임, 감은 눈(연한 회색) = 숨김 */}
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={shown}
                        disabled={last}
                        onChange={() => setHiddenL1(shown ? [...hiddenL1, name] : hiddenL1.filter((x) => x !== name))}
                      />
                      {shown ? (
                        <Eye size={16} strokeWidth={1.9} className="shrink-0 text-accent" />
                      ) : (
                        <EyeOff size={16} strokeWidth={1.7} className="shrink-0 text-label-3/60" />
                      )}
                      <span className={`truncate ${shown ? '' : 'text-label-3'}`}>{name === NO_L1 ? 'L1 없음' : name}</span>
                      <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] text-label-3">
                        {data.rows.filter((r) => r.l1 === name).length + drafts.newRows.filter((n) => n.l1 === name).length}
                      </span>
                    </label>
                  )
                })}
                <p className="mt-1 border-t border-separator px-3 pt-1.5 text-[length:calc(12px*var(--ui-fs,1))] leading-snug text-label-3">
                  눈을 누르면 그 그룹 탭을 숨깁니다(감은 눈 = 숨김). 탭을 우클릭해도 숨길 수 있습니다. 숨겨도 시트에서는 지워지지 않고, 이 브라우저에서만 안 보입니다.
                </p>
              </div>
            </div>
          )}
        </div>
        {tabMenu && (
          <div className="fixed inset-0 z-40" onMouseDown={() => setTabMenu(null)} onContextMenu={(e) => (e.preventDefault(), setTabMenu(null))}>
            <div
              className="mac-pop absolute z-50 w-[220px] py-1 text-[length:calc(14px*var(--ui-fs,1))]"
              style={{ left: tabMenu.x, top: tabMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setTabMenu(null)}
            >
              <p className="truncate px-3.5 pb-1 pt-1 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-3">{tabMenu.name === NO_L1 ? 'L1 없음' : tabMenu.name}</p>
              <button
                className="mac-menu-item disabled:opacity-40"
                disabled={shownL1s.length <= 1}
                onClick={() => setHiddenL1([...hiddenL1, tabMenu.name])}
              >
                <EyeOff {...icSm} className="shrink-0" />이 그룹 숨기기
              </button>
              <button
                className="mac-menu-item disabled:opacity-40"
                disabled={shownL1s.length <= 1}
                onClick={() => {
                  setHiddenL1(l1s.filter((x) => x !== tabMenu.name))
                  setActiveL1(tabMenu.name)
                }}
              >
                <Eye {...icSm} className="shrink-0" />이 그룹만 보기
              </button>
              {hiddenL1Count > 0 && (
                <button className="mac-menu-item" onClick={() => setHiddenL1([])}>
                  <Eye {...icSm} className="shrink-0" />숨긴 그룹 {hiddenL1Count}개 다시 보기
                </button>
              )}
            </div>
          </div>
        )}
        <div className="hidden">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
        </div>
      </div>
      {boardView === 'sheet' && data.spreadsheetId && (
        <>
          <span className="h-5 w-px shrink-0 bg-separator" />
          <button
            role="switch"
            aria-checked={sheetFull}
            onClick={() => setSheetFull(!sheetFull)}
            title={sheetFull ? '구글 도구 모음 숨기기' : '구글 도구 모음 보기(서식 · 수식)'}
            aria-label="구글 도구 모음"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-control ${sheetFull ? 'bg-accent-soft text-accent-hover' : 'text-label-2 hover:bg-black/[0.05] hover:text-label'}`}
          >
            <PanelTop {...icSm} />
          </button>
          <button
            onClick={() => setSheetReload((n) => n + 1)}
            title="구글시트 화면을 다시 불러옵니다"
            aria-label="새로고침"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label"
          >
            <RotateCw {...icSm} />
          </button>
          <a
            href={`https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit${data.sheetGid !== null ? `#gid=${data.sheetGid}` : ''}`}
            target="_blank"
            rel="noreferrer"
            title="새 창에서 열기(화면이 안 보이거나 로그인이 필요할 때)"
            aria-label="새 창에서 열기"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label"
          >
            <ExternalLink {...icSm} />
          </a>
        </>
      )}
    </div>
  )

  const statusBar = view === 'rate' ? null : fromXlsx ? (
    <NoticeBar
      tone="warn"
      icon={<FileSpreadsheet size={18} strokeWidth={1.9} />}
      title="엑셀 파일을 보고 있습니다. 구글시트로 올려야 팀원과 동기화됩니다."
      sub={`「${data.source}」 · ${fmt(data.fetchedAt)}에 열음 · ${
        editCount ? `고친 내용 ${editCount}건은 아직 이 브라우저에만 있습니다` : '여기서 고친 내용은 이 브라우저에만 남습니다'
      }`}
    >
      {excelButton}
      {isSheetsApiConfigured() && (
        <Button variant="secondary" size="sm" onClick={() => void loadFromSheet()} disabled={loading || saving} title="엑셀 대신 연결된 구글시트의 최신 내용을 엽니다">
          <RefreshCw {...icSm} />
          구글시트에서 불러오기
        </Button>
      )}
      {isSheetsApiConfigured() && (
        <button
          onClick={() => void createInSheet()}
          disabled={saving || !parseSheetUrl(sheetLink)}
          title={`연결된 시트(${sheetName})에 이 표를 새 탭으로 올립니다(고친 내용 포함). 같은 이름 탭이 있으면 「… (엑셀 날짜)」 탭으로 따로 만듭니다.`}
          className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-[#C2410C] px-3 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50"
        >
          {saving ? <Spinner className="h-3.5 w-3.5" /> : <CloudUpload {...icSm} />}
          구글시트로 올리기
        </button>
      )}
    </NoticeBar>
  ) : null
  // 시트 상태 줄: 머리 줄(과제 입력 / 연도 / 추진현황 … 파일) 가운데 빈 곳에 둔다
  const headStatus = !fromXlsx && !data.local && data.spreadsheetId ? (
    <>
      {/* 상태 줄(높이 고정 · 늘 보임): 시트 › 탭 · 불러온 시각 + 지금 상태 하나. 상태에 따라 색과 오른쪽 버튼만 바뀌고 줄 수는 그대로라
          칠하는 도중 알림이 생겨도 표가 밀리지 않는다 */}
      {(() => {
        const unsaved = editCount > 0 && !readOnly
        const state = loading
          ? 'loading'
          : unsaved
            ? canSave
              ? 'unsaved'
              : 'unsavable'
            : remote
              ? 'remote'
              : stale
                ? 'stale'
                : protectedSheet
                  ? 'locked'
                  : 'ok'
        const tone =
          state === 'unsaved' || state === 'unsavable'
            ? 'border-[#F5B48A] bg-[#FFF3EA]'
            : state === 'remote' || state === 'stale'
              ? 'border-accent/25 bg-accent-soft'
              : state === 'locked'
                ? 'border-separator bg-subtle'
                : 'border-transparent'
        return (
          <div
            className={`flex h-9 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-[10px] border px-3 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2 ${tone}`}
          >
            <FileSpreadsheet size={15} strokeWidth={1.9} className="shrink-0 text-emerald-700" />
            <a
              href={sheetOpenUrl}
              target="_blank"
              rel="noreferrer"
              {...sheetLinkProps}
              className="min-w-0 shrink truncate font-medium text-label hover:underline"
              title={`${sheetName} › ${data.tabTitle} · 구글시트에서 열기(고른 과제 행 · 없으면 지금 그룹의 첫 행으로) · ${fmt(data.fetchedAt)} 불러옴`}
            >
              {sheetName} › {data.tabTitle}
            </a>
            <span className="hidden shrink-0 text-label-3 2xl:inline">·</span>
            <span className="hidden shrink-0 2xl:inline">{fmt(data.fetchedAt)} 불러옴</span>
            {state !== 'stale' && <span className="shrink-0 text-label-3">·</span>}
            {state === 'loading' ? (
              <span className="flex shrink-0 items-center gap-1.5 text-accent">
                <Spinner className="h-3.5 w-3.5" />
                {loadingNote ? `${loadingNote}를 ` : ''}불러오는 중…
              </span>
            ) : state === 'unsaved' || state === 'unsavable' ? (
              <span className="flex shrink-0 items-center gap-1.5 font-semibold text-[#9A3412]" title="주황 점 = 고쳤지만 아직 저장 안 한 칸">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                저장 안 한 변경 {editCount}건{state === 'unsavable' ? ' · 이 시트에는 저장되지 않음' : ''}
                {remote && <span className="font-normal text-accent">· 다른 팀원도 새로 저장함</span>}
              </span>
            ) : state === 'remote' ? (
              <b className="shrink-0 font-semibold text-accent">다른 팀원이 새로 저장했습니다</b>
            ) : state === 'stale' ? null : state === 'locked' ? (
              <span className="shrink-0 font-medium text-label">🔒 읽기 전용 · 고쳐도 저장되지 않습니다</span>
            ) : (
              <span className="flex shrink-0 items-center gap-1" title="열어 둔 동안 5분마다, 다시 열면 바로 시트와 견줘 봅니다">
                <CircleCheck size={14} strokeWidth={2} className="text-emerald-600" />
                최신 · {timeAgo(new Date(seenAt).toISOString())} 확인
                {/* 다시 불러오기: 확인 시각 바로 뒤 아이콘(글자는 툴팁) */}
                <button
                  onClick={() => void loadFromSheet()}
                  disabled={saving}
                  title="다시 불러오기"
                  aria-label="다시 불러오기"
                  className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-[6px] text-label-3 hover:bg-black/[0.06] hover:text-label disabled:opacity-40"
                >
                  <RefreshCw size={13} strokeWidth={2} />
                </button>
              </span>
            )}
            <span className="flex shrink-0 items-center gap-1.5">
              {state === 'unsaved' || state === 'unsavable' ? (
                <>
                  <button
                    onClick={() => updateDrafts({ edits: {}, newRows: [] })}
                    disabled={saving}
                    title="모두 되돌리기 -- 고친 내용과 새 과제를 모두 지우고 시트 값으로"
                    className="flex h-7 items-center gap-1 rounded-[7px] px-2 text-[#9A3412] hover:bg-black/[0.05] disabled:opacity-50"
                  >
                    <RotateCcw size={14} strokeWidth={2} />
                    <span className="hidden 2xl:inline">되돌리기</span>
                  </button>
                  {state === 'unsaved' ? (
                    <button
                      onClick={requestSave}
                      disabled={saving}
                      className="flex h-7 items-center gap-1.5 rounded-[7px] bg-[#C2410C] px-3 font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50"
                    >
                      {saving ? <Spinner className="h-3.5 w-3.5" /> : <CloudUpload {...icSm} />}
                      구글시트에 저장
                    </button>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => void downloadProgressExcel(data, drafts, l1s)}>
                        <FileDown {...icSm} />
                        엑셀로 받기
                      </Button>
                      <Button variant="secondary" size="sm" onClick={openSheetSettings}>
                        저장할 수 있는 시트로 바꾸기
                      </Button>
                    </>
                  )}
                </>
              ) : state === 'remote' || state === 'stale' ? (
                <>
                  <Button variant="primary" size="sm" onClick={() => void (state === 'remote' ? acceptRemote() : loadFromSheet())}>
                    <RefreshCw {...icSm} />
                    최신으로 업데이트
                  </Button>
                  <button
                    onClick={() => (state === 'remote' ? setRemote(null) : setStale(false))}
                    aria-label="닫기"
                    className="flex h-7 w-7 items-center justify-center rounded-[7px] text-label-2 hover:bg-black/[0.06]"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </>
              ) : state === 'locked' ? (
                <Button variant="secondary" size="sm" onClick={openSheetSettings}>
                  저장할 수 있는 시트로 바꾸기
                </Button>
              ) : null}
            </span>
          </div>
        )
      })()}
    </>
  ) : null

  return (
    <div>
      <MenuSlot>
        <YearSwitcher
          title={data.local ? `local:${data.tabTitle}` : data.tabTitle}
          tabs={sheetTabs}
          editableTitle={data.local ? (parkedSheet?.data.tabTitle ?? data.tabTitle) : (archive?.data.tabTitle ?? data.tabTitle)}
          loading={yearLoading}
          disabled={loading || saving}
          onPick={pickYear}
          editableFrom={now.getFullYear()}
          connectedTitle={connectedTitle}
          onConnect={canManage && isSheetsApiConfigured() ? (t) => void openSheetYear(t) : undefined}
          footer={yearMenuFooter}
          onDeleteLocal={(id) => void deleteLocal(id)}
          onOpenMenu={() => void refreshYearTabs()}
          onHide={hideTab}
          localTabs={localTabs}
          onCreate={canManage ? () => setNewYearOpen(true) : undefined}
        />
      </MenuSlot>
      <MenuSlot id={PROGRESS_ACTIONS_SLOT}>
        {/* 머리 오른쪽 빈 곳: 시트 상태 줄(저장 안 한 변경 · 저장) · 과제 내보내기(팀장) · 파일 메뉴 */}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {headStatus}
          <span className="flex-1" />
          {/* 팀장: 지금 그룹(L1)을 성과관리 과제리스트로 내보내기가 주된 일 -- 머리 줄 프라이머리 버튼(성과관리의 구글시트 연결과 같은 화면) */}
          {canPerf && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setExportOpen(true)}
              disabled={!l1 || readOnly}
              title={
                data.spreadsheetId ? '그룹(L1)을 골라 성과관리 과제리스트로 내보내기' : '구글시트로 불러왔을 때만 내보낼 수 있습니다(xlsx로 불러온 경우 제외)'
              }
            >
              <Send {...icSm} />
              <span className="hidden xl:inline">과제 내보내기</span>
            </Button>
          )}
          <FileMenu disabled={yearLoading} label={FILE_LABEL} title="불러오기 · 내보내기 · 시트 연결">{fileMenuItems}</FileMenu>
        </span>
      </MenuSlot>
      {newYearDialog}
      {confirmDialog}
      {sheetSettings}
      {error && <ErrorBox error={error} onRetryAccount={() => loadFromSheet(true)} />}

      {/* 진척률: 같은 연도 · 고친 내용으로 센다(추진현황 화면은 숨겨 두고 그대로 유지) */}
      {view === 'rate' && <ProgressRate data={data} drafts={drafts} l1s={l1s} asOfDefault={currentKey} />}
      <div className={view === 'rate' ? 'hidden' : ''}>
        {statusBar}
        {/* 연도 ▾ + L1 탭(우클릭 = 숨기기 · 이 그룹만 보기, 끝의 +로 추가) + 오른쪽 그룹 숨기기 */}
        {/* 위 줄(모든 보기 공통): 보기 전환 │ 그룹(L1) 탭 │ (구글시트 보기) 구글 도구 모음 · 새로고침 · 새 창 */}
        {dockBar}

        {/* 도구 한 줄: 찾기·거르기 │ 보기(지브라·글자) │ 범례(입력 중엔 칠하기 도구) │ 되돌리기·저장·과제 추가·입력하기 */}
        <div
          className={`-mx-2 mt-2 flex min-h-[52px] flex-wrap items-center gap-2 rounded-[12px] px-2 py-1.5 text-[length:calc(14px*var(--ui-fs,1))] transition-colors ${
            editing && boardView === 'table' && !readOnly ? 'bg-accent-soft/70' : ''
          } ${boardView === 'sheet' ? 'hidden' : ''}`}
        >
          {/* 찾기: 평소엔 돋보기 버튼만, 누르면 칸이 넓어진다. 찾는 말이 있으면 넓게 둔 채로 · 비우고 벗어나면(Esc) 다시 버튼 */}
          <label className={`relative ${boardView === 'sheet' ? 'hidden' : ''}`} title="L2 · L3 · 담당자 찾기">
            <Search {...icSm} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${searchOpen ? 'left-2 text-label-3' : 'left-1/2 -translate-x-1/2 text-label-2'}`} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQuery('')
                  e.currentTarget.blur()
                }
              }}
              placeholder={searchOpen ? 'L2 · L3 · 담당자 찾기' : ''}
              aria-label="L2 · L3 · 담당자 찾기"
              className={`h-8 rounded-control border border-hairline transition-[width] duration-150 ${searchOpen ? `w-48 pl-7 ${query ? 'pr-7' : 'pr-2'}` : 'w-8 cursor-pointer px-0 text-transparent hover:bg-black/[0.04]'}`}
            />
            {/* 찾는 말 지우기(✕) */}
            {query && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                aria-label="찾기 지우기"
                title="찾기 지우기"
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-label-3 hover:bg-black/[0.07] hover:text-label"
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            )}
          </label>
          {/* 보기: 표 · 보드(상태별 칸반) · 타임라인(구분별 간트) -- 같은 행 · 같은 거르기 */}
          {/* 입력 중에는 보기 바꾸기를 숨긴다(서식 막대는 고른 칸 위에 뜬다) */}
          {/* 보드 · 타임라인 거르기(단계 + 지연 · 이번 달 마감): 보기 버튼 바로 옆 */}
          {boardView !== 'table' && boardView !== 'sheet' &&
            (() => {
              const { list, nowMonth } = scheduleListOf(views, weekCols, currentKey)
              return <ViewFilterBar list={list} value={viewFilter} onChange={setViewFilter} weekCols={weekCols} nowMonth={nowMonth} />
            })()}
          {activeFilters > 0 && (
            <button
              onClick={() => setFilters({})}
              className="flex h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-accent"
              title="머리글 필터 모두 해제"
            >
              필터 {activeFilters} ✕
            </button>
          )}
          {!(period.start === 1 && period.months === 12) && (
            <button
              onClick={() => setPeriod({ start: 1, months: 12 })}
              className="flex h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-accent"
              title="일정 기간을 전체로(일정 머리글 우클릭으로 바꿀 수 있음)"
            >
              기간 {periodLabel(period)} ✕
            </button>
          )}
          {/* 표 전용 도구(글자 · 행간 · 입력하기 · 칠하기)는 보드 · 타임라인에서 숨긴다 */}
          {boardView === 'table' && (
            <>
          {!editing && (
            <>
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
              className="flex h-8 items-center gap-0.5 px-2 text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label hover:bg-black/[0.04] disabled:opacity-30"
              aria-label="표 글자 크게"
            >
              가<span className="text-[9px] text-accent">▲</span>
            </button>
            <button
              onClick={() => setFontSize(fontSize - 1)}
              disabled={fontSize <= 10}
              className="flex h-8 items-center gap-0.5 border-l border-hairline px-2 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label hover:bg-black/[0.04] disabled:opacity-30"
              aria-label="표 글자 작게"
            >
              가<span className="text-[9px] text-accent">▼</span>
            </button>
          </span>
          <span className="flex overflow-hidden rounded-control border border-hairline" title={`행간(칸 위아래 여백) ${rowPad}px`}>
            <button
              onClick={() => stepRowPad(2)}
              disabled={rowPad >= ROW_PAD_MAX}
              className="flex h-8 w-8 items-center justify-center text-label hover:bg-black/[0.04] disabled:opacity-30"
              aria-label="행간 넓게"
              title={`행간 넓게 (지금 ${rowPad}px)`}
            >
              <UnfoldVertical {...icSm} />
            </button>
            <button
              onClick={() => stepRowPad(-2)}
              disabled={rowPad <= ROW_PAD_MIN}
              className="flex h-8 w-8 items-center justify-center border-l border-hairline text-label hover:bg-black/[0.04] disabled:opacity-30"
              aria-label="행간 좁게"
              title={`행간 좁게 (지금 ${rowPad}px)`}
            >
              <FoldVertical {...icSm} />
            </button>
            <button
              onClick={() => {
                setRowPad(ROW_PAD_DEFAULT)
                if (Object.keys(heightsRef.current).length) {
                  pushHistory('')
                  setView(widthsRef.current, {})
                }
              }}
              className="flex h-8 w-8 items-center justify-center border-l border-hairline text-label hover:bg-black/[0.04]"
              aria-label="모두 기본 높이로"
              title="모든 행을 기본 높이로 통일(행간 기본값 · 끌어서 바꾼 행 높이 모두 되돌림)"
            >
              <AlignVerticalSpaceAround {...icSm} />
            </button>
          </span>
          <span className="h-5 w-px shrink-0 bg-separator" />
            </>
          )}
          {/* 입력하기 · 범례(입력 중엔 칠하기 도구): 색 아이콘만, 이름은 마우스를 올리면. 지난 연도는 보기 전용 표시 */}
          {readOnly ? (
            <span className="flex items-center gap-2 rounded-control bg-orange-50 px-2.5 py-1 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-orange-800 ring-1 ring-orange-200">
              {data.tabTitle.replace(/추진현황/, '실적관리')} · 보기 전용
              <button
                onClick={() => archive && void viewYear(archive.data.tabTitle)}
                className="rounded px-1.5 py-0.5 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-accent hover:bg-white"
              >
                {archive?.data.tabTitle.replace(/추진현황/, '실적관리')}로 돌아가기
              </button>
            </span>
          ) : (
            editing ? (
              // 입력 중: 파란 버튼으로 바뀌어 지금 입력 모드인 걸 알 수 있게
              <button
                onClick={finishEditing}
                title="입력 모드 끝내기(저장 안 한 변경이 있으면 구글시트 저장을 권합니다)"
                className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-accent/40 bg-accent-soft px-3 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-accent hover:bg-accent/15"
              >
                <Check {...icSm} />
                입력 끝내기
              </button>
            ) : (
              <Button
                // 팀장은 과제 내보내기가 프라이머리(머리 줄), 입력하기는 세컨더리
                variant={canPerf ? 'secondary' : 'primary'}
                size="sm"
                onClick={async () => {
                  // 저장할 수 없는 시트(운영 팀 시트 등)면 먼저 알린다 -- 모르고 고친 내용이 쌓이지 않게
                  if (!data.local && !canSave && data.spreadsheetId) {
                    const ok = await askConfirm({
                      title: '이 시트는 읽기 전용입니다',
                      message: '운영 중인 팀 시트라 여기서 고친 내용은 구글시트에 저장되지 않습니다(엑셀로 받기만 됨).\n저장하려면 위 상태 줄의 「저장할 수 있는 시트로 바꾸기」로 팀 시트(사본)를 연결하세요.',
                      confirmLabel: '그래도 입력(연습)',
                      tone: 'accent',
                    })
                    if (!ok) return
                  }
                  setEditing(true)
                }}
                title="입력 모드 켜기: 주 칸에 계획 · 실적을 칠합니다(칸 글자는 언제든 칸을 눌러 고침)"
              >
                <Pencil {...icSm} />
                입력하기
              </Button>
            )
          )}
          {/* 칠하기: 보기 모드는 범례(■ 계획  S 착수  F 완료   ■ 실적  S 착수  완 완료),
              입력 모드는 도구 버튼(세그먼트: 계획 · 실적 · 지우개) + 고른 도구의 표시 안내 */}
          {editing ? (
            <span className="ml-1 flex items-center gap-3">
              <span className="mac-seg" role="radiogroup" aria-label="칠하기 도구">
                {(
                  [
                    ['plan', '계획', '계획(회색) 칠하기'],
                    ['actual', '실적', '실적(분홍) 칠하기'],
                    ['erase', '지우개', '지우개'],
                  ] as const
                ).map(([c, name, label]) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={tool === c}
                    aria-label={label}
                    onClick={() => setTool(c)}
                    onContextMenu={(e) => {
                      // 우클릭: 바로 아래에 색 팔레트
                      if (c === 'erase') return
                      e.preventDefault()
                      setTool(c)
                      openFillMenu(e.currentTarget, c)
                    }}
                    title={
                      c === 'erase'
                        ? '지우개 · 누르거나 끌어서 칸을 비움(남은 묶음의 S/F는 다시 맞춤)'
                        : `${label} · 누르거나 끌어서 칠함(첫 칸 S, 끝 칸 ${c === 'plan' ? 'F' : '완'} 자동) · 같은 칸을 다시 누르면 S → ${c === 'plan' ? 'F' : '완'} → 지움 · 우클릭: 색 바꾸기`
                    }
                    className={`mac-seg-item flex h-7 items-center gap-1.5 ${tool === c ? 'mac-seg-item-on' : ''}`}
                  >
                    {/* 지우개는 아이콘만(이름은 말풍선 · 스크린리더) */}
                    {c === 'erase' ? <Eraser size={15} strokeWidth={1.8} /> : <CellSwatch cell={{ m: '', f: c }} size={14} />}
                    {c !== 'erase' && name}
                  </button>
                ))}
              </span>
              <span className="flex items-center gap-3 text-[length:calc(14px*var(--ui-fs,1))] text-label-3">
                {tool === 'erase'
                  ? '누르거나 끌어서 비우기'
                  : (tool === 'actual'
                      ? ([
                          ['S', '착수'],
                          ['완', '완료'],
                        ] as const)
                      : ([
                          ['S', '착수'],
                          ['F', '완료'],
                        ] as const)
                    ).map(([m, t]) => (
                      <span key={m + t} className="flex items-center gap-1">
                        <b className="font-bold text-label-2">{m}</b>
                        {t}
                      </span>
                    ))}
              </span>
            </span>
          ) : (
            <span className="ml-1 flex items-center gap-6">
              {(
                [
                  [
                    'plan',
                    '계획',
                    [
                      ['S', '착수'],
                      ['F', '완료'],
                    ],
                  ],
                  [
                    'actual',
                    '실적',
                    [
                      ['S', '착수'],
                      ['완', '완료'],
                    ],
                  ],
                ] as const
              ).map(([c, name, marks]) => (
                <span key={c} className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
                    <CellSwatch cell={{ m: '', f: c }} size={16} />
                    {name}
                  </span>
                  {marks.map(([m, t]) => (
                    <span key={m + t} className="flex items-center gap-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-3">
                      <b className="font-bold text-label-2">{m}</b>
                      {t}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          )}
            </>
          )}
          <span className="ml-auto flex items-center gap-2">
            <span className={`flex items-center ${readOnly ? 'hidden' : ''}`}>
              <IconButton onClick={undo} disabled={past.current.length === 0} title="되돌리기 (⌘Z)" aria-label="되돌리기">
                <Undo2 {...ic} />
              </IconButton>
              <IconButton onClick={redo} disabled={future.current.length === 0} title="다시 하기 (⌘⇧Z)" aria-label="다시 하기">
                <Redo2 {...ic} />
              </IconButton>
            </span>
            {/* 시트 연도는 저장 안 한 변경 · 저장 버튼이 표 위 상태 줄에 있다. 여기는 이 브라우저 연도만 */}
            {editCount > 0 && data.local && (
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
                {data.local ? (
                  <Button variant="primary" size="sm" onClick={commitLocal} disabled={saving} title="고친 내용을 표에 반영해 이 브라우저에 저장합니다">
                    <Save {...icSm} />
                    저장
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={requestSave}
                    disabled={!canSave || saving}
                    title={
                      canSave
                        ? '고친 칸을 연결된 시트에 씁니다'
                        : protectedSheet
                          ? '운영 중인 팀 시트에는 저장하지 않습니다. ⋯ 파일 메뉴 › "시트 연결 설정"에서 테스트 시트를 연결하세요.'
                          : 'xlsx로 불러온 경우에는 시트에 저장할 수 없습니다. 구글시트에서 불러오세요.'
                    }
                  >
                    {saving ? <Spinner className="h-3.5 w-3.5" /> : <CloudUpload {...icSm} />}
                    구글시트에 저장
                  </Button>
                )}
              </>
            )}
          </span>
        </div>

        {/* 아래 여백: 마지막 행의 "+ 행" 칩 · 높이 조절 손잡이가 잘리거나, 다 보이는데도 세로 스크롤이 생기지 않게 */}
        <div
          ref={tableBoxRef}
          className={`${boardView === 'sheet' ? '-mx-4 -mb-6 mt-1 lg:-mx-6' : 'mt-2 overflow-auto pb-4'} transition-opacity ${editing && boardView === 'table' && !readOnly ? 'rounded-[6px] ring-1 ring-accent/40 ring-offset-2' : ''} ${
            loading ? 'pointer-events-none opacity-40' : ''
          }`}
          style={boardView === 'sheet' ? undefined : { maxHeight: tableBoxH }}
        >
          {boardView === 'sheet' && data.spreadsheetId ? (
            // 구글시트가 본문을 꽉 채운다(위 줄 아래부터). 구글의 아래 시트 탭 줄은 시트 아래쪽을 잘라 가린다
            <div ref={sheetBoxRef} className="relative overflow-hidden rounded-[12px] border border-hairline bg-white" style={{ height: sheetBoxH ?? 640 }}>
              <iframe
                key={`${data.spreadsheetId}:${data.sheetGid}:${sheetReload}:${sheetFull ? 'full' : 'min'}:${sheetJump ?? ''}`}
                title="구글시트"
                src={`https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit${sheetFull ? '' : '?rm=minimal'}${data.sheetGid !== null ? `${sheetFull ? '?' : '&'}gid=${data.sheetGid}` : ''}${sheetJump ? `#gid=${data.sheetGid ?? 0}&range=A${sheetJump}` : ''}`}
                className="absolute inset-x-0 w-full border-0"
                style={{ top: sheetFull ? -SHEET_HEAD_H : 0, height: `calc(100% + ${(sheetFull ? SHEET_HEAD_H : 0) + SHEET_TABS_H}px)` }}
              />
            </div>
          ) : boardView === 'board' ? (
            <KanbanBoard
              views={views}
              weekCols={weekCols}
              currentKey={currentKey}
              statusOptions={data.fields.find((f) => f.id === 'status')?.options}
              onStatus={readOnly || !data.fields.some((f) => f.id === 'status') ? undefined : (row, value) => setField(row, 'status', value)}
              filter={viewFilter}
            />
          ) : boardView === 'timeline' ? (
            <TimelineView views={views} weekCols={weekCols} currentKey={currentKey} filter={viewFilter} onFilter={setViewFilter} />
          ) : (
            <ScheduleTable
              weekCols={weekCols}
              rows={views}
              editing={editing}
              currentKey={currentKey}
              onPaint={paintCell}
              onWeekCells={readOnly ? undefined : setWeekCells}
              onField={setField}
              onFields={setFields}
              onActiveRow={(k) => {
                activeRowRef.current = k
              }}
              editNameKey={openKey}
              onDeleteRow={(row) => deleteRows([row])}
              onDeleteRows={deleteRows}
              onRestoreRow={(row) => restoreRows([row])}
              onDeleteGroup={(row) => deleteRows(groupRowsOf(row))}
              onRestoreGroup={(row) => restoreRows(groupRowsOf(row))}
              onAddGroup={addGroup}
              onSplitGroup={(row, name) => {
                const label = name.trim()
                if (!label) return
                updateDrafts((d) => ({ ...d, l2Splits: [...(d.l2Splits ?? []).filter((sp) => sp.key !== row.key), { key: row.key, label }] }))
              }}
              onRenameGroup={(row, name) => {
                const rowsOfGroup = groupRowsOf(row)
                if (rowsOfGroup.every((r) => r.isNew)) {
                  // 새 구분: 새 과제들의 구분 이름을 바로 바꾼다
                  const ids = new Set(rowsOfGroup.map((r) => r.key.slice(NEW_PREFIX.length)))
                  const { name: l2, tag } = splitL2(name)
                  updateDrafts((d) => ({ ...d, newRows: d.newRows.map((n) => (ids.has(n.id) ? { ...n, l2, l2Tag: tag } : n)) }))
                  return
                }
                // 나눈 구분: 나누기 이름을 바꾼다
                const split = (drafts.l2Splits ?? []).find((sp) => sp.key === rowsOfGroup[0].key)
                if (split) {
                  updateDrafts((d) => ({ ...d, l2Splits: (d.l2Splits ?? []).map((sp) => (sp === split ? { ...sp, label: name } : sp)) }))
                  return
                }
                // 시트 구분: 원래 이름(시트 값) 기준으로 고친 이름을 얹고, 저장하면 이름 칸에 쓴다
                const src = rowsOfGroup.find((r) => !r.isNew)!
                const orig = data.rows.find((r) => r.key === src.key) ?? src
                updateDrafts((d) => renameL2(d, orig, name))
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
              rowHeights={rowHeights}
              onRowHeights={changeRowHeights}
              readOnly={readOnly}
              fields={eff.fields}
              optionsOf={optionsOf}
              headerStyle={eff.headerStyle}
              scheduleMode={scheduleMode}
              onToggleSchedule={() => setScheduleMode(scheduleMode === 'full' ? 'compact' : 'full')}
              onShowSchedule={() => setScheduleMode(lastShownMode.current)}
              onScheduleMenu={(e) => setSchMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: Math.min(e.clientY, window.innerHeight - 380) })}
              allWeekCols={data.weekCols}
              onBg={setBg}
              onNote={setNote}
              onFmt={readOnly ? undefined : setFmt}
              onScopeFmt={readOnly ? undefined : setScopeFmt}
              onScopeBg={readOnly ? undefined : setScopeBg}
              onCells={readOnly ? undefined : setCells}
              onAddRows={readOnly ? undefined : addRows}
              onAddColumns={readOnly ? undefined : addColumns}
              onDeleteColumns={readOnly ? undefined : deleteColumns}
              onRenameColumn={
                readOnly
                  ? undefined
                  : (id, label) =>
                      updateDrafts((d) => {
                        if (id.startsWith('newcol:')) return { ...d, newCols: (d.newCols ?? []).map((c) => (c.id === id ? { ...c, label } : c)) }
                        // 시트 열: 원래 이름으로 되돌리면 고친 것에서 뺀다
                        const orig = data?.fields.find((f) => f.id === id)?.label
                        const ren = { ...(d.colRenames ?? {}) }
                        if (!label.trim() || label.trim() === orig) delete ren[id]
                        else ren[id] = label.trim()
                        return { ...d, colRenames: ren }
                      })
              }
              merges={merges}
              onMerge={readOnly ? undefined : mergeCells}
              zebra={zebra}
              sheetColors={sheetColors}
              headColors={headColors}
              headFmts={headFmts}
              onHeadFmt={setHeadFmt}
              onHeadColor={setHeadColor}
              hiddenCols={hiddenCols}
              onHideColumns={(ids) => setHiddenCols(Array.from(new Set([...hiddenCols, ...ids])))}
              onShowColumns={(ids) => setHiddenCols(hiddenCols.filter((x) => !ids.includes(x)))}
              filterOptions={filterOptions}
              hiddenOf={(id) => filters[id] ?? []}
              onFilter={(id, hidden) => setFilters((cur) => ({ ...cur, [id]: hidden }))}
              widths={widths}
              onResize={resizeCol}
            />
          )}
        </div>
        {exportOpen && (
          // 성과관리의 가져오기 화면(추진현황에서)과 같은 화면 -- 보낼 프로젝트를 고르고 L2를 골라 바로 넣는다
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
            <div className="flex h-[min(900px,92vh)] w-[min(1180px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[12px] bg-white shadow-dialog">
              <div className="flex items-start justify-between gap-4 border-b border-separator px-6 pb-3 pt-5">
                <div className="min-w-0">
                  <h3 className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">성과관리 과제리스트로 내보내기</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:calc(14px*var(--ui-fs,1))]">
                    <span className="font-semibold text-label-2">보낼 곳</span>
                    {workspaces.length > 0 ? (
                      <Select
                        value={target}
                        onChange={(e) => setExportTo(e.target.value)}
                        aria-label="보낼 성과관리 평가"
                        className="h-8 rounded-control border border-hairline bg-white px-2 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label"
                      >
                        {workspaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.teamName} {w.evaluationYear} {w.periodName}
                            {w.id === currentWorkspaceId ? ' (지금 열린 평가)' : ''}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-label-2">
                        성과관리에 아직 평가(팀 · 평가기간)가 없습니다.{' '}
                        <button onClick={() => setMode('perf')} className="font-semibold text-accent hover:underline">
                          성과관리에서 평가 만들기
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
              <p className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">그룹(L1) 추가</p>
              <p className="mt-0.5 text-[length:calc(12px*var(--ui-fs,1))] text-label-3">「{l1 === NO_L1 ? 'L1 없음' : l1}」 그룹 뒤에 넣습니다. 첫 구분(L2)과 과제 한 줄로 시작합니다.</p>
              <input
                autoFocus
                value={tabAdd.l1}
                onChange={(e) => setTabAdd({ ...tabAdd, l1: e.target.value })}
                onKeyDown={(e) => e.key === 'Escape' && setTabAdd(null)}
                placeholder="L1 이름"
                className="mt-2 h-8 w-full rounded-control border border-hairline px-2 text-[length:calc(14px*var(--ui-fs,1))]"
              />
              {l1s.includes(tabAdd.l1.trim()) && <p className="mt-1 text-[length:calc(12px*var(--ui-fs,1))] text-danger">이미 있는 L1입니다.</p>}
              <input
                value={tabAdd.l2}
                onChange={(e) => setTabAdd({ ...tabAdd, l2: e.target.value })}
                onKeyDown={(e) => e.key === 'Escape' && setTabAdd(null)}
                placeholder="첫 구분(L2) 이름 (태그는 끝에 [태그])"
                className="mt-1.5 h-8 w-full rounded-control border border-hairline px-2 text-[length:calc(14px*var(--ui-fs,1))]"
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
        {fillMenu && (
          <div className="fixed inset-0 z-50" onMouseDown={() => setFillMenu(null)}>
            <div className="mac-pop absolute w-[280px] px-3 py-2.5" style={{ left: fillMenu.x, top: fillMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-2">
                <CellSwatch cell={{ m: '', f: fillMenu.which }} size={14} />
                <span className="flex-1">{fillMenu.which === 'plan' ? '계획' : '실적'} 칠하기 색</span>
                <button
                  onClick={() => setFillMenu(null)}
                  className="-mr-1 flex h-6 w-6 items-center justify-center rounded-full text-label-3 hover:bg-black/[0.06] hover:text-label"
                  aria-label="닫기"
                  title="닫기 (Esc)"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
              <ColorPalette
                current={fillHex(fillMenu.which)}
                sheetColors={sheetColors}
                onPick={(hex) => {
                  setFillHex(fillMenu.which, hex)
                  setFillTick((n) => n + 1)
                  setFillMenu(null)
                }}
              />
              <p className="mt-2 text-[length:calc(12px*var(--ui-fs,1))] leading-snug text-label-3">
                이 브라우저에 기억합니다. 새로 칠하거나 고친 칸은 구글시트에 이 색으로 저장되고, 시트를 다시 읽을 때 이 색을 계획/실적으로 알아봅니다.
                재설정하면 기본색(회색 · 분홍)입니다.
              </p>
            </div>
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
              className={`mac-pop absolute py-1 text-[length:calc(14px*var(--ui-fs,1))] ${schPalette ? 'w-[268px]' : 'w-[220px]'}`}
              style={{ left: Math.min(schMenu.x, window.innerWidth - 276), top: schMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {schPalette ? (
                <div className="px-3 py-1.5">
                  <button onClick={() => setSchPalette(false)} className="mb-1 flex items-center gap-1 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2 hover:text-label">
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
                  <p className="px-3 pb-1 pt-1.5 text-[length:calc(12px*var(--ui-fs,1))] font-semibold text-label-3">일정 보기</p>
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
                  <p className="px-3 pb-1 pt-1 text-[length:calc(12px*var(--ui-fs,1))] font-semibold text-label-3">기간</p>
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
                              className={`h-7 rounded-control text-[length:calc(13px*var(--ui-fs,1))] ${on ? 'bg-label font-semibold text-white' : 'text-label-2 hover:bg-black/[0.05]'}`}
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
          title="구글시트에 업데이트"
          message={`${editCount}건의 변경이 있습니다${drafts.newRows.length ? `(새 과제 ${drafts.newRows.length}건 포함)` : ''}${drafts.deleted?.length ? ` · 지울 과제 ${drafts.deleted.length}건` : ''}. 구글 시트에 업데이트하여 공유하시겠습니까?`}
          confirmLabel="지금 업데이트"
          cancelLabel="나중에"
          tone="accent"
          onConfirm={() => {
            if (noAskNext) setAskSavePref(false)
            setNoAskNext(false)
            void saveToSheet()
          }}
          onCancel={() => {
            setNoAskNext(false)
            setConfirmSave(false)
          }}
        >
          {/* 어느 파일·탭에 쓰는지 크게 보여 줘 다른 시트에 쓰는 실수를 막는다 */}
          <div className="mt-3 rounded-card border border-separator bg-subtle px-3 py-2.5">
            <p className="text-[length:calc(12px*var(--ui-fs,1))] font-medium text-label-3">업데이트할 곳</p>
            <p className="mt-0.5 break-all text-[length:calc(14px*var(--ui-fs,1))] font-bold text-label">
              {data.fileTitle || '(시트 이름 없음)'} <span className="text-label-3">›</span> {data.tabTitle}
            </p>
            {drafts.newRows.length > 0 && <p className="mt-1 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">새 과제·새 구분은 화면에 보이는 자리에 줄을 넣어 씁니다.</p>}
            {!hasLoginSheetsToken() && <p className="mt-1 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">처음 한 번은 구글 시트 편집 권한을 허용해야 합니다.</p>}
            {(drafts.deleted?.length ?? 0) > 0 && (
              <p className="mt-1 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-danger">삭제로 표시한 과제 {drafts.deleted!.length}건은 시트에서 그 줄을 지웁니다.</p>
            )}
          </div>
          {/* 다음부터 묻지 않기: 파일 메뉴 › 업데이트 전에 묻기로 다시 켠다. 업데이트 때마다 시트를 새로 읽어 남이 바꾼 칸은 덮지 않는다 */}
          {isOperatingSheet(data.spreadsheetId) && (
            <p className="mt-2 rounded-card bg-danger/[0.06] px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium text-danger">
              연구소 모두가 쓰는 운영 시트입니다. 업데이트하면 바로 반영됩니다(바꾼 칸만 덮어씁니다).
            </p>
          )}
          {(drafts.deleted?.length ?? 0) === 0 && !isOperatingSheet(data.spreadsheetId) && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
              <input type="checkbox" checked={noAskNext} onChange={(e) => setNoAskNext(e.target.checked)} />
              다음부터 묻지 않고 바로 업데이트
              <span className="text-label-3">(파일 메뉴에서 다시 켬)</span>
            </label>
          )}
        </ConfirmDialog>
      </div>
    </div>
  )
}

// 머리 오른쪽 작은 알림(닫기 ✕ 포함)
function StartCard({
  Icon,
  title,
  desc,
  badge,
  busy,
  disabled,
  onClick,
}: {
  Icon: typeof Upload
  title: string
  desc: string
  badge?: string
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex w-[236px] flex-col rounded-card border border-separator bg-white p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft/40 disabled:opacity-50"
    >
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-control bg-subtle text-label-2 group-hover:text-accent">
          {busy ? <Spinner className="h-4 w-4" /> : <Icon size={17} strokeWidth={1.8} />}
        </span>
        {badge && <span className="mac-badge ml-auto bg-accent-soft text-accent">{badge}</span>}
      </span>
      <span className="mt-3 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">{title}</span>
      <span className="mt-1 text-[length:calc(13.5px*var(--ui-fs,1))] leading-relaxed text-label-2">{desc}</span>
    </button>
  )
}

function ErrorBox({ error, onRetryAccount }: { error: string; onRetryAccount: () => void }) {
  return (
    <div className="mt-3 rounded-card bg-danger/[0.06] px-3 py-2 text-left text-[length:calc(14px*var(--ui-fs,1))] text-danger">
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

// 머리글의 빈 칸(TaskInputApp이 비워 둔 곳)에 그린다: 위치 줄에는 연도 고르기, 오른쪽에는 파일 메뉴(⋯).
export const PROGRESS_MENU_SLOT = 'progress-menu-slot'
export const PROGRESS_ACTIONS_SLOT = 'progress-actions-slot'
function MenuSlot({ id = PROGRESS_MENU_SLOT, children }: { id?: string; children: React.ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const find = () => setNode(document.getElementById(id))
    find()
    // 메뉴 모양(펼침 · 아이콘만 · 위 메뉴)을 바꾸면 머리가 새로 그려져 빈 칸도 새것 -- 다시 찾는다
    window.addEventListener(SHELL_LAYOUT_EVENT, find)
    return () => window.removeEventListener(SHELL_LAYOUT_EVENT, find)
  }, [id])
  return node ? createPortal(children, node) : null
}

// 탭 위 알림 줄(크게 · 버튼은 오른쪽). warn = 저장 필요(주황) · info = 받을 내용(파랑)
function NoticeBar({
  tone,
  icon,
  title,
  sub,
  onClose,
  children,
}: {
  tone: 'warn' | 'info'
  icon: React.ReactNode
  title: string
  sub?: string
  onClose?: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={`mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border px-4 py-2.5 ${
        tone === 'warn' ? 'border-[#F5B48A] bg-[#FFF3EA] text-[#7C2D12]' : 'border-accent/30 bg-accent-soft text-label'
      }`}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${tone === 'warn' ? 'text-[#C2410C]' : 'text-accent'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold">{title}</p>
        {sub && <p className={`mt-0.5 text-[length:calc(13px*var(--ui-fs,1))] ${tone === 'warn' ? 'text-[#9A3412]/80' : 'text-label-2'}`}>{sub}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {children}
        {onClose && (
          <button onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-label-2 hover:bg-black/[0.06]">
            <X size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}

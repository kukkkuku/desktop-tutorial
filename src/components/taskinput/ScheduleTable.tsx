// 추진현황 일정표 -- 구글시트 추진현황 탭을 그대로 펼친 표.
//   · 머리글 색·묶음 머리글, 칸 배경색, 칸 메모를 시트 그대로 보여 준다.
//   · 주차 칸은 회색 = 계획, 분홍 = 실적, 글자 S / F / 완. 입력 중에는 고른 도구로 누르거나 끌어 칠한다.
//   · 입력 열(속성·분류·상태…)은 칸을 눌러 그 자리에서 입력한다.
//   · 칸에서 우클릭: 메모 추가·수정·삭제, 칸 색 / 행 색 바꾸기.
//   · 머리글 오른쪽 끝을 끌어 열 폭을 바꾸고, 좁히면 글자가 줄바꿈된다.
import { Fragment, useEffect, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, ListFilter, Plus, Trash2, Undo2 } from 'lucide-react'
import type { Importance, WeekColumn } from '../../types'
import type { CellState, FieldDef, HeaderStyle, ProgressRow } from '../../utils/progressBoard'
import { FILL_HEX, planRange } from '../../utils/progressBoard'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import ColorPalette from './ColorPalette'

export interface ScheduleRowView {
  row: ProgressRow
  cells: Record<string, CellState>
  vals: Record<string, string> // 고친 값을 얹은 열 값(name, status, assignees, category, note …)
  bg: Record<string, string> // 고친 값을 얹은 칸 배경색(열 id → RRGGBB)
  notes: Record<string, string> // 고친 값을 얹은 칸 메모(열 id 또는 주차 키 → 메모)
  editedCells: Set<string>
  editedFields: Set<string> // 값·색·메모 중 무엇이든 고친 열 id / 주차 키
  deleted?: boolean // 지우기로 함(저장하면 시트에서 줄을 지움)
}

// 과제관리 표와 같은 칩 색
export const STATUS_TONE: Record<string, string> = {
  대기: 'bg-black/[0.05] text-label-2',
  진행중: 'bg-accent-soft text-accent',
  완료: 'bg-emerald-100 text-emerald-800',
  보류: 'bg-red-100 text-red-700',
  중단: 'bg-red-100 text-red-700',
}
export function categoryTone(v: string): string {
  return IMPORTANCE_COLORS[v as Importance] ?? 'bg-black/[0.05] text-label-2'
}

// 칸/행 색 팔레트(구글시트에서 자주 쓰는 연한 색 + 시트에 있던 노랑·초록). '' = 색 없음
export const ROW_COLORS = ['', 'FFFF00', 'FFF2CC', 'FCE5CD', 'F4CCCC', 'EAD1DC', 'D9D2E9', 'CFE2F3', 'D9EAD3', '00FF00', 'EFEFEF', 'D9D9D9']

// 열 종류별 기본 폭(px)
const FIELD_WIDTH: Record<FieldDef['kind'], number> = { memo: 200, date: 96, select: 78, person: 110, link: 130, text: 100 }
export const DEFAULT_WIDTHS = { l2: 150, l3: 260, week: 12 }
export type ScheduleMode = 'full' | 'compact' | 'hidden'
const HEADER_FONT = 13 // 머리글 글자는 고정, 본문만 가▲/가▼로 바뀐다

export function fieldDefaultWidth(f: FieldDef) {
  return FIELD_WIDTH[f.kind]
}

export function cellLabel(c: CellState | undefined): string {
  if (!c) return ''
  if (c.m === 'S') return c.f === 'actual' ? '착수' : '착수 계획'
  if (c.m === 'F') return '완료 계획'
  if (c.m === '완') return '완료'
  return c.f === 'plan' ? '계획 기간' : c.f === 'actual' ? '진행 기간' : ''
}

export function CellSwatch({ cell, size = 18 }: { cell: CellState; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] border border-black/10 text-[10px] font-bold text-[#14161A]"
      style={{ width: size, height: size, background: cell.f ? `#${FILL_HEX[cell.f]}` : '#FFFFFF' }}
    >
      {cell.m}
    </span>
  )
}

// 구글시트처럼 메모가 있는 칸의 오른쪽 위 검은 삼각형
function NoteMark() {
  return <span className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-[#14161A]" />
}

// 시트 칸 하나 -- 누르면 그 자리에서 입력(Enter/바깥 누르면 반영, Esc 취소).
function FieldCell({
  f,
  value,
  bg,
  note,
  edited,
  onCommit,
  onMenu,
  onHoverNote,
  disabled,
}: {
  f: FieldDef
  value: string
  bg: string
  note: string
  edited: boolean
  onCommit: (v: string) => void
  onMenu: (e: React.MouseEvent) => void
  onHoverNote: (e: React.MouseEvent | null) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)
  function start() {
    setDraft(value)
    cancelled.current = false
    setEditing(true)
  }
  function finish() {
    setEditing(false)
    if (!cancelled.current && draft !== value) onCommit(draft)
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelled.current = true
      ;(e.target as HTMLElement).blur()
    }
    if (e.key === 'Enter' && (f.kind !== 'memo' || e.metaKey || e.ctrlKey)) (e.target as HTMLElement).blur()
  }
  const inputCls = 'absolute inset-0 z-30 h-full w-full border-2 border-accent bg-white px-1.5 text-[1em] text-label outline-none'
  const chip = 'inline-flex items-center rounded-full px-2 text-[0.85em] font-semibold'
  // 메모 칸은 시트에서 넣은 줄바꿈 그대로(두 줄까지), 다른 칸은 한 칸 안에서 이어 보여 준다
  let display: React.ReactNode = f.kind === 'memo' ? value.trim() : value.replace(/\s*\n\s*/g, ' · ')
  if (f.id === 'status' && value) display = <span className={`${chip} ${STATUS_TONE[value] ?? 'bg-black/[0.05] text-label-2'}`}>{value}</span>
  else if (f.id === 'category' && value) display = <span className={`${chip} ${categoryTone(value)}`}>{value}</span>
  else if (f.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) display = value.slice(5).replace('-', '.') // 연도 없이 월.일만
  return (
    <td
      onClick={editing || disabled ? undefined : start}
      onContextMenu={onMenu}
      onMouseEnter={note ? (e) => onHoverNote(e) : undefined}
      onMouseLeave={note ? () => onHoverNote(null) : undefined}
      title={note ? undefined : value ? `${f.label}: ${value}` : `${f.label} · 눌러서 입력 · 우클릭: 메모·색`}
      style={bg ? { background: `#${bg}` } : undefined}
      className="relative cursor-text border-b border-l border-dotted border-b-[#C9CDD3] border-l-[#D6DAE0] px-1.5 py-0 align-middle text-[0.92em] text-label hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-accent/60"
    >
      {/* 폭을 줄이면 줄바꿈. 긴 메모는 두 줄까지만(전체는 칸을 누르거나 오른쪽 L3 패널에서) */}
      <div className={`break-words ${f.kind === 'memo' ? 'line-clamp-2 whitespace-pre-line' : 'whitespace-normal'}`}>{display}</div>
      {note && <NoteMark />}
      {edited && <span className="pointer-events-none absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
      {editing &&
        (f.kind === 'memo' ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={keys}
            placeholder="⌘/Ctrl+Enter로 반영"
            className="absolute left-0 top-0 z-30 h-[9em] w-[max(100%,260px)] rounded-control border-2 border-accent bg-white p-1.5 text-[1em] text-label shadow-dialog outline-none"
          />
        ) : f.kind === 'date' ? (
          <input
            autoFocus
            type="date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(draft) ? draft : ''}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={keys}
            className={inputCls}
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={keys}
            list={`pb-opts-${f.id}`}
            className={inputCls}
          />
        ))}
    </td>
  )
}

// 머리글 오른쪽 끝을 끌어 열 폭 바꾸기
function ResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  return (
    <span
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const x0 = e.clientX
        const move = (ev: MouseEvent) => onResize(Math.max(36, Math.round(width + ev.clientX - x0)))
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
          document.documentElement.classList.remove('cursor-col-resize')
        }
        document.documentElement.classList.add('cursor-col-resize')
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }}
      onClick={(e) => e.stopPropagation()}
      title="끌어서 열 폭 조절"
      className="absolute -right-[3px] top-0 z-10 h-full w-[6px] cursor-col-resize hover:bg-accent/50"
    />
  )
}

// 행·구분 칸에 마우스를 올리면 뜨는 작은 아이콘 버튼
function RowIcon({
  label,
  danger,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={`flex h-5 w-5 items-center justify-center rounded text-label-2 hover:bg-black/[0.08] ${danger ? 'hover:text-danger' : 'hover:text-label'}`}
    >
      {children}
    </button>
  )
}

type Menu = { row: ProgressRow; key: string; kind: 'field' | 'week' | 'group'; x: number; y: number }

export interface FilterOption {
  value: string
  count: number
}

// 머리글 필터(구글시트처럼): 값 목록에서 보일 값만 체크
function FilterPopover({
  label,
  options,
  hidden,
  x,
  y,
  onChange,
  onClose,
}: {
  label: string
  options: FilterOption[]
  hidden: string[]
  x: number
  y: number
  onChange: (hidden: string[]) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const shown = options.filter((o) => !q.trim() || o.value.toLowerCase().includes(q.trim().toLowerCase()))
  const hid = new Set(hidden)
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div className="mac-pop absolute w-[250px] p-2 text-[13px] font-normal text-label" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
        <p className="px-1 text-[12px] font-semibold">{label} 필터</p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="값 찾기"
          className="mt-1.5 h-7 w-full rounded-control border border-hairline px-2 text-[12px]"
        />
        <div className="mt-1.5 flex items-center gap-2 px-1 text-[12px]">
          <button onClick={() => onChange(hidden.filter((v) => !shown.some((o) => o.value === v)))} className="font-medium text-accent hover:underline">
            모두 선택
          </button>
          <button onClick={() => onChange(Array.from(new Set([...hidden, ...shown.map((o) => o.value)])))} className="font-medium text-accent hover:underline">
            모두 해제
          </button>
          {hidden.length > 0 && (
            <button onClick={() => onChange([])} className="ml-auto text-label-2 hover:text-label">
              필터 지우기
            </button>
          )}
        </div>
        <div className="mt-1 max-h-[280px] overflow-y-auto">
          {shown.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-black/[0.04]">
              <input
                type="checkbox"
                checked={!hid.has(o.value)}
                onChange={(e) => onChange(e.target.checked ? hidden.filter((v) => v !== o.value) : [...hidden, o.value])}
              />
              <span className={`min-w-0 flex-1 truncate ${o.value === '(빈 칸)' ? 'text-label-3' : ''}`} title={o.value}>
                {o.value}
              </span>
              <span className="shrink-0 text-[11px] text-label-3">{o.count}</span>
            </label>
          ))}
          {shown.length === 0 && <p className="px-1 py-2 text-[12px] text-label-3">맞는 값이 없습니다</p>}
        </div>
      </div>
    </div>
  )
}

export default function ScheduleTable({
  weekCols,
  rows,
  editing,
  currentKey,
  onPaint,
  onField,
  editNameKey,
  onDeleteRow,
  onRestoreRow,
  onDeleteGroup,
  onRestoreGroup,
  onAddGroup,
  onRenameGroup,
  onRevertRow,
  onAddRow,
  onBg,
  onNote,
  fontSize = 13,
  fields = [],
  optionsOf,
  headerStyle: hs,
  scheduleMode = 'compact',
  onToggleSchedule,
  onScheduleMenu,
  allWeekCols = weekCols,
  zebra = false,
  widths = {},
  onResize,
  filterOptions,
  hiddenOf,
  onFilter,
  sheetColors = [],
}: {
  weekCols: WeekColumn[]
  rows: ScheduleRowView[]
  editing: boolean
  currentKey: string | null
  onPaint: (row: ProgressRow, weekKey: string, click: boolean) => void // click = 누른 칸(끌기 중이면 false)
  onField: (row: ProgressRow, id: string, value: string) => void
  editNameKey?: string | null // 이 행의 L3 이름을 바로 입력 상태로(새 과제 추가 직후)
  onDeleteRow?: (row: ProgressRow) => void // 과제 지우기(새 과제는 바로 빼고, 시트 과제는 저장할 때 줄을 지움)
  onRestoreRow?: (row: ProgressRow) => void // 지우기 취소
  onDeleteGroup?: (row: ProgressRow) => void // 이 행이 든 구분(L2) 통째로 지우기
  onRestoreGroup?: (row: ProgressRow) => void
  onAddGroup?: (row: ProgressRow, where: 'above' | 'below', name: string) => void // 이 구분 위/아래에 새 구분(L2)
  onRenameGroup?: (row: ProgressRow, name: string) => void // 새 구분 이름 고치기
  onRevertRow?: (row: ProgressRow) => void // 이 행 고친 내용 되돌리기
  onAddRow?: (row: ProgressRow, where: 'above' | 'below') => void // 우클릭: 위/아래에 과제 추가
  onBg: (row: ProgressRow, ids: string[], hex: string) => void
  onNote: (row: ProgressRow, key: string, note: string) => void
  fontSize?: number
  fields?: FieldDef[] // L3 오른쪽 시트 열(속성·분류·상태…) -- 표에 그대로 펼친다
  optionsOf?: (f: FieldDef) => string[]
  headerStyle?: HeaderStyle // 시트 머리글 색 · 묶음 머리글
  scheduleMode?: ScheduleMode // 일정: 전체 펴기 / 줄여보기 / 숨기기
  onToggleSchedule?: () => void
  onScheduleMenu?: (e: React.MouseEvent) => void // 일정 머리글 우클릭(보기 단계·기간 고르기)
  allWeekCols?: WeekColumn[] // 접었을 때 요약에 쓰는 전체 주차
  zebra?: boolean
  widths?: Record<string, number>
  onResize?: (key: string, w: number) => void
  filterOptions?: (f: FieldDef) => FilterOption[]
  hiddenOf?: (id: string) => string[]
  onFilter?: (id: string, hidden: string[]) => void
  sheetColors?: string[] // 이 시트에서 쓰는 칸 색(색 팔레트 맞춤 줄)
}) {
  const [filterOpen, setFilterOpen] = useState<{ f: FieldDef; x: number; y: number } | null>(null)
  // 머리글 이름 + 필터 버튼
  // 필터는 묶음 머리글(CATCH UP 일정) 앞 열까지만(속성·분류·상태·수요부서·담당팀·담당자·내/외)
  const firstGroupCol = Math.min(...(hs?.groups ?? []).flatMap((g) => g.fieldIds.map((id) => fields.find((f) => f.id === id)?.col ?? Infinity)), Infinity)
  const filterable = (f: FieldDef) => f.col < firstGroupCol && f.kind !== 'memo' && f.kind !== 'date' && f.kind !== 'link'
  const headLabel = (f: FieldDef) => {
    const active = (hiddenOf?.(f.id).length ?? 0) > 0
    return (
      <span className="flex items-center justify-center gap-0.5">
        <span className="min-w-0 break-keep">{f.label}</span>
        {onFilter && filterOptions && filterable(f) && (
          <button
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setFilterOpen({ f, x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 4 })
            }}
            title={active ? `${f.label} 필터 적용 중` : `${f.label} 필터`}
            aria-label={`${f.label} 필터`}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${active ? 'bg-accent text-white' : 'text-label-3 hover:bg-black/[0.07] hover:text-label'}`}
          >
            <ListFilter size={12} strokeWidth={2.25} />
          </button>
        )}
      </span>
    )
  }
  const cols = fields.filter((f) => f.id !== 'name')
  // 전체 펴기 = 주 칸, 줄여보기 = 계획·실적 요약 한 칸, 숨기기 = 일정 열 없음
  const scheduleOpen = scheduleMode === 'full'
  const showSummary = scheduleMode === 'compact'
  const schMenu = onScheduleMenu
    ? (e: React.MouseEvent) => {
        e.preventDefault()
        onScheduleMenu(e)
      }
    : undefined
  // 열 폭은 글자 13px 기준으로 기억하고, 글자 크기에 맞춰 같이 늘고 준다(줄이면 안 보이던 열이 들어온다).
  const scale = fontSize / 13
  const w = (key: string, def: number) => Math.round((widths[key] ?? def) * scale)
  const resizeTo = (key: string, px: number) => onResize?.(key, Math.round(px / scale))
  const wL2 = w('l2', DEFAULT_WIDTHS.l2)
  const wL3 = w('l3', DEFAULT_WIDTHS.l3)
  // 줄여보기는 12px 고정, 전체 펴기는 24px(머리글 끝을 끌어 바꿀 수 있음)
  const wWeek = w('week', DEFAULT_WIDTHS.week)
  const wSummary = w('summary', 220)
  const colW = (f: FieldDef) => w(f.id, fieldDefaultWidth(f))
  const months = Array.from(new Set(weekCols.map((x) => x.month)))
  const curIdx = currentKey ? weekCols.findIndex((x) => x.key === currentKey) : -1
  const monthStart = new Set(months.map((m) => weekCols.find((x) => x.month === m)!.key))
  // 머리글 칸: 시트 색이 있으면 그 색(글자는 검정), 시트 색을 모르는 예전 데이터면 검은 띠
  const thStyle = (hex: string | null | undefined): React.CSSProperties =>
    hs ? { background: hex ? `#${hex}` : '#FFFFFF', color: '#14161A' } : { background: '#14161A', color: '#FFFFFF' }
  const thBorder = 'border border-[#D3D3D3]'
  // 구분·과제 머리글은 검정, 일정(월·주) 머리글은 회색
  const blackTh: React.CSSProperties = { background: '#14161A', color: '#FFFFFF' }
  const grayTh: React.CSSProperties = { background: '#E4E6EA', color: '#14161A' }
  const groupOf = new Map((hs?.groups ?? []).flatMap((g) => g.fieldIds.map((id) => [id, g] as const)))
  const allIds = ['name', ...cols.map((f) => f.id)]

  // 끌어 칠하기: 누른 줄 안에서만 칠한다.
  const dragRow = useRef<string | null>(null)
  useEffect(() => {
    const up = () => (dragRow.current = null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // 우클릭 메뉴 · 메모 편집 · 메모 미리보기(표 밖에 떠서 잘리지 않게 fixed)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [nameEditing, setNameEditing] = useState<string | null>(null)
  useEffect(() => {
    if (editNameKey) setNameEditing(editNameKey)
  }, [editNameKey])
  const [paletteFor, setPaletteFor] = useState<'cell' | 'row' | null>(null)
  useEffect(() => {
    if (!menu) setPaletteFor(null)
  }, [menu])
  const [noteEdit, setNoteEdit] = useState<(Menu & { text: string }) | null>(null)
  // 새 구분(L2) 이름 입력: 위/아래에 추가 또는 새 구분 이름 고치기
  const [groupEdit, setGroupEdit] = useState<{ row: ProgressRow; mode: 'above' | 'below' | 'rename'; text: string; x: number; y: number } | null>(null)
  function commitGroup() {
    if (!groupEdit) return
    const name = groupEdit.text.trim()
    if (name) {
      if (groupEdit.mode === 'rename') onRenameGroup?.(groupEdit.row, name)
      else onAddGroup?.(groupEdit.row, groupEdit.mode, name)
    }
    setGroupEdit(null)
  }
  const [hoverNote, setHoverNote] = useState<{ text: string; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])
  function openMenu(e: React.MouseEvent, row: ProgressRow, key: string, kind: Menu['kind']) {
    e.preventDefault()
    setHoverNote(null)
    setMenu({ row, key, kind, x: Math.min(e.clientX, window.innerWidth - 250), y: Math.max(8, Math.min(e.clientY, window.innerHeight - 440)) })
  }
  function showNote(e: React.MouseEvent | null, text: string) {
    if (!e) return setHoverNote(null)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setHoverNote({ text, x: Math.min(r.right + 4, window.innerWidth - 300), y: r.top })
  }

  // 같은 L2끼리 묶어 "구분" 칸을 합친다(시트 순서 그대로).
  const groups: { l2: string; tag: string | null; rows: ScheduleRowView[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.l2 === r.row.l2) last.rows.push(r)
    else groups.push({ l2: r.row.l2, tag: r.row.l2Tag, rows: [r] })
  }
  const menuView = menu ? rows.find((v) => v.row.key === menu.row.key) : null
  const menuGroup = menu?.kind === 'group' ? groups.find((g) => g.rows[0].row.key === menu.row.key) : undefined
  const tableWidth = wL2 + wL3 + (scheduleOpen ? weekCols.length * wWeek : showSummary ? wSummary : 0) + cols.reduce((n, f) => n + colW(f), 0)
  let rowIndex = 0

  return (
    <>
      <table className="table-fixed border-collapse select-none" style={{ width: tableWidth, fontSize }}>
        <colgroup>
          <col style={{ width: wL2 }} />
          <col style={{ width: wL3 }} />
          {scheduleOpen ? weekCols.map((x) => <col key={x.key} style={{ width: wWeek }} />) : showSummary ? <col style={{ width: wSummary }} /> : null}
          {cols.map((f) => (
            <col key={f.id} style={{ width: colW(f) }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10" style={{ fontSize: HEADER_FONT }}>
          <tr>
            <th rowSpan={2} style={blackTh} className={`sticky left-0 z-20 px-2 py-2 font-bold ${thBorder}`}>
              구분(L2)
              {onResize && <ResizeHandle width={wL2} onResize={(v) => resizeTo('l2', v)} />}
            </th>
            <th rowSpan={2} style={{ left: wL2, ...blackTh }} className={`sticky z-20 px-2 py-2 font-bold ${thBorder}`}>
              과제(L3)
              {onResize && <ResizeHandle width={wL3} onResize={(v) => resizeTo('l3', v)} />}
            </th>
            {scheduleOpen ? (
              months.map((m, i) => (
                <th
                  key={m}
                  colSpan={weekCols.filter((x) => x.month === m).length}
                  style={grayTh}
                  onContextMenu={schMenu}
                  title="우클릭: 일정 보기(전체 펴기·줄여보기·숨기기)와 기간"
                  className={`group/sch relative pb-0.5 pt-2 font-bold ${thBorder}`}
                >
                  {m}월
                  {i === 0 && onToggleSchedule && (
                    <button
                      onClick={onToggleSchedule}
                      title="일정 줄여보기(요약 한 칸)"
                      aria-label="일정 줄여보기"
                      className="absolute left-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-white/70 text-label-2 opacity-0 shadow-sm transition-opacity hover:text-accent group-hover/sch:opacity-100"
                    >
                      <ChevronsLeft size={14} strokeWidth={2} />
                    </button>
                  )}
                </th>
              ))
            ) : showSummary ? (
              <th
                rowSpan={2}
                style={grayTh}
                onContextMenu={schMenu}
                title="우클릭: 일정 보기와 기간"
                className={`group/sch relative px-1.5 py-2 font-bold ${thBorder}`}
              >
                일정
                {onToggleSchedule && (
                  <button
                    onClick={onToggleSchedule}
                    title="일정 전체 펴기"
                    aria-label="일정 전체 펴기"
                    className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-white/70 text-label-2 opacity-0 shadow-sm transition-opacity hover:text-accent group-hover/sch:opacity-100"
                  >
                    <ChevronsRight size={14} strokeWidth={2} />
                  </button>
                )}
                {onResize && <ResizeHandle width={wSummary} onResize={(v) => resizeTo('summary', v)} />}
              </th>
            ) : null}
            {cols.map((f) => {
              const g = groupOf.get(f.id)
              if (g) {
                if (g.fieldIds[0] !== f.id) return null
                return (
                  <th
                    key={`g-${f.id}`}
                    colSpan={g.fieldIds.filter((id) => cols.some((c) => c.id === id)).length}
                    style={thStyle(g.bg ?? hs?.fields[f.id])}
                    className={`px-1.5 pb-0.5 pt-2 font-bold ${thBorder}`}
                  >
                    {g.label}
                  </th>
                )
              }
              return (
                <th key={f.id} rowSpan={2} style={thStyle(hs?.fields[f.id])} className={`relative px-1 py-2 font-bold ${thBorder}`} title={f.label}>
                  {headLabel(f)}
                  {onResize && <ResizeHandle width={colW(f)} onResize={(v) => resizeTo(f.id, v)} />}
                </th>
              )
            })}
          </tr>
          <tr>
            {scheduleOpen &&
              weekCols.map((x, i) => (
                <th
                  key={x.key}
                  style={grayTh}
                  onContextMenu={schMenu}
                  className={`relative pb-1.5 text-[10px] font-medium ${thBorder} ${i === curIdx ? '!text-[#E8342A]' : ''}`}
                >
                  {i === curIdx ? '▼' : x.week}
                  {onResize && i === 0 && <ResizeHandle width={wWeek} onResize={(v) => resizeTo('week', Math.max(8, v))} />}
                </th>
              ))}
            {cols
              .filter((f) => groupOf.has(f.id))
              .map((f) => (
                <th key={f.id} style={thStyle(hs?.fields[f.id])} className={`relative px-1 pb-1.5 font-bold ${thBorder}`} title={f.label}>
                  {headLabel(f)}
                  {onResize && <ResizeHandle width={colW(f)} onResize={(v) => resizeTo(f.id, v)} />}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <Fragment key={`${g.l2}-${gi}`}>
              {g.rows.map((v, ri) => {
                const rowBg = zebra && rowIndex++ % 2 === 1 ? 'bg-[#F7F8FA]' : 'bg-white'
                const l3Bg = v.bg.name
                const l3Note = v.notes.name
                return (
                  <tr key={v.row.key} className={`group/row ${rowBg} leading-snug ${v.deleted ? 'opacity-40' : ''}`}>
                    {ri === 0 && (
                      <td
                        rowSpan={g.rows.length}
                        onContextMenu={(e) => openMenu(e, g.rows[0].row, 'l2', 'group')}
                        title={`${g.l2} · 우클릭: 구분(L2) 추가·삭제`}
                        className={`group/l2 sticky left-0 z-[5] border-b border-r border-[#C9CDD3] bg-white px-2 py-2 text-center align-top font-bold text-label ${
                          g.rows.every((x) => x.deleted) ? 'text-label-3 line-through' : ''
                        }`}
                      >
                        {/* 줄이 많은 L2도 이름이 보이도록 위에 붙이고, 스크롤해도 머리글 아래에 머문다. */}
                        <div className="sticky top-[64px] py-1">
                          {g.rows.every((x) => x.row.isNew) && (
                            <span className="mb-1 inline-block rounded-[3px] bg-accent px-1 text-[0.77em] font-bold text-white no-underline">새 구분</span>
                          )}
                          <span className="block whitespace-pre-line break-words">{g.l2}</span>
                          {g.tag && <span className="mt-1 block text-[0.85em] font-semibold text-[#E8342A]">[{g.tag}]</span>}
                          <span className="mt-1 block text-[0.85em] font-medium text-label-3">{g.rows.length}건</span>
                          {/* 마우스를 올리면: 아래에 구분 추가 · 구분 삭제(취소) */}
                          <span className="mt-1 flex justify-center gap-0.5 opacity-0 transition-opacity group-hover/l2:opacity-100">
                            {onAddGroup && (
                              <RowIcon
                                label="아래에 구분(L2) 추가"
                                onClick={(e) => {
                                  const r = e.currentTarget.getBoundingClientRect()
                                  setGroupEdit({ row: g.rows[g.rows.length - 1].row, mode: 'below', text: '', x: r.left, y: r.bottom + 4 })
                                }}
                              >
                                <Plus size={13} strokeWidth={2} />
                              </RowIcon>
                            )}
                            {g.rows.every((x) => x.deleted)
                              ? onRestoreGroup && (
                                  <RowIcon label="구분 삭제 취소" onClick={() => onRestoreGroup(g.rows[0].row)}>
                                    <Undo2 size={13} strokeWidth={2} />
                                  </RowIcon>
                                )
                              : onDeleteGroup && (
                                  <RowIcon label={`구분(L2) 삭제 · 과제 ${g.rows.length}건`} danger onClick={() => onDeleteGroup(g.rows[0].row)}>
                                    <Trash2 size={13} strokeWidth={2} />
                                  </RowIcon>
                                )}
                          </span>
                        </div>
                      </td>
                    )}
                    <td
                      onContextMenu={(e) => openMenu(e, v.row, 'name', 'field')}
                      onMouseEnter={l3Note ? (e) => showNote(e, l3Note) : undefined}
                      onMouseLeave={l3Note ? () => showNote(null, '') : undefined}
                      style={{ left: wL2, ...(l3Bg ? { background: `#${l3Bg}` } : {}) }}
                      className={`sticky z-[5] border-b border-r border-dotted border-b-[#C9CDD3] border-r-[#C9CDD3] px-2 py-0 ${l3Bg ? '' : rowBg}`}
                    >
                      {nameEditing === v.row.key && (
                        <input
                          autoFocus
                          defaultValue={v.vals.name}
                          placeholder="과제(L3) 이름"
                          onBlur={(e) => {
                            if (e.target.value.trim() !== v.vals.name) onField(v.row, 'name', e.target.value.trim())
                            setNameEditing(null)
                          }}
                          onKeyDown={(e) => {
                            const el = e.target as HTMLInputElement
                            if (e.key === 'Enter') el.blur()
                            if (e.key === 'Escape') {
                              el.value = v.vals.name
                              el.blur()
                            }
                          }}
                          className="absolute inset-0 z-30 h-full w-full border-2 border-accent bg-white px-2 text-[1em] font-semibold text-label outline-none"
                        />
                      )}
                      <div
                        onClick={v.deleted ? undefined : () => setNameEditing(v.row.key)}
                        className="flex w-full min-w-0 cursor-text items-start gap-1 text-left"
                        title={l3Note ? undefined : `${v.vals.name || '(이름 없음)'} · 눌러서 이름 고치기 · 우클릭: 메모·색`}
                      >
                        {v.row.isNew && <span className="mt-[2px] shrink-0 rounded-[3px] bg-accent px-1 text-[0.77em] font-bold text-white">새 과제</span>}
                        {v.deleted && <span className="mt-[2px] shrink-0 rounded-[3px] bg-danger px-1 text-[0.77em] font-bold text-white">삭제</span>}
                        <span
                          className={`whitespace-normal break-words font-semibold ${v.vals.name ? 'text-label' : 'text-label-3'} ${v.deleted ? 'line-through' : ''}`}
                        >
                          {v.vals.name || '(이름을 입력하세요)'}
                        </span>
                        {(v.editedFields.size > 0 || v.row.isNew) && <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                      </div>
                      {l3Note && <NoteMark />}
                      {/* 마우스를 올리면 오른쪽에: 아래에 과제 추가 · 과제 삭제(취소) */}
                      <span className="absolute right-0.5 top-1/2 z-10 flex -translate-y-1/2 gap-0.5 rounded-control bg-white/95 p-0.5 opacity-0 shadow-sm ring-1 ring-black/10 transition-opacity group-hover/row:opacity-100">
                        {!v.deleted && onAddRow && (
                          <RowIcon label="아래에 과제 추가" onClick={() => onAddRow(v.row, 'below')}>
                            <Plus size={13} strokeWidth={2} />
                          </RowIcon>
                        )}
                        {v.deleted
                          ? onRestoreRow && (
                              <RowIcon label="삭제 취소" onClick={() => onRestoreRow(v.row)}>
                                <Undo2 size={13} strokeWidth={2} />
                              </RowIcon>
                            )
                          : onDeleteRow && (
                              <RowIcon label="과제 삭제" danger onClick={() => onDeleteRow(v.row)}>
                                <Trash2 size={13} strokeWidth={2} />
                              </RowIcon>
                            )}
                      </span>
                    </td>
                    {scheduleOpen ? (
                      weekCols.map((x, i) => {
                        const c = v.cells[x.key]
                        const edited = v.editedCells.has(x.key) || v.editedFields.has(x.key)
                        const note = v.notes[x.key]
                        return (
                          <td
                            key={x.key}
                            onMouseDown={
                              editing && !v.deleted
                                ? (e) => {
                                    if (e.button !== 0) return
                                    e.preventDefault()
                                    dragRow.current = v.row.key
                                    onPaint(v.row, x.key, true)
                                  }
                                : undefined
                            }
                            onMouseEnter={(e) => {
                              if (editing && dragRow.current === v.row.key) onPaint(v.row, x.key, false)
                              if (note) showNote(e, note)
                            }}
                            onMouseLeave={note ? () => showNote(null, '') : undefined}
                            onContextMenu={(e) => openMenu(e, v.row, x.key, 'week')}
                            title={
                              note
                                ? undefined
                                : `${x.month}월 ${x.week}주${c ? ` · ${cellLabel(c)}` : ''}${edited ? ' · 고침(아직 저장 안 함)' : ''} · 우클릭: 메모`
                            }
                            style={c?.f ? { background: `#${FILL_HEX[c.f]}` } : undefined}
                            className={`relative border-b border-dotted border-b-[#C9CDD3] p-0 text-center text-[0.78em] font-bold leading-none text-[#14161A] ${
                              monthStart.has(x.key) ? 'border-l border-l-[#A6A6A6]' : 'border-l border-l-[#E5E7EB]'
                            } ${editing ? 'cursor-crosshair hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-accent' : ''}`}
                          >
                            {i === curIdx && <span className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-[#E8342A]/70" />}
                            <span className="relative">{c?.m}</span>
                            {note && <NoteMark />}
                            {edited && <span className="pointer-events-none absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
                          </td>
                        )
                      })
                    ) : showSummary ? (
                      <td className="border-b border-l border-dotted border-b-[#C9CDD3] border-l-[#A6A6A6] px-1.5 py-0 text-[0.85em] leading-tight text-label-2">
                        {(() => {
                          const pr = planRange(v.cells, allWeekCols)
                          const wk = (k: string | null) => {
                            const x = k ? allWeekCols.find((y) => y.key === k) : null
                            return x ? `${x.month}/${x.week}주` : '-'
                          }
                          const plan = pr.planStart || pr.planEnd ? `${wk(pr.planStart)}~${wk(pr.planEnd)}` : '-'
                          const act = pr.started ? `${wk(pr.started)}~${pr.done ? wk(pr.done) : ''}` : '-'
                          return (
                            <p className="whitespace-normal break-words">
                              <span className="text-label-3">계획</span> {plan} <span className="text-label-3">실적</span> {act}
                            </p>
                          )
                        })()}
                      </td>
                    ) : null}
                    {cols.map((f) => (
                      <FieldCell
                        key={f.id}
                        f={f}
                        value={v.vals[f.id] ?? ''}
                        bg={v.bg[f.id] ?? ''}
                        note={v.notes[f.id] ?? ''}
                        edited={v.editedFields.has(f.id) || (!!v.row.isNew && !!v.vals[f.id])}
                        onCommit={(val) => onField(v.row, f.id, val)}
                        onMenu={(e) => openMenu(e, v.row, f.id, 'field')}
                        onHoverNote={(e) => showNote(e, v.notes[f.id] ?? '')}
                        disabled={v.deleted}
                      />
                    ))}
                  </tr>
                )
              })}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2 + (scheduleOpen ? weekCols.length : showSummary ? 1 : 0) + cols.length} className="px-4 py-12 text-left text-[13px] text-label-3">
                <span className="sticky left-4">조건에 맞는 과제가 없습니다. 머리글 필터나 찾기를 확인해 주세요.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 입력 칸 제안값(시트에 이미 있는 값) */}
      {optionsOf &&
        cols.map((f) => {
          const opts = optionsOf(f)
          return opts.length ? (
            <datalist key={f.id} id={`pb-opts-${f.id}`}>
              {opts.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          ) : null
        })}

      {filterOpen && filterOptions && onFilter && (
        <FilterPopover
          label={filterOpen.f.label}
          options={filterOptions(filterOpen.f)}
          hidden={hiddenOf?.(filterOpen.f.id) ?? []}
          x={filterOpen.x}
          y={filterOpen.y}
          onChange={(h) => onFilter(filterOpen.f.id, h)}
          onClose={() => setFilterOpen(null)}
        />
      )}

      {hoverNote && !menu && !noteEdit && (
        <div
          className="pointer-events-none fixed z-50 max-w-[300px] whitespace-pre-wrap break-words rounded-[4px] border border-[#D6DAE0] bg-white px-2.5 py-2 text-[12px] leading-relaxed text-label shadow-dialog"
          style={{ left: hoverNote.x, top: hoverNote.y }}
        >
          {hoverNote.text}
        </div>
      )}

      {menu && menuView && (
        <div
          className={`mac-pop fixed z-50 py-1 text-[13px] ${paletteFor ? 'w-[268px]' : 'w-[240px]'}`}
          style={{ left: Math.min(menu.x, window.innerWidth - (paletteFor ? 276 : 248)), top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.kind === 'group' && menuGroup ? (
            <>
              {onAddGroup &&
                (
                  [
                    ['above', '위에 구분(L2) 추가'],
                    ['below', '아래에 구분(L2) 추가'],
                  ] as const
                ).map(([where, label]) => (
                  <button
                    key={where}
                    onClick={() => {
                      setGroupEdit({ row: menuGroup.rows[where === 'above' ? 0 : menuGroup.rows.length - 1].row, mode: where, text: '', x: menu.x, y: menu.y })
                      setMenu(null)
                    }}
                    className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
                  >
                    {label}
                  </button>
                ))}
              {onRenameGroup && menuGroup.rows.every((x) => x.row.isNew) && (
                <button
                  onClick={() => {
                    const r = menuGroup.rows[0].row
                    setGroupEdit({ row: r, mode: 'rename', text: r.l2Tag ? `${r.l2} [${r.l2Tag}]` : r.l2, x: menu.x, y: menu.y })
                    setMenu(null)
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
                >
                  구분 이름 고치기
                </button>
              )}
              <div className="mac-menu-sep" />
              {menuGroup.rows.every((x) => x.deleted)
                ? onRestoreGroup && (
                    <button
                      onClick={() => {
                        onRestoreGroup(menu.row)
                        setMenu(null)
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
                    >
                      구분 삭제 취소
                    </button>
                  )
                : onDeleteGroup && (
                    <button
                      onClick={() => {
                        onDeleteGroup(menu.row)
                        setMenu(null)
                      }}
                      className="block w-full px-3 py-1.5 text-left text-danger hover:bg-black/[0.05]"
                    >
                      구분(L2) 삭제 · 과제 {menuGroup.rows.length}건
                    </button>
                  )}
            </>
          ) : menuView.deleted ? (
            onRestoreRow && (
              <button
                onClick={() => {
                  onRestoreRow(menu.row)
                  setMenu(null)
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
              >
                삭제 취소
              </button>
            )
          ) : paletteFor ? (
            <div className="px-3 py-1.5">
              <button onClick={() => setPaletteFor(null)} className="mb-1 flex items-center gap-1 text-[12px] font-medium text-label-2 hover:text-label">
                ‹ {paletteFor === 'cell' ? '칸 색' : '행 색 (L3 · 입력 열 전체)'}
              </button>
              <ColorPalette
                current={menuView.bg[menu.key] ?? ''}
                sheetColors={sheetColors}
                onPick={(hex) => {
                  onBg(menu.row, paletteFor === 'cell' ? [menu.key] : allIds, hex)
                  setMenu(null)
                }}
              />
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  setNoteEdit({ ...menu, text: menuView.notes[menu.key] ?? '' })
                  setMenu(null)
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
              >
                {menuView.notes[menu.key] ? '메모 수정' : '메모 추가'}
              </button>
              {menuView.notes[menu.key] && (
                <button
                  onClick={() => {
                    onNote(menu.row, menu.key, '')
                    setMenu(null)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-danger hover:bg-black/[0.05]"
                >
                  메모 삭제
                </button>
              )}
              {onAddRow && (
                <>
                  <div className="mac-menu-sep" />
                  {(
                    [
                      ['above', '위에 과제 추가'],
                      ['below', '아래에 과제 추가'],
                    ] as const
                  ).map(([where, label]) => (
                    <button
                      key={where}
                      onClick={() => {
                        onAddRow(menu.row, where)
                        setMenu(null)
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
                    >
                      {label}
                    </button>
                  ))}
                </>
              )}
              {onDeleteRow && (
                <button
                  onClick={() => {
                    onDeleteRow(menu.row)
                    setMenu(null)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-danger hover:bg-black/[0.05]"
                >
                  과제 삭제
                </button>
              )}
              {!menu.row.isNew && onRevertRow && (menuView.editedFields.size > 0 || menuView.editedCells.size > 0) && (
                <button
                  onClick={() => {
                    onRevertRow(menu.row)
                    setMenu(null)
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
                >
                  이 행 고친 내용 되돌리기
                </button>
              )}
              {menu.kind === 'field' && (
                <>
                  <div className="mac-menu-sep" />
                  {(
                    [
                      ['cell', '칸 색'],
                      ['row', '행 색 (L3 · 입력 열 전체)'],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setPaletteFor(k)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-black/[0.05]"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-[3px] ring-1 ring-inset ring-black/15"
                          style={{ background: menuView.bg[menu.key] ? `#${menuView.bg[menu.key]}` : '#FFFFFF' }}
                        />
                        {label}
                      </span>
                      <span className="text-label-3">▸</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {groupEdit && (
        <div className="fixed inset-0 z-50" onMouseDown={() => setGroupEdit(null)}>
          <div
            className="mac-pop absolute w-[300px] p-2.5"
            style={{ left: Math.min(groupEdit.x, window.innerWidth - 308), top: groupEdit.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="text-[12px] font-semibold text-label">
              {groupEdit.mode === 'rename' ? '구분(L2) 이름 고치기' : `${groupEdit.mode === 'above' ? '위에' : '아래에'} 새 구분(L2) 추가`}
            </p>
            <input
              autoFocus
              value={groupEdit.text}
              onChange={(e) => setGroupEdit({ ...groupEdit, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setGroupEdit(null)
                if (e.key === 'Enter') commitGroup()
              }}
              placeholder="구분 이름 (태그는 끝에 [태그])"
              className="mt-1.5 h-8 w-full rounded-control border border-hairline px-2 text-[13px] text-label"
            />
            {groupEdit.mode !== 'rename' && <p className="mt-1 text-[11px] text-label-3">과제 한 줄과 함께 만들어집니다. 과제 이름을 넣어야 저장됩니다.</p>}
            <div className="mt-2 flex justify-end gap-1.5">
              <button onClick={() => setGroupEdit(null)} className="h-7 rounded-control px-2.5 text-[12px] text-label-2 hover:bg-black/[0.05]">
                취소
              </button>
              <button
                onClick={commitGroup}
                disabled={!groupEdit.text.trim()}
                className="h-7 rounded-control bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {groupEdit.mode === 'rename' ? '바꾸기' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {noteEdit && (
        <div className="fixed inset-0 z-50" onMouseDown={() => setNoteEdit(null)}>
          <div className="mac-pop absolute w-[300px] p-2.5" style={{ left: noteEdit.x, top: noteEdit.y }} onMouseDown={(e) => e.stopPropagation()}>
            <p className="text-[12px] font-semibold text-label">메모</p>
            <textarea
              autoFocus
              value={noteEdit.text}
              onChange={(e) => setNoteEdit({ ...noteEdit, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNoteEdit(null)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  onNote(noteEdit.row, noteEdit.key, noteEdit.text)
                  setNoteEdit(null)
                }
              }}
              rows={5}
              placeholder="메모를 입력하세요 (⌘/Ctrl+Enter로 넣기)"
              className="mt-1.5 w-full resize-y rounded-control border border-hairline px-2 py-1.5 text-[13px] text-label"
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <button onClick={() => setNoteEdit(null)} className="h-7 rounded-control px-2.5 text-[12px] text-label-2 hover:bg-black/[0.05]">
                취소
              </button>
              <button
                onClick={() => {
                  onNote(noteEdit.row, noteEdit.key, noteEdit.text)
                  setNoteEdit(null)
                }}
                className="h-7 rounded-control bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover"
              >
                메모 넣기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

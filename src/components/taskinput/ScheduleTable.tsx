// 추진현황 일정표 -- 구글시트 추진현황 탭을 그대로 펼친 표.
//   · 머리글 색·묶음 머리글, 칸 배경색, 칸 메모를 시트 그대로 보여 준다.
//   · 주차 칸은 회색 = 계획, 분홍 = 실적, 글자 S / F / 완. 입력 중에는 고른 도구로 누르거나 끌어 칠한다.
//   · 입력 열(속성·분류·상태…)은 칸을 눌러 그 자리에서 입력한다.
//   · 칸에서 우클릭: 메모 추가·수정·삭제, 칸 색 / 행 색 바꾸기.
//   · 머리글 오른쪽 끝을 끌어 열 폭을 바꾸고, 좁히면 글자가 줄바꿈된다.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  Italic,
  Strikethrough,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronsLeft,
  ChevronsRight,
  ClipboardPaste,
  Copy,
  ListFilter,
  Plus,
  StickyNote,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { Importance, WeekColumn } from '../../types'
import type { CellMerge, CellState, FieldDef, HeaderStyle, ProgressRow } from '../../utils/progressBoard'
import { FILL_HEX, planRange } from '../../utils/progressBoard'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import ColorPalette from './ColorPalette'
import FormatBar from './FormatBar'
import { parseFmt, type CellFmt } from '../../utils/sheetSources'

// 붙여넣은 글(탭 · 줄바꿈으로 나눈 표, 따옴표 안 줄바꿈 허용)
function parseTsv(text: string): string[][] {
  const out: string[][] = [[]]
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"' && cur === '') q = true
    else if (ch === '\t') {
      out[out.length - 1].push(cur)
      cur = ''
    } else if (ch === '\n') {
      out[out.length - 1].push(cur)
      out.push([])
      cur = ''
    } else cur += ch
  }
  out[out.length - 1].push(cur)
  return out
}

// 구분(L2) 칸의 색 · 서식을 묶음 첫 행에 두는 키
export const L2_KEY = 'lvl:l2'

// 서식 막대를 띄울 자리(ProgressBoard 도구 줄)
export const FORMAT_BAR_SLOT = 'pb-format-slot'

// 칸 글자 서식 → 화면 스타일(크기는 시트 기본 10pt를 기준으로 비율)
function fmtStyle(fmt: string | undefined): React.CSSProperties {
  if (!fmt) return {}
  const f = parseFmt(fmt)
  return {
    ...(f.b ? { fontWeight: 700 } : {}),
    ...(f.i ? { fontStyle: 'italic' } : {}),
    ...(f.x ? { textDecoration: 'line-through' } : {}),
    ...(f.c ? { color: `#${f.c}` } : {}),
    ...(f.s ? { fontSize: `${(f.s / 10).toFixed(2)}em` } : {}),
    ...(f.a ? { textAlign: f.a } : {}),
  }
}

export interface ScheduleRowView {
  row: ProgressRow
  cells: Record<string, CellState>
  vals: Record<string, string> // 고친 값을 얹은 열 값(name, status, assignees, category, note …)
  bg: Record<string, string> // 고친 값을 얹은 칸 배경색(열 id → RRGGBB)
  notes: Record<string, string> // 고친 값을 얹은 칸 메모(열 id 또는 주차 키 → 메모)
  fmt?: Record<string, string> // 고친 값을 얹은 칸 글자 서식(열 id → fmtString)
  editedCells: Set<string>
  editedFields: Set<string> // 값·색·메모 중 무엇이든 고친 열 id / 주차 키
  deleted?: boolean // 지우기로 함(저장하면 시트에서 줄을 지움)
}

// 머리글 기본색: 구분·과제 #666666, 일정 #999999
export const HEAD_DEFAULT = { l2: '666666', l3: '666666', schedule: '999999' } as const
function isLightHex(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return r * 0.299 + g * 0.587 + b * 0.114 > 170
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
const HEADER_FONT = 12 // 머리글 글자는 고정, 본문만 가▲/가▼로 바뀐다

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

// Tab/Enter로 옆·아래 칸 옮기기. 한글 입력(IME) 중에 누른 키는 조합을 끝내는 데 쓰여 keydown이
// 'Process'(keyCode 229)나 조합 중(isComposing)으로 오므로, 그때는 키를 뗄 때(keyup) 옮긴다.
// 한 번 누른 키로 두 번 옮겨지지 않게 잠깐(150ms)은 한 번만.
let imeKeyPending = false
let lastNavAt = 0
type NavGo = (dx: number, dy: number) => void
const navDir = (e: React.KeyboardEvent): [number, number] => (e.key === 'Tab' ? [e.shiftKey ? -1 : 1, 0] : [0, e.shiftKey ? -1 : 1])
const isNav = (e: React.KeyboardEvent, enter: boolean) => e.key === 'Tab' || (enter && e.key === 'Enter')
function fireNav(e: React.KeyboardEvent, go: NavGo) {
  if (Date.now() - lastNavAt < 150) return
  lastNavAt = Date.now()
  const [dx, dy] = navDir(e)
  go(dx, dy)
}
// 처리했으면 true
function navKeyDown(e: React.KeyboardEvent, enter: boolean, go: NavGo): boolean {
  if (e.nativeEvent.isComposing || e.keyCode === 229) {
    imeKeyPending = true
    if (isNav(e, enter)) e.preventDefault()
    return true
  }
  if (!isNav(e, enter)) return false
  e.preventDefault()
  imeKeyPending = false
  fireNav(e, go)
  return true
}
function navKeyUp(e: React.KeyboardEvent, enter: boolean, go: NavGo) {
  if (!imeKeyPending || !isNav(e, enter)) return
  imeKeyPending = false
  fireNav(e, go)
}

// 선택한 칸의 입력기(구글시트처럼):
//   선택  -- 보이지 않는 입력창이 초점을 잡고 있다. 방향키 · Tab으로 칸 이동, Enter · F2 · 더블클릭으로 고치기,
//           Delete · Backspace로 지우기, 바로 타이핑하면(한글 조합 포함) 새 값으로 입력 시작.
//   타이핑 -- 방향키 · Tab · Enter는 반영하고 이동, Esc는 취소.
//   고치기 -- 지금 값에서 이어 고친다. Tab · Enter는 반영하고 이동(메모는 Enter가 줄바꿈, ⌘/Ctrl+Enter로 반영).
type EditMode = 'select' | 'type' | 'edit'
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
function CellEditor({
  value,
  kind,
  list,
  bold,
  disabled,
  editSignal,
  onCommit,
  onMove,
  onMoveRow,
  onExtend,
  onClearRange,
  onPick,
}: {
  onPick?: () => void // 고르는 칸(분류 · 상태): Enter · F2 · 더블클릭이면 글자 입력 대신 칩 목록을 연다
  value: string
  kind: 'text' | 'memo' | 'date'
  list?: string
  bold?: boolean
  disabled?: boolean
  editSignal?: number // 바뀌면 고치기 시작(더블클릭 · 새 과제 추가 직후)
  onCommit: (v: string) => void
  onMove: (dx: number, dy: number) => void
  onMoveRow?: (dir: -1 | 1) => void // Alt+↑/↓: 이 줄을 위/아래로 옮기기
  onExtend?: (dx: number, dy: number) => void // Shift+방향키: 선택 범위 늘리기
  onClearRange?: () => void // 여러 칸을 골랐을 때 Delete: 고른 칸 모두 지우기
}) {
  const [mode, setMode] = useState<EditMode>('select')
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const done = useRef(false)
  // 다른 칸을 눌러 선택이 옮겨 가면(입력창이 초점을 잃기 전에 사라지면) 입력하던 값을 반영한다
  const latest = useRef({ mode, draft, value, kind, onCommit })
  latest.current = { mode, draft, value, kind, onCommit }
  useEffect(
    () => () => {
      const l = latest.current
      if (l.mode === 'select' || done.current) return
      const v = l.kind === 'text' ? l.draft.trim() : l.draft
      if (v !== l.value) l.onCommit(v)
    },
    [],
  )
  useEffect(() => {
    ref.current?.focus({ preventScroll: mode === 'select' })
  }, [mode])
  useEffect(() => {
    if (editSignal && !disabled) {
      if (onPick) onPick()
      else startEdit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal])
  function startEdit() {
    if (disabled) return
    setDraft(value)
    done.current = false
    setMode('edit')
  }
  function commit() {
    if (done.current) return
    done.current = true
    const v = kind === 'text' ? draft.trim() : draft
    if (mode !== 'select' && v !== value) onCommit(v)
    setMode('select')
  }
  function cancel() {
    done.current = true
    setMode('select')
  }
  const go = (dx: number, dy: number) => {
    commit()
    onMove(dx, dy)
  }
  function keyDown(e: React.KeyboardEvent) {
    if (mode === 'select') {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return // 한글 조합 시작 -- 타이핑으로 넘어간다
      const a = ARROWS[e.key]
      if (a && e.shiftKey && onExtend) {
        e.preventDefault()
        onExtend(a[0], a[1])
      } else if (a && e.altKey && a[1] !== 0) {
        e.preventDefault()
        if (!disabled) onMoveRow?.(a[1] as -1 | 1)
      } else if (a) {
        e.preventDefault()
        onMove(a[0], a[1])
      } else if (e.key === 'Tab') {
        e.preventDefault()
        onMove(e.shiftKey ? -1 : 1, 0)
      } else if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault()
        if (e.key === 'Enter' && e.shiftKey) onMove(0, -1)
        else if (onPick && !disabled) onPick()
        else startEdit()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && (onClearRange || !disabled)) {
        e.preventDefault()
        if (onClearRange) onClearRange()
        else if (value) onCommit('')
      } else if (kind === 'date' && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        startEdit()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    if (kind === 'memo' && mode === 'edit' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit()
      return
    }
    // 타이핑 중 방향키는 반영하고 이동(고치기 중에는 글자 사이 이동)
    if (mode === 'type' && ARROWS[e.key] && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      go(...ARROWS[e.key])
      return
    }
    navKeyDown(e, !(kind === 'memo' && mode === 'edit'), go)
  }
  const keyUp = (e: React.KeyboardEvent) => mode !== 'select' && navKeyUp(e, !(kind === 'memo' && mode === 'edit'), go)
  function typeStart(v: string) {
    if (disabled) return
    done.current = false
    setDraft(v)
    setMode('type')
  }
  const shown = 'absolute z-30 border-2 border-accent bg-white text-[1em] text-label outline-none'
  if (mode === 'edit' && kind === 'memo')
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        placeholder="⌘/Ctrl+Enter로 반영"
        className={`${shown} left-0 top-0 h-[9em] w-[max(100%,260px)] rounded-control p-1.5 shadow-dialog`}
      />
    )
  if (mode === 'edit' && kind === 'date')
    return (
      <input
        ref={ref}
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(draft) ? draft : ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        className={`${shown} inset-0 h-full w-full px-1.5`}
      />
    )
  return (
    <input
      ref={ref}
      value={mode === 'select' ? '' : draft}
      data-cell-select={mode === 'select' ? '1' : undefined}
      onChange={(e) => (mode === 'select' ? typeStart(e.target.value) : setDraft(e.target.value))}
      onCompositionStart={() => mode === 'select' && typeStart('')}
      onBlur={() => mode !== 'select' && commit()}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      list={mode === 'select' ? undefined : list}
      aria-label="칸 입력"
      className={
        mode === 'select'
          ? 'pointer-events-none absolute inset-0 h-full w-full cursor-default opacity-0'
          : `${shown} inset-0 h-full w-full px-1.5 ${bold ? 'font-semibold' : ''}`
      }
    />
  )
}

// 시트 칸 하나 -- 한 번 누르면 선택, 더블클릭 · Enter · 타이핑으로 입력(구글시트처럼).
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
  selected,
  onSelect,
  editSignal,
  onMove,
  rowH,
  cellId,
  onMoveRow,
  inRange,
  onPointerDown,
  onPointerEnter,
  onExtend,
  onClearRange,
  fmt,
  span,
  onFillStart,
  fillPreview,
  choices,
}: {
  choices?: string[] // 칩으로 고르는 칸(분류 · 상태)의 선택지
  f: FieldDef
  value: string
  fmt?: string
  span?: { r: number; c: number } // 병합 칸(맨 위 왼쪽 칸이 여러 줄 · 열을 차지)
  onFillStart?: (e: React.MouseEvent) => void // 고른 범위 오른쪽 아래 점(끌어서 반복 채우기)
  fillPreview?: boolean // 채우기로 끌고 있는 자리
  bg: string
  note: string
  edited: boolean
  onCommit: (v: string) => void
  onMenu: (e: React.MouseEvent) => void
  onHoverNote: (e: React.MouseEvent | null) => void
  disabled?: boolean
  selected?: boolean
  onSelect?: (edit: boolean) => void // 누르면 선택(더블클릭이면 edit = true)
  editSignal?: number
  onMove: (dx: number, dy: number) => void
  rowH?: number // 사용자가 정한 행 높이(px) -- 넘치는 내용은 가린다
  cellId?: string // 선택을 옮길 때 화면에 보이게 스크롤하는 데 씀
  onMoveRow?: (dir: -1 | 1) => void
  inRange?: boolean // 여러 칸 선택 범위 안
  onPointerDown?: (e: React.MouseEvent) => void // 누르기(Shift = 범위 늘리기, 끌기 = 범위 고르기)
  onPointerEnter?: () => void
  onExtend?: (dx: number, dy: number) => void
  onClearRange?: () => void
}) {
  const chip = 'inline-flex items-center rounded-full px-2 text-[0.85em] font-semibold'
  const tdRef = useRef<HTMLTableCellElement>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const canPick = !!choices && !disabled
  // 메모 칸은 시트에서 넣은 줄바꿈 그대로(두 줄까지), 다른 칸은 한 칸 안에서 이어 보여 준다
  let display: React.ReactNode = f.kind === 'memo' ? value.trim() : value.replace(/\s*\n\s*/g, ' · ')
  if (f.id === 'status' && value) display = <span className={`${chip} ${STATUS_TONE[value] ?? 'bg-black/[0.05] text-label-2'}`}>{value}</span>
  else if (f.id === 'category' && value) display = <span className={`${chip} ${categoryTone(value)}`}>{value}</span>
  else if (f.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) display = value.slice(5).replace('-', '.') // 연도 없이 월.일만
  return (
    <td
      ref={tdRef}
      data-cell={cellId}
      rowSpan={span && span.r > 1 ? span.r : undefined}
      colSpan={span && span.c > 1 ? span.c : undefined}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        // 누른 칸의 입력창이 초점을 계속 갖도록(브라우저가 초점을 칸 밖으로 옮기지 않게)
        if (!(e.target as HTMLElement).closest('input,textarea,button,a')) e.preventDefault()
        if (onPointerDown) onPointerDown(e)
        else if (!selected) onSelect?.(false)
      }}
      onDoubleClick={() => onSelect?.(true)}
      onContextMenu={(e) => {
        if (!inRange) onSelect?.(false) // 고른 범위 안에서 우클릭하면 범위를 그대로 둔다
        onMenu(e)
      }}
      onMouseEnter={(e) => {
        onPointerEnter?.()
        if (note) onHoverNote(e)
      }}
      onMouseLeave={note ? () => onHoverNote(null) : undefined}
      title={note ? undefined : value ? `${f.label}: ${value}` : `${f.label} · 더블클릭 · Enter · 타이핑으로 입력 · 우클릭: 메모·색`}
      style={bg ? { background: `#${bg}` } : undefined}
      className={`relative cursor-cell border-b border-l border-b-[#DADDE2] border-l-[#E3E5E8] px-1.5 py-[var(--row-pad)] align-middle text-[0.92em] text-label ${
        selected ? 'outline outline-2 -outline-offset-2 outline-accent' : ''
      } ${inRange ? 'shadow-[inset_0_0_0_9999px_rgba(26,115,232,0.13)]' : ''} ${fillPreview ? 'outline-dashed outline-1 -outline-offset-2 outline-accent' : ''}`}
    >
      {/* 폭을 줄이면 줄바꿈. 긴 메모는 두 줄까지만. 행 높이를 정했으면 그 높이에서 자른다 */}
      {/* 칩으로 고르는 칸: 고르면 오른쪽에 ▾ (누르면 칩 목록) */}
      {canPick && selected && (
        <span
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setPickOpen((v) => !v)
          }}
          className="absolute right-1 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-label-2 hover:bg-black/[0.06]"
          title="골라서 넣기"
        >
          <ChevronDown size={13} strokeWidth={2.2} />
        </span>
      )}
      {pickOpen && tdRef.current && choices && (
        <ChipPicker
          anchor={tdRef.current}
          fieldId={f.id}
          value={value}
          choices={choices}
          onPick={(v) => {
            setPickOpen(false)
            if (v !== value) onCommit(v)
            requestAnimationFrame(() => (tdRef.current?.querySelector('input') as HTMLInputElement | null)?.focus({ preventScroll: true }))
          }}
          onClose={() => {
            setPickOpen(false)
            requestAnimationFrame(() => (tdRef.current?.querySelector('input') as HTMLInputElement | null)?.focus({ preventScroll: true }))
          }}
        />
      )}
      <div
        className={`break-words ${f.kind === 'memo' ? 'line-clamp-2 whitespace-pre-line' : 'whitespace-normal'} ${rowH ? 'overflow-hidden' : ''}`}
        style={{ ...fmtStyle(fmt), ...(rowH && !(span && span.r > 1) ? { maxHeight: Math.max(12, rowH - 4) } : {}) }}
      >
        {display}
      </div>
      {note && <NoteMark />}
      {onFillStart && <FillDot onStart={onFillStart} />}
      {edited && <span className="pointer-events-none absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
      {selected && (
        <CellEditor
          value={value}
          kind={f.kind === 'memo' ? 'memo' : f.kind === 'date' ? 'date' : 'text'}
          list={`pb-opts-${f.id}`}
          disabled={disabled}
          editSignal={editSignal}
          onCommit={onCommit}
          onMove={onMove}
          onMoveRow={onMoveRow}
          onExtend={onExtend}
          onClearRange={onClearRange}
          onPick={canPick ? () => setPickOpen(true) : undefined}
        />
      )}
    </td>
  )
}

// 칩 드롭다운(성과관리 과제리스트와 같은 모양): 칸 아래에 칩 목록, 눌러 고르기 · 방향키 + Enter · Esc 닫기
function chipTone(fieldId: string, v: string) {
  return fieldId === 'status' ? (STATUS_TONE[v] ?? 'bg-black/[0.05] text-label-2') : categoryTone(v)
}
function ChipPicker({
  anchor,
  fieldId,
  value,
  choices,
  onPick,
  onClose,
}: {
  anchor: HTMLElement
  fieldId: string
  value: string
  choices: string[]
  onPick: (v: string) => void
  onClose: () => void
}) {
  const [hi, setHi] = useState(() => Math.max(0, choices.indexOf(value)))
  const ref = useRef<HTMLDivElement>(null)
  const r = anchor.getBoundingClientRect()
  const below = window.innerHeight - r.bottom > 120
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [onClose])
  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setHi((i) => Math.min(choices.length - 1, i + 1))
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setHi((i) => Math.max(0, i - 1))
        else if (e.key === 'Enter') onPick(choices[hi])
        else if (e.key === 'Escape') onClose()
        else return
        e.preventDefault()
      }}
      style={{
        position: 'fixed',
        left: Math.min(r.left, window.innerWidth - 300),
        ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      }}
      className="z-50 flex max-w-[290px] flex-wrap gap-1.5 rounded-[12px] bg-white p-2 shadow-[0_4px_16px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.06)] outline-none"
    >
      {choices.map((c, i) => (
        <button
          key={c}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          onMouseEnter={() => setHi(i)}
          className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${chipTone(fieldId, c)} ${
            c === value ? 'ring-2 ring-accent' : i === hi ? 'ring-1 ring-black/25' : 'ring-1 ring-black/[0.08]'
          }`}
        >
          {c}
        </button>
      ))}
      {value && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick('')}
          className="inline-flex items-center rounded-full px-2 py-[3px] text-[12px] text-label-3 ring-1 ring-black/[0.08] hover:text-label"
          title="비우기"
        >
          비우기
        </button>
      )}
    </div>,
    document.body,
  )
}

// 고른 칸(범위)의 오른쪽 아래 점: 끌면 엑셀처럼 값을 반복해 채운다
function FillDot({ onStart }: { onStart: (e: React.MouseEvent) => void }) {
  return (
    <span
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onStart(e)
      }}
      title="끌어서 반복 채우기"
      className="absolute -bottom-[5px] -right-[5px] z-20 h-[9px] w-[9px] cursor-crosshair rounded-full bg-accent ring-2 ring-white"
    />
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

type Menu = { row: ProgressRow; key: string; kind: 'field' | 'week' | 'group' | 'row'; x: number; y: number }

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
  onWeekCells,
  onField,
  onFields,
  onDeleteRows,
  editNameKey,
  onDeleteRow,
  onRestoreRow,
  onDeleteGroup,
  onRestoreGroup,
  onAddGroup,
  onRenameGroup,
  onRevertRow,
  onAddRow,
  onMoveRow,
  onBg,
  onNote,
  onFmt,
  merges = [],
  heightReset = 0,
  onMerge,
  onCells,
  onAddRows,
  onAddColumns,
  onDeleteColumns,
  onRenameColumn,
  fontSize = 13,
  rowPad = 0,
  readOnly = false,
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
  headColors = {},
  onHeadColor,
}: {
  weekCols: WeekColumn[]
  rows: ScheduleRowView[]
  editing: boolean
  currentKey: string | null
  onPaint: (row: ProgressRow, weekKey: string, click: boolean) => void // click = 누른 칸(끌기 중이면 false)
  onWeekCells?: (list: { row: ProgressRow; key: string; cell: CellState }[]) => void // 주 칸 여러 개(붙여넣기 · 지우기 · 채우기)
  onField: (row: ProgressRow, id: string, value: string) => void
  onFields?: (list: { row: ProgressRow; id: string; value: string }[]) => void // 여러 칸 한 번에(범위 지우기 등)
  editNameKey?: string | null // 이 행의 L3 이름을 바로 입력 상태로(새 과제 추가 직후)
  onDeleteRows?: (rows: ProgressRow[]) => void // 여러 과제 한 번에 지우기
  onDeleteRow?: (row: ProgressRow) => void // 과제 지우기(새 과제는 바로 빼고, 시트 과제는 저장할 때 줄을 지움)
  onRestoreRow?: (row: ProgressRow) => void // 지우기 취소
  onDeleteGroup?: (row: ProgressRow) => void // 이 행이 든 구분(L2) 통째로 지우기
  onRestoreGroup?: (row: ProgressRow) => void
  onAddGroup?: (row: ProgressRow, where: 'above' | 'below', name: string) => void // 이 구분 위/아래에 새 구분(L2)
  onRenameGroup?: (row: ProgressRow, name: string) => void // 새 구분 이름 고치기
  onRevertRow?: (row: ProgressRow) => void // 이 행 고친 내용 되돌리기
  onAddRow?: (row: ProgressRow, where: 'above' | 'below') => void // 우클릭: 위/아래에 과제 추가
  onMoveRow?: (row: ProgressRow, target: ProgressRow, where: 'above' | 'below') => void // 줄 옮기기(같은 구분 안에서)
  onBg: (row: ProgressRow, ids: string[], hex: string) => void
  onNote: (row: ProgressRow, key: string, note: string) => void
  onFmt?: (list: { row: ProgressRow; id: string }[], patch: CellFmt | null) => void // 고른 칸 글자 서식(null = 기본으로)
  merges?: CellMerge[] // 입력 열 칸 병합(행 키 × 열 id)
  onMerge?: (rows: ProgressRow[], ids: string[], merge: boolean) => void // 고른 칸 병합 · 병합 해제
  onCells?: (
    list: { row: ProgressRow; id: string; value?: string; fmt?: string; bg?: string }[],
    append?: { row: ProgressRow; values: { fields: Record<string, string>; bg: Record<string, string>; fmt: Record<string, string> }[] },
  ) => void // 여러 칸 값 · 서식 · 색(붙여넣기 · 셀 삽입). append = 끝에 새 과제 줄도 같이
  onAddRows?: (
    row: ProgressRow,
    where: 'above' | 'below',
    count: number,
    values?: { fields: Record<string, string>; bg: Record<string, string>; fmt: Record<string, string> }[],
  ) => void
  onAddColumns?: (anchor: string, side: 'left' | 'right', labels: string[]) => void // 입력 열 끼워 넣기
  onDeleteColumns?: (ids: string[]) => void
  onRenameColumn?: (id: string, label: string) => void // 새 열 이름 고치기
  fontSize?: number
  rowPad?: number // 행간: 칸 위아래 여백(px)
  heightReset?: number // 바뀌면 끌어서 정한 행 높이를 모두 지운다
  readOnly?: boolean // 지난 연도 보기: 입력·칠하기·우클릭 메뉴·행 아이콘 없음
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
  headColors?: Record<string, string> // 머리글 색(열 id · 'l2' · 'l3' · 'schedule' · 'group:이름' → RRGGBB)
  onHeadColor?: (key: string, hex: string) => void // '' = 기본색으로
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
  // 분류 · 상태는 칩으로 고른다(시트 선택지 + 시트에 있는 값)
  const choicesOf = (f: FieldDef): string[] | undefined =>
    f.id === 'status' || f.id === 'category' ? Array.from(new Set([...(f.options ?? []), ...(optionsOf?.(f) ?? [])])).filter(Boolean) : undefined
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
  const WH = 36 // 맨 왼쪽 행 머리(시트 행 번호) 폭
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
  // 머리글 색은 우클릭으로 바꿀 수 있다(이 브라우저에 기억). 글자는 바탕 밝기에 맞춰 검정/흰색
  const headOn = (hex: string): React.CSSProperties => ({ background: `#${hex}`, color: isLightHex(hex) ? '#14161A' : '#FFFFFF' })
  const thStyle = (hex: string | null | undefined, key?: string): React.CSSProperties =>
    key && headColors[key] ? headOn(headColors[key]) : hs ? headOn(hex || 'FFFFFF') : headOn('14161A')
  const thBorder = 'border border-[#D3D3D3]'
  // 구분·과제 머리글은 짙은 회색(#666666), 일정(월·주) 머리글은 회색(#999999)
  const blackTh = (key: 'l2' | 'l3'): React.CSSProperties => headOn(headColors[key] || HEAD_DEFAULT[key])
  const grayTh: React.CSSProperties = headOn(headColors.schedule || HEAD_DEFAULT.schedule)
  const headMenuOn = (key: string) => (e: React.MouseEvent) => {
    if (!onHeadColor) return
    e.preventDefault()
    setHeadMenu({ key, x: Math.min(e.clientX, window.innerWidth - 276), y: Math.max(8, Math.min(e.clientY, window.innerHeight - 380)) })
  }
  const [headMenu, setHeadMenu] = useState<{ key: string; x: number; y: number } | null>(null)
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
  // 선택한 칸(구글시트처럼 한 번 누르면 선택) · 고치기 시작 신호
  const [sel, setSel] = useState<{ row: string; id: string } | null>(null)
  const [editSig, setEditSig] = useState<{ row: string; id: string; n: number } | null>(null)
  // 행 전체 선택(행 머리를 눌렀을 때) -- 칸 선택과 둘 중 하나만
  const [rowSel, setRowSelOnly] = useState<string | null>(null)
  // Shift로 늘린 행 선택의 끝(없으면 한 줄)
  const [rowSelEnd, setRowSelEnd] = useState<string | null>(null)
  const setRowSel = (key: string | null) => {
    setRowSelOnly(key)
    setRowSelEnd(null)
  }
  // 여러 칸 선택: sel(시작 칸, 입력기가 있는 칸) ~ selEnd(끝 칸) 사각형
  const [selEnd, setSelEnd] = useState<{ row: string; id: string } | null>(null)
  const selDrag = useRef(false)
  useEffect(() => {
    const up = () => (selDrag.current = false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])
  // ---- 일정(주) 칸 선택: 입력 모드가 아닐 때 칸 · 여러 칸 고르기, ⌘C/⌘V/⌘X, Delete, 채우기 점
  type WPos = { r: number; c: number }
  const [weekSel, setWeekSel] = useState<{ a: WPos; b: WPos } | null>(null)
  const weekDrag = useRef(false)
  const weekInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const up = () => (weekDrag.current = false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])
  useEffect(() => {
    if (editing) setWeekSel(null)
  }, [editing])
  const wRange = weekSel
    ? {
        r1: Math.min(weekSel.a.r, weekSel.b.r),
        r2: Math.max(weekSel.a.r, weekSel.b.r),
        c1: Math.min(weekSel.a.c, weekSel.b.c),
        c2: Math.max(weekSel.a.c, weekSel.b.c),
      }
    : null
  const inWeek = (r: number, c: number) => !!wRange && r >= wRange.r1 && r <= wRange.r2 && c >= wRange.c1 && c <= wRange.c2
  useEffect(() => {
    if (weekSel) requestAnimationFrame(() => weekInputRef.current?.focus({ preventScroll: true }))
  }, [weekSel])
  function weekDown(e: React.MouseEvent, r: number, c: number) {
    if (e.button !== 0) return
    e.preventDefault()
    setSel(null)
    setSelEnd(null)
    setRowSel(null)
    if (e.shiftKey && weekSel) setWeekSel({ ...weekSel, b: { r, c } })
    else setWeekSel({ a: { r, c }, b: { r, c } })
    weekDrag.current = true
  }
  function weekEnter(r: number, c: number) {
    if (weekDrag.current && weekSel) setWeekSel({ ...weekSel, b: { r, c } })
  }
  const weekCellAt = (r: number, c: number): CellState => rows[r]?.cells[weekCols[c]?.key] ?? { m: '', f: null }
  function weekApply(list: { r: number; c: number; cell: CellState }[]) {
    if (!onWeekCells || readOnly) return
    const out = list.filter((x) => rows[x.r] && !rows[x.r].deleted && weekCols[x.c]).map((x) => ({ row: rows[x.r].row, key: weekCols[x.c].key, cell: x.cell }))
    if (out.length) onWeekCells(out)
  }
  const [weekClip, setWeekClip] = useState<{ tsv: string; cells: CellState[][] } | null>(null)
  function weekCopy() {
    if (!wRange) return null
    const cells: CellState[][] = []
    for (let r = wRange.r1; r <= wRange.r2; r++) {
      const line: CellState[] = []
      for (let c = wRange.c1; c <= wRange.c2; c++) line.push(weekCellAt(r, c))
      cells.push(line)
    }
    const clip = { tsv: cells.map((l) => l.map((x) => x.m).join('\t')).join('\n'), cells }
    setWeekClip(clip)
    return clip
  }
  function weekClear() {
    if (!wRange) return
    const list: { r: number; c: number; cell: CellState }[] = []
    for (let r = wRange.r1; r <= wRange.r2; r++) for (let c = wRange.c1; c <= wRange.c2; c++) list.push({ r, c, cell: { m: '', f: null } })
    weekApply(list)
  }
  function weekPaste(text: string) {
    if (!wRange) return
    const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
    const cells: CellState[][] =
      weekClip && weekClip.tsv === t
        ? weekClip.cells
        : parseTsv(t).map((l) => l.map((v) => ({ m: (['S', 'F', '완'].includes(v.trim()) ? v.trim() : '') as CellState['m'], f: null })))
    if (!cells.length || !cells[0].length) return
    const one = cells.length === 1 && cells[0].length === 1
    const H = one ? wRange.r2 - wRange.r1 + 1 : cells.length
    const W = one ? wRange.c2 - wRange.c1 + 1 : cells[0].length
    const list: { r: number; c: number; cell: CellState }[] = []
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) list.push({ r: wRange.r1 + i, c: wRange.c1 + j, cell: one ? cells[0][0] : cells[i][j] })
    weekApply(list)
    if (!one)
      setWeekSel({
        a: { r: wRange.r1, c: wRange.c1 },
        b: { r: Math.min(rows.length - 1, wRange.r1 + H - 1), c: Math.min(weekCols.length - 1, wRange.c1 + W - 1) },
      })
  }
  function weekKey(e: React.KeyboardEvent) {
    if (!weekSel) return
    const a = ARROWS[e.key]
    if (a) {
      e.preventDefault()
      const move = (p: WPos) => ({ r: Math.max(0, Math.min(rows.length - 1, p.r + a[1])), c: Math.max(0, Math.min(weekCols.length - 1, p.c + a[0])) })
      if (e.shiftKey) setWeekSel({ ...weekSel, b: move(weekSel.b) })
      else {
        const p = move(weekSel.a)
        setWeekSel({ a: p, b: p })
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      weekClear()
    } else if (e.key === 'Escape') setWeekSel(null)
  }
  const weekRef = useRef({ weekCopy, weekPaste, weekClear })
  weekRef.current = { weekCopy, weekPaste, weekClear }
  useEffect(() => {
    const on = () => !!(document.activeElement as HTMLElement | null)?.dataset?.weekSelect
    const copy = (e: ClipboardEvent) => {
      if (!on()) return
      const c = weekRef.current.weekCopy()
      if (!c) return
      e.clipboardData?.setData('text/plain', c.tsv)
      e.preventDefault()
    }
    const cut = (e: ClipboardEvent) => {
      if (!on()) return
      copy(e)
      weekRef.current.weekClear()
    }
    const paste = (e: ClipboardEvent) => {
      if (!on()) return
      const t = e.clipboardData?.getData('text/plain')
      if (t === undefined) return
      e.preventDefault()
      weekRef.current.weekPaste(t)
    }
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', paste)
    return () => {
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', paste)
    }
  }, [])
  // 채우기 점: 고른 주 칸을 가로 · 세로로 끌어 늘리면 칸(글자 · 색)을 반복해서 채운다
  const [weekFillTo, setWeekFillTo] = useState<{ r1: number; r2: number; c1: number; c2: number } | null>(null)
  const inWeekFill = (r: number, c: number) =>
    !!weekFillTo && !!wRange && r >= weekFillTo.r1 && r <= weekFillTo.r2 && c >= weekFillTo.c1 && c <= weekFillTo.c2 && !inWeek(r, c)
  function weekFillStart() {
    const src = wRange
    if (!src) return
    let to: typeof weekFillTo = null
    const move = (ev: MouseEvent) => {
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('td[data-week]') as HTMLElement | null
      const [rs, cs] = (el?.dataset.week ?? '').split(':')
      if (rs === undefined || cs === undefined) return
      const r = Number(rs)
      const c = Number(cs)
      const dy = r > src.r2 ? r - src.r2 : r < src.r1 ? r - src.r1 : 0
      const dx = c > src.c2 ? c - src.c2 : c < src.c1 ? c - src.c1 : 0
      if (!dy && !dx) to = null
      else if (Math.abs(dy) >= Math.abs(dx)) to = { r1: Math.min(src.r1, r), r2: Math.max(src.r2, r), c1: src.c1, c2: src.c2 }
      else to = { r1: src.r1, r2: src.r2, c1: Math.min(src.c1, c), c2: Math.max(src.c2, c) }
      setWeekFillTo(to)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.documentElement.classList.remove('cursor-crosshair')
      setWeekFillTo(null)
      if (!to) return
      const h = src.r2 - src.r1 + 1
      const w = src.c2 - src.c1 + 1
      const mod = (n: number, m: number) => ((n % m) + m) % m
      const list: { r: number; c: number; cell: CellState }[] = []
      for (let r = to.r1; r <= to.r2; r++)
        for (let c = to.c1; c <= to.c2; c++) {
          if (r >= src.r1 && r <= src.r2 && c >= src.c1 && c <= src.c2) continue
          list.push({ r, c, cell: weekCellAt(src.r1 + mod(r - src.r1, h), src.c1 + mod(c - src.c1, w)) })
        }
      weekApply(list)
      setWeekSel({ a: { r: to.r1, c: to.c1 }, b: { r: to.r2, c: to.c2 } })
    }
    document.documentElement.classList.add('cursor-crosshair')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  function selectCell(row: string, id: string, edit = false) {
    setWeekSel(null)
    setRowSel(null)
    setSelEnd(null)
    setSel({ row, id })
    if (edit) setEditSig({ row, id, n: Date.now() })
  }
  const isSel = (row: string, id: string) => sel?.row === row && sel.id === id
  const sigOf = (row: string, id: string) => (editSig && editSig.row === row && editSig.id === id ? editSig.n : 0)
  // 새 과제를 추가하면 그 과제 이름 칸을 바로 입력
  useEffect(() => {
    if (editNameKey) selectCell(editNameKey, 'name', true)
  }, [editNameKey])
  // 행 높이(과제 칸 아래 경계를 끌어 조절 · 더블클릭하면 자동) -- 이 브라우저에 기억
  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('progress-board:row-heights') ?? '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  // 모두 기본 높이로(도구 줄 버튼)
  useEffect(() => {
    if (!heightReset) return
    setRowHeights({})
    try {
      localStorage.removeItem('progress-board:row-heights')
    } catch {
      // 기억 못 해도 지금 화면엔 반영
    }
  }, [heightReset])
  function setRowHeight(key: string, h: number | null) {
    setRowHeights((cur) => {
      const next = { ...cur }
      if (h === null) delete next[key]
      else next[key] = h
      try {
        localStorage.setItem('progress-board:row-heights', JSON.stringify(next))
      } catch {
        // 기억 못 해도 지금 화면엔 반영
      }
      return next
    })
  }
  function startRowResize(e: React.MouseEvent, key: string, tr: HTMLElement | null) {
    e.preventDefault()
    e.stopPropagation()
    const y0 = e.clientY
    const h0 = tr?.getBoundingClientRect().height ?? 24
    const move = (ev: MouseEvent) => setRowHeight(key, Math.max(16, Math.round(h0 + ev.clientY - y0)))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.documentElement.classList.remove('cursor-row-resize')
    }
    document.documentElement.classList.add('cursor-row-resize')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  // 표를 담은 칸의 폭(가로 꽉 채우기)
  const tableRef = useRef<HTMLTableElement>(null)
  const [availWidth, setAvailWidth] = useState(0)
  useEffect(() => {
    const box = tableRef.current?.parentElement
    if (!box) return
    const measure = () => setAvailWidth(box.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  const [paletteFor, setPaletteFor] = useState<'cell' | 'row' | 'text' | null>(null)
  // 메뉴가 화면 아래로 넘치면 위로 올린다
  const menuBoxRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = menuBoxRef.current
    if (!el || !menu) return
    el.style.top = `${menu.y}px`
    const r = el.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`
  })
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
    if (readOnly) return
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
  // 키보드로 칸 옮기기(구글시트처럼): Tab → 오른쪽, 줄 끝이면 다음 줄 과제(L3)부터 · Enter → 아래 줄 같은 열
  // 방향키 · Tab · Enter로 선택 옮기기: Tab은 줄 끝에서 다음 줄 과제(L3)로
  const editIds = ['name', ...cols.map((f) => f.id)]
  const rowIndexOf = new Map(rows.map((v, i) => [v.row.key, i]))
  // 고른 행 범위(번호칸 · Shift로 늘림)
  const rowRange = (() => {
    const a = rowSel ? rowIndexOf.get(rowSel) : undefined
    if (a === undefined) return null
    const b = rowSelEnd ? (rowIndexOf.get(rowSelEnd) ?? a) : a
    return { r1: Math.min(a, b), r2: Math.max(a, b) }
  })()
  const isRowSel = (key: string) => {
    const i = rowIndexOf.get(key)
    return !!rowRange && i !== undefined && i >= rowRange.r1 && i <= rowRange.r2
  }
  // 선택 범위(행 · 열 번호). 한 칸만 골랐으면 null
  const range = (() => {
    if (!sel || !selEnd || (sel.row === selEnd.row && sel.id === selEnd.id)) return null
    const r1 = rows.findIndex((v) => v.row.key === sel.row)
    const r2 = rows.findIndex((v) => v.row.key === selEnd.row)
    const c1 = editIds.indexOf(sel.id)
    const c2 = editIds.indexOf(selEnd.id)
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return null
    return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2) }
  })()
  const inRange = (ri: number, id: string) => {
    if (!range) return false
    const ci = editIds.indexOf(id)
    return ri >= range.r1 && ri <= range.r2 && ci >= range.c1 && ci <= range.c2
  }
  function cellDown(e: React.MouseEvent, row: string, id: string) {
    if (e.shiftKey && sel) {
      setRowSel(null)
      setSelEnd({ row, id })
      return
    }
    if (!isSel(row, id) || selEnd) selectCell(row, id)
    selDrag.current = true
  }
  function cellEnter(row: string, id: string) {
    if (selDrag.current && sel) setSelEnd(sel.row === row && sel.id === id ? null : { row, id })
  }
  function extendSel(dx: number, dy: number) {
    if (!sel) return
    const from = selEnd ?? sel
    const ri = Math.max(0, Math.min(rows.length - 1, rows.findIndex((v) => v.row.key === from.row) + dy))
    const ci = Math.max(0, Math.min(editIds.length - 1, editIds.indexOf(from.id) + dx))
    const t = rows[ri]
    if (t) setSelEnd({ row: t.row.key, id: editIds[ci] })
  }
  // 지금 고른 칸 범위(범위가 없으면 고른 칸 하나)
  const selRect = (() => {
    if (range) return range
    if (!sel) return null
    const r = rowIndexOf.get(sel.row)
    const c = editIds.indexOf(sel.id)
    return r !== undefined && c >= 0 ? { r1: r, r2: r, c1: c, c2: c } : null
  })()
  // ---- 복사 · 붙여넣기(⌘/Ctrl+C · V, 우클릭). 이 표에서 복사한 것은 서식 · 칸 색까지 붙인다.
  type ClipCell = { value: string; fmt?: string; bg?: string }
  const [clip, setClip] = useState<{ tsv: string; ids: string[]; cells: ClipCell[][] } | null>(null)
  function copySel(rect: typeof selRect = selRect) {
    if (!rect) return null
    const ids = editIds.slice(rect.c1, rect.c2 + 1)
    const cells = rows.slice(rect.r1, rect.r2 + 1).map((v) => ids.map((id) => ({ value: v.vals[id] ?? '', fmt: v.fmt?.[id] ?? '', bg: v.bg[id] ?? '' })))
    const q = (t: string) => (/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)
    const c = { tsv: cells.map((r) => r.map((x) => q(x.value)).join('\t')).join('\n'), ids, cells }
    setClip(c)
    return c
  }
  function pasteCells(cells: ClipCell[][], rect: typeof selRect = selRect) {
    if (!rect || !onCells || readOnly || !cells.length || !cells[0].length) return
    const one = cells.length === 1 && cells[0].length === 1
    const fill = one && (rect.r2 > rect.r1 || rect.c2 > rect.c1) // 한 칸을 복사해 여러 칸에 붙이면 모두 채움
    const H = fill ? rect.r2 - rect.r1 + 1 : cells.length
    const W = fill ? rect.c2 - rect.c1 + 1 : cells[0].length
    const list: { row: ProgressRow; id: string; value?: string; fmt?: string; bg?: string }[] = []
    for (let i = 0; i < H; i++) {
      const v = rows[rect.r1 + i]
      if (!v) break
      if (v.deleted) continue
      for (let j = 0; j < W; j++) {
        const id = editIds[rect.c1 + j]
        if (!id) break
        const x = fill ? cells[0][0] : cells[i][j]
        if (!x) continue
        list.push({ row: v.row, id, value: x.value, ...(x.fmt !== undefined ? { fmt: x.fmt } : {}), ...(x.bg !== undefined ? { bg: x.bg } : {}) })
      }
    }
    if (!list.length) return
    onCells(list)
    const last = rows[Math.min(rows.length - 1, rect.r1 + H - 1)]
    const lastId = editIds[Math.min(editIds.length - 1, rect.c1 + W - 1)]
    if ((H > 1 || W > 1) && rect === selRect) setSelEnd({ row: last.row.key, id: lastId })
  }
  function pasteText(text: string, rect: typeof selRect = selRect) {
    const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
    if (clip && clip.tsv === t) pasteCells(clip.cells, rect)
    else
      pasteCells(
        parseTsv(t).map((r) => r.map((value) => ({ value }))),
        rect,
      )
  }
  function pasteFromMenu(rect: typeof selRect = selRect) {
    if (clip) return pasteCells(clip.cells, rect)
    void navigator.clipboard?.readText?.().then(
      (t) => pasteText(t, rect),
      () => {},
    )
  }
  // 행 전체(L3 ~ 마지막 입력 열)
  // 행 전체(L3 ~ 마지막 입력 열). 고른 행 범위 안의 행이면 범위 전체
  const rowRect = (key: string) => {
    const r = rowIndexOf.get(key)
    if (r === undefined) return null
    if (rowRange && r >= rowRange.r1 && r <= rowRange.r2) return { ...rowRange, c1: 0, c2: editIds.length - 1 }
    return { r1: r, r2: r, c1: 0, c2: editIds.length - 1 }
  }
  const clipRef = useRef({ copySel, pasteText, rowRect, cut: () => {} })
  clipRef.current = {
    copySel,
    pasteText,
    rowRect,
    cut: () => {
      if (!selRect || !onCells || readOnly) return
      const list: { row: ProgressRow; id: string; value: string }[] = []
      for (let ri = selRect.r1; ri <= selRect.r2; ri++)
        for (let ci = selRect.c1; ci <= selRect.c2; ci++) if (rows[ri] && !rows[ri].deleted) list.push({ row: rows[ri].row, id: editIds[ci], value: '' })
      onCells(list)
    },
  }
  useEffect(() => {
    const inCell = () => !!(document.activeElement as HTMLElement | null)?.dataset?.cellSelect
    // 번호칸(행 선택)에 초점이 있으면 행 전체
    const rowKey = () => (document.activeElement as HTMLElement | null)?.dataset?.rowhead
    const copy = (e: ClipboardEvent) => {
      const rk = rowKey()
      if (rk) {
        const c = clipRef.current.copySel(clipRef.current.rowRect(rk))
        if (c) {
          e.clipboardData?.setData('text/plain', c.tsv)
          e.preventDefault()
        }
        return
      }
      if (!inCell()) return
      const c = clipRef.current.copySel()
      if (!c) return
      e.clipboardData?.setData('text/plain', c.tsv)
      e.preventDefault()
    }
    const cut = (e: ClipboardEvent) => {
      if (!inCell()) return
      copy(e)
      clipRef.current.cut()
    }
    const paste = (e: ClipboardEvent) => {
      const rk = rowKey()
      if (!inCell() && !rk) return
      const t = e.clipboardData?.getData('text/plain')
      if (t === undefined) return
      e.preventDefault()
      clipRef.current.pasteText(t, rk ? clipRef.current.rowRect(rk) : undefined)
    }
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', paste)
    return () => {
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', paste)
    }
  }, [])
  // 복사한 줄을 새 과제로 위/아래에 끼워 넣기
  function insertCopied(row: ProgressRow, where: 'above' | 'below') {
    if (!clip || !onAddRows) return
    onAddRows(
      row,
      where,
      clip.cells.length,
      clip.cells.map((r) => ({
        fields: Object.fromEntries(clip.ids.map((id, j) => [id, r[j].value])),
        bg: Object.fromEntries(clip.ids.flatMap((id, j) => (r[j].bg ? [[id, r[j].bg!]] : []))),
        fmt: Object.fromEntries(clip.ids.flatMap((id, j) => (r[j].fmt ? [[id, r[j].fmt!]] : []))),
      })),
    )
  }
  // ---- 셀 삽입: 고른 칸 자리에 빈 칸을 넣고 기존 칸을 오른쪽/아래로 민다(입력 열만 · 끝에서 밀려나는 값이 있으면 막음)
  function shiftCells(dir: 'right' | 'down'): string | null {
    if (!selRect || !onCells || readOnly) return null
    const c1 = Math.max(1, selRect.c1)
    const c2 = selRect.c2
    if (c2 < c1) return 'L3(과제) 열에는 셀 삽입을 할 수 없습니다.'
    const live = rows.filter((v) => !v.deleted)
    const lr1 = live.findIndex((v) => v.row.key === rows[selRect.r1]?.row.key)
    const lr2 = live.findIndex((v) => v.row.key === rows[selRect.r2]?.row.key)
    if (lr1 < 0 || lr2 < 0) return null
    const get = (v: ScheduleRowView, id: string) => ({ value: v.vals[id] ?? '', fmt: v.fmt?.[id] ?? '', bg: v.bg[id] ?? '' })
    const empty = { value: '', fmt: '', bg: '' }
    const list: { row: ProgressRow; id: string; value: string; fmt: string; bg: string }[] = []
    if (dir === 'right') {
      const n = c2 - c1 + 1
      for (let r = lr1; r <= lr2; r++) {
        const v = live[r]
        const ids = editIds.slice(c1)
        if (ids.slice(ids.length - n).some((id) => (v.vals[id] ?? '').trim())) return '맨 오른쪽 칸에 값이 있어 밀 수 없습니다. 열을 먼저 추가해 주세요.'
        for (let j = ids.length - 1; j >= 0; j--) list.push({ row: v.row, id: ids[j], ...(j >= n ? get(v, ids[j - n]) : empty) })
      }
    } else {
      const n = lr2 - lr1 + 1
      const tail = live.slice(lr1)
      const ids = editIds.slice(c1, c2 + 1)
      for (const id of ids) for (let i = tail.length - 1; i >= 0; i--) list.push({ row: tail[i].row, id, ...(i >= n ? get(tail[i - n], id) : empty) })
      // 맨 아래에서 밀려나는 값은 표 끝에 새 과제 줄을 만들어 담는다(이름을 넣어야 저장됨)
      const out = tail.slice(Math.max(0, tail.length - n))
      if (out.some((v) => ids.some((id) => (v.vals[id] ?? '').trim()))) {
        onCells(list, {
          row: live[live.length - 1].row,
          values: out.map((v) => ({
            fields: Object.fromEntries(ids.map((id) => [id, v.vals[id] ?? ''])),
            bg: Object.fromEntries(ids.flatMap((id) => (v.bg[id] ? [[id, v.bg[id]]] : []))),
            fmt: Object.fromEntries(ids.flatMap((id) => (v.fmt?.[id] ? [[id, v.fmt[id]]] : []))),
          })),
        })
        return null
      }
    }
    onCells(list)
    return null
  }
  // 머리글 오른쪽 경계 위쪽: 마우스를 올리면 "+ 열"과 빨간 세로선, 누르면 이 열 오른쪽에 새 열
  const addColZone = (f: FieldDef) =>
    onAddColumns && !readOnly ? (
      <span
        className="group/addc absolute -right-[7px] top-0 z-30 h-[45%] w-[14px] cursor-pointer"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          setColAdd({ anchor: f.id, side: 'right', count: 1, x: Math.min(r.left - 120, window.innerWidth - 300), y: r.bottom + 30, text: '' })
        }}
        title="여기에 열 추가"
      >
        <span className="pointer-events-none absolute left-1/2 top-[3px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1D1D1F] px-2 py-[1px] text-[11px] font-bold text-white opacity-0 shadow group-hover/addc:opacity-100">
          + 열
        </span>
        <span className="pointer-events-none absolute left-1/2 top-0 h-[100vh] w-[2px] -translate-x-1/2 bg-[#E8342A] opacity-0 group-hover/addc:opacity-100" />
      </span>
    ) : null
  // ---- 채우기 점: 고른 범위를 아래·위·오른쪽·왼쪽으로 끌어 늘리면 원래 칸 값(서식 · 색 포함)을 반복해 채운다
  const [fillTo, setFillTo] = useState<{ r1: number; r2: number; c1: number; c2: number } | null>(null)
  const fillCorner = selRect && !readOnly && onCells ? `${rows[selRect.r2]?.row.key}|${editIds[selRect.c2]}` : null
  const inFill = (ri: number, id: string) => {
    if (!fillTo || !selRect) return false
    const c = editIds.indexOf(id)
    const inside = ri >= fillTo.r1 && ri <= fillTo.r2 && c >= fillTo.c1 && c <= fillTo.c2
    const src = ri >= selRect.r1 && ri <= selRect.r2 && c >= selRect.c1 && c <= selRect.c2
    return inside && !src
  }
  function fillStart() {
    const src = selRect
    if (!src || !onCells) return
    let to: typeof fillTo = null
    const move = (ev: MouseEvent) => {
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('td[data-cell]') as HTMLElement | null
      const [rk, id] = (el?.dataset.cell ?? '').split('|')
      const r = rowIndexOf.get(rk ?? '')
      const c = editIds.indexOf(id ?? '')
      if (r === undefined || c < 0) return
      // 더 많이 벗어난 쪽(세로 · 가로) 하나로만 늘린다
      const dy = r > src.r2 ? r - src.r2 : r < src.r1 ? r - src.r1 : 0
      const dx = c > src.c2 ? c - src.c2 : c < src.c1 ? c - src.c1 : 0
      if (!dy && !dx) to = null
      else if (Math.abs(dy) >= Math.abs(dx)) to = { r1: Math.min(src.r1, r), r2: Math.max(src.r2, r), c1: src.c1, c2: src.c2 }
      else to = { r1: src.r1, r2: src.r2, c1: Math.min(src.c1, c), c2: Math.max(src.c2, c) }
      setFillTo(to)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.documentElement.classList.remove('cursor-crosshair')
      setFillTo(null)
      if (!to) return
      const h = src.r2 - src.r1 + 1
      const w = src.c2 - src.c1 + 1
      const mod = (n: number, m: number) => ((n % m) + m) % m
      const list: { row: ProgressRow; id: string; value: string; fmt: string; bg: string }[] = []
      for (let r = to.r1; r <= to.r2; r++)
        for (let c = to.c1; c <= to.c2; c++) {
          if (r >= src.r1 && r <= src.r2 && c >= src.c1 && c <= src.c2) continue
          const v = rows[r]
          const s0 = rows[src.r1 + mod(r - src.r1, h)]
          const sid = editIds[src.c1 + mod(c - src.c1, w)]
          const id = editIds[c]
          if (!v || v.deleted || !s0 || !id) continue
          // L3(과제 이름)는 다른 칸으로 채우지 않는다(과제 이름 칸끼리만)
          if ((id === 'name') !== (sid === 'name')) continue
          list.push({ row: v.row, id, value: s0.vals[sid] ?? '', fmt: s0.fmt?.[sid] ?? '', bg: s0.bg[sid] ?? '' })
        }
      if (list.length) onCells!(list)
      // 채운 뒤에는 늘어난 범위를 고른 상태로
      const a = rows[to.r1]
      const b = rows[to.r2]
      if (a && b) {
        setSel({ row: a.row.key, id: editIds[to.c1] })
        setSelEnd({ row: b.row.key, id: editIds[to.c2] })
      }
    }
    document.documentElement.classList.add('cursor-crosshair')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  // ---- 열 전체 선택: 머리글을 누르면 그 열의 보이는 칸 전체(Shift = 여러 열)
  const colSelected = (id: string) => {
    if (!range || range.r1 !== 0 || range.r2 !== rows.length - 1) return false
    const c = editIds.indexOf(id)
    return c >= range.c1 && c <= range.c2
  }
  const selectedCols = range && range.r1 === 0 && range.r2 === rows.length - 1 ? editIds.slice(range.c1, range.c2 + 1).filter((id) => id !== 'name') : []
  function headDown(e: React.MouseEvent, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    if (rows.length < 2) return
    setRowSel(null)
    const first = rows[0].row.key
    const last = rows[rows.length - 1].row.key
    if (e.shiftKey && sel && selectedCols.length) {
      setSel({ row: first, id: sel.id })
      setSelEnd({ row: last, id })
    } else {
      setSel({ row: first, id })
      setSelEnd({ row: last, id })
    }
  }
  // ---- 병합 · 나누기 대상(고른 범위): 서식 막대와 우클릭에서 같이 쓴다
  const mergePlan = (() => {
    const rect = selRect
    if (!rect) return { rows: [] as ScheduleRowView[], ids: [] as string[], canMerge: false, hit: [] as CellMerge[] }
    const mRows = rows.slice(rect.r1, rect.r2 + 1)
    // L3와 입력 열 사이에는 일정 칸이 있어 가로로 함께 병합하지 않는다(L3를 뺀다)
    const ids0 = editIds.slice(rect.c1, rect.c2 + 1)
    const mIds = ids0.length > 1 ? ids0.filter((id) => id !== 'name') : ids0
    const canMerge = mRows.length * mIds.length > 1 && mRows.every((v) => !v.deleted)
    const hit = merges.filter((m) => m.rows.some((k) => mRows.some((v) => v.row.key === k)) && m.ids.some((id) => mIds.includes(id)))
    return { rows: mRows, ids: mIds, canMerge, hit }
  })()
  function doMerge() {
    if (!onMerge || !mergePlan.canMerge) return
    onMerge(
      mergePlan.rows.map((v) => v.row),
      mergePlan.ids,
      true,
    )
  }
  function doSplit() {
    if (!onMerge) return
    for (const m of mergePlan.hit) {
      const list = m.rows.map((k) => rows.find((v) => v.row.key === k)?.row).filter((r): r is ProgressRow => !!r)
      if (list.length) onMerge(list, m.ids, false)
    }
  }
  // ---- 열 추가 이름 입력(우클릭 · 머리글 + 열)
  const [colAdd, setColAdd] = useState<{ anchor: string; side: 'left' | 'right'; count: number; x: number; y: number; text: string; rename?: string } | null>(
    null,
  )
  // 범위 지우기(Delete): 지운 행 · 보기 전용은 건너뛴다
  function clearRange() {
    if (!range || readOnly) return
    const list: { row: ProgressRow; id: string; value: string }[] = []
    for (let ri = range.r1; ri <= range.r2; ri++) {
      const v = rows[ri]
      if (!v || v.deleted) continue
      for (let ci = range.c1; ci <= range.c2; ci++) {
        const id = editIds[ci]
        if ((v.vals[id] ?? '') !== '') list.push({ row: v.row, id, value: '' })
      }
    }
    if (!list.length) return
    if (onFields) onFields(list)
    else list.forEach((x) => onField(x.row, x.id, ''))
  }
  // 모서리 칸: 보이는 과제 전체(L3 ~ 마지막 입력 열) 선택
  function selectAll() {
    if (!rows.length) return
    setRowSel(null)
    setSel({ row: rows[0].row.key, id: 'name' })
    setSelEnd({ row: rows[rows.length - 1].row.key, id: editIds[editIds.length - 1] })
  }
  const allSelected = !!range && range.r1 === 0 && range.r2 === rows.length - 1 && range.c1 === 0 && range.c2 === editIds.length - 1 && rows.length > 0
  // 서식을 바꿀 칸: 범위가 있으면 범위 전체, 없으면 고른 칸 하나(지운 줄은 빼고)
  const fmtTargets = (() => {
    if (!sel) return []
    const out: { v: ScheduleRowView; id: string }[] = []
    if (range) {
      for (let ri = range.r1; ri <= range.r2; ri++) {
        const v = rows[ri]
        if (v && !v.deleted) for (let ci = range.c1; ci <= range.c2; ci++) out.push({ v, id: editIds[ci] })
      }
      return out
    }
    const v = rows.find((x) => x.row.key === sel.row)
    return v && !v.deleted && editIds.includes(sel.id) ? [{ v, id: sel.id }] : []
  })()
  const anchorView = sel ? rows.find((x) => x.row.key === sel.row) : undefined
  const anchorFmt = parseFmt(sel ? anchorView?.fmt?.[sel.id] : '')
  function applyFmt(patch: CellFmt | null) {
    if (!onFmt || readOnly || !fmtTargets.length) return
    onFmt(
      fmtTargets.map((t) => ({ row: t.v.row, id: t.id })),
      patch,
    )
  }
  function applyBg(hex: string) {
    if (readOnly) return
    const byRow = new Map<string, { row: ProgressRow; ids: string[] }>()
    for (const t of fmtTargets) {
      const g = byRow.get(t.v.row.key) ?? { row: t.v.row, ids: [] }
      g.ids.push(t.id)
      byRow.set(t.v.row.key, g)
    }
    byRow.forEach((g) => onBg(g.row, g.ids, hex))
  }
  const [fmtSlot, setFmtSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setFmtSlot(document.getElementById(FORMAT_BAR_SLOT)), [])
  // ⌘/Ctrl+B: 고른 칸 굵게 켜기/끄기
  // ⌘/Ctrl+B 굵게 · ⌘/Ctrl+I 기울임 · ⌘/Ctrl+Shift+X 취소선
  const toggleRef = useRef<(k: 'b' | 'i' | 'x') => void>(() => {})
  toggleRef.current = (k) => applyFmt({ [k]: anchorFmt[k] ? undefined : true })
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      const which = !e.shiftKey && k === 'b' ? 'b' : !e.shiftKey && k === 'i' ? 'i' : e.shiftKey && k === 'x' ? 'x' : null
      if (!which) return
      const el = document.activeElement as HTMLElement | null
      if (!el?.closest('td[data-cell]')) return
      e.preventDefault()
      toggleRef.current(which)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  function moveSel(rowKey: string, id: string, dx: number, dy: number) {
    let ri = rows.findIndex((v) => v.row.key === rowKey)
    let ci = editIds.indexOf(id)
    if (ri < 0 || ci < 0) return
    // 병합 칸에서는 병합 끝 너머로
    const here = mergeOf(rowKey, id)?.m
    if (here) {
      if (dy > 0) ri = rowIndexOf.get(here.rows[here.rows.length - 1]) ?? ri
      if (dx > 0) ci = editIds.indexOf(here.ids[here.ids.length - 1])
    }
    if (dx) {
      ci += dx
      if (ci >= editIds.length) {
        ci = 0
        ri += 1
      }
      if (ci < 0) {
        ci = editIds.length - 1
        ri -= 1
      }
    }
    ri += dy
    const target = rows[Math.max(0, Math.min(rows.length - 1, ri))]
    if (!target) return
    let tid = editIds[ci]
    // 병합에 가려진 칸이면 병합의 맨 위 왼쪽 칸으로
    const cover = mergeOf(target.row.key, tid)
    if (cover && !cover.span) {
      const [ak, aid] = [cover.m.rows[0], cover.m.ids[0]]
      const t2 = rows.find((v) => v.row.key === ak)
      if (t2) {
        setSel({ row: ak, id: aid })
        requestAnimationFrame(() =>
          document.querySelector(`[data-cell="${CSS.escape(`${ak}|${aid}`)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
        )
        return
      }
    }
    setSel({ row: target.row.key, id: tid })
    requestAnimationFrame(() =>
      document.querySelector(`[data-cell="${CSS.escape(`${target.row.key}|${tid}`)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    )
  }
  // 줄 옮기기: 과제 칸 왼쪽 손잡이를 끌어 같은 구분(L2) 안의 다른 줄 위/아래에 놓는다 · Alt+↑/↓로 한 칸씩
  const groupOfRow = (r: ProgressRow) => `${r.l1}␟${r.l2}␟${r.l2Tag ?? ''}`
  const [drag, setDrag] = useState<{ key: string; over: { key: string; where: 'above' | 'below' } | null } | null>(null)
  // 행 머리를 누르면 행 전체 선택, 누른 채 끌면(4px 넘게) 같은 구분 안의 다른 줄 위/아래로 옮기기
  function rowHeadDown(e: React.MouseEvent, v: ScheduleRowView) {
    if (e.button !== 0) return
    e.preventDefault()
    const head = e.currentTarget as HTMLElement
    setSel(null)
    setWeekSel(null)
    // Shift+클릭: 고른 행부터 여기까지
    if (e.shiftKey && rowSel) {
      setRowSelEnd(v.row.key)
      head.focus({ preventScroll: true })
      return
    }
    setRowSel(v.row.key)
    head.focus({ preventScroll: true })
    if (!onMoveRow || v.deleted || readOnly) return
    const g = groupOfRow(v.row)
    const y0 = e.clientY
    let dragging = false
    let over: { key: string; where: 'above' | 'below' } | null = null
    const move = (ev: MouseEvent) => {
      if (!dragging && Math.abs(ev.clientY - y0) < 4) return
      if (!dragging) {
        dragging = true
        document.documentElement.classList.add('cursor-grabbing')
      }
      const tr = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('tr[data-row]') as HTMLElement | null
      const key = tr?.dataset.row
      const target = key ? rows.find((x) => x.row.key === key) : undefined
      if (!tr || !target || groupOfRow(target.row) !== g || target.row.key === v.row.key) over = null
      else {
        const r = tr.getBoundingClientRect()
        over = { key: target.row.key, where: ev.clientY < r.top + r.height / 2 ? 'above' : 'below' }
      }
      setDrag({ key: v.row.key, over })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.documentElement.classList.remove('cursor-grabbing')
      const target = over && rows.find((x) => x.row.key === over!.key)
      if (dragging && target && over) onMoveRow(v.row, target.row, over.where)
      setDrag(null)
      head.focus({ preventScroll: true })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  // 행을 고른 상태: ↑/↓로 행 선택 옮기기, Alt+↑/↓로 행 옮기기, →/Enter로 그 행의 과제 칸 선택, Esc로 선택 해제
  function rowHeadKey(e: React.KeyboardEvent, v: ScheduleRowView) {
    const i = rows.findIndex((x) => x.row.key === v.row.key)
    const focusHead = (key: string) =>
      requestAnimationFrame(() => (document.querySelector(`[data-rowhead="${CSS.escape(key)}"]`) as HTMLElement | null)?.focus({ preventScroll: false }))
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault()
      if (!readOnly && !v.deleted) moveRowBy(v, e.key === 'ArrowUp' ? -1 : 1)
      focusHead(v.row.key)
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey) {
      // Shift+↑/↓: 행 선택 늘리기 · 줄이기
      e.preventDefault()
      const end = rowSelEnd ? (rowIndexOf.get(rowSelEnd) ?? i) : (rowIndexOf.get(rowSel ?? '') ?? i)
      const t = rows[end + (e.key === 'ArrowUp' ? -1 : 1)]
      if (t) {
        if (!rowSel) setRowSelOnly(v.row.key)
        setRowSelEnd(t.row.key)
        focusHead(t.row.key)
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const t = rows[i + (e.key === 'ArrowUp' ? -1 : 1)]
      if (t) {
        setRowSel(t.row.key)
        focusHead(t.row.key)
      }
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault()
      selectCell(v.row.key, 'name')
    } else if (e.key === 'Escape') {
      setRowSel(null)
    }
  }
  function moveRowBy(v: ScheduleRowView, dir: -1 | 1) {
    if (!onMoveRow) return
    const i = rows.findIndex((x) => x.row.key === v.row.key)
    const t = rows[i + dir]
    if (!t || groupOfRow(t.row) !== groupOfRow(v.row)) return
    onMoveRow(v.row, t.row, dir < 0 ? 'above' : 'below')
  }
  // 병합 칸 배치: 지금 보이는 순서에서 줄 · 열이 붙어 있을 때만 합쳐 그린다(필터 등으로 떨어지면 따로 그림)
  const mergeAt = new Map<string, { span?: { r: number; c: number }; anchor: string; m: CellMerge; src: CellMerge }>() // 'rowKey|id' →
  for (const m0 of merges) {
    // 줄을 옮겼으면 보이는 순서대로
    const m = { ...m0, rows: [...m0.rows].sort((x, y) => (rowIndexOf.get(x) ?? -1) - (rowIndexOf.get(y) ?? -1)) }
    const ris = m.rows.map((k) => rowIndexOf.get(k) ?? -1)
    const cis = m.ids.map((id) => editIds.indexOf(id))
    const tight = (xs: number[]) => xs.every((x) => x >= 0) && xs.every((x, i) => i === 0 || x === xs[i - 1] + 1)
    if (!tight(ris) || !tight(cis)) continue
    const anchor = `${m.rows[0]}|${m.ids[0]}`
    m.rows.forEach((k, i) =>
      m.ids.forEach((id, j) =>
        mergeAt.set(`${k}|${id}`, { anchor, m, src: m0, ...(i === 0 && j === 0 ? { span: { r: m.rows.length, c: m.ids.length } } : {}) }),
      ),
    )
  }
  const mergeOf = (rowKey: string, id: string) => mergeAt.get(`${rowKey}|${id}`)
  const menuView = menu ? rows.find((v) => v.row.key === menu.row.key) : null
  // 고른 범위 안에서 연 메뉴면 범위 전체에 적용(색 · 서식 · 지우기)
  const menuInRange = !!menu && inRange(rowIndexOf.get(menu.row.key) ?? -1, menu.key)
  const menuRowRange = menu?.kind === 'row' && rowRange && isRowSel(menu.row.key) ? rowRange : null
  const menuRangeRows =
    menuInRange && range
      ? rows
          .slice(range.r1, range.r2 + 1)
          .filter((v) => !v.deleted)
          .map((v) => v.row)
      : menuRowRange
        ? rows
            .slice(menuRowRange.r1, menuRowRange.r2 + 1)
            .filter((v) => !v.deleted)
            .map((v) => v.row)
        : []
  const menuGroup = menu?.kind === 'group' ? groups.find((g) => g.rows[0].row.key === menu.row.key) : undefined
  const baseWidth = WH + wL2 + wL3 + (scheduleOpen ? weekCols.length * wWeek : showSummary ? wSummary : 0) + cols.reduce((n, f) => n + colW(f), 0)
  // 표가 화면보다 좁으면(일정을 접었을 때 등) 마지막 열을 늘려 가로를 꽉 채운다
  const fillExtra = Math.max(0, availWidth - baseWidth)
  const tableWidth = baseWidth + fillExtra
  const lastColId = cols[cols.length - 1]?.id
  let rowIndex = 0

  return (
    <>
      <table ref={tableRef} className="table-fixed border-collapse select-none" style={{ width: tableWidth, fontSize, ['--row-pad' as string]: `${rowPad}px` }}>
        <colgroup>
          <col style={{ width: WH }} />
          <col style={{ width: wL2 }} />
          <col style={{ width: wL3 }} />
          {scheduleOpen ? weekCols.map((x) => <col key={x.key} style={{ width: wWeek }} />) : showSummary ? <col style={{ width: wSummary }} /> : null}
          {cols.map((f) => (
            <col key={f.id} style={{ width: colW(f) + (f.id === lastColId ? fillExtra : 0) }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10" style={{ fontSize: HEADER_FONT }}>
          <tr>
            {/* 행 머리(구글시트의 행 번호): 누르면 행 전체 선택, 끌어서 옮기기, 아래 경계로 높이 조절 */}
            {/* 모서리 칸(구글시트처럼): 누르면 보이는 과제 전체 선택 · 다시 누르면 해제 */}
            <th
              rowSpan={2}
              onMouseDown={(e) => {
                e.preventDefault()
                if (allSelected) {
                  setSel(null)
                  setSelEnd(null)
                } else selectAll()
              }}
              title={allSelected ? '전체 선택 해제' : '표 전체 선택(보이는 과제 모두) · 서식 · 칸 색 · 지우기를 한꺼번에'}
              aria-label="표 전체 선택"
              style={{ left: 0, background: allSelected ? '#D3E3FD' : '#F1F3F4' }}
              className={`group/all sticky z-20 cursor-pointer hover:!bg-[#E3E6E8] ${thBorder}`}
            >
              <span
                className={`absolute bottom-[4px] right-[4px] h-0 w-0 border-b-[9px] border-l-[9px] border-l-transparent ${
                  allSelected ? 'border-b-accent' : 'border-b-[#B7BCC2] group-hover/all:border-b-[#80868B]'
                }`}
              />
            </th>
            <th rowSpan={2} style={{ left: WH, ...blackTh('l2') }} onContextMenu={headMenuOn('l2')} className={`sticky z-20 px-2 py-2 font-bold ${thBorder}`}>
              구분(L2)
              {onResize && <ResizeHandle width={wL2} onResize={(v) => resizeTo('l2', v)} />}
            </th>
            <th
              rowSpan={2}
              style={{ left: WH + wL2, ...blackTh('l3') }}
              onContextMenu={headMenuOn('l3')}
              className={`sticky z-20 px-2 py-2 font-bold ${thBorder}`}
            >
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
                    style={thStyle(g.bg ?? hs?.fields[f.id], `group:${g.label}`)}
                    onContextMenu={headMenuOn(`group:${g.label}`)}
                    className={`px-1.5 pb-0.5 pt-2 font-bold ${thBorder}`}
                  >
                    {g.label}
                  </th>
                )
              }
              return (
                <th
                  key={f.id}
                  rowSpan={2}
                  style={thStyle(hs?.fields[f.id], f.id)}
                  onMouseDown={(e) => headDown(e, f.id)}
                  onContextMenu={headMenuOn(f.id)}
                  className={`relative cursor-pointer px-1 py-2 font-bold ${thBorder} ${colSelected(f.id) ? 'shadow-[inset_0_-3px_0_#1A73E8]' : ''}`}
                  title={`${f.label} · 눌러서 열 전체 선택(Shift로 여러 열) · 우클릭: 열 삽입·삭제 · 머리글 색`}
                >
                  {headLabel(f)}
                  {onResize && <ResizeHandle width={colW(f)} onResize={(v) => resizeTo(f.id, v)} />}
                  {addColZone(f)}
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
                <th
                  key={f.id}
                  style={thStyle(hs?.fields[f.id], f.id)}
                  onMouseDown={(e) => headDown(e, f.id)}
                  onContextMenu={headMenuOn(f.id)}
                  className={`relative cursor-pointer px-1 pb-1.5 font-bold ${thBorder} ${colSelected(f.id) ? 'shadow-[inset_0_-3px_0_#1A73E8]' : ''}`}
                  title={`${f.label} · 눌러서 열 전체 선택(Shift로 여러 열) · 우클릭: 열 삽입·삭제 · 머리글 색`}
                >
                  {headLabel(f)}
                  {onResize && <ResizeHandle width={colW(f)} onResize={(v) => resizeTo(f.id, v)} />}
                  {addColZone(f)}
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
                const rowH = rowHeights[v.row.key]
                const ri2 = rowIndexOf.get(v.row.key) ?? -1
                const l3Note = v.notes.name
                const nameMg = mergeOf(v.row.key, 'name')
                return (
                  <tr
                    key={v.row.key}
                    data-row={v.row.key}
                    style={{
                      ...(rowH ? { height: rowH } : {}),
                      ...(drag?.over?.key === v.row.key ? { boxShadow: drag.over.where === 'above' ? 'inset 0 2px 0 #007AFF' : 'inset 0 -2px 0 #007AFF' } : {}),
                    }}
                    className={`group/row ${rowBg} leading-snug ${v.deleted ? 'opacity-40' : ''} ${drag?.key === v.row.key ? 'opacity-50' : ''} ${
                      isRowSel(v.row.key) ? 'pb-row-sel' : ''
                    }`}
                  >
                    {/* 행 머리: 시트 행 번호(새 과제는 +). 누르면 행 전체 선택 · 끌면 같은 구분 안에서 옮기기 · 아래 경계로 높이 조절 */}
                    <td
                      tabIndex={-1}
                      data-rowhead={v.row.key}
                      onMouseDown={(e) => rowHeadDown(e, v)}
                      onKeyDown={(e) => rowHeadKey(e, v)}
                      onContextMenu={(e) => {
                        if (!isRowSel(v.row.key)) setRowSel(v.row.key)
                        openMenu(e, v.row, 'name', 'row')
                      }}
                      title={`${v.row.row >= 0 ? `시트 ${v.row.row + 1}행` : '새 과제'} · 눌러서 행 선택 · 끌어서 옮기기(같은 구분 안에서) · Alt+↑/↓`}
                      style={{ left: 0 }}
                      className={`group/rh sticky z-[6] cursor-grab hover:z-[8] select-none border-b border-r border-b-[#DADDE2] border-r-[#C9CDD3] p-0 text-center text-[0.72em] tabular-nums outline-none ${
                        isRowSel(v.row.key) ? 'bg-accent font-semibold text-white' : 'bg-[#F8F9FA] text-label-3 hover:bg-[#EEF0F2]'
                      }`}
                    >
                      {v.row.row >= 0 ? v.row.row + 1 : '+'}
                      {/* 행 경계의 +: 이 행 아래에 과제 추가 */}
                      {!readOnly && !v.deleted && onAddRow && (
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            onAddRow(v.row, 'below')
                          }}
                          title="여기에 과제 추가(이 행 아래)"
                          aria-label="이 행 아래에 과제 추가"
                          className="absolute -bottom-[8px] -right-[8px] z-30 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white opacity-0 shadow ring-2 ring-white transition-opacity hover:scale-110 group-hover/rh:opacity-100"
                        >
                          <Plus size={11} strokeWidth={3} />
                        </button>
                      )}
                      {/* 아래 경계를 끌어 이 행 높이 조절 · 더블클릭하면 자동 높이 */}
                      <span
                        onMouseDown={(e) => startRowResize(e, v.row.key, (e.currentTarget as HTMLElement).closest('tr'))}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setRowHeight(v.row.key, null)
                        }}
                        title={rowH ? `행 높이 ${rowH}px · 끌어서 조절 · 더블클릭하면 자동` : '끌어서 행 높이 조절'}
                        className="absolute -bottom-[3px] left-0 z-20 h-[6px] w-full cursor-row-resize hover:bg-accent/50"
                      />
                    </td>
                    {ri === 0 && (
                      <td
                        rowSpan={g.rows.length}
                        onContextMenu={(e) => openMenu(e, g.rows[0].row, 'l2', 'group')}
                        onDoubleClick={(e) => {
                          // 더블클릭: 구분 이름 고치기
                          if (!onRenameGroup || readOnly || g.rows.every((x) => x.deleted)) return
                          const r = g.rows[0].row
                          setGroupEdit({
                            row: r,
                            mode: 'rename',
                            text: g.tag ? `${g.l2} [${g.tag}]` : g.l2,
                            x: Math.min(e.clientX, window.innerWidth - 310),
                            y: e.clientY,
                          })
                        }}
                        title={`${g.l2} · 더블클릭: 이름 고치기 · 우클릭: 구분(L2) 추가·삭제 · 칸 색 · 글자 서식`}
                        style={{ left: WH, ...(g.rows[0].bg[L2_KEY] ? { background: `#${g.rows[0].bg[L2_KEY]}` } : {}), ...fmtStyle(g.rows[0].fmt?.[L2_KEY]) }}
                        className={`pb-l2 group/l2 sticky z-[5] border-b border-r border-[#C9CDD3] bg-white px-2 py-2 text-center align-top font-bold text-label ${
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
                          <span
                            className={`mt-1 flex justify-center gap-0.5 opacity-0 transition-opacity group-hover/l2:opacity-100 ${readOnly ? 'hidden' : ''}`}
                          >
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
                    {/* L3 칸 병합: 가려진 칸은 그리지 않고, 맨 위 칸이 여러 줄을 차지 */}
                    {!(nameMg && !nameMg.span) && (
                      <td
                        data-cell={`${v.row.key}|name`}
                        rowSpan={nameMg?.span && nameMg.span.r > 1 ? nameMg.span.r : undefined}
                        colSpan={nameMg?.span && nameMg.span.c > 1 ? nameMg.span.c : undefined}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return
                          if (!(e.target as HTMLElement).closest('input,textarea,button,a')) e.preventDefault()
                          cellDown(e, v.row.key, 'name')
                        }}
                        onDoubleClick={() => selectCell(v.row.key, 'name', true)}
                        onContextMenu={(e) => {
                          if (!inRange(ri2, 'name')) selectCell(v.row.key, 'name')
                          openMenu(e, v.row, 'name', 'field')
                        }}
                        onMouseEnter={(e) => {
                          cellEnter(v.row.key, 'name')
                          if (l3Note) showNote(e, l3Note)
                        }}
                        onMouseLeave={l3Note ? () => showNote(null, '') : undefined}
                        style={{ left: WH + wL2, ...(l3Bg ? { background: `#${l3Bg}` } : {}), ...(rowH ? {} : { height: `calc(2.5em + ${2 * rowPad}px)` }) }}
                        className={`sticky z-[5] cursor-cell border-b border-r border-b-[#DADDE2] border-r-[#C9CDD3] px-2 py-[var(--row-pad)] ${l3Bg ? '' : rowBg} ${
                          isSel(v.row.key, 'name') ? 'outline outline-2 -outline-offset-2 outline-accent' : ''
                        } ${inRange(ri2, 'name') ? 'shadow-[inset_0_0_0_9999px_rgba(26,115,232,0.13)]' : ''} ${
                          inFill(ri2, 'name') ? 'outline-dashed outline-1 -outline-offset-2 outline-accent' : ''
                        }`}
                      >
                        {isSel(v.row.key, 'name') && (
                          <CellEditor
                            value={v.vals.name}
                            kind="text"
                            bold
                            disabled={v.deleted || readOnly}
                            editSignal={sigOf(v.row.key, 'name')}
                            onCommit={(val) => onField(v.row, 'name', val)}
                            onMove={(dx, dy) => moveSel(v.row.key, 'name', dx, dy)}
                            onMoveRow={(dir) => moveRowBy(v, dir)}
                            onExtend={extendSel}
                            onClearRange={range ? clearRange : undefined}
                          />
                        )}
                        <div
                          className={`flex w-full min-w-0 items-start gap-1 text-left ${rowH ? 'overflow-hidden' : ''}`}
                          style={rowH ? { maxHeight: Math.max(12, rowH - 4) } : undefined}
                          title={l3Note ? undefined : `${v.vals.name || '(이름 없음)'} · 더블클릭 · Enter · 타이핑으로 이름 고치기 · 우클릭: 메모·색`}
                        >
                          {v.row.isNew && <span className="mt-[2px] shrink-0 rounded-[3px] bg-accent px-1 text-[0.77em] font-bold text-white">새 과제</span>}
                          {v.deleted && <span className="mt-[2px] shrink-0 rounded-[3px] bg-danger px-1 text-[0.77em] font-bold text-white">삭제</span>}
                          <span
                            className={`min-w-0 ${parseFmt(v.fmt?.name).a ? 'flex-1' : ''} whitespace-normal break-words font-semibold ${v.vals.name ? 'text-label' : 'text-label-3'} ${v.deleted ? 'line-through' : ''}`}
                            style={v.vals.name ? fmtStyle(v.fmt?.name) : undefined}
                          >
                            {v.vals.name || '(이름을 입력하세요)'}
                          </span>
                          {(v.editedFields.size > 0 || v.row.isNew) && <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                        </div>
                        {l3Note && <NoteMark />}
                        {fillCorner === `${v.row.key}|name` && <FillDot onStart={fillStart} />}
                        {/* 마우스를 올리면 오른쪽에: 메모 추가(수정) · 메모 삭제 / 지운 과제는 삭제 취소 */}
                        <span
                          className={`absolute right-0.5 top-1/2 z-10 flex -translate-y-1/2 gap-0.5 rounded-control bg-white/95 p-0.5 opacity-0 shadow-sm ring-1 ring-black/10 transition-opacity group-hover/row:opacity-100 ${readOnly ? 'hidden' : ''}`}
                        >
                          {v.deleted ? (
                            onRestoreRow && (
                              <RowIcon label="삭제 취소" onClick={() => onRestoreRow(v.row)}>
                                <Undo2 size={13} strokeWidth={2} />
                              </RowIcon>
                            )
                          ) : (
                            <>
                              <RowIcon
                                label={l3Note ? '메모 수정' : '메모 추가'}
                                onClick={(e) => {
                                  const r = e.currentTarget.getBoundingClientRect()
                                  setNoteEdit({
                                    row: v.row,
                                    key: 'name',
                                    kind: 'field',
                                    x: Math.min(r.left, window.innerWidth - 300),
                                    y: Math.min(r.bottom + 4, window.innerHeight - 220),
                                    text: l3Note ?? '',
                                  })
                                }}
                              >
                                <StickyNote size={13} strokeWidth={2} />
                              </RowIcon>
                              {l3Note && (
                                <RowIcon label="메모 삭제" danger onClick={() => onNote(v.row, 'name', '')}>
                                  <Trash2 size={13} strokeWidth={2} />
                                </RowIcon>
                              )}
                            </>
                          )}
                        </span>
                      </td>
                    )}
                    {scheduleOpen ? (
                      weekCols.map((x, i) => {
                        const c = v.cells[x.key]
                        const edited = v.editedCells.has(x.key) || v.editedFields.has(x.key)
                        const note = v.notes[x.key]
                        return (
                          <td
                            key={x.key}
                            data-week={`${ri2}:${i}`}
                            onMouseDown={
                              editing && !v.deleted
                                ? (e) => {
                                    if (e.button !== 0) return
                                    e.preventDefault()
                                    dragRow.current = v.row.key
                                    onPaint(v.row, x.key, true)
                                  }
                                : !editing && onWeekCells
                                  ? (e) => weekDown(e, ri2, i)
                                  : undefined
                            }
                            onMouseEnter={(e) => {
                              if (editing && dragRow.current === v.row.key) onPaint(v.row, x.key, false)
                              if (!editing) weekEnter(ri2, i)
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
                            className={`relative border-b border-b-[#DADDE2] p-0 text-center text-[0.78em] font-bold leading-none text-[#14161A] ${
                              monthStart.has(x.key) ? 'border-l border-l-[#A6A6A6]' : 'border-l border-l-[#E5E7EB]'
                            } ${editing ? 'cursor-crosshair hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-accent' : 'cursor-cell'} ${
                              inWeek(ri2, i) ? 'shadow-[inset_0_0_0_9999px_rgba(26,115,232,0.2)]' : ''
                            } ${weekSel && weekSel.a.r === ri2 && weekSel.a.c === i ? 'outline outline-2 -outline-offset-2 outline-accent' : ''} ${
                              inWeekFill(ri2, i) ? 'outline-dashed outline-1 -outline-offset-2 outline-accent' : ''
                            }`}
                          >
                            {weekSel && weekSel.a.r === ri2 && weekSel.a.c === i && (
                              <input
                                ref={weekInputRef}
                                data-week-select="1"
                                readOnly
                                onKeyDown={weekKey}
                                className="pointer-events-none absolute h-0 w-0 opacity-0"
                                aria-label="고른 주 칸"
                              />
                            )}
                            {wRange && wRange.r2 === ri2 && wRange.c2 === i && !readOnly && onWeekCells && <FillDot onStart={weekFillStart} />}
                            {i === curIdx && <span className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-[#E8342A]/70" />}
                            <span className="relative">{c?.m}</span>
                            {note && <NoteMark />}
                            {edited && <span className="pointer-events-none absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
                          </td>
                        )
                      })
                    ) : showSummary ? (
                      <td className="border-b border-l border-b-[#DADDE2] border-l-[#A6A6A6] px-1.5 py-[var(--row-pad)] text-[0.85em] leading-tight text-label-2">
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
                    {cols.map((f) => {
                      const mg = mergeOf(v.row.key, f.id)
                      if (mg && !mg.span) return null
                      return (
                        <FieldCell
                          span={mg?.span}
                          key={f.id}
                          f={f}
                          value={v.vals[f.id] ?? ''}
                          fmt={v.fmt?.[f.id]}
                          choices={choicesOf(f)}
                          bg={v.bg[f.id] ?? ''}
                          note={v.notes[f.id] ?? ''}
                          edited={v.editedFields.has(f.id) || (!!v.row.isNew && !!v.vals[f.id])}
                          onCommit={(val) => onField(v.row, f.id, val)}
                          onMenu={(e) => openMenu(e, v.row, f.id, 'field')}
                          onHoverNote={(e) => showNote(e, v.notes[f.id] ?? '')}
                          disabled={v.deleted || readOnly}
                          selected={isSel(v.row.key, f.id)}
                          onSelect={(edit) => selectCell(v.row.key, f.id, edit)}
                          editSignal={sigOf(v.row.key, f.id)}
                          onMove={(dx, dy) => moveSel(v.row.key, f.id, dx, dy)}
                          rowH={rowH}
                          cellId={`${v.row.key}|${f.id}`}
                          onMoveRow={(dir) => moveRowBy(v, dir)}
                          inRange={inRange(ri2, f.id)}
                          onFillStart={fillCorner === `${v.row.key}|${f.id}` ? fillStart : undefined}
                          fillPreview={inFill(ri2, f.id)}
                          onPointerDown={(e) => cellDown(e, v.row.key, f.id)}
                          onPointerEnter={() => cellEnter(v.row.key, f.id)}
                          onExtend={extendSel}
                          onClearRange={range ? clearRange : undefined}
                        />
                      )
                    })}
                  </tr>
                )
              })}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3 + (scheduleOpen ? weekCols.length : showSummary ? 1 : 0) + cols.length} className="px-4 py-12 text-left text-[13px] text-label-3">
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

      {fmtSlot &&
        onFmt &&
        !readOnly &&
        editing &&
        createPortal(
          <FormatBar
            fmt={anchorFmt}
            count={fmtTargets.length}
            sheetColors={sheetColors}
            onFmt={(patch) => applyFmt(patch)}
            canMerge={!!onMerge && mergePlan.canMerge}
            canSplit={!!onMerge && mergePlan.hit.length > 0}
            onMerge={doMerge}
            onSplit={doSplit}
            onDone={() => {
              setSel(null)
              setSelEnd(null)
            }}
          />,
          fmtSlot,
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
          ref={menuBoxRef}
          className={`mac-pop fixed z-50 py-1 text-[13px] ${paletteFor ? 'w-[268px]' : 'w-[240px]'}`}
          style={{ left: Math.min(menu.x, window.innerWidth - (paletteFor ? 276 : 248)), top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.kind === 'group' && menuGroup ? (
            paletteFor ? (
              <div className="px-3 py-1.5">
                <button onClick={() => setPaletteFor(null)} className="mb-1 flex items-center gap-1 text-[12px] font-medium text-label-2 hover:text-label">
                  ‹ 구분(L2) {paletteFor === 'text' ? '글자 색' : '칸 색'}
                </button>
                <ColorPalette
                  current={paletteFor === 'text' ? (parseFmt(menuGroup.rows[0].fmt?.[L2_KEY]).c ?? '') : (menuGroup.rows[0].bg[L2_KEY] ?? '')}
                  sheetColors={sheetColors}
                  onPick={(hex) => {
                    const r = menuGroup.rows[0].row
                    if (paletteFor === 'text') onFmt?.([{ row: r, id: L2_KEY }], { c: hex && hex !== '000000' ? hex : undefined })
                    else onBg(r, [L2_KEY], hex)
                    setMenu(null)
                  }}
                />
              </div>
            ) : (
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
                        setGroupEdit({
                          row: menuGroup.rows[where === 'above' ? 0 : menuGroup.rows.length - 1].row,
                          mode: where,
                          text: '',
                          x: menu.x,
                          y: menu.y,
                        })
                        setMenu(null)
                      }}
                      className="block w-full px-3 py-1.5 text-left hover:bg-black/[0.05]"
                    >
                      {label}
                    </button>
                  ))}
                {onRenameGroup && !menuGroup.rows.every((x) => x.deleted) && (
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
                {/* 구분(L2) 칸 서식: 굵게 · 기울임 · 취소선 · 글자 색 · 칸 색 */}
                {onFmt && !menuGroup.rows.every((x) => x.deleted) && (
                  <>
                    <div className="mac-menu-sep" />
                    <div className="flex items-center gap-1 px-3 py-1">
                      {(
                        [
                          ['b', Bold, '굵게'],
                          ['i', Italic, '기울임'],
                          ['x', Strikethrough, '취소선'],
                        ] as const
                      ).map(([k, Icon, label]) => {
                        const on = !!parseFmt(menuGroup.rows[0].fmt?.[L2_KEY])[k]
                        return (
                          <button
                            key={k}
                            onClick={() => {
                              onFmt([{ row: menuGroup.rows[0].row, id: L2_KEY }], { [k]: on ? undefined : true })
                              setMenu(null)
                            }}
                            title={label}
                            aria-label={`구분 ${label}`}
                            className={`flex h-7 w-7 items-center justify-center rounded-[7px] ${on ? 'bg-[#1D1D1F] text-white' : 'text-label-2 hover:bg-black/[0.06]'}`}
                          >
                            <Icon size={15} strokeWidth={2.2} />
                          </button>
                        )
                      })}
                    </div>
                    {(
                      [
                        ['text', '글자 색', parseFmt(menuGroup.rows[0].fmt?.[L2_KEY]).c ?? '1D1D1F'],
                        ['cell', '칸 색', menuGroup.rows[0].bg[L2_KEY] ?? 'FFFFFF'],
                      ] as const
                    ).map(([k, label, hex]) => (
                      <button key={k} onClick={() => setPaletteFor(k)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]">
                        <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-black/15" style={{ background: `#${hex}` }} />
                        {label}
                        <span className="ml-auto text-label-3">▸</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )
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
                ‹ {paletteFor === 'cell' ? '칸 색' : paletteFor === 'text' ? '글자 색' : '행 색 (L3 · 입력 열 전체)'}
              </button>
              <ColorPalette
                current={
                  paletteFor === 'text'
                    ? (parseFmt(menuView.fmt?.[menu.key]).c ?? '')
                    : paletteFor === 'row'
                      ? (menuView.bg.name ?? '')
                      : (menuView.bg[menu.key] ?? '')
                }
                sheetColors={sheetColors}
                onPick={(hex) => {
                  if (paletteFor === 'text') applyFmt({ c: hex && hex !== '000000' ? hex : undefined })
                  else if (paletteFor === 'cell') applyBg(hex)
                  else if (menuRangeRows.length > 1) menuRangeRows.forEach((r) => onBg(r, allIds, hex))
                  else onBg(menu.row, allIds, hex)
                  setMenu(null)
                }}
              />
            </div>
          ) : (
            (() => {
              const noteKey = menu.kind === 'row' ? 'name' : menu.key
              const item = 'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05] disabled:opacity-40 disabled:hover:bg-transparent'
              const ic = { size: 14, strokeWidth: 1.9, className: 'shrink-0 text-label-2' }
              const hint = (t: string) => <span className="ml-auto text-[11px] text-label-3">{t}</span>
              const close = () => setMenu(null)
              // 고른 범위(우클릭한 칸이 범위 안일 때)
              const rect = menu.kind === 'field' && menuInRange && range ? range : menuRowRange ? { ...menuRowRange, c1: 0, c2: 0 } : null
              const nRows = rect ? rect.r2 - rect.r1 + 1 : 1
              const selIds = rect ? editIds.slice(rect.c1, rect.c2 + 1) : [menu.key]
              const colIds = selIds.filter((id) => id !== 'name')
              const nCols = Math.max(1, colIds.length)
              const topRow = rect ? rows[rect.r1].row : menu.row
              const bottomRow = rect ? rows[rect.r2].row : menu.row
              // 열 넣을 자리: L3만 골랐으면 첫 입력 열 왼쪽
              const leftAt = colIds[0] ? { anchor: colIds[0], side: 'left' as const } : null
              const rightAt = colIds.length
                ? { anchor: colIds[colIds.length - 1], side: 'right' as const }
                : cols[0]
                  ? { anchor: cols[0].id, side: 'left' as const }
                  : null
              const askCols = (at: { anchor: string; side: 'left' | 'right' }) => {
                setColAdd({ ...at, count: nCols, x: menu.x, y: menu.y, text: '' })
                close()
              }
              const sep = <div className="mac-menu-sep" />
              return (
                <>
                  {/* 번호칸(행 선택) 메뉴에는 메모 없음 */}
                  {menu.kind !== 'row' && (
                    <>
                      <button
                        onClick={() => {
                          setNoteEdit({ ...menu, key: noteKey, text: menuView.notes[noteKey] ?? '' })
                          close()
                        }}
                        className={item}
                      >
                        <StickyNote {...ic} />
                        {menuView.notes[noteKey] ? '메모 수정' : '메모 추가'}
                      </button>
                      {menuView.notes[noteKey] && (
                        <button
                          onClick={() => {
                            onNote(menu.row, noteKey, '')
                            close()
                          }}
                          className={`${item} text-danger`}
                        >
                          <Trash2 {...ic} className="shrink-0 text-danger" />
                          메모 삭제
                        </button>
                      )}
                    </>
                  )}
                  {menu.kind === 'row' && onCells && (
                    <>
                      <button
                        onClick={() => {
                          const c = copySel(rowRect(menu.row.key))
                          if (c) void navigator.clipboard?.writeText?.(c.tsv).catch(() => {})
                          close()
                        }}
                        className={item}
                      >
                        <Copy {...ic} />
                        {nRows > 1 ? `행 ${nRows}개 복사` : '행 복사'}
                        {hint('⌘C')}
                      </button>
                      <button
                        onClick={() => {
                          pasteFromMenu(rowRect(menu.row.key))
                          close()
                        }}
                        className={item}
                        title="복사한 행 값으로 이 행을 덮어씁니다"
                      >
                        <ClipboardPaste {...ic} />행 붙여넣기(덮어쓰기){hint('⌘V')}
                      </button>
                      {clip && onAddRows && (
                        <>
                          <button
                            onClick={() => {
                              insertCopied(topRow, 'above')
                              close()
                            }}
                            className={item}
                          >
                            <ArrowUpToLine {...ic} />
                            복사한 행 {clip.cells.length}개 위에 삽입
                          </button>
                          <button
                            onClick={() => {
                              insertCopied(bottomRow, 'below')
                              close()
                            }}
                            className={item}
                          >
                            <ArrowDownToLine {...ic} />
                            복사한 행 {clip.cells.length}개 아래에 삽입
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {(menu.kind === 'field' || menu.kind === 'row') && (onAddRows || onAddColumns) && (
                    <>
                      {sep}
                      {onAddRows && (
                        <>
                          <button
                            onClick={() => {
                              onAddRows(topRow, 'above', nRows)
                              close()
                            }}
                            className={item}
                          >
                            <Plus {...ic} />
                            위에 행 {nRows}개 삽입
                          </button>
                          <button
                            onClick={() => {
                              onAddRows(bottomRow, 'below', nRows)
                              close()
                            }}
                            className={item}
                          >
                            <Plus {...ic} />
                            아래에 행 {nRows}개 삽입
                          </button>
                        </>
                      )}
                      {menu.kind === 'field' && onAddColumns && (
                        <>
                          {leftAt && (
                            <button onClick={() => askCols(leftAt)} className={item}>
                              <Plus {...ic} />
                              왼쪽에 열 {nCols}개 삽입
                            </button>
                          )}
                          {rightAt && (
                            <button onClick={() => askCols(rightAt)} className={item}>
                              <Plus {...ic} />
                              오른쪽에 열 {nCols}개 삽입
                            </button>
                          )}
                        </>
                      )}
                      {menu.kind === 'field' && onCells && colIds.length > 0 && (
                        <div className="group/sub relative">
                          <button className={item}>
                            <Plus {...ic} />셀 삽입
                            <span className="ml-auto text-label-3">▸</span>
                          </button>
                          <div className="mac-pop invisible absolute left-full top-0 z-10 -ml-1 w-[250px] py-1 group-hover/sub:visible">
                            {(
                              [
                                ['right', '셀을 삽입하고 기존 셀을 오른쪽으로 이동'],
                                ['down', '셀을 삽입하고 기존 셀을 아래로 이동'],
                              ] as const
                            ).map(([d, label]) => (
                              <button
                                key={d}
                                onClick={() => {
                                  const why = shiftCells(d)
                                  if (why) window.alert(why)
                                  close()
                                }}
                                className={item}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {(onDeleteRow || (menu.kind === 'field' && onDeleteColumns && colIds.length > 0)) && sep}
                  {onDeleteRow && (
                    <button
                      onClick={() => {
                        if (menuRangeRows.length > 1) onDeleteRows ? onDeleteRows(menuRangeRows) : menuRangeRows.forEach(onDeleteRow)
                        else onDeleteRow(menu.row)
                        close()
                      }}
                      className={`${item} text-danger`}
                    >
                      <Trash2 {...ic} className="shrink-0 text-danger" />
                      {menuRangeRows.length > 1 ? `행 ${menuRangeRows.length}개 삭제` : '행 삭제'}
                    </button>
                  )}
                  {menu.kind === 'field' && onDeleteColumns && colIds.length > 0 && (
                    <button
                      onClick={() => {
                        close()
                        onDeleteColumns(colIds)
                      }}
                      className={`${item} text-danger`}
                    >
                      <Trash2 {...ic} className="shrink-0 text-danger" />
                      {colIds.length > 1 ? `열 ${colIds.length}개 삭제` : '열 삭제'}
                    </button>
                  )}
                  {menu.kind === 'field' &&
                    onMerge &&
                    (() => {
                      // 병합: 고른 범위. 병합 해제: 우클릭한 칸 또는 범위에 걸친 병합
                      const mRows = range && menuInRange ? rows.slice(range.r1, range.r2 + 1) : []
                      const ids0 = range && menuInRange ? editIds.slice(range.c1, range.c2 + 1) : []
                      const mIds = ids0.length > 1 ? ids0.filter((id) => id !== 'name') : ids0
                      const canMerge = mRows.length * mIds.length > 1 && mRows.every((v) => !v.deleted)
                      const hit = merges.filter((m) =>
                        mRows.length
                          ? m.rows.some((k) => mRows.some((v) => v.row.key === k)) && m.ids.some((id) => mIds.includes(id))
                          : m === mergeOf(menu.row.key, menu.key)?.src,
                      )
                      if (!canMerge && !hit.length) return null
                      const lost = mRows.some((v, i) => mIds.some((id, j) => (i || j) && (v.vals[id] ?? '').trim()))
                      return (
                        <>
                          <div className="mac-menu-sep" />
                          {canMerge && (
                            <button
                              onClick={() => {
                                onMerge(
                                  mRows.map((v) => v.row),
                                  mIds,
                                  true,
                                )
                                setMenu(null)
                              }}
                              className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-black/[0.05]"
                              title={lost ? '병합하면 맨 위 왼쪽 칸 값만 남고 나머지 칸 값은 지워집니다' : undefined}
                            >
                              <span className="flex items-center gap-2">
                                <TableCellsMerge size={14} strokeWidth={1.9} className="text-label-2" />
                                병합
                              </span>
                              <span className="text-[11px] text-label-3">{lost ? '왼쪽 위 값만 남음' : `${mRows.length}×${mIds.length}`}</span>
                            </button>
                          )}
                          {hit.length > 0 && (
                            <button
                              onClick={() => {
                                for (const m of hit) {
                                  const list = m.rows.map((k) => rows.find((v) => v.row.key === k)?.row).filter((r): r is ProgressRow => !!r)
                                  if (list.length) onMerge(list, m.ids, false)
                                }
                                setMenu(null)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]"
                            >
                              <TableCellsSplit size={14} strokeWidth={1.9} className="text-label-2" />
                              병합 해제(나누기){hit.length > 1 ? ` · ${hit.length}곳` : ''}
                            </button>
                          )}
                        </>
                      )
                    })()}
                  {menu.kind === 'field' && onFmt && (
                    <>
                      {sep}
                      <button
                        onClick={() => {
                          applyFmt({ b: anchorFmt.b ? undefined : true })
                          close()
                        }}
                        className={item}
                      >
                        <Bold {...ic} />
                        {anchorFmt.b ? '굵게 해제' : '굵게'}
                        {hint('⌘B')}
                      </button>
                      {(
                        [
                          ['text', '글자 색', parseFmt(menuView.fmt?.[menu.key]).c ?? '1D1D1F'],
                          ['cell', '칸 색', menuView.bg[menu.key] ?? 'FFFFFF'],
                        ] as const
                      ).map(([k, label, hex]) => (
                        <button key={k} onClick={() => setPaletteFor(k)} className={item}>
                          <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-black/15" style={{ background: `#${hex}` }} />
                          {label}
                          <span className="ml-auto text-label-3">▸</span>
                        </button>
                      ))}
                    </>
                  )}
                  {menu.kind === 'row' &&
                    onMerge &&
                    (() => {
                      // 여러 행을 골랐으면 L3(과제명) 칸 병합 · 걸친 병합 해제
                      const rs = menuRangeRows
                      const hit = merges.filter((m) => m.ids.includes('name') && m.rows.some((k) => rs.some((r) => r.key === k) || k === menu.row.key))
                      if (rs.length < 2 && !hit.length) return null
                      return (
                        <>
                          {sep}
                          {rs.length > 1 && (
                            <button
                              onClick={() => {
                                onMerge(rs, ['name'], true)
                                close()
                              }}
                              className={item}
                              title="고른 행의 L3(과제명) 칸을 하나로 합칩니다(맨 위 이름만 남음)"
                            >
                              <TableCellsMerge {...ic} />셀 병합 (L3 {rs.length}칸)
                            </button>
                          )}
                          {hit.length > 0 && (
                            <button
                              onClick={() => {
                                for (const m of hit) {
                                  const list = m.rows.map((k) => rows.find((v) => v.row.key === k)?.row).filter((r): r is ProgressRow => !!r)
                                  if (list.length) onMerge(list, m.ids, false)
                                }
                                close()
                              }}
                              className={item}
                            >
                              <TableCellsSplit {...ic} />
                              병합 해제(나누기)
                            </button>
                          )}
                        </>
                      )
                    })()}
                  {menu.kind === 'row' && (
                    <>
                      {sep}
                      <button onClick={() => setPaletteFor('row')} className={item}>
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-black/15"
                          style={{ background: menuView.bg.name ? `#${menuView.bg.name}` : '#FFFFFF' }}
                        />
                        행 색 (L3 · 입력 열 전체)
                        <span className="ml-auto text-label-3">▸</span>
                      </button>
                    </>
                  )}
                  {!menu.row.isNew && onRevertRow && (menuView.editedFields.size > 0 || menuView.editedCells.size > 0) && (
                    <>
                      {sep}
                      <button
                        onClick={() => {
                          onRevertRow(menu.row)
                          close()
                        }}
                        className={item}
                      >
                        <Undo2 {...ic} />이 행 고친 내용 되돌리기
                      </button>
                    </>
                  )}
                </>
              )
            })()
          )}
        </div>
      )}

      {colAdd && (
        <div className="fixed inset-0 z-50" onMouseDown={() => setColAdd(null)}>
          <form
            className="mac-pop absolute w-[290px] p-2.5"
            style={{ left: Math.max(8, Math.min(colAdd.x, window.innerWidth - 298)), top: Math.min(colAdd.y, window.innerHeight - 140) }}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              const label = colAdd.text.trim() || '새 열'
              if (colAdd.rename) onRenameColumn?.(colAdd.rename, label)
              else
                onAddColumns?.(colAdd.anchor, colAdd.side, colAdd.count === 1 ? [label] : Array.from({ length: colAdd.count }, (_, i) => `${label} ${i + 1}`))
              setColAdd(null)
            }}
          >
            <p className="text-[12px] font-semibold text-label">
              {colAdd.rename ? '열 이름 고치기' : `${colAdd.side === 'left' ? '왼쪽' : '오른쪽'}에 새 열${colAdd.count > 1 ? ` ${colAdd.count}개` : ''}`}
            </p>
            <input
              autoFocus
              value={colAdd.text}
              onChange={(e) => setColAdd({ ...colAdd, text: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && setColAdd(null)}
              placeholder="열 이름(머리글)"
              className="mt-1.5 h-8 w-full rounded-control border border-hairline px-2 text-[13px]"
            />
            {!colAdd.rename && <p className="mt-1 text-[11px] leading-snug text-label-3">저장하면 구글시트에도 이 자리에 열이 생깁니다.</p>}
            <div className="mt-2 flex justify-end gap-1.5">
              <button type="button" onClick={() => setColAdd(null)} className="rounded-control px-2.5 py-1 text-[12px] text-label-2 hover:bg-black/[0.05]">
                취소
              </button>
              <button type="submit" className="rounded-control bg-accent px-2.5 py-1 text-[12px] font-semibold text-white">
                {colAdd.rename ? '바꾸기' : '추가'}
              </button>
            </div>
          </form>
        </div>
      )}

      {headMenu && onHeadColor && (
        <div className="fixed inset-0 z-50" onMouseDown={() => setHeadMenu(null)} onContextMenu={(e) => (e.preventDefault(), setHeadMenu(null))}>
          <div className="mac-pop absolute w-[268px] px-3 py-2" style={{ left: headMenu.x, top: headMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
            {cols.some((f) => f.id === headMenu.key) && (onAddColumns || onDeleteColumns) && (
              <div className="-mx-3 mb-1.5 border-b border-separator pb-1 text-[13px]">
                {onAddColumns &&
                  (['left', 'right'] as const).map((side) => (
                    <button
                      key={side}
                      onClick={() => {
                        setColAdd({ anchor: headMenu.key, side, count: 1, x: headMenu.x, y: headMenu.y, text: '' })
                        setHeadMenu(null)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]"
                    >
                      <Plus size={14} strokeWidth={1.9} className="text-label-2" />
                      {side === 'left' ? '왼쪽' : '오른쪽'}에 열 삽입
                    </button>
                  ))}
                {onRenameColumn && headMenu.key.startsWith('newcol:') && (
                  <button
                    onClick={() => {
                      setColAdd({
                        anchor: headMenu.key,
                        side: 'right',
                        count: 1,
                        x: headMenu.x,
                        y: headMenu.y,
                        text: cols.find((f) => f.id === headMenu.key)?.label ?? '',
                        rename: headMenu.key,
                      })
                      setHeadMenu(null)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]"
                  >
                    <span className="w-3.5" />열 이름 고치기
                  </button>
                )}
                {onDeleteColumns && (
                  <button
                    onClick={() => {
                      const k = headMenu.key
                      setHeadMenu(null)
                      onDeleteColumns(selectedCols.includes(k) ? selectedCols : [k])
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-danger hover:bg-black/[0.05]"
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                    {selectedCols.includes(headMenu.key) && selectedCols.length > 1 ? `열 ${selectedCols.length}개 삭제` : '열 삭제'}
                  </button>
                )}
              </div>
            )}
            <p className="mb-1 text-[12px] font-semibold text-label-2">머리글 색</p>
            <ColorPalette
              current={headColors[headMenu.key] ?? ''}
              sheetColors={sheetColors}
              onPick={(hex) => {
                // 여러 열을 골랐으면 고른 열 머리글 모두
                for (const k of selectedCols.includes(headMenu.key) ? selectedCols : [headMenu.key]) onHeadColor(k, hex)
                setHeadMenu(null)
              }}
            />
          </div>
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

// 스프레드시트처럼 편집하는 표. 일정표 빌더(첨부 PWA)의 "표 격자" 조작감을
// 옮겨 왔다: 칸 클릭 = 선택(바로 치면 덮어씀), 더블클릭/Enter/F2 = 이어서
// 편집, 왼쪽 손잡이로 행 선택·드래그 이동, 머리글로 열 선택·이름 바꾸기·폭
// 조절, 우클릭 메뉴, ⌘Z 되돌리기. 빌더에 없던 화살표·Tab 이동과 엑셀/시트
// 붙여넣기(TSV)를 더했고, 병합·칼 도구는 뺐다(한 행 = 과제 하나인 데이터 표).
//
// 이 컴포넌트는 데이터를 들고 있지 않는다. 바뀐 내용을 on* 콜백으로 알리면
// 부모가 새 데이터를 만들어 다시 내려준다(되돌리기도 부모가 스냅샷으로).
//
// 한글 입력: 선택만 된 상태에서도 활성 칸 위에 투명한 textarea가 포커스를
// 잡고 있다가, 글자가 들어오면(IME 조합 시작 포함) 그대로 편집 상태로
// 바뀐다. 첫 글자를 keydown에서 가로채면 한글 조합이 깨지기 때문이다.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ColumnType } from '../../types'

export interface GridColumn {
  id: string
  label: string
  type: ColumnType
  width: number
  system: boolean
  // 목록에서 고르는 칸(상태·분류·담당자 등). 칸을 누르면 표 바깥에 칩 목록이 뜬다.
  // 모든 선택 칸이 같은 방식이다 -- 차이는 여러 개를 고르는지, 목록에 없는 값을
  // 입력할 수 있는지, 칩 색뿐.
  picker?: {
    options: string[]
    multi?: boolean // 여러 개(담당자). 값은 "a, b" 문자열로 주고받는다
    allowNew?: boolean // 목록에 없는 값을 입력해 넣을 수 있음
    // 선택된 칩의 색 클래스. known = 목록에 있는 값인지
    tone?: (value: string, known: boolean) => string
  }
}

// 표 안의 뱃지와 선택 팝업의 칩이 같은 모양이 되도록 함께 쓴다(색만 다름).
export const CHIP_BASE = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'
const CHIP_IDLE = 'border border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-800'

export interface CellEdit {
  rowId: string
  colId: string
  text: string
}

interface DataGridProps<R extends { id: string }> {
  columns: GridColumn[]
  rows: R[]
  getText: (row: R, colId: string) => string
  renderCell?: (row: R, col: GridColumn) => ReactNode | undefined
  rowClassName?: (row: R) => string
  rowMarker?: (row: R) => ReactNode
  onCommit: (edits: CellEdit[]) => void
  // 붙여넣기: 시작 칸(보이는 행·열 index)과 TSV 격자. 행이 모자라면 부모가 추가한다.
  onPaste: (rowIndex: number, colIndex: number, matrix: string[][]) => void
  onInsertRows: (index: number, count: number) => void
  onDeleteRows: (ids: string[]) => void
  onMoveRows?: (ids: string[], toIndex: number) => void
  onInsertColumn: (index: number) => void
  onDeleteColumns: (colIds: string[]) => void
  onHideColumns: (colIds: string[]) => void
  onRenameColumn: (colId: string, label: string) => void
  onResizeColumn: (colId: string, width: number) => void
  onMoveColumns?: (colIds: string[], toIndex: number) => void
  onUndo: () => void
  onRedo: () => void
  // 선택 범위에 걸친 행 id -- 부모가 "선택한 행으로 무엇을 하기" 버튼을 띄울 때 쓴다.
  onSelectionChange?: (rowIds: string[]) => void
  // 우클릭 메뉴 맨 위에 붙일 부모 전용 동작(선택 범위에 걸친 행 id를 받는다). 빈 배열이면 안 붙임.
  rowActions?: (rowIds: string[]) => RowAction[]
  // 데이터 행 사이에 끼우는 머리 행(묶음 제목 등). anchor = 이 머리 행 바로 뒤에 올 데이터 행
  // index(끝이면 rows.length). 선택·편집 대상이 아니다.
  groupHeaders?: (anchor: number) => GroupHeaderRow[]
  // 행 앞 체크박스(셀 선택과 별개). 넘기면 체크 열이 생긴다.
  check?: {
    isChecked: (row: R) => boolean
    isDisabled?: (row: R) => boolean
    title?: (row: R) => string | undefined
    onToggle: (rows: R[], on: boolean) => void
  }
  addRowLabel?: string
  emptyText?: string
}

export interface GroupHeaderRow {
  key: string
  caret?: ReactNode
  check?: { checked: boolean; indeterminate?: boolean; disabled?: boolean; title?: string; onChange: (on: boolean) => void }
  content: ReactNode
}

export interface RowAction {
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}

type Sel =
  | { t: 'cells'; r1: number; c1: number; r2: number; c2: number }
  | { t: 'rows'; a: number; b: number }
  | { t: 'cols'; a: number; b: number }

interface Menu {
  x: number
  y: number
  kind: 'cell' | 'row' | 'col'
}

const HANDLE_W = 52
const MIN_COL_W = 48

function lo(a: number, b: number) {
  return Math.min(a, b)
}
function hi(a: number, b: number) {
  return Math.max(a, b)
}

// 엑셀/구글시트에서 복사한 TSV. 따옴표로 감싼 칸 안의 줄바꿈·탭도 처리한다.
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  let quoted = false
  const src = text.replace(/\r\n?/g, '\n')
  while (i < src.length) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i += 2
        continue
      }
      if (ch === '"') {
        quoted = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"' && cell === '') {
      quoted = true
      i += 1
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
    i += 1
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function toTsv(matrix: string[][]): string {
  return matrix
    .map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t'))
    .join('\n')
}

export default function DataGrid<R extends { id: string }>(props: DataGridProps<R>) {
  const { columns, rows, getText } = props
  const nR = rows.length
  const nC = columns.length

  const [sel, setSel] = useState<Sel | null>(null)
  const [active, setActive] = useState<{ r: number; c: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragInsert, setDragInsert] = useState<{ kind: 'row' | 'col'; index: number } | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const sinkRef = useRef<HTMLTextAreaElement>(null)
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>())
  const headRefs = useRef(new Map<number, HTMLTableCellElement>())
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const drag = useRef<null | { kind: 'cells' | 'rows' | 'cols'; anchor: number; anchorC?: number; moving?: boolean; start?: { x: number; y: number } }>(null)
  const [sinkBox, setSinkBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [sinkValue, setSinkValue] = useState('')
  const composing = useRef(false)
  // 선택 칸: 강조된 칩, 고른 값들, 편집 시작 때 값(목록에 없는 값도 뺐다가 다시 넣을 수 있게)
  const [choiceIndex, setChoiceIndex] = useState(0)
  // 키보드로 옮겼을 때만 강조 테두리를 보인다(마우스로 열자마자 첫 칩이 강조돼 헷갈리지 않게).
  const [kbNav, setKbNav] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [pickedAtStart, setPickedAtStart] = useState<string[]>([])
  function beginPicker(col: GridColumn, text: string) {
    const list = col.picker?.multi
      ? text
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : text
        ? [text]
        : []
    setPicked(list)
    setPickedAtStart(list)
    setKbNav(false)
    setChoiceIndex(col.picker && !col.picker.multi ? Math.max(0, col.picker.options.indexOf(text)) : 0)
  }
  function openPicker(r: number, c: number) {
    const col = columns[c]
    const row = rows[r]
    if (!col?.picker || !row) return
    select(r, c)
    beginPicker(col, getText(row, col.id))
    setSinkValue('')
    setEditing(true)
    wantFocus.current = true
    requestAnimationFrame(() => sinkRef.current?.focus())
  }

  // 행/열 수가 줄면 선택을 안쪽으로 당긴다.
  useEffect(() => {
    if (!active) return
    if (nR === 0 || nC === 0) {
      setActive(null)
      setSel(null)
      setEditing(false)
      return
    }
    if (active.r >= nR || active.c >= nC) {
      const r = Math.min(active.r, nR - 1)
      const c = Math.min(active.c, nC - 1)
      setActive({ r, c })
      setSel({ t: 'cells', r1: r, c1: c, r2: r, c2: c })
    }
  }, [nR, nC, active])

  const activeRow = active ? rows[active.r] : undefined
  const activeCol = active ? columns[active.c] : undefined

  // 투명 입력칸을 활성 칸 위로 옮긴다.
  useLayoutEffect(() => {
    if (!active || !wrapRef.current) {
      setSinkBox(null)
      return
    }
    const td = cellRefs.current.get(`${active.r}:${active.c}`)
    if (!td) return
    const wrap = wrapRef.current.getBoundingClientRect()
    const box = td.getBoundingClientRect()
    setSinkBox({ left: box.left - wrap.left, top: box.top - wrap.top, width: box.width, height: box.height })
  }, [active, columns, rows, editing])

  // 입력칸은 활성 칸이 생긴 다음 렌더에야 나타나므로, 아직 없으면 "포커스
  // 원함"을 기억해 두었다가 나타난 직후(아래 effect)에 준다.
  const wantFocus = useRef(false)
  const focusSink = useCallback(() => {
    // 머리글 이름 바꾸기 입력칸이 포커스를 갖고 있으면 뺏지 않는다.
    const cur = document.activeElement
    if (cur instanceof HTMLInputElement && wrapRef.current?.contains(cur)) return
    if (sinkRef.current) sinkRef.current.focus({ preventScroll: false })
    else wantFocus.current = true
  }, [])
  useEffect(() => {
    if (wantFocus.current && sinkRef.current) {
      wantFocus.current = false
      sinkRef.current.focus({ preventScroll: false })
    }
  }, [sinkBox])

  function select(r: number, c: number, extend = false) {
    if (extend && active && sel?.t === 'cells') {
      setSel({ t: 'cells', r1: active.r, c1: active.c, r2: r, c2: c })
      return
    }
    setActive({ r, c })
    setSel({ t: 'cells', r1: r, c1: c, r2: r, c2: c })
  }

  function startEdit(initial?: string) {
    if (!activeRow || !activeCol) return
    if (activeCol.picker && initial === undefined) {
      beginPicker(activeCol, getText(activeRow, activeCol.id))
      setSinkValue('')
      setEditing(true)
      requestAnimationFrame(() => sinkRef.current?.focus())
      return
    }
    const text = initial ?? getText(activeRow, activeCol.id)
    setSinkValue(text)
    setEditing(true)
    requestAnimationFrame(() => {
      const el = sinkRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  function commitEdit(move?: 'down' | 'right' | 'left' | 'up') {
    // 선택 칸: 고른 값을 넣는다. 입력칸에 남은 글자는 입력 허용 칸에서만 값으로 쓴다.
    if (editing && activeCol?.picker && activeRow) {
      const pk = activeCol.picker
      const extra = sinkValue.trim()
      const typedNew = extra && pk.allowNew && !pk.options.includes(extra) ? extra : ''
      let text: string
      if (pk.multi) text = (typedNew && !picked.includes(typedNew) ? [...picked, typedNew] : picked).join(', ')
      else text = typedNew || picked[0] || ''
      if (text !== getText(activeRow, activeCol.id)) props.onCommit([{ rowId: activeRow.id, colId: activeCol.id, text }])
      setEditing(false)
      setSinkValue('')
      if (move && active) moveActive(move)
      requestAnimationFrame(focusSink)
      return
    }
    if (editing && activeRow && activeCol) {
      const before = getText(activeRow, activeCol.id)
      if (sinkValue !== before) props.onCommit([{ rowId: activeRow.id, colId: activeCol.id, text: sinkValue }])
    }
    setEditing(false)
    setSinkValue('')
    if (move && active) moveActive(move)
    requestAnimationFrame(focusSink)
  }

  function cancelEdit() {
    setEditing(false)
    setSinkValue('')
    requestAnimationFrame(focusSink)
  }

  function moveActive(dir: 'down' | 'right' | 'left' | 'up', extend = false) {
    if (!active) return
    const base = extend && sel?.t === 'cells' ? { r: sel.r2, c: sel.c2 } : active
    let { r, c } = base
    if (dir === 'down') r = Math.min(nR - 1, r + 1)
    if (dir === 'up') r = Math.max(0, r - 1)
    if (dir === 'right') c = Math.min(nC - 1, c + 1)
    if (dir === 'left') c = Math.max(0, c - 1)
    if (extend && sel?.t === 'cells') setSel({ ...sel, r2: r, c2: c })
    else select(r, c)
  }

  // ---------- 선택 범위 ----------

  const range = useMemo(() => {
    if (!sel) return null
    if (sel.t === 'cells') return { r1: lo(sel.r1, sel.r2), r2: hi(sel.r1, sel.r2), c1: lo(sel.c1, sel.c2), c2: hi(sel.c1, sel.c2) }
    if (sel.t === 'rows') return { r1: lo(sel.a, sel.b), r2: hi(sel.a, sel.b), c1: 0, c2: nC - 1 }
    return { r1: 0, r2: nR - 1, c1: lo(sel.a, sel.b), c2: hi(sel.a, sel.b) }
  }, [sel, nR, nC])

  const selectedRowIds = useMemo(() => {
    if (!range) return []
    return rows.slice(range.r1, range.r2 + 1).map((r) => r.id)
  }, [range, rows])

  const onSelectionChange = props.onSelectionChange
  const selectionKey = selectedRowIds.join('|')
  useEffect(() => {
    onSelectionChange?.(selectionKey ? selectionKey.split('|') : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  const selectedColIds = useMemo(() => {
    if (!sel || sel.t !== 'cols') return []
    return columns.slice(lo(sel.a, sel.b), hi(sel.a, sel.b) + 1).map((c) => c.id)
  }, [sel, columns])

  function clearRange() {
    if (!range) return
    const edits: CellEdit[] = []
    for (let r = range.r1; r <= range.r2; r++)
      for (let c = range.c1; c <= range.c2; c++) {
        const row = rows[r]
        const col = columns[c]
        if (row && col && getText(row, col.id) !== '') edits.push({ rowId: row.id, colId: col.id, text: '' })
      }
    if (edits.length) props.onCommit(edits)
  }

  function copyMatrix(): string[][] {
    if (!range) return []
    const out: string[][] = []
    for (let r = range.r1; r <= range.r2; r++) {
      const line: string[] = []
      for (let c = range.c1; c <= range.c2; c++) line.push(rows[r] && columns[c] ? getText(rows[r], columns[c].id) : '')
      out.push(line)
    }
    return out
  }

  // 지운 뒤에도 그 자리(바로 아래 행)에 선택을 남겨 둔다 -- 입력칸이 사라지면
  // 포커스가 빠져서 곧바로 ⌘Z로 되돌릴 수 없다.
  function deleteSelectedRows() {
    if (selectedRowIds.length === 0 || !range) return
    const count = selectedRowIds.length
    props.onDeleteRows(selectedRowIds)
    const remaining = nR - count
    if (remaining <= 0) {
      setSel(null)
      setActive(null)
      return
    }
    const r = Math.min(range.r1, remaining - 1)
    const c = active?.c ?? 0
    setActive({ r, c })
    setSel({ t: 'cells', r1: r, c1: c, r2: r, c2: c })
    requestAnimationFrame(focusSink)
  }

  // ---------- 키보드 ----------

  function onSinkKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey
    if (e.nativeEvent.isComposing || composing.current) return
    if (editing && activeCol?.picker) {
      const pk = activeCol.picker
      const list = filteredOptions
      const q = sinkValue.trim()
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight'
        setKbNav(true)
        if (list.length) setChoiceIndex((i) => (i + (fwd ? 1 : list.length - 1)) % list.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const hit = list[Math.min(choiceIndex, list.length - 1)]
        if (pk.multi) {
          if (!q) {
            commitEdit('down')
            return
          }
          const name = hit ?? (pk.allowNew ? q : undefined)
          if (name) setPicked((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]))
          setSinkValue('')
          setChoiceIndex(0)
        } else {
          const value = q && !hit && pk.allowNew ? q : hit
          if (value !== undefined) choose(value, 'down')
        }
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commitEdit(e.shiftKey ? 'left' : 'right')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && sinkValue === '' && picked.length > 0) {
        e.preventDefault()
        setPicked((cur) => cur.slice(0, -1))
      }
      return
    }
    if (editing) {
      const memoLike = activeCol?.type === 'memo'
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !(memoLike && mod)) {
        e.preventDefault()
        commitEdit('down')
      } else if (e.key === 'Enter' && memoLike && mod) {
        e.preventDefault()
        commitEdit('down')
      } else if (e.key === 'Enter' && (e.altKey || e.shiftKey)) {
        // Alt/Shift+Enter = 칸 안 줄바꿈 (엑셀과 같게). textarea 기본 동작을
        // Alt에서는 안 해 주므로 직접 넣는다.
        e.preventDefault()
        const el = e.currentTarget
        const s = el.selectionStart
        const next = sinkValue.slice(0, s) + '\n' + sinkValue.slice(el.selectionEnd)
        setSinkValue(next)
        requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commitEdit(e.shiftKey ? 'left' : 'right')
      }
      return
    }

    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      if (e.shiftKey) props.onRedo()
      else props.onUndo()
      return
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault()
      props.onRedo()
      return
    }
    if ((mod || e.altKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && props.onMoveRows && range) {
      e.preventDefault()
      const to = e.key === 'ArrowUp' ? range.r1 - 1 : range.r2 + 2
      if (to < 0 || to > nR) return
      props.onMoveRows(selectedRowIds, to)
      const d = e.key === 'ArrowUp' ? -1 : 1
      if (sel?.t === 'rows') setSel({ t: 'rows', a: sel.a + d, b: sel.b + d })
      else if (sel?.t === 'cells') setSel({ ...sel, r1: sel.r1 + d, r2: sel.r2 + d })
      if (active) setActive({ r: active.r + d, c: active.c })
      return
    }
    if (!active) return
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault()
        moveActive(e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowLeft' ? 'left' : 'right', e.shiftKey)
        return
      case 'Tab':
        e.preventDefault()
        moveActive(e.shiftKey ? 'left' : 'right')
        return
      case 'Enter':
      case 'F2':
        e.preventDefault()
        startEdit()
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        if (sel?.t === 'rows') deleteSelectedRows()
        else if (sel?.t === 'cols') props.onDeleteColumns(selectedColIds)
        else clearRange()
        return
      case 'Escape':
        setSel(active ? { t: 'cells', r1: active.r, c1: active.c, r2: active.r, c2: active.c } : null)
        return
    }
  }

  // 선택 상태에서 글자가 들어오면 그 글자로 새로 쓰기 시작한다.
  function onSinkChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!editing) {
      if (!activeRow || !activeCol) return
      if (activeCol.picker) beginPicker(activeCol, getText(activeRow, activeCol.id))
      setChoiceIndex(0)
      setEditing(true)
    }
    setSinkValue(e.target.value)
  }

  function onCopy(e: React.ClipboardEvent) {
    if (editing || !range) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', toTsv(copyMatrix()))
  }

  function onCut(e: React.ClipboardEvent) {
    if (editing || !range) return
    onCopy(e)
    clearRange()
  }

  function onPasteEvent(e: React.ClipboardEvent) {
    if (editing || !active) return
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const matrix = parseTsv(text.replace(/\n$/, ''))
    if (matrix.length === 0) return
    const start = range ? { r: range.r1, c: range.c1 } : active
    props.onPaste(start.r, start.c, matrix)
    const r2 = start.r + matrix.length - 1
    const c2 = Math.min(nC - 1, start.c + Math.max(...matrix.map((m) => m.length)) - 1)
    setSel({ t: 'cells', r1: start.r, c1: start.c, r2, c2 })
  }

  // ---------- 마우스 ----------

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = drag.current
      if (!d) return
      if (d.kind === 'rows' && d.moving) {
        // 행 드래그 이동: 마우스 아래 행 경계에 삽입선
        let index = nR
        for (let r = 0; r < nR; r++) {
          const tr = rowRefs.current.get(r)
          if (!tr) continue
          const box = tr.getBoundingClientRect()
          if (e.clientY < box.top + box.height / 2) {
            index = r
            break
          }
        }
        setDragInsert({ kind: 'row', index })
      } else if (d.kind === 'cols' && d.moving) {
        let index = nC
        for (let c = 0; c < nC; c++) {
          const th = headRefs.current.get(c)
          if (!th) continue
          const box = th.getBoundingClientRect()
          if (e.clientX < box.left + box.width / 2) {
            index = c
            break
          }
        }
        setDragInsert({ kind: 'col', index })
      }
    }
    function onUp() {
      const d = drag.current
      drag.current = null
      if (d?.moving && dragInsert) {
        if (d.kind === 'rows' && dragInsert.kind === 'row' && props.onMoveRows && range) {
          props.onMoveRows(selectedRowIds, dragInsert.index)
          const count = range.r2 - range.r1 + 1
          const newStart = dragInsert.index > range.r1 ? dragInsert.index - count : dragInsert.index
          setSel({ t: 'rows', a: newStart, b: newStart + count - 1 })
          setActive({ r: newStart, c: active?.c ?? 0 })
        } else if (d.kind === 'cols' && dragInsert.kind === 'col' && props.onMoveColumns && sel?.t === 'cols') {
          props.onMoveColumns(selectedColIds, dragInsert.index)
          const count = selectedColIds.length
          const a = lo(sel.a, sel.b)
          const newStart = dragInsert.index > a ? dragInsert.index - count : dragInsert.index
          setSel({ t: 'cols', a: newStart, b: newStart + count - 1 })
        }
      }
      setDragInsert(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  })

  function onCellMouseDown(e: React.MouseEvent, r: number, c: number) {
    if (e.button !== 0) return
    if (editing && active && active.r === r && active.c === c) return
    e.preventDefault()
    if (editing) commitEdit()
    setMenu(null)
    if (e.shiftKey && active) {
      setSel({ t: 'cells', r1: active.r, c1: active.c, r2: r, c2: c })
    } else {
      select(r, c)
      drag.current = { kind: 'cells', anchor: r, anchorC: c }
      // 선택 칸은 누르면 바로 목록을 연다.
      if (columns[c]?.picker && rows[r]) {
        openPicker(r, c)
        return
      }
    }
    requestAnimationFrame(focusSink)
  }

  function onCellMouseEnter(r: number, c: number) {
    const d = drag.current
    if (!d) return
    if (d.kind === 'cells') setSel({ t: 'cells', r1: d.anchor, c1: d.anchorC ?? 0, r2: r, c2: c })
    else if (d.kind === 'rows' && !d.moving) setSel({ t: 'rows', a: d.anchor, b: r })
  }

  function onRowHandleMouseDown(e: React.MouseEvent, r: number) {
    if (e.button !== 0) return
    e.preventDefault()
    if (editing) commitEdit()
    setMenu(null)
    const within = sel?.t === 'rows' && r >= lo(sel.a, sel.b) && r <= hi(sel.a, sel.b)
    if (within && props.onMoveRows) {
      drag.current = { kind: 'rows', anchor: r, moving: true }
    } else if (e.shiftKey && sel?.t === 'rows') {
      setSel({ t: 'rows', a: sel.a, b: r })
    } else {
      setSel({ t: 'rows', a: r, b: r })
      setActive({ r, c: active?.c ?? 0 })
      drag.current = { kind: 'rows', anchor: r }
    }
    requestAnimationFrame(focusSink)
  }

  function onHeadMouseDown(e: React.MouseEvent, c: number) {
    // 두 번째 클릭(더블클릭 = 이름 바꾸기)에서는 입력칸으로 포커스를 뺏지 않는다.
    if (e.button !== 0 || renaming || e.detail > 1) return
    e.preventDefault()
    if (editing) commitEdit()
    setMenu(null)
    const within = sel?.t === 'cols' && c >= lo(sel.a, sel.b) && c <= hi(sel.a, sel.b)
    if (within && props.onMoveColumns) {
      drag.current = { kind: 'cols', anchor: c, moving: true }
    } else if (e.shiftKey && sel?.t === 'cols') {
      setSel({ t: 'cols', a: sel.a, b: c })
    } else {
      setSel({ t: 'cols', a: c, b: c })
      if (nR > 0) setActive({ r: active?.r ?? 0, c })
    }
    requestAnimationFrame(focusSink)
  }

  function onResizeStart(e: React.MouseEvent, col: GridColumn) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = col.width
    let latest = startW
    const th = headRefs.current.get(columns.indexOf(col))
    function move(ev: MouseEvent) {
      latest = Math.max(MIN_COL_W, startW + ev.clientX - startX)
      if (th) th.style.width = `${latest}px`
    }
    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      if (latest !== startW) props.onResizeColumn(col.id, latest)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function openMenu(e: React.MouseEvent, kind: Menu['kind'], r?: number, c?: number) {
    e.preventDefault()
    if (editing) commitEdit()
    // 우클릭한 곳이 선택 범위 밖이면 거기를 선택한다.
    if (kind === 'cell' && r !== undefined && c !== undefined) {
      const inside = range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2
      if (!inside) select(r, c)
    } else if (kind === 'row' && r !== undefined) {
      const inside = sel?.t === 'rows' && r >= lo(sel.a, sel.b) && r <= hi(sel.a, sel.b)
      if (!inside) {
        setSel({ t: 'rows', a: r, b: r })
        setActive({ r, c: active?.c ?? 0 })
      }
    } else if (kind === 'col' && c !== undefined) {
      const inside = sel?.t === 'cols' && c >= lo(sel.a, sel.b) && c <= hi(sel.a, sel.b)
      if (!inside) setSel({ t: 'cols', a: c, b: c })
    }
    setMenu({ x: e.clientX, y: e.clientY, kind })
  }

  useEffect(() => {
    if (!menu) return
    function close() {
      setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  // ---------- 렌더 ----------

  const filteredOptions = useMemo(() => {
    if (!editing || !activeCol?.picker) return []
    const all = Array.from(new Set([...activeCol.picker.options, ...pickedAtStart, ...picked]))
    const q = sinkValue.trim()
    return q ? all.filter((n) => n.includes(q)) : all
  }, [editing, activeCol, sinkValue, picked, pickedAtStart])

  // 하나만 고르는 칸: 누르는 즉시 넣고 닫는다.
  function choose(value: string, move?: 'down' | 'right' | 'left') {
    if (!activeRow || !activeCol) return
    if (value !== getText(activeRow, activeCol.id)) props.onCommit([{ rowId: activeRow.id, colId: activeCol.id, text: value }])
    setEditing(false)
    setSinkValue('')
    if (move) moveActive(move)
    requestAnimationFrame(focusSink)
  }

  // 선택 팝업은 표 스크롤 영역에 갇히지 않게 body에 띄우고, 화면 좌표로 칸 아래(자리가
  // 없으면 위)에 붙인다. 스크롤·크기 변경 때 다시 잰다.
  const [popPos, setPopPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!editing || !activeCol?.picker || !active) {
      setPopPos(null)
      return
    }
    function place() {
      const td = active ? cellRefs.current.get(`${active.r}:${active.c}`) : undefined
      if (!td) return
      const rect = td.getBoundingClientRect()
      const width = Math.max(rect.width, 280)
      const left = Math.min(rect.left, window.innerWidth - width - 8)
      const below = window.innerHeight - rect.bottom
      setPopPos(below < 240 && rect.top > below ? { left, bottom: window.innerHeight - rect.top + 4, width } : { left, top: rect.bottom + 4, width })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [editing, activeCol, active, rows])

  const check = props.check
  const CHECK_W = check ? 36 : 0
  const checkable = check ? rows.filter((r) => !check.isDisabled?.(r)) : []
  const allChecked = checkable.length > 0 && checkable.every((r) => check!.isChecked(r))
  const someChecked = checkable.some((r) => check!.isChecked(r))
  function renderHeaders(anchor: number) {
    const list = props.groupHeaders?.(anchor)
    if (!list?.length) return null
    return list.map((h) => (
      <tr key={`gh:${h.key}`} className="bg-[#F3F5F8]">
        <td className="h-9 border-b border-r border-[#D6DAE0] text-center text-xs text-gray-500">{h.caret}</td>
        {check && (
          <td className="border-b border-r border-[#D6DAE0] text-center" title={h.check?.title}>
            {h.check && (
              <input
                type="checkbox"
                checked={h.check.checked}
                disabled={h.check.disabled}
                ref={(el) => {
                  if (el) el.indeterminate = !!h.check?.indeterminate && !h.check.checked
                }}
                onChange={(e) => h.check!.onChange(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-[#2563EB] align-middle disabled:cursor-not-allowed disabled:opacity-40"
              />
            )}
          </td>
        )}
        <td colSpan={nC + 1} className="border-b border-[#D6DAE0] px-2 py-1.5">
          {h.content}
        </td>
      </tr>
    ))
  }

  const tableWidth = HANDLE_W + CHECK_W + columns.reduce((s, c) => s + c.width, 0) + 44
  const menuRows = range ? range.r2 - range.r1 + 1 : 0
  const canDeleteCols = selectedColIds.length > 0 && columns.filter((c) => selectedColIds.includes(c.id)).every((c) => !c.system)

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-lg border border-[#D6DAE0] bg-white">
        {/* 화면이 넓으면 표가 가로를 다 채우고(남는 폭은 열마다 비율대로), 좁으면 가로 스크롤 */}
        <div ref={wrapRef} className="relative" style={{ width: '100%', minWidth: tableWidth }}>
          <table className="table-fixed border-collapse text-[13.5px]" style={{ width: '100%', minWidth: tableWidth }}>
            <colgroup>
              <col style={{ width: HANDLE_W }} />
              {check && <col style={{ width: CHECK_W }} />}
              {columns.map((c) => (
                <col key={c.id} style={{ width: c.width }} />
              ))}
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr className="bg-[#14161A] text-white">
                <th className="h-9 border-r border-white/10 text-center text-xs font-medium text-[#9AA1AC]">#</th>
                {check && (
                  <th className="h-9 border-r border-white/10 text-center">
                    <input
                      type="checkbox"
                      aria-label="보이는 행 모두 선택"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked && !allChecked
                      }}
                      disabled={checkable.length === 0}
                      onChange={() => check.onToggle(checkable, !allChecked)}
                      className="h-4 w-4 cursor-pointer accent-[#2563EB] align-middle"
                    />
                  </th>
                )}
                {columns.map((col, c) => {
                  const colSelected = sel?.t === 'cols' && c >= lo(sel.a, sel.b) && c <= hi(sel.a, sel.b)
                  return (
                    <th
                      key={col.id}
                      ref={(el) => {
                        if (el) headRefs.current.set(c, el)
                        else headRefs.current.delete(c)
                      }}
                      onMouseDown={(e) => onHeadMouseDown(e, c)}
                      onDoubleClick={() => setRenaming(col.id)}
                      onContextMenu={(e) => openMenu(e, 'col', undefined, c)}
                      className={`relative h-9 select-none border-r border-white/10 px-2 text-left text-[13px] font-semibold ${
                        colSelected ? 'bg-[#2C3440]' : ''
                      } ${dragInsert?.kind === 'col' && dragInsert.index === c ? 'shadow-[inset_3px_0_0_#F97316]' : ''}`}
                      title={col.system ? `${col.label} (시트 열)` : col.label}
                    >
                      {renaming === col.id ? (
                        <input
                          autoFocus
                          onFocus={(e) => e.target.select()}
                          defaultValue={col.label}
                          onMouseDown={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (v && v !== col.label) props.onRenameColumn(col.id, v)
                            setRenaming(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            if (e.key === 'Escape') setRenaming(null)
                          }}
                          className="w-full rounded bg-white px-1 py-0.5 text-[13px] font-medium text-black outline-none"
                        />
                      ) : (
                        <span className="flex items-center gap-1 truncate">
                          <span className="truncate">{col.label}</span>
                          {!col.system && <span className="shrink-0 text-[11px] font-normal text-[#9AA1AC]">추가</span>}
                        </span>
                      )}
                      <span
                        onMouseDown={(e) => onResizeStart(e, col)}
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-white/20"
                      />
                    </th>
                  )
                })}
                <th className="h-9 p-0 text-center">
                  <button
                    onClick={() => props.onInsertColumn(nC)}
                    title="열 추가"
                    className="h-9 w-full text-lg leading-none text-[#9AA1AC] hover:bg-white/10 hover:text-white"
                  >
                    ＋
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => {
                const rowSelected = sel?.t === 'rows' && r >= lo(sel.a, sel.b) && r <= hi(sel.a, sel.b)
                return (
                  <Fragment key={row.id}>
                  {renderHeaders(r)}
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(r, el)
                      else rowRefs.current.delete(r)
                    }}
                    className={`${props.rowClassName?.(row) ?? ''} ${
                      dragInsert?.kind === 'row' && dragInsert.index === r ? 'shadow-[inset_0_3px_0_#F97316]' : ''
                    }`}
                  >
                    <td
                      onMouseDown={(e) => onRowHandleMouseDown(e, r)}
                      onMouseEnter={() => onCellMouseEnter(r, 0)}
                      onContextMenu={(e) => openMenu(e, 'row', r)}
                      className={`group h-9 cursor-grab select-none border-b border-r border-dotted border-[#C9CDD3] text-center text-xs tabular-nums ${
                        rowSelected ? 'bg-accent text-white' : 'text-gray-400 hover:bg-gray-50'
                      }`}
                      title="클릭: 행 선택 · 선택한 행을 끌어서 이동 · 우클릭: 메뉴"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span className={`${rowSelected ? 'text-white/80' : 'text-gray-300 group-hover:text-gray-500'}`}>⋮⋮</span>
                        {r + 1}
                        {props.rowMarker?.(row)}
                      </span>
                    </td>
                    {check && (
                      <td
                        onMouseDown={(e) => e.stopPropagation()}
                        className="border-b border-r border-dotted border-[#C9CDD3] text-center"
                        title={check.title?.(row)}
                      >
                        <input
                          type="checkbox"
                          checked={check.isChecked(row)}
                          disabled={check.isDisabled?.(row)}
                          onChange={(e) => check.onToggle([row], e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-[#2563EB] align-middle disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                    )}
                    {columns.map((col, c) => {
                      const inRange = range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2
                      const isActive = active?.r === r && active?.c === c
                      const custom = props.renderCell?.(row, col)
                      const text = getText(row, col.id)
                      return (
                        <td
                          key={col.id}
                          ref={(el) => {
                            const k = `${r}:${c}`
                            if (el) cellRefs.current.set(k, el)
                            else cellRefs.current.delete(k)
                          }}
                          onMouseDown={(e) => onCellMouseDown(e, r, c)}
                          onMouseEnter={() => onCellMouseEnter(r, c)}
                          onDoubleClick={() => startEdit()}
                          onContextMenu={(e) => openMenu(e, 'cell', r, c)}
                          style={{ boxShadow: cellShadow(inRange ? range : null, r, c, isActive) }}
                          className={`h-9 cursor-cell overflow-hidden border-b border-r border-dotted border-[#C9CDD3] px-2 align-middle ${
                            inRange && !isActive ? 'bg-blue-50' : ''
                          } ${col.id === 'name' ? 'font-semibold' : ''}`}
                        >
                          <div className={col.picker ? 'flex items-center justify-between gap-1' : ''}>
                            {custom !== undefined ? (
                              custom
                            ) : (
                              <div
                                className={`whitespace-pre-line break-words py-1.5 leading-snug ${col.type === 'memo' ? 'line-clamp-3 text-[13px]' : ''}`}
                                title={col.type === 'memo' && text.length > 20 ? text : undefined}
                              >
                                {text}
                              </div>
                            )}
                            {col.picker && (
                              <span
                                onMouseDown={(e) => {
                                  // ▾를 누르면 바로 목록을 연다.
                                  e.preventDefault()
                                  e.stopPropagation()
                                  if (editing) commitEdit()
                                  openPicker(r, c)
                                }}
                                className="ml-auto shrink-0 cursor-pointer rounded px-1 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                title="목록에서 고르기"
                              >
                                ▾
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <td className="border-b border-dotted border-[#C9CDD3]" />
                  </tr>
                  </Fragment>
                )
              })}
              {renderHeaders(nR)}
              {dragInsert?.kind === 'row' && dragInsert.index === nR && (
                <tr>
                  <td colSpan={nC + 2 + (check ? 1 : 0)} className="h-0 p-0 shadow-[inset_0_3px_0_#F97316]" />
                </tr>
              )}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">{props.emptyText ?? '행이 없습니다.'}</div>
          )}

          {/* 활성 칸 위의 입력칸 -- 선택 상태에선 투명, 편집 상태에선 보인다 */}
          {sinkBox && (
            <textarea
              ref={sinkRef}
              value={editing ? sinkValue : ''}
              onChange={onSinkChange}
              onKeyDown={onSinkKeyDown}
              onCompositionStart={() => {
                composing.current = true
                if (!editing) setEditing(true)
              }}
              onCompositionEnd={() => {
                composing.current = false
              }}
              onCopy={onCopy}
              onCut={onCut}
              onPaste={onPasteEvent}
              onBlur={() => {
                if (editing && !menu) commitEdit()
              }}
              spellCheck={false}
              className={`absolute z-10 resize-none px-2 py-[7px] text-[13.5px] leading-snug outline-none ${
                editing
                  ? 'bg-white text-black shadow-[0_0_0_2px_#2563EB,0_8px_24px_rgba(17,19,24,.12)]'
                  : 'pointer-events-none bg-transparent text-transparent caret-transparent'
              }`}
              style={{
                left: sinkBox.left,
                top: sinkBox.top,
                width: editing && activeCol?.type === 'memo' ? Math.max(sinkBox.width, 280) : sinkBox.width,
                height: editing && activeCol?.type === 'memo' ? Math.max(sinkBox.height, 120) : sinkBox.height,
                minHeight: sinkBox.height,
              }}
              aria-label={activeCol ? `${activeCol.label} 편집` : '셀 편집'}
              placeholder={
                editing && activeCol?.picker
                  ? activeCol.picker.allowNew
                    ? '찾기 · 없으면 입력 후 Enter'
                    : '찾기'
                  : undefined
              }
            />
          )}

          {editing &&
            activeCol?.picker &&
            popPos &&
            createPortal(
              <div
                role="listbox"
                aria-multiselectable={activeCol.picker.multi ? 'true' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                className="fixed z-[60] rounded-lg border border-gray-200 bg-white text-sm shadow-[0_8px_24px_rgba(17,19,24,.14),0_2px_6px_rgba(17,19,24,.06)]"
                style={{ left: popPos.left, top: popPos.top, bottom: popPos.bottom, width: popPos.width }}
              >
                <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto p-2.5">
                  {filteredOptions.map((n, i) => {
                    const pk = activeCol.picker!
                    const on = picked.includes(n)
                    const known = pk.options.includes(n)
                    const tone = pk.tone?.(n, known) ?? 'bg-blue-50 text-blue-800'
                    return (
                      <button
                        key={n}
                        role="option"
                        aria-selected={on}
                        onMouseEnter={() => {
                          setChoiceIndex(i)
                          setKbNav(false)
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          if (!pk.multi) {
                            choose(n)
                            return
                          }
                          setPicked((cur) => (on ? cur.filter((x) => x !== n) : [...cur, n]))
                          setSinkValue('')
                        }}
                        title={pk.multi ? (on ? '누르면 빼기' : '누르면 넣기') : undefined}
                        className={`${CHIP_BASE} cursor-pointer transition-colors ${on ? tone : CHIP_IDLE} ${
                          i === choiceIndex && (kbNav || sinkValue.trim()) ? 'outline outline-2 outline-offset-1 outline-accent/60' : ''
                        }`}
                      >
                        {n}
                        {on && pk.multi && <span className="ml-1 opacity-60">×</span>}
                      </button>
                    )
                  })}
                  {activeCol.picker.allowNew && sinkValue.trim() && !filteredOptions.includes(sinkValue.trim()) && (
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const q = sinkValue.trim()
                        if (!activeCol.picker!.multi) {
                          choose(q)
                          return
                        }
                        setPicked((cur) => (cur.includes(q) ? cur : [...cur, q]))
                        setSinkValue('')
                      }}
                      className={`${CHIP_BASE} border border-dashed border-accent bg-white text-accent`}
                    >
                      ＋ {sinkValue.trim()}
                    </button>
                  )}
                  {filteredOptions.length === 0 && !(activeCol.picker.allowNew && sinkValue.trim()) && (
                    <p className="text-xs text-gray-400">{activeCol.picker.options.length ? '맞는 값이 없습니다' : '고를 값이 없습니다. 입력해서 추가하세요.'}</p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">
                  <span>
                    {activeCol.picker.multi ? '눌러서 넣기·빼기' : '눌러서 고르기'}
                    {activeCol.picker.allowNew ? ' · 없으면 입력 후 Enter' : ''} · Esc 취소
                  </span>
                  {activeCol.picker.multi && (
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault()
                        commitEdit()
                      }}
                      className="font-semibold text-accent"
                    >
                      완료
                    </button>
                  )}
                </div>
              </div>,
              document.body,
            )}
        </div>
      </div>

      <button
        onClick={() => {
          props.onInsertRows(nR, 1)
          select(nR, 0)
          wantFocus.current = true
        }}
        className="mt-1 w-full rounded-md py-2 text-left text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-accent"
      >
        ＋ {props.addRowLabel ?? '행 추가'}
      </button>

      {menu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[200px] rounded-xl border border-gray-200 bg-white py-1.5 text-sm shadow-[0_8px_24px_rgba(17,19,24,.12),0_2px_6px_rgba(17,19,24,.06)]"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 320) }}
        >
          {(menu.kind === 'cell' || menu.kind === 'row') && range && (
            <>
              {(() => {
                const actions = props.rowActions?.(selectedRowIds) ?? []
                if (actions.length === 0) return null
                return (
                  <>
                    {actions.map((a) => (
                      <MenuItem
                        key={a.label}
                        label={a.label}
                        hint={a.hint}
                        disabled={a.disabled}
                        onClick={() => {
                          setMenu(null)
                          a.onClick()
                        }}
                      />
                    ))}
                    <div className="my-1 h-px bg-gray-100" />
                  </>
                )
              })()}
              <MenuItem
                label="위에 행 추가"
                onClick={() => {
                  props.onInsertRows(range.r1, 1)
                  setMenu(null)
                }}
              />
              <MenuItem
                label="아래에 행 추가"
                onClick={() => {
                  props.onInsertRows(range.r2 + 1, 1)
                  setMenu(null)
                }}
              />
              {props.onMoveRows && (
                <>
                  <MenuItem
                    label="위로 이동"
                    hint="⌥↑"
                    disabled={range.r1 === 0}
                    onClick={() => {
                      props.onMoveRows!(selectedRowIds, range.r1 - 1)
                      setMenu(null)
                    }}
                  />
                  <MenuItem
                    label="아래로 이동"
                    hint="⌥↓"
                    disabled={range.r2 >= nR - 1}
                    onClick={() => {
                      props.onMoveRows!(selectedRowIds, range.r2 + 2)
                      setMenu(null)
                    }}
                  />
                </>
              )}
              {menu.kind === 'cell' && (
                <MenuItem
                  label="내용 지우기"
                  hint="Del"
                  onClick={() => {
                    clearRange()
                    setMenu(null)
                  }}
                />
              )}
              <div className="my-1 h-px bg-gray-100" />
              <MenuItem
                danger
                label={menuRows > 1 ? `행 ${menuRows}개 삭제` : '행 삭제'}
                onClick={() => {
                  deleteSelectedRows()
                  setMenu(null)
                }}
              />
            </>
          )}
          {menu.kind === 'col' && sel?.t === 'cols' && (
            <>
              <MenuItem
                label="왼쪽에 열 추가"
                onClick={() => {
                  props.onInsertColumn(lo(sel.a, sel.b))
                  setMenu(null)
                }}
              />
              <MenuItem
                label="오른쪽에 열 추가"
                onClick={() => {
                  props.onInsertColumn(hi(sel.a, sel.b) + 1)
                  setMenu(null)
                }}
              />
              {selectedColIds.length === 1 && (
                <MenuItem
                  label="열 이름 바꾸기"
                  onClick={() => {
                    setRenaming(selectedColIds[0])
                    setMenu(null)
                  }}
                />
              )}
              <MenuItem
                label="열 숨기기"
                onClick={() => {
                  props.onHideColumns(selectedColIds)
                  setSel(null)
                  setMenu(null)
                }}
              />
              <div className="my-1 h-px bg-gray-100" />
              <MenuItem
                danger
                disabled={!canDeleteCols}
                label="열 삭제"
                hint={canDeleteCols ? undefined : '시트 열은 숨기기만'}
                onClick={() => {
                  props.onDeleteColumns(selectedColIds)
                  setSel(null)
                  setMenu(null)
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// 선택 범위는 엑셀처럼 바깥 테두리로 한 덩어리로 보이게, 현재 칸은 굵은 테두리.
const SEL_BLUE = '#2563EB'
function cellShadow(range: { r1: number; r2: number; c1: number; c2: number } | null, r: number, c: number, active: boolean): string | undefined {
  if (active) return `inset 0 0 0 2px ${SEL_BLUE}`
  if (!range || (range.r1 === range.r2 && range.c1 === range.c2)) return undefined
  const parts: string[] = []
  if (r === range.r1) parts.push(`inset 0 2px 0 ${SEL_BLUE}`)
  if (r === range.r2) parts.push(`inset 0 -2px 0 ${SEL_BLUE}`)
  if (c === range.c1) parts.push(`inset 2px 0 0 ${SEL_BLUE}`)
  if (c === range.c2) parts.push(`inset -2px 0 0 ${SEL_BLUE}`)
  return parts.length ? parts.join(', ') : undefined
}

function MenuItem({ label, hint, onClick, danger, disabled }: { label: string; hint?: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-4 px-3.5 py-1.5 text-left disabled:cursor-not-allowed disabled:text-gray-300 ${
        danger ? 'text-danger hover:bg-red-50' : 'text-gray-800 hover:bg-gray-50'
      }`}
    >
      <span>{label}</span>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </button>
  )
}

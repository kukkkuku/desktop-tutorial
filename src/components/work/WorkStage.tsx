// 과제관리: 위쪽 L2 탭(일정표 빌더의 폴더 탭 모양), 아래쪽 그 L2의 L3 표.
// 모든 편집은 utils/workBoard.ts의 순수 함수로 새 보드를 만들어
// SET_WORK_BOARD로 넣고, 되돌리기는 보드 스냅샷 스택으로 한다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppState } from '../../state/AppContext'
import type { ColumnDef, Importance, TaskGroup, TeamMember, WorkBoard, WorkItem } from '../../types'
import { IMPORTANCE_OPTIONS, TASK_CATEGORY_OPTIONS } from '../../types'
import {
  COL_ASSIGNEES,
  COL_CATEGORY,
  COL_EVAL_GROUP,
  COL_NAME,
  STATUS_OPTIONS,
  applyDoneRule,
  evalGroupOf,
  newEvalGroupName,
  renameEvalGroup,
  setEvalGroup,
  addColumn,
  addGroup,
  deleteColumns,
  deleteGroup,
  deleteItems,
  getCellText,
  insertItems,
  itemsOfGroup,
  moveColumns,
  moveGroup,
  moveItems,
  moveItemsToGroup,
  newWorkItem,
  optionsForColumn,
  setCellText,
  updateColumn,
  updateGroup,
  updateItems,
} from '../../utils/workBoard'
import { exportUnits, unitsToTasks } from '../../utils/evalExport'
import { sheetUrl } from '../../utils/sheetSources'
import SheetsIcon from '../SheetsIcon'
import { withGoogleAccount } from '../../utils/googleDrive'
import { ChevronDown, ChevronRight, CornerDownRight, Plus, Settings2, Redo2, RotateCw, Undo2, Ungroup, X } from 'lucide-react'
import { ic, icSm } from '../ui/icon'
import DataGrid, { CHIP_BASE, CHIP_IDLE, type CellEdit, type GridColumn, type GroupHeaderRow } from '../grid/DataGrid'
import Button from '../Button'
import ConfirmDialog from '../ConfirmDialog'

const HISTORY_LIMIT = 60

interface WorkStageProps {
  onOpenSheetImport: () => void
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.round(h / 24)}일 전`
}

export default function WorkStage({ onOpenSheetImport }: WorkStageProps) {
  const { state, dispatch, workspaceId } = useAppState()
  const board = state.workBoard
  const members = state.members

  // ---------- 되돌리기 ----------
  const undoStack = useRef<WorkBoard[]>([])
  const redoStack = useRef<WorkBoard[]>([])
  const lastSet = useRef<WorkBoard>(board)
  const [, forceRender] = useState(0)

  // 가져오기처럼 이 화면 밖에서 바뀐 보드도 되돌릴 수 있게 스택에 넣는다.
  useEffect(() => {
    if (board !== lastSet.current) {
      undoStack.current = [...undoStack.current, lastSet.current].slice(-HISTORY_LIMIT)
      redoStack.current = []
      lastSet.current = board
      forceRender((n) => n + 1)
    }
  }, [board])

  function apply(next: WorkBoard) {
    if (next === board) return
    undoStack.current = [...undoStack.current, board].slice(-HISTORY_LIMIT)
    redoStack.current = []
    lastSet.current = next
    dispatch({ type: 'SET_WORK_BOARD', payload: next })
  }

  function undo() {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(board)
    lastSet.current = prev
    dispatch({ type: 'SET_WORK_BOARD', payload: prev })
    showToast('되돌렸습니다')
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(board)
    lastSet.current = next
    dispatch({ type: 'SET_WORK_BOARD', payload: next })
  }

  // ---------- 토스트 ----------
  const [toast, setToast] = useState<{ text: string; undo?: boolean } | null>(null)
  const toastTimer = useRef<number>()
  // ⌘Z / ⌘⇧Z / ⌘Y: 표 밖(체크박스·버튼을 누른 뒤 등)에서도 되돌리기. 표 안 입력칸은
  // 표가 먼저 처리하고(preventDefault), 다른 입력칸에서는 그 칸의 되돌리기를 쓴다.
  const undoRef = useRef<{ undo: () => void; redo: () => void }>({ undo: () => {}, redo: () => {} })
  undoRef.current = { undo, redo }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) undoRef.current.redo()
        else undoRef.current.undo()
      } else if (k === 'y') {
        e.preventDefault()
        undoRef.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function showToast(text: string, withUndo = false) {
    setToast({ text, undo: withUndo })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4000)
  }

  // ---------- L2 탭 ----------
  const tabKey = `work-active-group:${workspaceId}`
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(tabKey)
    } catch {
      return null
    }
  })
  const activeGroup: TaskGroup | undefined = board.groups.find((g) => g.id === activeGroupId) ?? board.groups[0]
  useEffect(() => {
    if (!activeGroup) return
    try {
      localStorage.setItem(tabKey, activeGroup.id)
    } catch {
      // 탭 기억은 편의 기능이라 실패해도 그만이다.
    }
  }, [activeGroup, tabKey])

  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; groupId: string } | null>(null)
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<TaskGroup | null>(null)
  // L2 삭제 때 함께 지울 팀원(선택). 기본은 지우지 않음.
  const [removeMemberIds, setRemoveMemberIds] = useState<Set<string>>(new Set())
  const [dragTab, setDragTab] = useState<{ id: string; over: number | null } | null>(null)

  useEffect(() => {
    if (!tabMenu) return
    const close = () => setTabMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [tabMenu])

  function handleAddGroup() {
    const { board: next, group } = addGroup(board, `새 그룹 ${board.groups.length + 1}`)
    apply(next)
    setActiveGroupId(group.id)
    setRenamingGroup(group.id)
  }

  // ---------- 표 ----------
  const [search, setSearch] = useState('')
  // 평가과제로 내보낼 L3(체크박스). 묶인 행은 묶음 단위로 함께 켜지고 꺼진다.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  // 섞인 분류 묶음 등 과제등급을 팀장이 골라야 하는 단위: unit key -> 등급
  const [exportGrades, setExportGrades] = useState<Record<string, Importance>>({})
  // 묶음 이름을 그 자리에서 고치는 중인 평가과제 묶음
  const [renamingEval, setRenamingEval] = useState<string | null>(null)
  // L3 id -> 그 L3가 들어간 평가 과제 이름들
  const linkedTasks = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const t of state.tasks) for (const id of t.workItemIds ?? []) m.set(id, [...(m.get(id) ?? []), t.name])
    return m
  }, [state.tasks])
  const exportedIds = useMemo(() => new Set(linkedTasks.keys()), [linkedTasks])
  const units = useMemo(() => exportUnits(board, checked, exportedIds), [board, checked, exportedIds])
  // 과제등급이 안 정해진 단위: 묶음은 머리 행에서 고르고, 낱개 L3는 분류 칸을 채운다.
  const needGrade = units.filter((u) => !u.grade && !exportGrades[u.key])
  const canExport = units.length > 0 && needGrade.length === 0
  const checkedFree = board.items.filter((i) => checked.has(i.id) && !exportedIds.has(i.id))

  function toggleCheck(rows: WorkItem[], on: boolean) {
    setChecked((cur) => {
      const next = new Set(cur)
      for (const row of rows) {
        const g = evalGroupOf(row)
        const ids = g ? board.items.filter((i) => evalGroupOf(i) === g && !exportedIds.has(i.id)).map((i) => i.id) : [row.id]
        for (const id of ids) {
          if (on) next.add(id)
          else next.delete(id)
        }
      }
      return next
    })
  }

  function exportChecked() {
    if (!canExport) return
    const { tasks, participants } = unitsToTasks(units, exportGrades)
    dispatch({ type: 'ADD_TASKS_FROM_WORK', payload: { tasks, participants } })
    setChecked(new Set())
    setExportGrades({})
    showToast(`평가과제 ${tasks.length}개를 내보냈습니다. 평가과제 탭에서 성과등급을 매기세요.`)
  }

  // 우클릭 → 평가과제로 묶기: 고른 행 중 이미 묶음이 하나 있으면 그 묶음에 합치고, 없으면 새 이름.
  function groupRows(ids: string[]) {
    const free = board.items.filter((i) => ids.includes(i.id) && !exportedIds.has(i.id))
    if (free.length < 2) return
    const existing = Array.from(new Set(free.map(evalGroupOf).filter(Boolean)))
    const name = existing.length === 1 ? existing[0] : newEvalGroupName(board, free)
    apply(setEvalGroup(board, free.map((i) => i.id), name, members))
    // 묶음 일부만 체크돼 있으면 체크가 어긋나므로 묶은 행의 체크를 맞춘다.
    if (free.some((i) => checked.has(i.id))) toggleCheck(free, true)
    showToast(`L3 ${free.length}건을 「${name}」로 묶었습니다. 위 묶음 이름을 눌러 바꿀 수 있습니다.`, true)
  }

  function ungroupRows(ids: string[]) {
    // 묶음은 보기용 묶기라 이미 내보낸 L3도 풀 수 있다(평가과제와의 연결은 그대로).
    const free = board.items.filter((i) => ids.includes(i.id) && evalGroupOf(i))
    if (free.length === 0) return
    apply(setEvalGroup(board, free.map((i) => i.id), '', members))
    showToast(`L3 ${free.length}건을 묶음에서 뺐습니다.`, true)
  }

  function renameGroup(from: string, to: string) {
    setRenamingEval(null)
    const v = to.trim()
    if (!v || v === from) return
    const ids = new Set(board.items.filter((i) => evalGroupOf(i) === from).map((i) => i.id))
    apply(renameEvalGroup(board, from, v, members))
    // 이미 내보낸 묶음이면 같은 이름으로 만든 평가과제 이름도 함께 바꾼다.
    for (const t of state.tasks)
      if (t.name === from && t.workItemIds?.some((id) => ids.has(id)) && !state.tasks.some((o) => o.name === v))
        dispatch({ type: 'UPDATE_TASK', payload: { ...t, name: v } })
  }

  // 묶음 머리 행에서 분류를 고르면 하위 과제 전부의 분류를 바꾼다. 내보낸 평가과제의 과제등급도 맞춘다.
  function setGroupCategory(g: string, value: string) {
    if (!value) return
    const ids = new Set(board.items.filter((i) => evalGroupOf(i) === g).map((i) => i.id))
    apply({ ...board, items: board.items.map((i) => (ids.has(i.id) ? setCellText(i, COL_CATEGORY, value, members) : i)) })
    if ((IMPORTANCE_OPTIONS as string[]).includes(value))
      for (const t of state.tasks)
        if (t.workItemIds?.length && t.workItemIds.every((id) => ids.has(id)) && t.importance !== value)
          dispatch({ type: 'UPDATE_TASK', payload: { ...t, importance: value as Importance } })
  }
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [deletingCols, setDeletingCols] = useState<ColumnDef[] | null>(null)

  const groupItems = useMemo(() => (activeGroup ? itemsOfGroup(board, activeGroup.id) : []), [board, activeGroup])
  // ---------- 다른 L2로 옮기기(행을 L2 탭에 끌어다 놓기) ----------
  const [rowDropTab, setRowDropTab] = useState<string | null>(null)
  // 마지막으로 옮긴 행: 그 L2에서 연한 주황 배경 + 과제명 옆 주황 점.
  // 배경은 그 탭에서 다른 곳을 누르면 사라지고, 점은 잠시 뒤 사라진다.
  const [moved, setMoved] = useState<{ groupId: string; ids: Set<string>; bg: boolean } | null>(null)
  const viewingMoved = !!moved && moved.groupId === activeGroup?.id
  useEffect(() => {
    if (!viewingMoved) return
    const timer = window.setTimeout(() => setMoved(null), 12000)
    function clearBg() {
      setMoved((m) => (m && m.bg ? { ...m, bg: false } : m))
    }
    // 탭을 누른 그 클릭은 건너뛰고, 다음 클릭부터
    const t0 = window.setTimeout(() => window.addEventListener('mousedown', clearBg), 0)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(t0)
      window.removeEventListener('mousedown', clearBg)
    }
  }, [viewingMoved])
  function tabAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-l2-tab]')
    return el?.getAttribute('data-l2-tab') ?? null
  }
  const rowDragOutside = {
    move: (_ids: string[], x: number, y: number): string | null => {
      const t = tabAt(x, y)
      const target = t && t !== activeGroup?.id ? t : null
      setRowDropTab(target)
      if (!t) return null
      return target ? `→ ${board.groups.find((g) => g.id === target)?.name ?? ''}` : ''
    },
    drop: (ids: string[], x: number, y: number) => {
      setRowDropTab(null)
      const t = tabAt(x, y)
      if (!t) return false
      if (t === activeGroup?.id || ids.length === 0) return true
      // 묶음째 옮길 때만 묶음을 유지한다. 하위 과제 일부만 옮기면 그 과제는 묶음에서 빠져
      // 낱개로 옮겨진다(묶음 머리 행이 따라가 보이지 않게).
      const set = new Set(ids)
      const partial = board.items.filter((i) => set.has(i.id) && evalGroupOf(i) && !board.items.filter((o) => evalGroupOf(o) === evalGroupOf(i)).every((o) => set.has(o.id)))
      const moved = moveItemsToGroup(board, ids, t)
      apply(partial.length ? setEvalGroup(moved, partial.map((i) => i.id), '', members) : moved)
      setMoved({ groupId: t, ids: new Set(ids), bg: true })
      const name = board.groups.find((g) => g.id === t)?.name ?? ''
      showToast(`L3 ${ids.length}건을 「${name}」로 옮겼습니다.`, true)
      return true
    },
  }

  // 평가과제 묶음은 첫 행 자리에 모아 보여 주고, 묶음마다 머리 행을 붙인다(접을 수 있음).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { viewRows, headerAt, numbers, ranges } = useMemo(() => {
    const gathered: WorkItem[] = []
    const done = new Set<string>()
    for (const i of groupItems) {
      if (done.has(i.id)) continue
      const g = evalGroupOf(i)
      const block = g ? groupItems.filter((x) => evalGroupOf(x) === g) : [i]
      for (const x of block) {
        gathered.push(x)
        done.add(x.id)
      }
    }
    // 번호는 최상위(낱개 L3·묶음)에만, 접기·찾기와 무관하게 전체 순서로 매긴다.
    const numbers = new Map<string, string>()
    const childCount = new Map<string, number>()
    let n = 0
    for (const i of gathered) {
      const g = evalGroupOf(i)
      const k = g ? `g:${g}` : i.id
      if (!numbers.has(k)) numbers.set(k, String(++n))
      if (g) {
        const c = (childCount.get(g) ?? 0) + 1
        childCount.set(g, c)
        numbers.set(i.id, `${numbers.get(k)}-${c}`)
      }
    }
    const q = search.trim()
    const matches = q ? gathered.filter((i) => board.columns.some((c) => getCellText(i, c.id, members).includes(q))) : gathered
    const rows: WorkItem[] = []
    const heads = new Map<number, string[]>()
    const seen = new Set<string>()
    for (const i of matches) {
      const g = evalGroupOf(i)
      if (g && !seen.has(g)) {
        seen.add(g)
        heads.set(rows.length, [...(heads.get(rows.length) ?? []), g])
      }
      if (!g || !collapsed.has(g)) rows.push(i)
    }
    // 펼친 묶음이 차지하는 보이는 행 범위(머리 행을 누르면 이 범위를 선택)
    const ranges = new Map<string, [number, number]>()
    rows.forEach((i, idx) => {
      const g = evalGroupOf(i)
      if (!g) return
      const cur = ranges.get(g)
      ranges.set(g, cur ? [cur[0], idx] : [idx, idx])
    })
    return { viewRows: rows, headerAt: heads, numbers, ranges }
  }, [groupItems, search, board.columns, members, collapsed])
  const filtered = search.trim() !== ''

  function groupHeader(g: string): GroupHeaderRow {
    const all = board.items.filter((i) => evalGroupOf(i) === g)
    const here = groupItems.filter((i) => evalGroupOf(i) === g)
    const free = all.filter((i) => !exportedIds.has(i.id))
    const done = free.length === 0
    const isOpen = !collapsed.has(g)
    const fixedGrade = new Set(all.map((i) => i.category)).size === 1 ? all[0]?.category ?? null : null
    const key = `g:${g}`
    const on = free.filter((i) => checked.has(i.id)).length
    const taskNames = Array.from(new Set(all.flatMap((i) => linkedTasks.get(i.id) ?? [])))
    const doneCount = all.filter((i) => i.fields.status === '완료').length
    const starts = all.map((i) => i.fields.startDate).filter(Boolean).sort()
    const ends = all.map((i) => i.fields.doneDate).filter(Boolean).sort()
    const byId = new Map(members.map((m) => [m.id, m.name]))
    const people = Array.from(new Set(all.flatMap((i) => [...i.assigneeIds.map((id) => byId.get(id) ?? ''), ...i.unmatchedAssignees]).filter(Boolean)))
    const toggle = () =>
      setCollapsed((cur) => {
        const next = new Set(cur)
        if (next.has(g)) next.delete(g)
        else next.add(g)
        return next
      })
    return {
      key: g,
      label: g,
      number: numbers.get(key),
      rowRange: collapsed.has(g) ? null : ranges.get(g) ?? null,
      rowIds: here.map((i) => i.id),
      check: {
        checked: !done && on === free.length,
        indeterminate: on > 0,
        disabled: done,
        title: done ? `이미 내보냄: ${taskNames.join(', ')}` : '묶음 전체 선택',
        onChange: (v) => toggleCheck(free, v),
      },
      cell: (colId) => {
        if (colId === COL_NAME)
          return (
            <div className="group/gh flex items-center gap-1.5 py-1">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={toggle}
                title={isOpen ? '접기' : '펼치기'}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-label hover:bg-black/[0.07] hover:text-label"
              >
                <ChevronRight size={16} strokeWidth={2} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              </button>
              {renamingEval === g ? (
                <input
                  autoFocus
                  defaultValue={g}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => renameGroup(g, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') renameGroup(g, g)
                  }}
                  className="h-7 min-w-0 flex-1 rounded-control border border-accent px-2 text-sm font-bold outline-none"
                />
              ) : (
                <span
                  onDoubleClick={() => setRenamingEval(g)}
                  className="min-w-0 break-words font-bold text-label"
                  title="두 번 눌러 이름 바꾸기"
                >
                  {g}
                </span>
              )}
              {done && (
                <span className="shrink-0 rounded bg-accent/10 px-1.5 text-[11px] font-semibold text-accent" title={taskNames.join(', ')}>
                  내보냄
                </span>
              )}
              <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/gh:opacity-100">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => ungroupRows(here.map((i) => i.id))}
                  title={done ? '묶음 풀기(하위 과제를 모두 낱개로 · 평가과제는 그대로)' : '묶음 풀기(하위 과제를 모두 낱개로)'}
                  className="rounded px-1.5 text-label-2 hover:bg-black/[0.07] hover:text-label"
                >
                  <UngroupIcon />
                </button>
              </span>
            </div>
          )
        if (colId === COL_CATEGORY) {
          const value = fixedGrade ?? exportGrades[key] ?? ''
          return (
            <GroupCategoryPicker
              value={value}
              needs={!value && on > 0}
              onPick={(v) => {
                setGroupCategory(g, v)
                setExportGrades((cur) => ({ ...cur, [key]: v as Importance }))
              }}
            />
          )
        }
        if (colId === 'status') return <span className="text-xs text-label-2">완료 {doneCount}/{all.length}</span>
        if (colId === COL_ASSIGNEES)
          return (
            <div className="flex flex-wrap gap-1 py-1">
              {people.map((n) => (
                <Chip key={n} tone={PERSON_TONE}>
                  {n}
                </Chip>
              ))}
            </div>
          )
        if (colId === 'startDate') return <span className="text-label-2">{starts[0] ?? ''}</span>
        if (colId === 'doneDate') return <span className="text-label-2">{ends.length === all.length ? ends[ends.length - 1] : ''}</span>
        return null
      },
    }
  }

  // 하위 과제(묶음 안 L3)의 과제명: ㄴ 표시 + 묶음에서 빼기 아이콘
  function renderCell(row: WorkItem, col: GridColumn) {
    const dot = viewingMoved && moved!.ids.has(row.id) ? (
      <span className="ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-orange-500 align-middle" title="방금 옮겨 온 과제" />
    ) : null
    if (col.id === COL_NAME && !evalGroupOf(row) && dot)
      return (
        <div className="whitespace-pre-line break-words py-1.5 leading-snug">
          {row.name}
          {dot}
        </div>
      )
    if (col.id === COL_NAME && evalGroupOf(row)) {
      return (
        <div className="group/child flex items-start gap-1.5 py-1.5 pl-6 leading-snug">
          <CornerDownRight size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-label-3" />
          <span className="min-w-0 flex-1 whitespace-pre-line break-words">
            {row.name}
            {dot}
          </span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => ungroupRows([row.id])}
            title="묶음에서 빼기"
            className="shrink-0 rounded px-1 text-label-3 opacity-0 hover:bg-black/[0.07] hover:text-label group-hover/child:opacity-100"
          >
            <UngroupIcon />
          </button>
        </div>
      )
    }
    return renderWorkCell(row, col, members)
  }


  const visibleCols = board.columns.filter((c) => !c.hidden)
  // 평가과제 묶음 열은 앱이 쓰는 숨은 열이라 열 표시 목록·숨김 개수에서 뺀다.
  const hiddenCols = board.columns.filter((c) => c.hidden && c.id !== COL_EVAL_GROUP)
  const [hideNumbers, setHideNumbers] = useState(() => {
    try {
      return localStorage.getItem('work.hideNumbers') === '1'
    } catch {
      return false
    }
  })
  function toggleNumbers() {
    setHideNumbers((v) => {
      try {
        localStorage.setItem('work.hideNumbers', v ? '0' : '1')
      } catch {
        // 기억 못 해도 지금 화면에는 반영
      }
      return !v
    })
  }
  const memberNames = useMemo(() => members.filter((m) => m.active).map((m) => m.name), [members])

  const gridColumns: GridColumn[] = visibleCols.map((c) => ({
    id: c.id,
    label: c.label,
    type: c.type,
    width: c.width ?? 140,
    system: c.system,
    // 선택 칸은 모두 같은 칩 팝업으로 고른다. 상태·분류는 정해진 값만, 담당자는 여러 명 +
    // 목록에 없는 이름 입력, 그 밖의 선택형(속성·담당팀 등)은 한 개 + 입력.
    picker:
      c.id === 'status'
        ? { options: [...STATUS_OPTIONS], tone: toneFor('status') }
        : c.id === COL_CATEGORY
          ? { options: [...TASK_CATEGORY_OPTIONS], tone: toneFor(COL_CATEGORY) }
          : c.type === 'person'
            ? { options: memberNames, multi: true, allowNew: true, tone: toneFor(COL_ASSIGNEES) }
            : c.type === 'select'
              ? { options: optionsForColumn(board, c), allowNew: true, tone: toneFor(c.id) }
              : undefined,
  }))

  // 드롭다운 칸(상태·분류)에 목록에 없는 값이 들어오면(붙여넣기 등) 그 칸은 건너뛴다.
  function allowed(colId: string, text: string): boolean {
    if (text === '') return true
    if (colId === 'status') return (STATUS_OPTIONS as readonly string[]).includes(text)
    if (colId === COL_CATEGORY) return (TASK_CATEGORY_OPTIONS as string[]).includes(text)
    return true
  }

  function commit(edits: CellEdit[]) {
    const skipped = edits.filter((e) => !allowed(e.colId, e.text))
    if (skipped.length) {
      showToast(`상태는 ${STATUS_OPTIONS.join('/')}, 분류는 ${TASK_CATEGORY_OPTIONS.join('/')} 중에서만 넣을 수 있어 ${skipped.length}칸을 건너뛰었습니다.`)
      edits = edits.filter((e) => allowed(e.colId, e.text))
    }
    const byId = new Map(board.items.map((i) => [i.id, i]))
    const updates = new Map<string, WorkItem>()
    for (const e of edits) {
      const item = updates.get(e.rowId) ?? byId.get(e.rowId)
      if (!item) continue
      updates.set(e.rowId, applyDoneRule(setCellText(item, e.colId, e.text, members), e.colId, members))
    }
    apply(updateItems(board, updates))
  }

  function groupIndexOfView(viewIndex: number): number {
    if (viewIndex < viewRows.length) return groupItems.indexOf(viewRows[viewIndex])
    if (viewRows.length === 0) return groupItems.length
    return groupItems.indexOf(viewRows[viewRows.length - 1]) + 1
  }

  function insertRows(viewIndex: number, count: number) {
    if (!activeGroup) return
    const created = Array.from({ length: count }, () => newWorkItem(activeGroup.id))
    apply(insertItems(board, activeGroup.id, groupIndexOfView(viewIndex), created))
  }

  function paste(rowIndex: number, colIndex: number, matrix: string[][]) {
    if (!activeGroup) return
    let next = board
    const byId = new Map(board.items.map((i) => [i.id, i]))
    const updates = new Map<string, WorkItem>()
    const created: WorkItem[] = []
    matrix.forEach((line, i) => {
      const existing = viewRows[rowIndex + i]
      let item = existing ? updates.get(existing.id) ?? byId.get(existing.id)! : newWorkItem(activeGroup.id)
      line.forEach((text, j) => {
        const col = visibleCols[colIndex + j]
        if (col && allowed(col.id, text.trim())) item = applyDoneRule(setCellText(item, col.id, col.id === 'status' || col.id === COL_CATEGORY ? text.trim() : text, members), col.id, members)
      })
      if (existing) updates.set(existing.id, item)
      else created.push(item)
    })
    next = updateItems(next, updates)
    if (created.length) next = insertItems(next, activeGroup.id, groupItems.length, created)
    apply(next)
    if (created.length) showToast(`붙여넣기: 행 ${created.length}개를 새로 만들었습니다`, true)
  }

  function removeRows(ids: string[]) {
    apply(deleteItems(board, ids))
    showToast(`행 ${ids.length}개를 삭제했습니다`, true)
  }

  // 끌어 놓은 자리로 묶음 소속도 정한다(트리처럼): 어느 묶음의 하위 행들 사이면 그 묶음에
  // 들어가고, 최상위 자리(낱개 행 사이·묶음 머리 행 앞)면 묶음에서 빠진다. 내보낸 행은 소속 유지.
  function regroup(next: WorkBoard, ids: string[], target: string): WorkBoard {
    const set = new Set(ids)
    // 묶음 전체를 함께 옮기는 중이면(머리 행으로 고른 뒤 끌기 등) 그 묶음은 그대로 둔다.
    const whole = (g: string) => !!g && next.items.filter((i) => evalGroupOf(i) === g).every((i) => set.has(i.id))
    const change = next.items.filter((i) => set.has(i.id) && evalGroupOf(i) !== target && !whole(evalGroupOf(i)))
    if (change.length === 0) return next
    showToast(target ? `L3 ${change.length}건을 「${target}」 묶음으로 옮겼습니다.` : `L3 ${change.length}건을 묶음에서 뺐습니다.`, true)
    return setEvalGroup(next, change.map((i) => i.id), target, members)
  }

  function moveRows(ids: string[], viewTo: number) {
    if (!activeGroup) return
    const set = new Set(ids)
    let below: WorkItem | undefined
    for (let k = viewTo; k < viewRows.length; k++) {
      if (!set.has(viewRows[k].id)) {
        below = viewRows[k]
        break
      }
    }
    const target = below ? evalGroupOf(below) : ''
    apply(regroup(moveItems(board, activeGroup.id, ids, groupIndexOfView(viewTo)), ids, target))
  }

  // 묶음 머리 행 기준 이동: beforeId(보드 순서상 그 L3) 앞으로, null이면 맨 끝.
  // 묶음째 옮기는 게 아니면 최상위 자리이므로 묶음에서 뺀다.
  function moveRowsBefore(ids: string[], beforeId: string | null, wholeGroups: boolean) {
    if (!activeGroup || (beforeId && ids.includes(beforeId))) return
    const to = beforeId ? groupItems.findIndex((i) => i.id === beforeId) : groupItems.length
    const next = moveItems(board, activeGroup.id, ids, to < 0 ? groupItems.length : to)
    apply(wholeGroups ? next : regroup(next, ids, ''))
  }

  function boardColIndexOfVisible(visIndex: number): number {
    if (visIndex < visibleCols.length) return board.columns.indexOf(visibleCols[visIndex])
    return board.columns.length
  }

  function insertColumn(visIndex: number) {
    const { board: next, column } = addColumn(board, boardColIndexOfVisible(visIndex))
    apply(next)
    showToast(`"${column.label}" 열을 추가했습니다. 머리글을 두 번 눌러 이름을 바꾸세요.`)
  }

  function requestDeleteColumns(colIds: string[]) {
    const cols = board.columns.filter((c) => colIds.includes(c.id) && !c.system)
    if (cols.length === 0) {
      showToast('시트와 연결된 열은 지울 수 없습니다. 대신 숨길 수 있습니다.')
      return
    }
    const hasData = board.items.some((i) => cols.some((c) => i.fields[c.id]))
    if (hasData) setDeletingCols(cols)
    else apply(deleteColumns(board, cols.map((c) => c.id)))
  }

  // ---------- 요약 ----------
  const missingCount = groupItems.filter((i) => i.missingInSheet).length

  // 이 L2 과제에만 담당자로 있고 다른 데는 전혀 안 쓰이는 팀원(L2 삭제 때 함께 지울 후보).
  // 다른 L2 담당, 사람이 정한 평가 기여도·개인등급, 면담 기록, 피어리뷰가 하나라도 있으면 빼 둔다.
  function memberUsage(groupId: string): { member: TeamMember; reason: string | null }[] {
    const inGroup = new Set(board.items.filter((i) => i.groupId === groupId).flatMap((i) => i.assigneeIds))
    const elsewhere = new Set(board.items.filter((i) => i.groupId !== groupId).flatMap((i) => i.assigneeIds))
    const manualTasks = new Set(
      state.tasks.filter((t) => state.contributions.some((c) => c.taskId === t.id && !c.isAutoDistributed)).map((t) => t.id),
    )
    const reasonOf = (id: string): string | null => {
      if (elsewhere.has(id)) return '다른 L2 과제 담당'
      if (state.contributions.some((c) => c.memberId === id && ((manualTasks.has(c.taskId) && c.contributionPercent > 0) || c.personalPerformanceGrade)))
        return '평가 기여도·등급 있음'
      if (state.meetingNotes.some((n) => n.memberId === id)) return '면담 기록 있음'
      if (
        state.peerReviews.some((r) => r.targetMemberId === id || r.reviewerMemberId === id) ||
        state.rankReviews.some((r) => r.targetMemberId === id || r.reviewerMemberId === id) ||
        state.taskPeerReviews.some((r) => r.targetMemberId === id || r.reviewerMemberId === id)
      )
        return '피어리뷰 있음'
      return null
    }
    return members.filter((m) => inGroup.has(m.id)).map((m) => ({ member: m, reason: reasonOf(m.id) }))
  }
  function orphanMembersOf(groupId: string) {
    return memberUsage(groupId)
      .filter((u) => !u.reason)
      .map((u) => u.member)
  }
  const deleteUsage = deletingGroup ? memberUsage(deletingGroup.id) : []
  const deleteCandidates = deletingGroup ? orphanMembersOf(deletingGroup.id) : []

  function openDeleteGroup(g: TaskGroup) {
    setRemoveMemberIds(new Set())
    setDeletingGroup(g)
  }

  // ---------- 빈 화면 ----------
  if (board.groups.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h2 className="text-xl font-bold text-label">과제관리</h2>
        <p className="mt-2 text-sm leading-relaxed text-label-2">
          회사 과제관리 구글시트에서 필요한 L2만 골라 가져오거나, L2를 직접 만들어 시작하세요.
          <br />
          L2는 탭으로, 그 아래 L3 과제는 표로 편집합니다.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="primary" onClick={onOpenSheetImport}>구글시트에서 가져오기</Button>
          <Button variant="secondary" onClick={handleAddGroup}>
            L2 직접 만들기
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* L2 탭 + 오른쪽 끝 시트 연결. 아래 선은 inset 그림자라 활성 탭(흰 배경)이 덮는다. */}
      <div className="flex items-end shadow-[inset_0_-1px_0_#E3E3E8]">
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {board.groups.map((g, idx) => {
          const on = g.id === activeGroup?.id
          const count = itemsOfGroup(board, g.id).length
          return (
            <div
              key={g.id}
              draggable={renamingGroup !== g.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                setDragTab({ id: g.id, over: null })
              }}
              onDragOver={(e) => {
                if (!dragTab) return
                e.preventDefault()
                setDragTab({ ...dragTab, over: idx })
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragTab && dragTab.id !== g.id) apply(moveGroup(board, dragTab.id, idx))
                setDragTab(null)
              }}
              onDragEnd={() => setDragTab(null)}
              data-l2-tab={g.id}
              onClick={() => setActiveGroupId(g.id)}
              onDoubleClick={() => setRenamingGroup(g.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setTabMenu({ x: e.clientX, y: e.clientY, groupId: g.id })
              }}
              className={`group relative flex max-w-[280px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-[9px] border px-3.5 py-2 text-sm transition-colors ${
                on
                  ? 'border-[#E3E3E8] border-b-white bg-white font-semibold text-label'
                  : 'border-transparent bg-black/[0.04] font-medium text-label-2 hover:bg-black/[0.07] hover:text-label'
              } ${dragTab?.over === idx && dragTab.id !== g.id ? 'shadow-[inset_3px_0_0_#F97316]' : ''} ${
                rowDropTab === g.id ? '!border-orange-400 !bg-orange-50 ring-2 ring-orange-300' : ''
              }`}
              title={[g.h, g.l1, g.name].filter(Boolean).join(' › ')}
            >
              {renamingGroup === g.id ? (
                <input
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  defaultValue={g.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== g.name) apply(updateGroup(board, g.id, { name: v }))
                    setRenamingGroup(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenamingGroup(null)
                  }}
                  className="w-48 rounded border border-accent px-1 py-0.5 text-sm font-medium outline-none"
                />
              ) : (
                <>
                  {g.tag && <span className="shrink-0 rounded bg-label/85 px-1.5 text-[11px] font-semibold leading-5 text-white">{g.tag}</span>}
                  <span className="truncate">{g.name}</span>
                  <span className={`shrink-0 text-xs tabular-nums ${on ? 'text-label-3' : 'text-label-3'}`}>{count}</span>
                  {!on && moved?.groupId === g.id && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" title="옮겨 온 과제가 있습니다" />}
                  <button
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      openDeleteGroup(g)
                    }}
                    title="이 L2 삭제(과제관리에서만, 구글시트는 그대로)"
                    className={`-mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-label-3 hover:bg-black/[0.07] hover:text-label ${
                      on ? '' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </>
              )}
            </div>
          )
        })}
        <button
          onClick={handleAddGroup}
          title="그룹(L2) 추가"
          className="shrink-0 rounded-t-[9px] px-3 py-2 text-sm font-semibold text-label-3 hover:bg-black/[0.05] hover:text-label"
        >
          <span className="flex items-center gap-1"><Plus {...icSm} />그룹 추가</span>
        </button>
      </div>
      {board.sheetLink && (
        <div className="flex shrink-0 items-center gap-1.5 pb-1.5 pl-3 text-xs text-label-2">
          {board.sheetLink.spreadsheetId ? (
            <a
              href={withGoogleAccount(sheetUrl(board.sheetLink.spreadsheetId, board.sheetLink.gid))}
              target="_blank"
              rel="noreferrer"
              title="구글시트에서 열기"
              className="flex max-w-[200px] items-center gap-1.5 rounded-control px-1 py-0.5 font-medium hover:bg-black/[0.05] hover:text-label"
            >
              <SheetsIcon className="h-4 w-3.5 shrink-0" />
              <span className="truncate">{board.sheetLink.tabName}</span>
            </a>
          ) : (
            <span className="flex max-w-[200px] items-center gap-1.5 font-medium" title="엑셀 파일에서 가져옴">
              <SheetsIcon className="h-4 w-3.5 shrink-0" />
              <span className="truncate">{board.sheetLink.tabName}</span>
            </span>
          )}
          <span className="whitespace-nowrap rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-label-2">{timeAgo(board.sheetLink.lastFetchedAt)}</span>
          <span className="group/reload relative">
            <button
              onClick={onOpenSheetImport}
              aria-label="다시 가져오기"
              className="flex h-7 w-7 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-accent"
            >
              <RotateCw {...icSm} />
            </button>
            <span className="pointer-events-none absolute right-0 top-full z-40 mt-1 whitespace-nowrap rounded-control bg-label/90 px-2 py-1 text-[11px] text-white backdrop-blur opacity-0 shadow transition-opacity group-hover/reload:opacity-100">
              다시 가져오기
            </span>
          </span>
        </div>
      )}
      </div>

      {activeGroup && (
        <>
          {/* 정보 줄: 위치(H › L1), 제목 + 시트 연결 */}
          <div className="min-w-0">
            <p className="truncate text-xs text-label-2">
              {[activeGroup.h, activeGroup.l1].filter(Boolean).join(' › ') || 'H·L1 없음'}
              {activeGroup.hierarchyInferred && (
                <span className="ml-1.5 text-orange-500" title="시트에서 병합 셀이 끊겨 비어 있던 H/L1을 위 행 값으로 채웠습니다. 시트에서 확인해 주세요.">
                  (추정)
                </span>
              )}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="truncate text-[17px] font-semibold text-label">{activeGroup.name}</h2>
              {missingCount > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700" title="지난 가져오기 때 시트에서 찾지 못한 행입니다. 지우지 않고 표시만 합니다.">
                  시트에 없음 {missingCount}
                </span>
              )}
            </div>
          </div>

          {/* 도구 줄 -- 체크한 행이 있으면 선택 동작 줄로 바뀐다 */}
          {checkedFree.length > 0 ? (
            <div className="flex min-h-[40px] flex-wrap items-center gap-2 rounded-card bg-accent-soft px-3 py-1.5">
              <span className="text-sm font-semibold text-label">{checkedFree.length}건 선택</span>
              <span className="text-xs text-label-2">→ 평가과제 {units.length}개</span>
              <span className="mx-1 h-4 w-px bg-gray-300" />
              <Button variant="secondary" onClick={() => groupRows(checkedFree.map((i) => i.id))} disabled={checkedFree.length < 2} className="h-8 px-3 text-xs">
                평가과제로 묶기
              </Button>
              <Button
                variant="secondary"
                onClick={() => ungroupRows(checkedFree.map((i) => i.id))}
                disabled={!checkedFree.some((i) => evalGroupOf(i))}
                className="h-8 px-3 text-xs"
              >
                묶음 풀기
              </Button>
              <Button variant="primary" onClick={exportChecked} disabled={!canExport} className="h-8 px-3 text-xs">
                평가과제로 내보내기
              </Button>
              {needGrade.length > 0 && (
                <span className="text-xs text-orange-700">
                  과제등급을 정해야 내보낼 수 있어요 {needGrade.length}개 -- 묶음은 머리 행에서, 낱개 L3는 분류 칸에서 고르세요
                </span>
              )}
              <button onClick={() => setChecked(new Set())} className="ml-auto rounded-control px-2 py-1 text-xs text-label-2 hover:bg-white hover:text-label">
                선택 해제
              </button>
            </div>
          ) : (
          <div className="flex min-h-[40px] flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이 L2에서 찾기"
              className="h-8 w-60 rounded-control border border-hairline bg-white px-2.5 text-[13px]"
            />
            {filtered && <span className="text-xs text-label-2">{viewRows.length}건 · 찾는 중에는 행 이동이 꺼집니다</span>}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={undo}
                disabled={undoStack.current.length === 0}
                title="되돌리기 (⌘Z)"
                className="flex h-8 w-8 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label disabled:text-label-3/60 disabled:hover:bg-transparent"
              >
                <Undo2 {...ic} />
              </button>
              <button
                onClick={redo}
                disabled={redoStack.current.length === 0}
                title="다시 하기 (⌘⇧Z)"
                className="flex h-8 w-8 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label disabled:text-label-3/60 disabled:hover:bg-transparent"
              >
                <Redo2 {...ic} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setColMenuOpen((v) => !v)}
                  title={`표시할 열 고르기${hiddenCols.length > 0 ? ` (숨김 ${hiddenCols.length})` : ''}`}
                  aria-label="열 표시 설정"
                  className={`flex h-8 w-8 items-center justify-center rounded-control hover:bg-black/[0.05] hover:text-label ${colMenuOpen ? 'bg-black/[0.05] text-label' : 'text-label-2'}`}
                >
                  <Settings2 {...ic} />
                </button>
                {colMenuOpen && (
                  <div className="mac-pop absolute right-0 top-9 z-30 max-h-96 w-60 overflow-y-auto py-1 text-[13px]">
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-black/[0.04]">
                      <input type="checkbox" checked={!hideNumbers} onChange={toggleNumbers} />
                      <span className="truncate">번호</span>
                    </label>
                    <div className="mac-menu-sep" />
                    {board.columns.filter((c) => c.id !== COL_EVAL_GROUP).map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-black/[0.04]">
                        <input
                          type="checkbox"
                          checked={!c.hidden}
                          disabled={c.id === 'name'}
                          onChange={() => apply(updateColumn(board, c.id, { hidden: !c.hidden }))}
                        />
                        <span className="truncate">{c.label}</span>
                        {!c.system && <span className="ml-auto text-[11px] text-label-3">추가</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          <DataGrid
            rowActions={(ids) => {
              const free = board.items.filter((i) => ids.includes(i.id) && !exportedIds.has(i.id))
              const taken = ids.length - free.length
              const grouped = board.items.filter((i) => ids.includes(i.id) && evalGroupOf(i))
              return [
                {
                  label: `평가과제로 묶기 (${free.length}건)`,
                  hint: taken > 0 ? `내보낸 ${taken}건 제외` : undefined,
                  disabled: free.length < 2,
                  onClick: () => groupRows(ids),
                },
                { label: '묶음 풀기', disabled: grouped.length === 0, onClick: () => ungroupRows(ids) },
              ]
            }}
            groupHeaders={(anchor) => (headerAt.get(anchor) ?? []).map((g) => groupHeader(g))}
            check={{
              isChecked: (row) => checked.has(row.id),
              isDisabled: (row) => exportedIds.has(row.id),
              title: (row) => (exportedIds.has(row.id) ? `이미 내보냄: ${linkedTasks.get(row.id)!.join(', ')}` : '평가과제로 내보낼 행'),
              onToggle: toggleCheck,
            }}
            columns={gridColumns}
            rows={viewRows}
            getText={(row, colId) => getCellText(row, colId, members)}
            renderCell={renderCell}
            rowNumber={(row) => numbers.get(row.id)}
            hideNumbers={hideNumbers}
            rowClassName={(row) =>
              viewingMoved && moved!.bg && moved!.ids.has(row.id)
                ? 'bg-orange-50'
                : row.missingInSheet
                  ? 'bg-orange-50/50 text-label-2'
                  : evalGroupOf(row)
                    ? 'bg-[#F5F5F7]'
                    : ''
            }
            rowMarker={(row) => (
              <>
                {row.missingInSheet && (
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" title="시트에 없음 -- 지난 가져오기 때 시트에서 찾지 못했습니다" />
                )}
              </>
            )}
            onCommit={commit}
            onPaste={paste}
            onInsertRows={insertRows}
            onDeleteRows={removeRows}
            onMoveRows={filtered ? undefined : moveRows}
            onMoveRowsBefore={filtered ? undefined : moveRowsBefore}
            onRowDragOutside={rowDragOutside}
            onInsertColumn={insertColumn}
            onDeleteColumns={requestDeleteColumns}
            onHideColumns={(ids) => {
              let next = board
              for (const id of ids) if (id !== 'name') next = updateColumn(next, id, { hidden: true })
              apply(next)
              showToast('열을 숨겼습니다. "열 표시"에서 다시 켤 수 있습니다.')
            }}
            onRenameColumn={(id, label) => apply(updateColumn(board, id, { label }))}
            onResizeColumn={(id, width) => apply(updateColumn(board, id, { width }))}
            onMoveColumns={(ids, visTo) => apply(moveColumns(board, ids, boardColIndexOfVisible(visTo)))}
            onUndo={undo}
            onRedo={redo}
            storageKey="work"
            addRowLabel="과제 추가"
            emptyText={filtered ? '찾는 내용이 없습니다.' : '아직 과제가 없습니다. 아래 "＋ 과제 추가"를 누르거나 엑셀에서 복사해 붙여넣으세요.'}
          />
          <p className="text-xs text-label-3">
            여러 행 선택 후 우클릭 → 평가과제로 묶기 · 체크 후 평가과제로 내보내기 · 묶음 이름은 두 번 눌러 바꾸기 · 칸을 누르고 바로 입력 · Enter로 이어서 편집 · ⌘V로 엑셀/시트 붙여넣기 · 행을 끌어서 이동(다른 그룹 탭에 놓으면 그 그룹으로)
          </p>
        </>
      )}

      {tabMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="mac-pop fixed z-50 min-w-[190px] py-1"
          style={{ left: tabMenu.x, top: tabMenu.y }}
        >
          {(() => {
            const idx = board.groups.findIndex((g) => g.id === tabMenu.groupId)
            const g = board.groups[idx]
            if (!g) return null
            const item = (label: string, onClick: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) => (
              <button
                disabled={opts.disabled}
                onClick={() => {
                  onClick()
                  setTabMenu(null)
                }}
                className={`mac-menu-item ${opts.danger ? 'mac-menu-item-danger' : ''}`}
              >
                {label}
              </button>
            )
            return (
              <>
                {item('이름 바꾸기', () => setRenamingGroup(g.id))}
                {item('왼쪽으로 이동', () => apply(moveGroup(board, g.id, idx - 1)), { disabled: idx === 0 })}
                {item('오른쪽으로 이동', () => apply(moveGroup(board, g.id, idx + 1)), { disabled: idx === board.groups.length - 1 })}
                <div className="my-1 h-px bg-black/[0.05]" />
                {item('L2 삭제', () => openDeleteGroup(g), { danger: true })}
              </>
            )
          })()}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-label/90 px-4 py-2 text-[13px] text-white shadow-pop backdrop-blur-xl">
          {toast.text}
          {toast.undo && (
            <button
              onClick={() => {
                undo()
                setToast(null)
              }}
              className="font-bold text-[#7CA8FF] hover:underline"
            >
              되돌리기
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deletingGroup !== null}
        title={deletingGroup ? `${deletingGroup.name} 과제 삭제` : ''}
        confirmLabel={(() => {
          const n = deleteCandidates.filter((m) => removeMemberIds.has(m.id)).length
          return n > 0 ? `과제와 팀원 ${n}명 삭제` : '과제 삭제'
        })()}
        message={
          deletingGroup
            ? [
                `「${deletingGroup.name}」과 그 아래 L3 ${itemsOfGroup(board, deletingGroup.id).length}건을 이 앱의 과제관리에서 지웁니다.`,
                '구글시트 원본은 바뀌지 않습니다.',
                ...(deletingGroup.source === 'sheet' ? ['시트 가져오기 선택 목록에서도 빠지므로, 다시 가져와도 되살아나지 않습니다(가져오기에서 다시 고르면 됩니다).'] : []),
                '바로 뒤라면 되돌리기(⌘Z)로 살릴 수 있습니다.',
              ].join('\n')
            : ''
        }
        onConfirm={() => {
          if (deletingGroup) {
            apply(deleteGroup(board, deletingGroup.id))
            const ids = deleteCandidates.filter((m) => removeMemberIds.has(m.id)).map((m) => m.id)
            for (const id of ids) dispatch({ type: 'DELETE_MEMBER', payload: { id } })
            if (ids.length) showToast(`과제와 팀원 ${ids.length}명을 삭제했습니다. 팀원 삭제는 되돌리기로 살아나지 않습니다.`)
          }
          setDeletingGroup(null)
        }}
        onCancel={() => setDeletingGroup(null)}
      >
        {deleteUsage.length > 0 && (
          <div className="mt-4 rounded-card bg-black/[0.03] p-3 text-[13px]">
            <p className="font-semibold text-label">팀원도 함께 삭제 <span className="font-normal text-label-2">(선택)</span></p>
            {deleteCandidates.length > 0 ? (
              <>
                <p className="mt-0.5 text-xs text-label-2">이 L2에만 담당자로 있는 팀원입니다. 체크한 팀원만 팀원 목록에서 지웁니다(되돌리기 불가).</p>
                <div className="mt-2 space-y-1">
                  {deleteCandidates.length > 1 && (
                    <label className="flex cursor-pointer items-center gap-2 border-b border-separator pb-1 text-xs text-label-2">
                      <input
                        type="checkbox"
                        checked={deleteCandidates.every((m) => removeMemberIds.has(m.id))}
                        onChange={(e) => setRemoveMemberIds(e.target.checked ? new Set(deleteCandidates.map((m) => m.id)) : new Set())}
                        className="h-4 w-4 accent-[#DC2626]"
                      />
                      모두 선택
                    </label>
                  )}
                  {deleteCandidates.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={removeMemberIds.has(m.id)}
                        onChange={() =>
                          setRemoveMemberIds((cur) => {
                            const next = new Set(cur)
                            if (next.has(m.id)) next.delete(m.id)
                            else next.add(m.id)
                            return next
                          })
                        }
                        className="h-4 w-4 accent-[#DC2626]"
                      />
                      <span className="text-label">{m.name}</span>
                      <span className="text-xs text-label-3">
                        담당 L3 {board.items.filter((i) => i.groupId === deletingGroup!.id && i.assigneeIds.includes(m.id)).length}건
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-0.5 text-xs text-label-2">이 L2에만 있는 팀원이 없어 팀원 목록은 그대로 둡니다.</p>
            )}
            {deleteUsage.some((u) => u.reason) && (
              <div className="mt-2 space-y-0.5 text-xs text-label-2">
                <p className="font-medium text-label-2">그대로 남는 팀원</p>
                {Array.from(new Set(deleteUsage.map((u) => u.reason).filter(Boolean))).map((reason) => (
                  <p key={reason}>
                    <span className="text-label-3">{reason}:</span>{' '}
                    {deleteUsage
                      .filter((u) => u.reason === reason)
                      .map((u) => u.member.name)
                      .join(', ')}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={deletingCols !== null}
        title="열 삭제"
        message={deletingCols ? `「${deletingCols.map((c) => c.label).join('」, 「')}」 열에 입력된 값도 함께 지워집니다.` : ''}
        onConfirm={() => {
          if (deletingCols) apply(deleteColumns(board, deletingCols.map((c) => c.id)))
          setDeletingCols(null)
        }}
        onCancel={() => setDeletingCols(null)}
      />
    </div>
  )
}

// 뱃지는 모두 같은 모양(CHIP_BASE)이고 색만 다르다. 선택 팝업의 칩도 같은 색을 쓴다.
const TONES: Record<string, Record<string, string>> = {
  [COL_CATEGORY]: { 과제: 'bg-violet-100 text-violet-800', 일반: 'bg-slate-100 text-slate-700', 일상: 'bg-stone-100 text-stone-600' },
  status: { 대기: 'bg-black/[0.05] text-label-2', 진행중: 'bg-accent-soft text-accent', 완료: 'bg-emerald-100 text-emerald-800', 중단: 'bg-red-100 text-red-700' },
}
const PERSON_TONE = 'bg-sky-50 text-sky-800'
const UNKNOWN_TONE = 'border border-dashed border-label-3 bg-white text-label-2'
const DEFAULT_TONE = 'bg-black/[0.05] text-label'

// 평가과제 묶음 색: 이름으로 고정(같은 묶음은 어디서나 같은 색).
const GROUP_TONES = [
  'bg-amber-100 text-amber-900',
  'bg-teal-100 text-teal-900',
  'bg-pink-100 text-pink-900',
  'bg-indigo-100 text-indigo-900',
  'bg-lime-100 text-lime-900',
  'bg-cyan-100 text-cyan-900',
  'bg-orange-100 text-orange-900',
  'bg-fuchsia-100 text-fuchsia-900',
]
export function evalGroupTone(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return GROUP_TONES[h % GROUP_TONES.length]
}

function toneFor(colId: string) {
  return (value: string, known: boolean): string => {
    if (colId === COL_EVAL_GROUP) return evalGroupTone(value)
    if (colId === COL_ASSIGNEES) return known ? PERSON_TONE : UNKNOWN_TONE
    return TONES[colId]?.[value] ?? DEFAULT_TONE
  }
}

// 묶음 머리 행의 분류: 개별 과제 칸과 같은 모양(칩 + ▾)과 같은 칩 목록. 고르면 하위 과제 전체에 적용.
function GroupCategoryPicker({ value, needs, onPick }: { value: string; needs: boolean; onPick: (v: string) => void }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos])
  const tone = toneFor(COL_CATEGORY)
  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={(e) => {
          e.stopPropagation()
          const r = btnRef.current!.getBoundingClientRect()
          setPos(pos ? null : { left: r.left, top: r.bottom + 4 })
        }}
        title="고르면 하위 과제 전체의 분류가 바뀝니다"
        className={`flex w-full items-center justify-between gap-1 rounded-control py-0.5 ${needs ? 'ring-2 ring-orange-300' : ''}`}
      >
        {value ? <Chip tone={tone(value, true)}>{value}</Chip> : <span className="text-[13px] text-label-3">분류 선택</span>}
        <ChevronDown {...icSm} className="shrink-0 text-label-3" />
      </button>
      {pos &&
        createPortal(
          <div onMouseDown={(e) => e.stopPropagation()} className="mac-pop fixed z-[60] flex gap-1.5 p-2.5" style={{ left: pos.left, top: pos.top }}>
            {TASK_CATEGORY_OPTIONS.map((o) => (
              <button
                key={o}
                onClick={() => {
                  onPick(o)
                  setPos(null)
                }}
                className={`${CHIP_BASE} cursor-pointer transition-colors ${o === value ? tone(o, true) : CHIP_IDLE}`}
              >
                {o}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

function UngroupIcon() {
  return <Ungroup {...icSm} />
}

function Chip({ tone, title, children }: { tone: string; title?: string; children: React.ReactNode }) {
  return (
    <span className={`${CHIP_BASE} ${tone}`} title={title}>
      {children}
    </span>
  )
}

function renderWorkCell(row: WorkItem, col: GridColumn, members: { id: string; name: string }[]) {
  if (col.id === COL_ASSIGNEES) {
    const byId = new Map(members.map((m) => [m.id, m.name]))
    const names = row.assigneeIds.map((id) => byId.get(id)).filter(Boolean) as string[]
    if (names.length === 0 && row.unmatchedAssignees.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1 py-1">
        {names.map((n) => (
          <Chip key={n} tone={PERSON_TONE}>
            {n}
          </Chip>
        ))}
        {row.unmatchedAssignees.map((n) => (
          <Chip key={n} tone={UNKNOWN_TONE} title="팀원 목록에 없는 이름입니다. 팀원관리에서 추가하면 자동으로 연결됩니다.">
            {n}
          </Chip>
        ))}
      </div>
    )
  }
  if (col.id === COL_CATEGORY) {
    if (row.category) return <Chip tone={toneFor(COL_CATEGORY)(row.category, true)}>{row.category}</Chip>
    if (row.categoryRaw)
      return (
        <Chip tone="bg-orange-50 text-orange-700" title="과제/일반/일상이 아닌 값입니다. 시트 원문을 그대로 보여 줍니다.">
          {row.categoryRaw}
        </Chip>
      )
    return null
  }
  if (col.picker && !col.picker.multi) {
    const v = row.fields[col.id]
    if (!v) return null
    return <Chip tone={toneFor(col.id)(v, true)}>{v}</Chip>
  }
  if (col.type === 'link') {
    const v = row.fields[col.id]
    if (!v) return null
    const href = /^https?:\/\//.test(v) ? v : null
    return (
      <div className="flex items-center gap-1 truncate">
        <span className="truncate text-accent">{v}</span>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" onMouseDown={(e) => e.stopPropagation()} className="shrink-0 text-label-3 hover:text-accent" title="새 탭에서 열기">
            ↗
          </a>
        )}
      </div>
    )
  }
  if (col.type === 'date') {
    const v = row.fields[col.id]
    if (!v) return null
    return <span className="tabular-nums">{v}</span>
  }
  return undefined
}

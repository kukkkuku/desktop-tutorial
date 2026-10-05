// 과제관리: 위쪽 L2 탭(일정표 빌더의 폴더 탭 모양), 아래쪽 그 L2의 L3 표.
// 모든 편집은 utils/workBoard.ts의 순수 함수로 새 보드를 만들어
// SET_WORK_BOARD로 넣고, 되돌리기는 보드 스냅샷 스택으로 한다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppState } from '../../state/AppContext'
import type { ColumnDef, Importance, Task, TaskGroup, TeamMember, WorkBoard, WorkItem } from '../../types'
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
import { evalUnits, unitGrade, unitKeyOf } from '../../utils/evalReconcile'
import { v4 as uuidv4 } from 'uuid'
import { fetchSheetTab, fetchSpreadsheetTabs, sheetUrl } from '../../utils/sheetSources'
import { applySheetImport, columnMapFromNames, fillMerges, filterRows, parseHeader, parseRows, yearFromTitle } from '../../utils/sheetImport'
import SheetLinkChip from '../SheetLinkChip'
import SheetsIcon from '../SheetsIcon'
import PopMenu from '../ui/PopMenu'
import { GoalCell, GradeCell, PeriodCell } from './EvalCells'
import { useTabFit } from '../../hooks/useTabFit'
import { readProgressSource } from '../../utils/progressImport'
import { SHEET_ADMIN_ONLY, useCanManageSheets } from '../../hooks/useSheetManager'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { useAccessData } from '../../hooks/useAccessData'
import type { AccessUser } from '../../utils/accessSheet'
import { effectiveTeam, sameTeam } from '../../utils/memberTeam'
import { withGoogleAccount } from '../../utils/googleDrive'
import { ChartGantt, ChevronDown, ChevronRight, CornerDownRight, Download, Plus, Settings2, Redo2, Undo2, Ungroup, Upload, X } from 'lucide-react'
import { ic, icSm, ListChevronsDownUp, ListChevronsUpDown } from '../ui/icon'
import DataGrid, { CHIP_BASE, CHIP_IDLE, type CellEdit, type GridColumn, type GroupHeaderRow } from '../grid/DataGrid'
import Button from '../Button'
import IconButton from '../IconButton'
import ConfirmDialog from '../ConfirmDialog'

const HISTORY_LIMIT = 60

interface WorkStageProps {
  onOpenSheetImport: (url?: string, source?: 'sheet' | 'progress' | 'xlsx') => void
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

// 과제관리 표에만 있는 가상 열(보드 열이 아님): 성과등급 · 시작일/완료일(두 줄) · 목표/성과(두 줄)
const V_GRADE = '__grade'
const V_PERIOD = '__period'
const V_GOAL = '__goal'
const V_L2 = '__l2' // 평가 대상만 보기에서 그 줄의 그룹(L2)
const isVirtual = (id: string) => id.startsWith('__')

export default function WorkStage({ onOpenSheetImport }: WorkStageProps) {
  const { state, dispatch, workspaceId } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const { data: accessData } = useAccessData(false)
  const accessUsers = accessData?.users
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

  // 새로고침: 지난번 가져오기 설정(탭·열 매칭·고른 L2) 그대로 시트를 다시 읽어 합친다.
  // 엑셀로 가져온 경우나 읽다 막히면 가져오기 화면을 연다.
  const [reloading, setReloading] = useState(false)
  async function reloadFromSheet() {
    const link = board.sheetLink
    if (!link?.spreadsheetId) {
      onOpenSheetImport()
      return
    }
    setReloading(true)
    try {
      const [info, raw] = await Promise.all([fetchSpreadsheetTabs(link.spreadsheetId), fetchSheetTab(link.spreadsheetId, link.tabName)])
      const filled = fillMerges(raw.rows, raw.merges)
      const header = parseHeader(filled)
      if (!header) throw new Error('헤더를 찾지 못했습니다')
      const rows = filterRows(parseRows(filled, header, columnMapFromNames(header, link.columnMap)), link.selectedGroups, link.teamFilter)
      const res = applySheetImport(board, rows, header, state.members, { ...link, fileTitle: info.title, lastFetchedAt: new Date().toISOString() }, yearFromTitle(raw.title) ?? currentWorkspace?.evaluationYear ?? null)
      dispatch({ type: 'SET_WORK_BOARD', payload: res.board })
      showToast(`시트에서 다시 불러왔습니다 · 추가 ${res.added} · 갱신 ${res.updated}${res.missing ? ` · 시트에 없음 ${res.missing}` : ''}`)
    } catch {
      onOpenSheetImport()
    } finally {
      setReloading(false)
    }
  }

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
  // 브라우저 탭처럼 줄어드는 L2 탭 줄(좁으면 개수를 숨기고 여백을 줄임)
  // 연결 시트의 파일 이름: 예전에 가져와 이름이 없으면 과제 입력에 불러 둔 같은 시트의 이름을 쓰고, 보드에도 적어 둔다
  const linkFileTitle = useMemo(() => {
    const l = board.sheetLink
    if (!l) return ''
    if (l.fileTitle) return l.fileTitle
    const p = readProgressSource()?.data
    return p && l.spreadsheetId && p.spreadsheetId === l.spreadsheetId ? (p.fileTitle ?? '') : ''
  }, [board.sheetLink])
  useEffect(() => {
    if (board.sheetLink && !board.sheetLink.fileTitle && linkFileTitle)
      dispatch({ type: 'SET_WORK_BOARD', payload: { ...board, sheetLink: { ...board.sheetLink, fileTitle: linkFileTitle } } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkFileTitle])
  const canManageSheets = useCanManageSheets() // 시트 연결을 바꾸는 것은 팀장 · 관리자만(팀원은 새로고침만)
  const tabStripRef = useRef<HTMLDivElement>(null)
  const tabsCompact = useTabFit(tabStripRef, board.groups.length + 1, 130)
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
  // 묶음 이름을 그 자리에서 고치는 중인 평가과제 묶음
  const [renamingEval, setRenamingEval] = useState<string | null>(null)
  // L3 id -> 그 L3가 들어간 평가 과제 이름들
  const linkedTasks = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const t of state.tasks) for (const id of t.workItemIds ?? []) m.set(id, [...(m.get(id) ?? []), t.name])
    return m
  }, [state.tasks])
  // 평가 대상 = 평가과제가 가리키는 L3(묶음은 통째로). 체크하면 바로 평가과제가 생기고, 끄면 지워진다.
  const targetIds = useMemo(() => new Set(linkedTasks.keys()), [linkedTasks])
  // L3 id -> 그 L3의 평가과제(성과등급 · 목표 · 성과를 이 표에서 넣는다 -- 예전 평가하기 · 과제별)
  const taskOfItem = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of state.tasks) for (const id of t.workItemIds ?? []) if (!m.has(id)) m.set(id, t)
    return m
  }, [state.tasks])
  const gradeUsed = state.criteria.performanceGradeWeight > 0
  const targetTaskCount = state.tasks.filter((t) => t.workItemIds?.length).length
  // 평가 대상이 늘면 「평가 대상만 보기」를 잠깐 강조한다(넣은 과제를 모아 볼 수 있는 곳)
  const [evalFlash, setEvalFlash] = useState(false)
  const prevTargetCount = useRef(targetTaskCount)
  useEffect(() => {
    const grew = targetTaskCount > prevTargetCount.current
    prevTargetCount.current = targetTaskCount
    if (!grew) return
    setEvalFlash(true)
    const t = window.setTimeout(() => setEvalFlash(false), 1600)
    return () => window.clearTimeout(t)
  }, [targetTaskCount])
  // 방금 평가 대상으로 넣은 과제: 그 줄(낱개면 성과등급 칸)을 고르고 성과등급 목록을 바로 연다
  const [openGradeTask, setOpenGradeTask] = useState<string | null>(null)
  const clearOpenGrade = useCallback(() => setOpenGradeTask(null), [])
  const [selectReq, setSelectReq] = useState<{ rowId: string; colId: string; token: number } | null>(null)
  function updateTask(t: Task) {
    dispatch({ type: 'UPDATE_TASK', payload: t })
  }
  // 평가 칸: 평가 대상인 줄(묶음은 머리 행)만. 대상이 아니면 "—"
  function gradeCell(t: Task | undefined) {
    if (!t) return <span className="text-label-3">—</span>
    return (
      <GradeCell
        value={t.performanceGrade}
        muted={!gradeUsed}
        onPick={(v) => updateTask({ ...t, performanceGrade: v })}
        autoOpen={openGradeTask === t.id}
        onAutoOpened={clearOpenGrade}
      />
    )
  }
  function goalCell(t: Task | undefined) {
    if (!t) return <span className="text-label-3">—</span>
    return <GoalCell objective={t.objective} achievement={t.achievement} onSave={(objective, achievement) => updateTask({ ...t, objective, achievement })} />
  }
  // 과제등급(분류)이 안 정해진 단위를 평가 대상으로 켤 때 등급을 묻는다
  // 입력한 내용이 있는 평가과제를 평가 대상에서 뺄 때 확인
  const [untarget, setUntarget] = useState<{ taskIds: string[]; names: string[] } | null>(null)

  // 단위의 과제등급: 묶음은 묶음 분류(없으면 하위가 모두 같을 때), 낱개는 그 L3 분류
  function gradeOfUnit(u: { key: string; name: string; items: WorkItem[] }): Importance | null {
    const stored = u.key.startsWith('g:') ? board.evalGroupGrades?.[u.name] : undefined
    return stored && (IMPORTANCE_OPTIONS as readonly string[]).includes(stored) ? (stored as Importance) : unitGrade(u.items)
  }
  function unitsOfRows(rows: WorkItem[]) {
    const all = evalUnits(board.items, board.evalGroupGrades)
    const keys = Array.from(new Set(rows.map(unitKeyOf)))
    return keys.map((k) => all.get(k)).filter((u): u is NonNullable<typeof u> => !!u)
  }

  // 분류가 섞였거나 빈 단위의 과제등급: 하위 분류 중 가장 높은 것(과제 > 일반 > 일상), 하나도 없으면 「일반」.
  // 예전에는 체크할 때마다 「과제등급 고르기」 창을 띄웠다 -- 이제 바로 넣고, 바꾸려면 분류 칸에서 고친다(L3 분류는 건드리지 않음).
  function fallbackGrade(items: WorkItem[]): Importance {
    const cats = new Set(items.map((i) => i.category))
    return IMPORTANCE_OPTIONS.find((g) => cats.has(g as WorkItem['category'])) ?? '일반'
  }

  function createTargets(list: { key: string; name: string; items: WorkItem[] }[]) {
    const guessed = list.filter((u) => !gradeOfUnit(u))
    // 분류가 빈 낱개 L3는 분류 칸이 곧 과제등급이라 그 칸에도 넣어 보이게 한다(묶음은 머리 줄 분류가 과제등급을 보여 준다)
    const updates = new Map<string, WorkItem>()
    for (const u of guessed) if (!u.key.startsWith('g:')) for (const i of u.items) if (!i.category) updates.set(i.id, setCellText(i, COL_CATEGORY, fallbackGrade(u.items), members))
    if (updates.size) apply(updateItems(board, updates))
    const tasks = list.map((u) => ({
      id: uuidv4(),
      name: u.name,
      importance: gradeOfUnit(u) ?? fallbackGrade(u.items),
      performanceGrade: null,
      workload: '중' as const,
      objective: '',
      achievement: '',
      workItemIds: u.items.map((i) => i.id),
    }))
    const participants = Object.fromEntries(tasks.map((t, k) => [t.id, Array.from(new Set(list[k].items.flatMap((i) => i.assigneeIds)))]))
    dispatch({ type: 'ADD_TASKS_FROM_WORK', payload: { tasks, participants } })
    if (tasks.length === 1) {
      setOpenGradeTask(tasks[0].id)
      if (!list[0].key.startsWith('g:')) setSelectReq({ rowId: list[0].items[0].id, colId: V_GRADE, token: Date.now() })
    }
    const head =
      tasks.length === 1
        ? `「${tasks[0].name}」을(를) 평가 대상으로 넣었습니다.`
        : `평가과제 ${tasks.length}개를 평가 대상으로 넣었습니다.`
    const guessedGrades = Array.from(new Set(guessed.map((u) => fallbackGrade(u.items))))
    showToast(
      guessed.length > 0
        ? `${head} 분류가 섞였거나 빈 ${guessed.length}개는 「${guessedGrades.join(' · ')}」(으)로 넣었습니다 -- 분류 칸에서 바꿀 수 있습니다.`
        : tasks.length === 1
          ? `${head} 이 줄에서 성과등급 · 목표 · 성과를 넣으세요.`
          : head,
    )
  }

  function removeTargets(taskIds: string[]) {
    for (const id of taskIds) dispatch({ type: 'DELETE_TASK', payload: { id } })
    showToast(`평가과제 ${taskIds.length}개를 평가 대상에서 뺐습니다.`)
  }

  function toggleTarget(rows: WorkItem[], on: boolean) {
    const units = unitsOfRows(rows)
    if (on) {
      const fresh = units.filter((u) => !u.items.some((i) => targetIds.has(i.id)))
      if (!fresh.length) return
      createTargets(fresh)
      return
    }
    const ids = new Set(units.flatMap((u) => u.items.map((i) => i.id)))
    const tasks = state.tasks.filter((t) => t.workItemIds?.some((id) => ids.has(id)))
    if (!tasks.length) return
    const filled = tasks.filter(
      (t) =>
        t.performanceGrade ||
        t.objective.trim() ||
        t.achievement.trim() ||
        state.contributions.some((c) => c.taskId === t.id && (c.personalPerformanceGrade || c.personalGradeNote)) ||
        state.taskPeerReviews.some((r) => r.taskId === t.id),
    )
    if (filled.length) setUntarget({ taskIds: tasks.map((t) => t.id), names: filled.map((t) => t.name) })
    else removeTargets(tasks.map((t) => t.id))
  }

  // 우클릭 → 평가과제로 묶기: 고른 행 중 이미 묶음이 하나 있으면 그 묶음에 합치고, 없으면 새 이름.
  function groupRows(ids: string[]) {
    const free = board.items.filter((i) => ids.includes(i.id))
    if (free.length < 2) return
    const targets = new Set(free.filter((i) => targetIds.has(i.id)).map(unitKeyOf)).size
    const existing = Array.from(new Set(free.map(evalGroupOf).filter(Boolean)))
    const name = existing.length === 1 ? existing[0] : newEvalGroupName(board, free)
    apply(setEvalGroup(board, free.map((i) => i.id), name, members))
    showToast(
      targets > 1
        ? `L3 ${free.length}건을 「${name}」로 묶었습니다. 평가과제 ${targets}개가 하나로 합쳐졌습니다(목표 · 성과는 이어 붙임).`
        : `L3 ${free.length}건을 「${name}」로 묶었습니다. 위 묶음 이름을 눌러 바꿀 수 있습니다.`,
      true,
    )
  }

  function ungroupRows(ids: string[]) {
    // 평가 대상 묶음을 풀면 평가과제도 L3별로 나뉜다(등급 · 목표는 L3가 가장 많이 남은 쪽에 남음).
    const free = board.items.filter((i) => ids.includes(i.id) && evalGroupOf(i))
    if (free.length === 0) return
    apply(setEvalGroup(board, free.map((i) => i.id), '', members))
    showToast(`L3 ${free.length}건을 묶음에서 뺐습니다.`, true)
  }

  function renameGroup(from: string, to: string) {
    setRenamingEval(null)
    const v = to.trim()
    if (!v || v === from) return
    // 평가 대상 묶음이면 평가과제 이름도 따라 바뀐다(utils/evalReconcile.ts)
    apply(renameEvalGroup(board, from, v, members))
  }

  // 묶음 머리 행에서 분류를 고르면 하위 과제 전부의 분류를 바꾼다. 평가 대상이면 과제등급도 따라 바뀐다.
  // 묶음 분류를 정하고, 하위는 기본으로 따라가게 모두 같은 값으로(하위는 그 뒤 따로 바꿀 수 있음)
  function setGroupCategory(g: string, value: string) {
    if (!value) return
    const ids = new Set(board.items.filter((i) => evalGroupOf(i) === g).map((i) => i.id))
    apply({
      ...board,
      items: board.items.map((i) => (ids.has(i.id) ? setCellText(i, COL_CATEGORY, value, members) : i)),
      evalGroupGrades: { ...(board.evalGroupGrades ?? {}), [g]: value },
    })
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

  // 평가 대상만 보기: 모든 그룹(L2) 탭의 평가 대상(묶음은 통째로)을 한 표에 모은다 -- 성과등급 · 목표/성과를 한꺼번에 매길 때.
  // 켜 있는 동안 행 추가 · 옮기기는 끈다(그룹 탭 안에서만 하는 일).
  // 처음에는 꺼져 있다(과제관리는 그룹 탭 보기부터)
  const [evalOnly, setEvalOnly] = useState(false)
  const sourceItems = useMemo(() => {
    if (!evalOnly) return groupItems
    const order = new Map(board.groups.map((g, k) => [g.id, k]))
    const targetBundles = new Set(board.items.filter((i) => targetIds.has(i.id)).map(evalGroupOf).filter(Boolean))
    return board.items
      .map((i, k) => ({ i, k }))
      .filter(({ i }) => targetIds.has(i.id) || (evalGroupOf(i) && targetBundles.has(evalGroupOf(i))))
      .sort((a, b) => (order.get(a.i.groupId) ?? 0) - (order.get(b.i.groupId) ?? 0) || a.k - b.k)
      .map(({ i }) => i)
  }, [evalOnly, groupItems, board.items, board.groups, targetIds])
  // 지금 보기(그룹 탭 또는 평가 대상만)에 있는 묶음 이름들 -- 일괄 접기 · 펴기
  const bundleNames = useMemo(() => Array.from(new Set(sourceItems.map(evalGroupOf).filter(Boolean))), [sourceItems])
  const groupNameOf = (id: string) => board.groups.find((g) => g.id === id)?.name ?? ''

  // 평가과제 묶음은 첫 행 자리에 모아 보여 주고, 묶음마다 머리 행을 붙인다(접을 수 있음).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { viewRows, headerAt, numbers, ranges } = useMemo(() => {
    const gathered: WorkItem[] = []
    const done = new Set<string>()
    for (const i of sourceItems) {
      if (done.has(i.id)) continue
      const g = evalGroupOf(i)
      const block = g ? sourceItems.filter((x) => evalGroupOf(x) === g) : [i]
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
  }, [sourceItems, search, board.columns, members, collapsed])
  const filtered = search.trim() !== '' || evalOnly

  function groupHeader(g: string): GroupHeaderRow {
    const all = board.items.filter((i) => evalGroupOf(i) === g)
    const here = sourceItems.filter((i) => evalGroupOf(i) === g)
    const isTarget = all.some((i) => targetIds.has(i.id))
    const isOpen = !collapsed.has(g)
    // 묶음 분류: 정해 둔 값 → (평가 대상이면) 평가과제 과제등급 → 하위가 모두 같을 때 그 값. 하위 하나를 바꿔도 비지 않는다
    const linkedTask = all.map((i) => taskOfItem.get(i.id)).find(Boolean)
    const fixedGrade =
      board.evalGroupGrades?.[g] ?? linkedTask?.importance ?? (new Set(all.map((i) => i.category)).size === 1 ? (all[0]?.category ?? null) : null)
    const key = `g:${g}`
    const taskNames = Array.from(new Set(all.flatMap((i) => linkedTasks.get(i.id) ?? [])))
    const doneCount = all.filter((i) => i.fields.status === '완료').length
    const starts = all.map((i) => i.fields.startDate).filter(Boolean).sort()
    const ends = all.map((i) => i.fields.doneDate).filter(Boolean).sort()
    const byId = new Map(members.map((m) => [m.id, m.name]))
    // 묶음 담당자: 팀원(실선)과 팀원 목록에 없는 이름(점선)을 나눠 보여 준다
    const people = Array.from(new Set(all.flatMap((i) => i.assigneeIds.map((id) => byId.get(id) ?? '')).filter(Boolean)))
    const strangers = Array.from(new Set(all.flatMap((i) => i.unmatchedAssignees).filter((n) => n && !people.includes(n))))
    const memberByName = new Map(members.map((m) => [m.name, m]))
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
        checked: isTarget,
        title: isTarget ? `평가 대상: ${taskNames.join(', ')} -- 끄면 평가과제에서 빠집니다` : '평가 대상으로 넣기(묶음이 평가과제 하나가 됩니다)',
        onChange: (v) => toggleTarget(all, v),
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
              <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/gh:opacity-100">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => ungroupRows(here.map((i) => i.id))}
                  title={isTarget ? '묶음 풀기(하위 과제를 모두 낱개로 · 평가과제도 L3별로 나뉨)' : '묶음 풀기(하위 과제를 모두 낱개로)'}
                  className="rounded px-1.5 text-label-2 hover:bg-black/[0.07] hover:text-label"
                >
                  <UngroupIcon />
                </button>
              </span>
            </div>
          )
        if (colId === COL_CATEGORY) {
          const value = fixedGrade ?? ''
          return <GroupCategoryPicker value={value} needs={!value && isTarget} onPick={(v) => setGroupCategory(g, v)} />
        }
        if (colId === 'status') return <span className="text-xs text-label-2">완료 {doneCount}/{all.length}</span>
        if (colId === COL_ASSIGNEES)
          return (
            <div className="flex flex-wrap gap-1 py-1">
              {people.map((n) => {
                const c = personChip(memberByName.get(n), currentWorkspace?.teamName ?? '', accessUsers)
                return (
                  <Chip key={n} tone={c.tone} title={c.title}>
                    {n}
                  </Chip>
                )
              })}
              {strangers.map((n) => (
                <Chip key={n} tone={UNKNOWN_TONE} title="팀원 목록에 없는 이름입니다. 팀원관리에서 추가하면 자동으로 연결됩니다.">
                  {n}
                </Chip>
              ))}
            </div>
          )
        if (colId === V_GRADE) return gradeCell(isTarget ? taskOfItem.get(all.find((i) => taskOfItem.has(i.id))?.id ?? '') : undefined)
        if (colId === V_GOAL) return goalCell(isTarget ? taskOfItem.get(all.find((i) => taskOfItem.has(i.id))?.id ?? '') : undefined)
        if (colId === V_L2) return <span className="text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">{groupNameOf(all[0]?.groupId ?? '')}</span>
        if (colId === V_PERIOD) return <PeriodCell start={starts[0] ?? ''} done={ends.length === all.length ? ends[ends.length - 1] : ''} />
        if (colId === 'startDate') return <span className="text-label-2">{starts[0] ?? ''}</span>
        if (colId === 'doneDate') return <span className="text-label-2">{ends.length === all.length ? ends[ends.length - 1] : ''}</span>
        return null
      },
    }
  }

  // 하위 과제(묶음 안 L3)의 과제명: ㄴ 표시 + 묶음에서 빼기 아이콘
  function renderCell(row: WorkItem, col: GridColumn) {
    if (col.id === V_L2) return evalGroupOf(row) ? <span /> : <span className="text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">{groupNameOf(row.groupId)}</span>
    if (col.id === V_GRADE || col.id === V_GOAL) {
      if (evalGroupOf(row)) return <span /> // 묶음 안 L3는 머리 행에서
      const t = taskOfItem.get(row.id)
      return col.id === V_GRADE ? gradeCell(t) : goalCell(t)
    }
    if (col.id === V_PERIOD)
      return (
        <PeriodCell
          start={row.fields.startDate ?? ''}
          done={row.fields.doneDate ?? ''}
          onSave={(start, done) =>
            commit([
              { rowId: row.id, colId: 'startDate', text: start },
              { rowId: row.id, colId: 'doneDate', text: done },
            ])
          }
        />
      )
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
    return renderWorkCell(row, col, members, currentWorkspace?.teamName ?? '', accessUsers)
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

  const baseColumns: GridColumn[] = visibleCols.map((c) => ({
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
            ? {
                options: memberNames,
                multi: true,
                allowNew: true,
                tone: (v: string) => personChip(members.find((m) => m.name === v), currentWorkspace?.teamName ?? '', accessUsers).tone,
              }
            : c.type === 'select'
              ? { options: optionsForColumn(board, c), allowNew: true, tone: toneFor(c.id) }
              : undefined,
  }))
  // 보이는 열 + 평가 칸(앱이 그리는 가상 열): 분류 뒤 성과등급, 시작일 · 완료일은 한 칸 두 줄, 맨 끝 목표/성과 두 줄.
  // 가상 열은 보드 열(board.columns)에 없으니 붙여넣기 · 열 추가/이동은 visIndexOfGrid로 실제 열 자리로 바꾼다.
  const [vWidths, setVWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('work.vwidths') ?? '{}')
    } catch {
      return {}
    }
  })
  function resizeVirtual(id: string, width: number) {
    const next = { ...vWidths, [id]: width }
    setVWidths(next)
    try {
      localStorage.setItem('work.vwidths', JSON.stringify(next))
    } catch {
      // 기억 못 해도 지금 화면에는 반영
    }
  }
  const mergedDates = visibleCols.some((c) => c.id === 'startDate') && visibleCols.some((c) => c.id === 'doneDate')
  const gridColumns: GridColumn[] = (() => {
    const out: GridColumn[] = []
    const grade: GridColumn = { id: V_GRADE, label: '성과등급', type: 'text', width: vWidths[V_GRADE] ?? 88, system: true, readOnly: true }
    for (const g of baseColumns) {
      if (mergedDates && g.id === 'doneDate') continue
      if (mergedDates && g.id === 'startDate') {
        out.push({ id: V_PERIOD, label: '시작일', sub: '완료일', type: 'text', width: vWidths[V_PERIOD] ?? 112, system: true, readOnly: true })
        continue
      }
      out.push(g)
      if (g.id === COL_CATEGORY) out.push(grade)
    }
    if (!out.includes(grade)) out.splice(Math.max(0, out.findIndex((g) => g.id === COL_NAME)) + 1, 0, grade)
    if (evalOnly) out.unshift({ id: V_L2, label: '그룹(L2)', type: 'text', width: vWidths[V_L2] ?? 150, system: true, readOnly: true })
    out.push({ id: V_GOAL, label: '목표', sub: '성과', type: 'text', width: vWidths[V_GOAL] ?? 260, system: true, readOnly: true })
    return out
  })()
  // 표의 열 자리(가상 열 포함) → 보이는 보드 열 자리. 시작일/완료일 칸은 실제 열 두 개.
  function visIndexOfGrid(gi: number): number {
    let n = 0
    for (let k = 0; k < gi && k < gridColumns.length; k++) {
      const id = gridColumns[k].id
      if (id === V_PERIOD) n += 2
      else if (!isVirtual(id)) n += 1
    }
    return n
  }
  // 가상 열 id → 실제 보드 열 id(시작일/완료일 칸 = 두 열, 평가 칸은 없음)
  const realColIds = (ids: string[]) => ids.flatMap((id) => (id === V_PERIOD ? ['startDate', 'doneDate'] : isVirtual(id) ? [] : [id]))

  // 드롭다운 칸(상태·분류)에 목록에 없는 값이 들어오면(붙여넣기 등) 그 칸은 건너뛴다.
  function allowed(colId: string, text: string): boolean {
    if (text === '') return true
    if (colId === 'status') return (STATUS_OPTIONS as readonly string[]).includes(text)
    if (colId === COL_CATEGORY) return (TASK_CATEGORY_OPTIONS as string[]).includes(text)
    return true
  }

  function commit(edits: CellEdit[]) {
    edits = edits.filter((e) => !isVirtual(e.colId))
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
      if (!existing && evalOnly) return // 평가 대상만 보기에서는 새 줄을 만들지 않는다
      let item = existing ? updates.get(existing.id) ?? byId.get(existing.id)! : newWorkItem(activeGroup.id)
      line.forEach((text, j) => {
        const gcol = gridColumns[colIndex + j]
        const col = gcol && !isVirtual(gcol.id) ? visibleCols.find((c) => c.id === gcol.id) : undefined
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
          과제 입력의 추진현황이나 회사 과제관리 구글시트에서 필요한 L2만 골라 가져오거나, L2를 직접 만들어 시작하세요.
          <br />
          L2는 탭으로, 그 아래 L3 과제는 표로 편집합니다.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="primary" onClick={() => onOpenSheetImport(undefined, 'progress')}>
            추진현황에서 가져오기
          </Button>
          {canManageSheets && (
            <Button variant="secondary" onClick={() => onOpenSheetImport(undefined, 'sheet')}>
              구글시트에서 가져오기
            </Button>
          )}
          {canManageSheets && (
            <Button variant="secondary" onClick={() => onOpenSheetImport(undefined, 'xlsx')}>
              엑셀 파일에서 가져오기
            </Button>
          )}
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
      {/* 브라우저 탭처럼: 폭이 모자라면 탭이 함께 줄고 이름은 말줄임(가려지거나 옆으로 밀리지 않게) */}
      <div ref={tabStripRef} className="flex min-w-0 flex-1 items-end gap-1 overflow-hidden pt-1">
        {board.groups.map((g, idx) => {
          const on = !evalOnly && g.id === activeGroup?.id
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
              onClick={() => {
                setActiveGroupId(g.id)
                if (evalOnly) setEvalOnly(false) // 그룹 탭을 누르면 그 탭 보기로
              }}
              onDoubleClick={() => setRenamingGroup(g.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setTabMenu({ x: e.clientX, y: e.clientY, groupId: g.id })
              }}
              className={`group relative flex min-w-[44px] max-w-[280px] flex-[0_1_auto] cursor-pointer select-none items-center overflow-hidden rounded-t-[9px] border py-2 text-sm transition-colors ${
                tabsCompact ? 'gap-1 px-2' : 'gap-1.5 px-3.5'
              } ${
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
                  {g.tag && !tabsCompact && <span className="shrink-0 rounded bg-label/85 px-1.5 text-[length:calc(12px*var(--ui-fs,1))] font-semibold leading-5 text-white">{g.tag}</span>}
                  <span className="min-w-0 truncate break-all">{g.name}</span>
                  {!tabsCompact && <span className="shrink-0 text-xs tabular-nums text-label-3">{count}</span>}
                  {!on && moved?.groupId === g.id && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" title="옮겨 온 과제가 있습니다" />}
                  <button
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      openDeleteGroup(g)
                    }}
                    title="이 L2 삭제(과제관리에서만, 구글시트는 그대로)"
                    className={`-mr-1.5 h-5 w-5 shrink-0 items-center justify-center rounded text-label-3 hover:bg-black/[0.07] hover:text-label ${
                      on ? 'flex' : 'hidden group-hover:flex'
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
      {/* 가져오기(예전 빠른 시작의 가져오기 탭들): 추진현황에서 · 구글시트 · 엑셀(관리자) */}
      <div className="shrink-0 pb-1.5 pl-2">
        <PopMenu label={<span className="flex items-center gap-1"><Download {...icSm} />가져오기</span>} title="과제 가져오기 -- 추진현황 · 구글시트 · 엑셀에서 그룹(L2)을 골라">
          <p className="px-3.5 pb-1 pt-1 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-3">과제 가져오기</p>
          <button onClick={() => onOpenSheetImport(undefined, 'progress')} className="mac-menu-item">
            <ChartGantt {...icSm} className="shrink-0" />추진현황에서
            <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] font-normal text-label-3">과제 입력</span>
          </button>
          {canManageSheets && (
            <button onClick={() => onOpenSheetImport(undefined, 'sheet')} className="mac-menu-item">
              <SheetsIcon className="h-3.5 w-3.5 shrink-0" />구글시트에서
            </button>
          )}
          {canManageSheets && (
            <button onClick={() => onOpenSheetImport(undefined, 'xlsx')} className="mac-menu-item">
              <Upload {...icSm} className="shrink-0" />엑셀 파일에서
              <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] font-normal text-label-3">xlsx</span>
            </button>
          )}
        </PopMenu>
      </div>
      {board.sheetLink && (
        <div className="pb-1.5 pl-3">
          <SheetLinkChip
            label={linkFileTitle || board.sheetLink.tabName}
            sub={linkFileTitle ? board.sheetLink.tabName : undefined}
            meta={<span className="whitespace-nowrap rounded-full bg-black/[0.05] px-2 py-0.5 text-[length:calc(12px*var(--ui-fs,1))] text-label-2">{timeAgo(board.sheetLink.lastFetchedAt)}</span>}
            currentUrl={board.sheetLink.spreadsheetId ? sheetUrl(board.sheetLink.spreadsheetId, board.sheetLink.gid) : null}
            openUrl={board.sheetLink.spreadsheetId ? withGoogleAccount(sheetUrl(board.sheetLink.spreadsheetId, board.sheetLink.gid)) : null}
            note={!canManageSheets ? SHEET_ADMIN_ONLY : board.sheetLink.spreadsheetId ? '다른 시트 링크를 넣고 연결하면 가져오기 화면에서 그 시트를 바로 읽습니다.' : '엑셀 파일에서 가져왔습니다. 구글시트 링크를 넣으면 시트와 연결합니다.'}
            onConnect={canManageSheets ? (url) => onOpenSheetImport(url) : undefined}
            onReload={() => void reloadFromSheet()}
            reloading={reloading}
          />
        </div>
      )}
      </div>

      {activeGroup && (
        <>
          {/* 정보 줄 한 줄: H › L1 › L2(제목은 굵고 크게) */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span className={`shrink-0 text-xs text-label-2 ${evalOnly ? 'hidden' : ''}`}>
              {[activeGroup.h, activeGroup.l1].filter(Boolean).join(' › ') || 'H·L1 없음'}
              {activeGroup.hierarchyInferred && (
                <span className="ml-1.5 text-orange-500" title="시트에서 병합 셀이 끊겨 비어 있던 H/L1을 위 행 값으로 채웠습니다. 시트에서 확인해 주세요.">
                  (추정)
                </span>
              )}
            </span>
            {!evalOnly && <span className="text-xs text-label-3">›</span>}
            <h2 className="min-w-0 truncate text-[length:calc(17px*var(--ui-fs,1))] font-semibold text-label">{evalOnly ? '평가 대상 · 모든 그룹' : activeGroup.name}</h2>
            {missingCount > 0 && (
              <span
                className="ml-1.5 self-center rounded-full bg-orange-100 px-2 py-0.5 text-[length:calc(12px*var(--ui-fs,1))] font-bold text-orange-700"
                title="지난 가져오기 때 시트에서 찾지 못한 행입니다. 지우지 않고 표시만 합니다."
              >
                시트에 없음 {missingCount}
              </span>
            )}
          </div>

          {/* 도구 줄 */}
          <div className="flex min-h-[40px] flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={evalOnly ? '평가 대상에서 찾기' : '이 L2에서 찾기'}
              className="h-8 w-60 rounded-control border border-hairline bg-white px-2.5 text-[length:calc(14px*var(--ui-fs,1))]"
            />
            <label
              className={`flex h-8 cursor-pointer select-none items-center gap-2 rounded-control border px-2.5 text-[length:calc(14px*var(--ui-fs,1))] transition-shadow duration-300 ${evalOnly ? 'border-accent bg-accent-soft font-medium text-accent' : targetTaskCount > 0 ? 'border-accent/40 text-label hover:bg-accent-soft' : 'border-hairline text-label-2 hover:text-label'} ${evalFlash ? 'shadow-[0_0_0_4px_rgba(37,99,235,0.25)]' : ''}`}
              title="모든 그룹(L2) 탭의 평가 대상만 한 표에 모아 성과등급 · 목표/성과를 매깁니다"
            >
              <input type="checkbox" checked={evalOnly} onChange={(e) => setEvalOnly(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
              평가 대상만 보기
              {targetTaskCount > 0 && (
                <span className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${evalOnly ? 'bg-accent text-white' : 'bg-accent-soft text-accent'}`}>{targetTaskCount}</span>
              )}
            </label>
            {/* 묶음 일괄 접기 · 펴기 토글(지금 보이는 묶음 전부): 펼친 게 있으면 모두 접기, 다 접혀 있으면 모두 펴기 */}
            {bundleNames.length > 0 &&
              (() => {
                const allFolded = bundleNames.every((n) => collapsed.has(n))
                const label = allFolded ? '묶음 모두 펴기' : '묶음 모두 접기'
                return (
                  <IconButton onClick={() => setCollapsed(allFolded ? new Set() : new Set(bundleNames))} title={label} aria-label={label}>
                    {allFolded ? <ListChevronsUpDown {...ic} /> : <ListChevronsDownUp {...ic} />}
                  </IconButton>
                )
              })()}
            {filtered && !evalOnly && <span className="text-xs text-label-2">{viewRows.length}건 · 찾는 중에는 행 이동이 꺼집니다</span>}
            {evalOnly && <span className="text-xs text-label-2">모든 그룹의 평가 대상 · 행 추가 · 옮기기는 그룹 탭에서</span>}
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
                  <div className="mac-pop absolute right-0 top-9 z-30 max-h-96 w-60 overflow-y-auto py-1 text-[length:calc(14px*var(--ui-fs,1))]">
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
                        {!c.system && <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] text-label-3">추가</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DataGrid
            selectCell={selectReq}
            rowActions={(ids) => {
              const free = board.items.filter((i) => ids.includes(i.id))
              const merging = new Set(free.filter((i) => targetIds.has(i.id)).map(unitKeyOf)).size
              const grouped = board.items.filter((i) => ids.includes(i.id) && evalGroupOf(i))
              return [
                {
                  label: `평가과제로 묶기 (${free.length}건)`,
                  hint: merging > 1 ? `평가과제 ${merging}개가 하나로 합쳐짐` : undefined,
                  disabled: free.length < 2,
                  onClick: () => groupRows(ids),
                },
                { label: '묶음 풀기', disabled: grouped.length === 0, onClick: () => ungroupRows(ids) },
              ]
            }}
            groupHeaders={(anchor) => (headerAt.get(anchor) ?? []).map((g) => groupHeader(g))}
            check={{
              isChecked: (row) => targetIds.has(row.id),
              title: (row) =>
                targetIds.has(row.id)
                  ? `평가 대상: ${linkedTasks.get(row.id)!.join(', ')} -- 끄면 평가과제에서 빠집니다`
                  : evalGroupOf(row)
                    ? '평가 대상으로 넣기(묶음 전체가 평가과제 하나)'
                    : '평가 대상으로 넣기(이 L3가 평가과제 하나)',
              headerTitle: '평가 대상',
              onToggle: toggleTarget,
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
            onInsertRows={evalOnly ? undefined : insertRows}
            onDeleteRows={removeRows}
            onMoveRows={filtered ? undefined : moveRows}
            onMoveRowsBefore={filtered ? undefined : moveRowsBefore}
            onRowDragOutside={evalOnly ? undefined : rowDragOutside}
            onInsertColumn={(gi) => insertColumn(visIndexOfGrid(gi))}
            onDeleteColumns={(ids) => requestDeleteColumns(realColIds(ids))}
            onHideColumns={(ids) => {
              let next = board
              for (const id of realColIds(ids)) if (id !== 'name') next = updateColumn(next, id, { hidden: true })
              apply(next)
              showToast('열을 숨겼습니다. "열 표시"에서 다시 켤 수 있습니다.')
            }}
            onRenameColumn={(id, label) => !isVirtual(id) && apply(updateColumn(board, id, { label }))}
            onResizeColumn={(id, width) => (isVirtual(id) ? resizeVirtual(id, width) : apply(updateColumn(board, id, { width })))}
            onMoveColumns={(ids, gridTo) => {
              const real = realColIds(ids)
              if (real.length) apply(moveColumns(board, real, boardColIndexOfVisible(visIndexOfGrid(gridTo))))
            }}
            onUndo={undo}
            onRedo={redo}
            storageKey="work"
            addRowLabel="과제 추가"
            emptyText={evalOnly && !search.trim() ? '평가 대상이 없습니다. "평가 대상만 보기"를 끄고 그룹 탭에서 왼쪽 체크로 넣으세요.' : filtered ? '찾는 내용이 없습니다.' : '아직 과제가 없습니다. 아래 "＋ 과제 추가"를 누르거나 엑셀에서 복사해 붙여넣으세요.'}
          />
          <p className="text-xs text-label-3">
            왼쪽 체크 = 평가 대상(체크하면 바로 평가과제가 생김 · 그 줄에서 성과등급 · 목표/성과 입력) · 여러 행 선택 후 우클릭 → 평가과제로 묶기 · 묶음 이름은 두 번 눌러 바꾸기 · 칸을 누르고 바로 입력 · Enter로 이어서 편집 · ⌘V로 엑셀/시트 붙여넣기 · 행을 끌어서 이동(다른 그룹 탭에 놓으면 그 그룹으로)
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
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-label/90 px-4 py-2 text-[length:calc(14px*var(--ui-fs,1))] text-white shadow-pop backdrop-blur-xl">
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
        open={untarget !== null}
        title="평가 대상에서 빼기"
        confirmLabel="빼기"
        message={
          untarget
            ? `${untarget.names
                .map((n) => `「${n}」`)
                .slice(0, 3)
                .join(
                  ', ',
                )}${untarget.names.length > 3 ? ` 외 ${untarget.names.length - 3}개` : ''}에 입력한 성과등급 · 목표 · 성과 · 개인등급 · 피어리뷰가 함께 지워집니다.\n과제리스트의 L3는 그대로 남습니다.`
            : ''
        }
        onConfirm={() => {
          if (untarget) removeTargets(untarget.taskIds)
          setUntarget(null)
        }}
        onCancel={() => setUntarget(null)}
      />

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
          <div className="mt-4 rounded-card bg-black/[0.03] p-3 text-[length:calc(14px*var(--ui-fs,1))]">
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
  status: { 대기: 'bg-white text-label-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]', 진행중: 'bg-emerald-100 text-emerald-800', 완료: 'bg-black/[0.06] text-label-2', 중단: 'bg-red-100 text-red-700', 보류: 'bg-red-100 text-red-700', 지연: 'bg-red-100 text-red-700' },
}
const PERSON_TONE = 'bg-sky-50 text-sky-800'
const UNKNOWN_TONE = 'border border-dashed border-label-3 bg-white text-label-2'
// 담당자 칩: 목록에 없는 사람 · 비활성 · 우리 팀이 아닌 사람은 점선. 팀은 팀원관리에 보이는 값(권한 시트 팀 → 없으면 평가에 저장된 팀)으로 본다
function personChip(m: TeamMember | undefined, teamName: string, users?: AccessUser[]): { tone: string; title?: string } {
  if (!m) return { tone: UNKNOWN_TONE, title: '팀원 목록에 없는 이름입니다. 팀원관리에서 추가하면 자동으로 연결됩니다.' }
  if (!m.active) return { tone: UNKNOWN_TONE, title: '비활성 팀원(팀원관리에서 끔)' }
  const t = effectiveTeam(m, users)
  if (t && teamName && !sameTeam(t, teamName)) return { tone: UNKNOWN_TONE, title: `우리 팀이 아님: ${t}` }
  return { tone: PERSON_TONE }
}
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
        {value ? <Chip tone={tone(value, true)}>{value}</Chip> : <span className="whitespace-nowrap text-[length:calc(14px*var(--ui-fs,1))] text-label-3">분류 선택</span>}
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

function renderWorkCell(row: WorkItem, col: GridColumn, members: TeamMember[], teamName = '', users?: AccessUser[]) {
  if (col.id === COL_ASSIGNEES) {
    const byId = new Map(members.map((m) => [m.id, m]))
    const people = row.assigneeIds.map((id) => byId.get(id)).filter(Boolean) as TeamMember[]
    if (people.length === 0 && row.unmatchedAssignees.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1 py-1">
        {people.map((m) => {
          const c = personChip(m, teamName, users)
          return (
            <Chip key={m.id} tone={c.tone} title={c.title}>
              {m.name}
            </Chip>
          )
        })}
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

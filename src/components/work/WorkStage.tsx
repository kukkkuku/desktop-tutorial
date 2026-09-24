// 과제관리: 위쪽 L2 탭(일정표 빌더의 폴더 탭 모양), 아래쪽 그 L2의 L3 표.
// 모든 편집은 utils/workBoard.ts의 순수 함수로 새 보드를 만들어
// SET_WORK_BOARD로 넣고, 되돌리기는 보드 스냅샷 스택으로 한다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppState } from '../../state/AppContext'
import type { ColumnDef, TaskGroup, WorkBoard, WorkItem } from '../../types'
import {
  COL_ASSIGNEES,
  COL_CATEGORY,
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
  newWorkItem,
  optionsForColumn,
  setCellText,
  updateColumn,
  updateGroup,
  updateItems,
} from '../../utils/workBoard'
import DataGrid, { type CellEdit, type GridColumn } from '../grid/DataGrid'
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
  const [dragTab, setDragTab] = useState<{ id: string; over: number | null } | null>(null)

  useEffect(() => {
    if (!tabMenu) return
    const close = () => setTabMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [tabMenu])

  function handleAddGroup() {
    const { board: next, group } = addGroup(board, `새 L2 ${board.groups.length + 1}`)
    apply(next)
    setActiveGroupId(group.id)
    setRenamingGroup(group.id)
  }

  // ---------- 표 ----------
  const [search, setSearch] = useState('')
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [deletingCols, setDeletingCols] = useState<ColumnDef[] | null>(null)

  const groupItems = useMemo(() => (activeGroup ? itemsOfGroup(board, activeGroup.id) : []), [board, activeGroup])
  const viewRows = useMemo(() => {
    const q = search.trim()
    if (!q) return groupItems
    return groupItems.filter((i) => board.columns.some((c) => getCellText(i, c.id, members).includes(q)))
  }, [groupItems, search, board.columns, members])
  const filtered = search.trim() !== ''

  const visibleCols = board.columns.filter((c) => !c.hidden)
  const hiddenCols = board.columns.filter((c) => c.hidden)
  const memberNames = useMemo(() => members.filter((m) => m.active).map((m) => m.name), [members])

  const gridColumns: GridColumn[] = visibleCols.map((c) => ({
    id: c.id,
    label: c.label,
    type: c.type,
    width: c.width ?? 140,
    system: c.system,
    suggestions: c.type === 'select' ? optionsForColumn(board, c) : c.type === 'person' ? memberNames : undefined,
  }))

  function commit(edits: CellEdit[]) {
    const byId = new Map(board.items.map((i) => [i.id, i]))
    const updates = new Map<string, WorkItem>()
    for (const e of edits) {
      const item = updates.get(e.rowId) ?? byId.get(e.rowId)
      if (!item) continue
      updates.set(e.rowId, setCellText(item, e.colId, e.text, members))
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
        if (col) item = setCellText(item, col.id, text, members)
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

  function moveRows(ids: string[], viewTo: number) {
    if (!activeGroup) return
    apply(moveItems(board, activeGroup.id, ids, groupIndexOfView(viewTo)))
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
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of groupItems) {
      const s = i.fields.status || '상태 없음'
      m.set(s, (m.get(s) ?? 0) + 1)
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [groupItems])
  const missingCount = groupItems.filter((i) => i.missingInSheet).length

  // ---------- 빈 화면 ----------
  if (board.groups.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h2 className="text-xl font-bold text-black">과제관리</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          회사 과제관리 구글시트에서 필요한 L2만 골라 가져오거나, L2를 직접 만들어 시작하세요.
          <br />
          L2는 탭으로, 그 아래 L3 과제는 표로 편집합니다.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={onOpenSheetImport}>구글시트에서 가져오기</Button>
          <Button variant="secondary" onClick={handleAddGroup}>
            L2 직접 만들기
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* L2 탭 */}
      <div className="flex items-end gap-1 overflow-x-auto border-b border-[#D6DAE0] pt-1">
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
              onClick={() => setActiveGroupId(g.id)}
              onDoubleClick={() => setRenamingGroup(g.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setTabMenu({ x: e.clientX, y: e.clientY, groupId: g.id })
              }}
              className={`group relative -mb-px flex max-w-[280px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-[9px] border px-3.5 py-2 text-sm transition-colors ${
                on
                  ? 'border-[#D6DAE0] border-b-white bg-white font-bold text-black'
                  : 'border-transparent bg-[#E7EAF0] font-medium text-gray-600 hover:bg-[#DDE1E8]'
              } ${dragTab?.over === idx && dragTab.id !== g.id ? 'shadow-[inset_3px_0_0_#F97316]' : ''}`}
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
                  {g.tag && <span className="shrink-0 rounded bg-[#14161A] px-1.5 text-[11px] font-bold leading-5 text-white">{g.tag}</span>}
                  <span className="truncate">{g.name}</span>
                  <span className={`shrink-0 text-xs tabular-nums ${on ? 'text-gray-400' : 'text-gray-400'}`}>{count}</span>
                </>
              )}
            </div>
          )
        })}
        <button
          onClick={handleAddGroup}
          title="L2 추가"
          className="-mb-px shrink-0 rounded-t-[9px] px-3 py-2 text-sm font-semibold text-gray-400 hover:bg-[#E7EAF0] hover:text-black"
        >
          ＋ L2
        </button>
      </div>

      {activeGroup && (
        <>
          {/* 정보 줄 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-gray-500">
                {[activeGroup.h, activeGroup.l1].filter(Boolean).join(' › ') || 'H·L1 없음'}
                {activeGroup.hierarchyInferred && (
                  <span className="ml-1.5 text-orange-500" title="시트에서 병합 셀이 끊겨 비어 있던 H/L1을 위 행 값으로 채웠습니다. 시트에서 확인해 주세요.">
                    (추정)
                  </span>
                )}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold text-black">{activeGroup.name}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    activeGroup.source === 'sheet' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {activeGroup.source === 'sheet' ? '시트' : '직접'}
                </span>
                <span className="text-xs text-gray-500">
                  L3 {groupItems.length}건{statusCounts.length > 0 && ' · '}
                  {statusCounts.map(([s, n]) => `${s} ${n}`).join(' · ')}
                </span>
                {missingCount > 0 && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700" title="지난 가져오기 때 시트에서 찾지 못한 행입니다. 지우지 않고 표시만 합니다.">
                    시트에 없음 {missingCount}
                  </span>
                )}
              </div>
            </div>
            {board.sheetLink && (
              <button onClick={onOpenSheetImport} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-black">
                <span>시트 「{board.sheetLink.tabName}」 · {timeAgo(board.sheetLink.lastFetchedAt)}</span>
                <span className="text-accent">⟳ 다시 가져오기</span>
              </button>
            )}
          </div>

          {/* 도구 줄 */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이 L2에서 찾기"
              className="h-8 w-56 rounded-md border border-gray-300 px-2.5 text-sm outline-none focus:border-accent"
            />
            {filtered && <span className="text-xs text-gray-500">{viewRows.length}건 · 찾는 중에는 행 이동이 꺼집니다</span>}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={undo}
                disabled={undoStack.current.length === 0}
                title="되돌리기 (⌘Z)"
                className="h-8 rounded-md px-2.5 text-base text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
              >
                ↶
              </button>
              <button
                onClick={redo}
                disabled={redoStack.current.length === 0}
                title="다시 하기 (⌘⇧Z)"
                className="h-8 rounded-md px-2.5 text-base text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
              >
                ↷
              </button>
              <div className="relative">
                <Button variant="secondary" onClick={() => setColMenuOpen((v) => !v)} className="h-8 px-3 text-xs">
                  열 표시{hiddenCols.length > 0 ? ` · 숨김 ${hiddenCols.length}` : ''}
                </Button>
                {colMenuOpen && (
                  <div className="absolute right-0 top-9 z-30 max-h-96 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1.5 text-sm shadow-lg">
                    {board.columns.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={!c.hidden}
                          disabled={c.id === 'name'}
                          onChange={() => apply(updateColumn(board, c.id, { hidden: !c.hidden }))}
                        />
                        <span className="truncate">{c.label}</span>
                        {!c.system && <span className="ml-auto text-[11px] text-gray-400">추가</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DataGrid
            columns={gridColumns}
            rows={viewRows}
            getText={(row, colId) => getCellText(row, colId, members)}
            renderCell={(row, col) => renderWorkCell(row, col, members)}
            rowClassName={(row) => (row.missingInSheet ? 'bg-orange-50/50 text-gray-500' : '')}
            rowMarker={(row) =>
              row.missingInSheet ? (
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" title="시트에 없음 -- 지난 가져오기 때 시트에서 찾지 못했습니다" />
              ) : null
            }
            onCommit={commit}
            onPaste={paste}
            onInsertRows={insertRows}
            onDeleteRows={removeRows}
            onMoveRows={filtered ? undefined : moveRows}
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
            addRowLabel="L3 추가"
            emptyText={filtered ? '찾는 내용이 없습니다.' : '아직 L3가 없습니다. 아래 "＋ L3 추가"를 누르거나 엑셀에서 복사해 붙여넣으세요.'}
          />
          <p className="text-xs text-gray-400">
            칸을 누르고 바로 입력 · 두 번 누르거나 Enter로 이어서 편집 · Alt+Enter 줄바꿈 · 엑셀/시트에서 복사한 범위를 ⌘V로 붙여넣기 · 왼쪽 번호로 행 선택 후 끌어서 이동 ·
            머리글 우클릭으로 열 추가·숨기기
          </p>
        </>
      )}

      {tabMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1.5 text-sm shadow-lg"
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
                className={`block w-full px-3.5 py-1.5 text-left disabled:text-gray-300 ${opts.danger ? 'text-danger hover:bg-red-50' : 'hover:bg-gray-50'}`}
              >
                {label}
              </button>
            )
            return (
              <>
                {item('이름 바꾸기', () => setRenamingGroup(g.id))}
                {item('왼쪽으로 이동', () => apply(moveGroup(board, g.id, idx - 1)), { disabled: idx === 0 })}
                {item('오른쪽으로 이동', () => apply(moveGroup(board, g.id, idx + 1)), { disabled: idx === board.groups.length - 1 })}
                <div className="my-1 h-px bg-gray-100" />
                {item('L2 삭제', () => setDeletingGroup(g), { danger: true })}
              </>
            )
          })()}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#14161A] px-4 py-2 text-sm text-white shadow-lg">
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
        title="L2 삭제"
        message={
          deletingGroup
            ? `「${deletingGroup.name}」과 그 아래 L3 ${itemsOfGroup(board, deletingGroup.id).length}건을 지웁니다.${
                deletingGroup.source === 'sheet' ? ' 시트 가져오기 선택 목록에서도 빠지므로, 다시 가져와도 되살아나지 않습니다.' : ''
              } 바로 뒤라면 되돌리기(⌘Z)로 살릴 수 있습니다.`
            : ''
        }
        onConfirm={() => {
          if (deletingGroup) apply(deleteGroup(board, deletingGroup.id))
          setDeletingGroup(null)
        }}
        onCancel={() => setDeletingGroup(null)}
      />
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

const CATEGORY_STYLE: Record<string, string> = {
  과제: 'bg-[#14161A] text-white',
  일반: 'bg-gray-200 text-gray-800',
  일상: 'bg-gray-100 text-gray-500',
}

const STATUS_STYLE: Record<string, string> = {
  완료: 'text-green-700',
  진행중: 'text-accent',
  보류: 'text-gray-400',
}

function renderWorkCell(row: WorkItem, col: GridColumn, members: { id: string; name: string }[]) {
  if (col.id === COL_ASSIGNEES) {
    const byId = new Map(members.map((m) => [m.id, m.name]))
    const names = row.assigneeIds.map((id) => byId.get(id)).filter(Boolean) as string[]
    if (names.length === 0 && row.unmatchedAssignees.length === 0) return null
    return (
      <div className="flex gap-1 overflow-hidden">
        {names.map((n) => (
          <span key={n} className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
            {n}
          </span>
        ))}
        {row.unmatchedAssignees.map((n) => (
          <span
            key={n}
            className="shrink-0 rounded-full border border-dashed border-gray-400 px-2 py-0.5 text-xs text-gray-600"
            title="팀원 목록에 없는 이름입니다. 팀원관리에서 추가하면 자동으로 연결됩니다."
          >
            {n}
          </span>
        ))}
      </div>
    )
  }
  if (col.id === COL_CATEGORY) {
    if (row.category) return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_STYLE[row.category]}`}>{row.category}</span>
    if (row.categoryRaw)
      return (
        <span className="text-xs text-orange-600" title="과제/일반/일상이 아닌 값입니다. 시트 원문을 그대로 보여 줍니다.">
          ⚠ {row.categoryRaw}
        </span>
      )
    return <span className="text-xs text-gray-300">미입력</span>
  }
  if (col.id === 'status') {
    const v = row.fields.status
    if (!v) return null
    return <span className={`text-[13px] font-semibold ${STATUS_STYLE[v] ?? 'text-gray-700'}`}>{v}</span>
  }
  if (col.type === 'link') {
    const v = row.fields[col.id]
    if (!v) return null
    const href = /^https?:\/\//.test(v) ? v : null
    return (
      <div className="flex items-center gap-1 truncate">
        <span className="truncate text-accent">{v}</span>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" onMouseDown={(e) => e.stopPropagation()} className="shrink-0 text-gray-400 hover:text-accent" title="새 탭에서 열기">
            ↗
          </a>
        )}
      </div>
    )
  }
  if (col.type === 'date') {
    const v = row.fields[col.id]
    return v ? <span className="tabular-nums">{v}</span> : null
  }
  return undefined
}

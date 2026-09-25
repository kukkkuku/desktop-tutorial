import { useMemo, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Importance, PerformanceGrade, Task, Workload } from '../types'
import { ALL_IMPORTANCE_OPTIONS, IMPORTANCE_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import ConfirmDialog from './ConfirmDialog'
import { IMPORTANCE_COLORS, WORKLOAD_COLORS } from '../utils/badgeColors'
import { GRADE_COLORS, calcAllTaskScores } from '../utils/calculations'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import { downloadCurrentTasksExcel } from '../utils/excel'
import { downloadTasksPdf } from '../utils/pdfReports'
import Button from './Button'
import IconButton from './IconButton'
import DataGrid, { CHIP_BASE, type CellEdit, type GridColumn } from './grid/DataGrid'
import { useStateHistory } from '../hooks/useStateHistory'
import { ChevronRight, Redo2, Undo2 } from 'lucide-react'
import { ic } from './ui/icon'

const MUTED = 'bg-black/[0.05] text-label-3'
const STATUS_TONE: Record<string, string> = {
  대기: 'bg-black/[0.05] text-label-2',
  진행중: 'bg-accent-soft text-accent',
  완료: 'bg-emerald-100 text-emerald-800',
  중단: 'bg-red-100 text-red-700',
}

// 평가과제는 과제관리에서 내보내 만든다(여기서 직접 추가하지 않음 -- 출처를 하나로).
// 표는 과제관리와 같은 DataGrid: 칸을 눌러 바로 입력, 붙여넣기, 행 삭제·이동, ⌘Z.
export default function TaskManagement({ onGoToWork }: { onGoToWork?: () => void }) {
  const { state, dispatch, recentlyAddedIds } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const history = useStateHistory()
  const [deleting, setDeleting] = useState<Task[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  const [widths, setWidths] = useState<Record<string, number>>({})

  const isImportanceUsed = state.criteria.taskGradeWeight > 0
  const isWorkloadUsed = state.criteria.workloadWeight > 0
  const isPerformanceGradeUsed = state.criteria.performanceGradeWeight > 0

  const scoreByTaskId = useMemo(
    () => new Map(calcAllTaskScores(state.tasks, state.criteria).map((row) => [row.task.id, row.score])),
    [state.tasks, state.criteria],
  )
  const peopleByTaskId = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of state.contributions) if (c.contributionPercent > 0) m.set(c.taskId, (m.get(c.taskId) ?? 0) + 1)
    return m
  }, [state.contributions])

  const baseColumns: GridColumn[] = [
    { id: 'name', label: '과제명', type: 'text', width: 340, system: true },
    {
      id: 'importance',
      label: '과제등급',
      type: 'select',
      width: 100,
      system: true,
      readOnly: !isImportanceUsed,
      picker: { options: IMPORTANCE_OPTIONS, tone: (v) => IMPORTANCE_COLORS[v as Importance] ?? MUTED },
    },
    {
      id: 'performanceGrade',
      label: '성과등급',
      type: 'select',
      width: 100,
      system: true,
      readOnly: !isPerformanceGradeUsed,
      picker: { options: PERFORMANCE_GRADE_OPTIONS, tone: (v) => GRADE_COLORS[v as PerformanceGrade] ?? MUTED },
    },
    ...(isWorkloadUsed
      ? [
          {
            id: 'workload',
            label: '업무량',
            type: 'select' as const,
            width: 90,
            system: true,
            picker: { options: WORKLOAD_OPTIONS, tone: (v: string) => WORKLOAD_COLORS[v as Workload] ?? MUTED },
          },
        ]
      : []),
    { id: 'objective', label: '목표', type: 'memo', width: 260, system: true },
    { id: 'achievement', label: '성과', type: 'memo', width: 260, system: true },
    { id: 'score', label: '점수', type: 'text', width: 80, system: true, readOnly: true },
    { id: 'people', label: '참여', type: 'text', width: 70, system: true, readOnly: true },
  ]
  const columns = baseColumns.map((c) => (widths[c.id] ? { ...c, width: widths[c.id] } : c))

  function textOf(task: Task, colId: string): string {
    switch (colId) {
      case 'name':
        return task.name
      case 'importance':
        return task.importance
      case 'performanceGrade':
        return task.performanceGrade ?? ''
      case 'workload':
        return task.workload
      case 'objective':
        return task.objective
      case 'achievement':
        return task.achievement
      case 'score':
        return (scoreByTaskId.get(task.id) ?? 0).toFixed(1)
      case 'people':
        return `${peopleByTaskId.get(task.id) ?? 0}명`
      default:
        return ''
    }
  }

  // 칸 입력·붙여넣기·지우기를 한 번에 반영한다. 맞지 않는 값(없는 등급, 겹치는 이름)은 건너뛰고 알린다.
  function applyEdits(edits: CellEdit[]) {
    const byId = new Map(state.tasks.map((t) => [t.id, { ...t }]))
    const changed = new Set<string>()
    const problems: string[] = []
    for (const e of edits) {
      const t = byId.get(e.rowId)
      if (!t) continue
      const v = e.text.trim()
      switch (e.colId) {
        case 'name': {
          if (!v) {
            problems.push('과제명은 비울 수 없습니다')
            break
          }
          if ([...byId.values()].some((o) => o.id !== t.id && o.name === v)) {
            problems.push(`'${v}' 과제가 이미 있습니다`)
            break
          }
          if (t.name !== v) (t.name = v), changed.add(t.id)
          break
        }
        case 'importance': {
          if (!isImportanceUsed) break
          if (!v) break
          if (!ALL_IMPORTANCE_OPTIONS.includes(v as Importance)) {
            problems.push(`과제등급 '${v}'은(는) 없는 값입니다`)
            break
          }
          if (t.importance !== v) (t.importance = v as Importance), changed.add(t.id)
          break
        }
        case 'performanceGrade': {
          if (!isPerformanceGradeUsed) break
          const g = v.toUpperCase()
          if (g && !PERFORMANCE_GRADE_OPTIONS.includes(g as PerformanceGrade)) {
            problems.push(`성과등급 '${v}'은(는) 없는 값입니다`)
            break
          }
          const next = g ? (g as PerformanceGrade) : null
          if (t.performanceGrade !== next) (t.performanceGrade = next), changed.add(t.id)
          break
        }
        case 'workload': {
          if (!v || !WORKLOAD_OPTIONS.includes(v as Workload)) break
          if (t.workload !== v) (t.workload = v as Workload), changed.add(t.id)
          break
        }
        case 'objective':
        case 'achievement':
          if (t[e.colId] !== v) (t[e.colId] = v), changed.add(t.id)
          break
      }
    }
    setNotice(problems.length ? Array.from(new Set(problems)).join(' · ') : '')
    if (changed.size === 0) return
    history.record()
    for (const id of changed) dispatch({ type: 'UPDATE_TASK', payload: byId.get(id)! })
  }

  function paste(rowIndex: number, colIndex: number, matrix: string[][]) {
    const edits: CellEdit[] = []
    matrix.forEach((line, i) => {
      const task = state.tasks[rowIndex + i]
      if (!task) return
      line.forEach((text, j) => {
        const col = columns[colIndex + j]
        if (col && !col.readOnly) edits.push({ rowId: task.id, colId: col.id, text })
      })
    })
    if (rowIndex + matrix.length > state.tasks.length)
      setNotice('평가과제는 과제관리에서 내보내 만듭니다 -- 표 아래로 넘친 줄은 넣지 않았습니다')
    applyEdits(edits)
  }

  function moveRows(ids: string[], toIndex: number) {
    const set = new Set(ids)
    const moving = state.tasks.filter((t) => set.has(t.id))
    const rest = state.tasks.filter((t) => !set.has(t.id))
    const at = state.tasks.slice(0, toIndex).filter((t) => !set.has(t.id)).length
    history.record()
    dispatch({ type: 'IMPORT_TASKS', payload: [...rest.slice(0, at), ...moving, ...rest.slice(at)] })
  }

  function confirmDelete() {
    if (!deleting) return
    history.record()
    for (const t of deleting) dispatch({ type: 'DELETE_TASK', payload: { id: t.id } })
    setDeleting(null)
  }

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const itemById = useMemo(() => new Map(state.workBoard.items.map((i) => [i.id, i])), [state.workBoard.items])
  const groupName = useMemo(() => new Map(state.workBoard.groups.map((g) => [g.id, g.name])), [state.workBoard.groups])
  const memberName = useMemo(() => new Map(state.members.map((m) => [m.id, m.name])), [state.members])

  function renderCell(task: Task, col: GridColumn) {
    if (col.id === 'name') {
      const linked = task.workItemIds?.length ?? 0
      const open = expanded.has(task.id)
      return (
        <div className="flex items-start gap-1 py-1">
          {linked > 0 ? (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => toggle(task.id)}
              title={open ? '접기' : `과제관리 L3 ${linked}건 펼치기`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.07] hover:text-label"
            >
              <ChevronRight size={16} strokeWidth={2} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-6 shrink-0" title="과제관리와 연결 없음" />
          )}
          <span className="min-w-0 flex-1 whitespace-pre-line break-words py-0.5 leading-snug">{task.name}</span>
          {recentlyAddedIds.has(task.id) && (
            <span className="mt-0.5 shrink-0 rounded-full bg-success px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">N</span>
          )}
        </div>
      )
    }
    if (col.id === 'importance')
      return <span className={`${CHIP_BASE} ${isImportanceUsed ? IMPORTANCE_COLORS[task.importance] : MUTED}`}>{task.importance}</span>
    if (col.id === 'performanceGrade')
      return task.performanceGrade ? (
        <span className={`${CHIP_BASE} ${isPerformanceGradeUsed ? GRADE_COLORS[task.performanceGrade] : MUTED}`}>{task.performanceGrade}</span>
      ) : (
        <span className="text-label-3" title="아직 안 매김 -- 점수에 들어가지 않습니다">
          미입력
        </span>
      )
    if (col.id === 'workload') return <span className={`${CHIP_BASE} ${WORKLOAD_COLORS[task.workload]}`}>{task.workload}</span>
    if (col.id === 'score') return <span className="font-semibold tabular-nums text-accent">{textOf(task, 'score')}</span>
    if (col.id === 'people') return <span className="tabular-nums text-label-2">{textOf(task, 'people')}</span>
    return undefined
  }

  function renderDetail(task: Task) {
    if (!expanded.has(task.id) || !task.workItemIds?.length) return null
    return (
      <ul className="space-y-1 pl-7">
        {task.workItemIds.map((id) => {
          const it = itemById.get(id)
          if (!it)
            return (
              <li key={id} className="text-[13px] text-label-3">
                과제관리에서 지워진 L3
              </li>
            )
          const status = it.fields.status ?? ''
          const people = it.assigneeIds.map((a) => memberName.get(a)).filter(Boolean) as string[]
          const dates = [it.fields.startDate, it.fields.doneDate].filter(Boolean).join(' ~ ')
          return (
            <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="min-w-0 text-label">
                <span className="text-label-3">{groupName.get(it.groupId) ?? ''} › </span>
                {it.name}
              </span>
              {status && <span className={`${CHIP_BASE} ${STATUS_TONE[status] ?? MUTED}`}>{status}</span>}
              {people.length > 0 && <span className="text-label-2">{people.join(', ')}</span>}
              {dates && <span className="tabular-nums text-label-3">{dates}</span>}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h3 className="mr-2 text-[17px] font-semibold text-label">평가과제</h3>
          <IconButton onClick={history.undo} disabled={!history.canUndo} title="되돌리기 (⌘Z)" aria-label="되돌리기">
            <Undo2 {...ic} />
          </IconButton>
          <IconButton onClick={history.redo} disabled={!history.canRedo} title="다시 하기 (⌘⇧Z)" aria-label="다시 하기">
            <Redo2 {...ic} />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CurrentDataDownloadControls
            disabled={state.tasks.length === 0}
            onExcelDownload={() => downloadCurrentTasksExcel(state.tasks, state.criteria)}
            onPdfDownload={() => downloadTasksPdf(teamName, periodName, state.tasks, state.criteria)}
          />
        </div>
      </div>
      <p className="mt-1 text-[13px] text-label-2">새 평가과제는 과제관리에서 L3를 체크해 내보냅니다. 여기서는 등급·목표·성과를 바로 입력하세요.</p>

      {state.tasks.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-separator px-6 py-12 text-center">
          <p className="text-[13px] font-medium text-label">아직 평가과제가 없습니다</p>
          <p className="mt-1 text-xs text-label-2">과제관리에서 L3를 체크하고 "평가과제로 내보내기"를 누르면 여기에 생깁니다.</p>
          {onGoToWork && (
            <Button variant="primary" onClick={onGoToWork} className="mt-4">
              과제관리로 이동
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {notice && <p className="mb-2 text-[13px] text-danger">{notice}</p>}
          <DataGrid
            columns={columns}
            rows={state.tasks}
            fixedColumns
            getText={textOf}
            renderCell={renderCell}
            rowDetail={renderDetail}
            onCommit={applyEdits}
            onPaste={paste}
            onDeleteRows={(ids) => setDeleting(state.tasks.filter((t) => ids.includes(t.id)))}
            onMoveRows={moveRows}
            onResizeColumn={(id, w) => setWidths((cur) => ({ ...cur, [id]: w }))}
            onUndo={history.undo}
            onRedo={history.redo}
            storageKey="eval-tasks"
            emptyText="평가과제가 없습니다."
          />
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting && deleting.length > 1 ? `평가과제 ${deleting.length}개 삭제` : '평가과제 삭제'}
        message={
          deleting
            ? `${deleting
                .slice(0, 5)
                .map((t) => `'${t.name}'`)
                .join('\n')}${deleting.length > 5 ? `\n외 ${deleting.length - 5}개` : ''}\n\n평가하기에 입력한 기여도·등급도 함께 지워집니다.\n과제관리의 L3는 그대로 남고, ⌘Z로 되돌릴 수 있습니다.`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

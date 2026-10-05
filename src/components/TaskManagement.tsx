import { useMemo, useRef, useState } from 'react'
import { toast } from './ui/Toast'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Importance, PerformanceGrade, Task, Workload } from '../types'
import { ALL_IMPORTANCE_OPTIONS, IMPORTANCE_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import ConfirmDialog from './ConfirmDialog'
import { IMPORTANCE_COLORS, WORKLOAD_COLORS } from '../utils/badgeColors'
import { GRADE_COLORS, calcAllTaskScores, getContribution, getTaskContributionSum, isContributionSumValid } from '../utils/calculations'
import GradeNoteButton from './GradeNoteButton'
import Select from './ui/Select'
import { OutOfSyncBanner } from './EvaluationMatrix'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import { downloadCurrentTasksExcel } from '../utils/excel'
import { downloadTasksPdf } from '../utils/pdfReports'
import Button from './Button'
import IconButton from './IconButton'
import DataGrid, { CHIP_BASE, type CellEdit, type DetailLine, type GridColumn } from './grid/DataGrid'
import { useStateHistory } from '../hooks/useStateHistory'
import { ChevronRight, Plus, Redo2, Undo2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { ic } from './ui/icon'

const MUTED = 'bg-black/[0.05] text-label-3'
const STATUS_TONE: Record<string, string> = {
  대기: 'bg-black/[0.05] text-label-2',
  진행중: 'bg-accent-soft text-accent',
  완료: 'bg-emerald-100 text-emerald-800',
  중단: 'bg-red-100 text-red-700',
}

// 평가하기 · 과제별: 한 줄이 평가과제 하나(성과등급 · 목표 · 성과 · 점수). 줄을 펼치면 참여자별 기여도 ·
// 개인수행등급과 묶인 L3가 나와 과제 하나를 한곳에서 끝낸다. 팀원 합계 · 순위는 "팀원별" 보기(EvaluationMatrix).
// 평가과제는 과제리스트에서 "평가 대상"을 체크하면 생긴다(이름 · 과제등급 · 묶음은 과제리스트를 따름).
// 과제리스트와 상관없는 과제는 여기서 "과제 추가"로 만든다.
// 표는 과제관리와 같은 DataGrid: 칸을 눌러 바로 입력, 붙여넣기, 행 삭제·이동, ⌘Z.
export default function TaskManagement({ onGoToWork }: { onGoToWork?: () => void }) {
  const { state, dispatch, recentlyAddedIds } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const history = useStateHistory()
  const [deleting, setDeleting] = useState<Task[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [widths, setWidths] = useState<Record<string, number>>({})

  const isImportanceUsed = state.criteria.taskGradeWeight > 0
  const isWorkloadUsed = state.criteria.workloadWeight > 0
  const isPerformanceGradeUsed = state.criteria.performanceGradeWeight > 0

  const scoreByTaskId = useMemo(
    () => new Map(calcAllTaskScores(state.tasks, state.criteria).map((row) => [row.task.id, row.score])),
    [state.tasks, state.criteria],
  )
  const activeMembers = state.members.filter((m) => m.active)
  const activeIds = useMemo(() => new Set(state.members.filter((m) => m.active).map((m) => m.id)), [state.members])
  const peopleByTaskId = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of state.contributions) if (c.contributionPercent > 0 && activeIds.has(c.memberId)) m.set(c.taskId, (m.get(c.taskId) ?? 0) + 1)
    return m
  }, [state.contributions, activeIds])
  const sumOf = (taskId: string) => getTaskContributionSum(state.contributions, taskId, activeIds)
  // 펼친 줄에서 "참여자 추가"로 고른 팀원(기여도를 넣기 전까지 빈 칸으로 보여 줌)
  const [added, setAdded] = useState<Record<string, string[]>>({})
  const showGrade = state.criteria.personalGradeWeight > 0
  // 과제별 피어리뷰(순위) 평균 -- 기여도를 정할 때 참고(본인 평가 제외)
  const peerRankOf = useMemo(() => {
    const acc = new Map<string, { sum: number; count: number }>()
    for (const r of state.taskPeerReviews) {
      if (r.method !== 'rank' || r.reviewerMemberId === r.targetMemberId) continue
      const k = `${r.taskId}|${r.targetMemberId}`
      const cur = acc.get(k) ?? { sum: 0, count: 0 }
      acc.set(k, { sum: cur.sum + r.value, count: cur.count + 1 })
    }
    return new Map(Array.from(acc, ([k, v]) => [k, v.sum / v.count]))
  }, [state.taskPeerReviews])

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
    { id: 'people', label: '참여 · 기여도', type: 'text', width: 120, system: true, readOnly: true },
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
        return `${peopleByTaskId.get(task.id) ?? 0}명 · ${sumOf(task.id).toFixed(0)}%`
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
          if (linked(t)) {
            if (t.name !== v) problems.push('과제리스트에서 온 과제의 이름은 과제리스트 묶음 이름(또는 L3 이름)을 따릅니다')
            break
          }
          if (!v) {
            problems.push('과제명은 비울 수 없습니다')
            break
          }
          if ([...byId.values()].some((o) => o.id !== t.id && o.name === v)) {
            problems.push(`'${v}' 과제가 이미 있습니다`)
            break
          }
          if (t.name !== v) ((t.name = v), changed.add(t.id))
          break
        }
        case 'importance': {
          if (!isImportanceUsed) break
          if (!v) break
          if (linked(t)) {
            if (t.importance !== v) problems.push('과제리스트에서 온 과제의 과제등급은 과제리스트 묶음 행의 분류에서 바꿉니다')
            break
          }
          if (!ALL_IMPORTANCE_OPTIONS.includes(v as Importance)) {
            problems.push(`과제등급 '${v}'은(는) 없는 값입니다`)
            break
          }
          if (t.importance !== v) ((t.importance = v as Importance), changed.add(t.id))
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
          if (t.performanceGrade !== next) ((t.performanceGrade = next), changed.add(t.id))
          break
        }
        case 'workload': {
          if (!v || !WORKLOAD_OPTIONS.includes(v as Workload)) break
          if (t.workload !== v) ((t.workload = v as Workload), changed.add(t.id))
          break
        }
        case 'objective':
        case 'achievement':
          if (t[e.colId] !== v) ((t[e.colId] = v), changed.add(t.id))
          break
      }
    }
    if (problems.length) toast(Array.from(new Set(problems)).join(' · '), 'error')
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
      toast('새 평가과제는 과제리스트의 평가 대상 체크나 과제 추가로 만듭니다 -- 표 아래로 넘친 줄은 넣지 않았습니다', 'info')
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

  // 과제리스트와 이어진 평가과제는 과제등급·묶기를 과제리스트(묶음 행 분류)에서만 고친다. 여기서는 보여 주기만.
  const linked = (t: Task) => (t.workItemIds?.length ?? 0) > 0

  // 과제리스트와 상관없는 평가과제(예: 다른 팀 지원 업무). 과제등급은 일반으로 두고 표에서 바꾼다.
  function addTask() {
    const names = new Set(state.tasks.map((t) => t.name))
    let name = '새 평가과제'
    for (let k = 2; names.has(name); k++) name = `새 평가과제 (${k})`
    history.record()
    const task: Task = { id: uuidv4(), name, importance: '일반', performanceGrade: null, workload: '중', objective: '', achievement: '' }
    dispatch({ type: 'ADD_TASK', payload: task })
  }

  function confirmDelete() {
    if (!deleting) return
    history.record()
    for (const t of deleting) dispatch({ type: 'DELETE_TASK', payload: { id: t.id } })
    setDeleting(null)
  }

  function toggle(id: string, open?: boolean) {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (open) next.add(id)
      else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const itemById = useMemo(() => new Map(state.workBoard.items.map((i) => [i.id, i])), [state.workBoard.items])
  const groupName = useMemo(() => new Map(state.workBoard.groups.map((g) => [g.id, g.name])), [state.workBoard.groups])
  const memberName = useMemo(() => new Map(state.members.map((m) => [m.id, m.name])), [state.members])

  function renderCell(task: Task, col: GridColumn) {
    if (col.id === 'name') {
      const l3Count = task.workItemIds?.length ?? 0
      const open = expanded.has(task.id)
      return (
        <div className="flex items-start gap-1 py-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => toggle(task.id)}
            title={open ? '접기' : `펼치기 -- 참여자 기여도 · 개인수행등급${l3Count ? ` · L3 ${l3Count}건` : ''}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.07] hover:text-label"
          >
            <ChevronRight size={16} strokeWidth={2} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
          <span className="min-w-0 flex-1 whitespace-pre-line break-words py-0.5 leading-snug">{task.name}</span>
          {recentlyAddedIds.has(task.id) && (
            <span className="mt-0.5 shrink-0 rounded-full bg-success px-1.5 py-0.5 text-[length:calc(12px*var(--ui-fs,1))] font-semibold leading-none text-white">N</span>
          )}
        </div>
      )
    }
    if (col.id === 'importance')
      return (
        <span
          className={`${CHIP_BASE} ${isImportanceUsed ? IMPORTANCE_COLORS[task.importance] : MUTED}`}
          title={linked(task) ? '과제리스트 묶음 행의 분류를 따릅니다' : undefined}
        >
          {task.importance}
        </span>
      )
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
    if (col.id === 'people') {
      const sum = sumOf(task.id)
      const ok = sum === 0 || isContributionSumValid(sum)
      return (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggle(task.id, true)}
          title={ok ? '펼쳐서 기여도 · 개인수행등급 입력' : `기여도 합계가 ${sum.toFixed(0)}% -- 펼쳐서 100%로 맞추세요`}
          className={`tabular-nums hover:underline ${ok ? 'text-label-2' : 'font-semibold text-danger'}`}
        >
          {peopleByTaskId.get(task.id) ?? 0}명 · {sum.toFixed(0)}%
        </button>
      )
    }
    return undefined
  }

  // 기여도 · 개인수행등급 고치기(되돌리기에 들어감 -- 같은 칸을 이어 치는 동안은 한 번만 기록)
  const lastEdit = useRef('')
  function recordOnce(key: string) {
    if (lastEdit.current === key) return
    lastEdit.current = key
    history.record()
  }
  function setPercent(taskId: string, memberId: string, value: string) {
    const n = value === '' ? 0 : parseFloat(value)
    if (Number.isNaN(n)) return
    recordOnce(`p:${taskId}:${memberId}`)
    dispatch({ type: 'SET_CONTRIBUTION_PERCENT', payload: { taskId, memberId, contributionPercent: Math.min(100, Math.max(0, n)) } })
  }

  // 펼친 줄: ① 참여자마다 기여도 · 개인수행등급(앞칸 = 이름, 목표 열부터 = 입력) ② 합계 · 참여자 추가 ③ 묶인 L3
  function participantLines(task: Task): DetailLine[] {
    const ids = activeMembers
      .filter((m) => (getContribution(state.contributions, task.id, m.id)?.contributionPercent ?? 0) > 0 || added[task.id]?.includes(m.id))
      .map((m) => m.id)
    const rest = activeMembers.filter((m) => !ids.includes(m.id))
    const sum = sumOf(task.id)
    const ok = sum === 0 || isContributionSumValid(sum)
    const lines: DetailLine[] = ids.map((mid) => {
      const c = getContribution(state.contributions, task.id, mid)
      const pct = c?.contributionPercent ?? 0
      const grade = c?.personalPerformanceGrade ?? null
      const peer = peerRankOf.get(`${task.id}|${mid}`)
      return {
        key: `m:${mid}`,
        lead: <span className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-[#1F2937]">{memberName.get(mid)}</span>,
        rest: (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[length:calc(14px*var(--ui-fs,1))]">
            <label className="flex items-center gap-1.5 text-[#4B5563]">
              기여도
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={pct || ''}
                placeholder="0"
                onChange={(e) => setPercent(task.id, mid, e.target.value)}
                onBlur={() => (lastEdit.current = '')}
                className="h-7 w-16 rounded-control border border-hairline bg-white px-2 text-right tabular-nums text-label"
              />
              %
            </label>
            {showGrade && (
              <span className="flex items-center gap-1.5 text-[#4B5563]">
                개인수행등급
                <Select
                  value={grade ?? ''}
                  disabled={pct === 0}
                  title={pct === 0 ? '기여도가 0이면 개인수행등급을 매길 수 없습니다' : undefined}
                  onChange={(e) => {
                    history.record()
                    dispatch({
                      type: 'SET_CONTRIBUTION_GRADE',
                      payload: { taskId: task.id, memberId: mid, personalPerformanceGrade: e.target.value as PerformanceGrade },
                    })
                  }}
                  className={`h-7 w-20 rounded-control border border-hairline px-2 text-[length:calc(14px*var(--ui-fs,1))] ${pct ? 'bg-white text-label' : 'bg-black/[0.05] text-label-3'}`}
                >
                  <option value="" disabled>
                    미입력
                  </option>
                  {PERFORMANCE_GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
                {pct > 0 && (
                  <GradeNoteButton
                    note={c?.personalGradeNote}
                    label={`${task.name} · ${memberName.get(mid)}`}
                    onSave={(note) => {
                      history.record()
                      dispatch({ type: 'SET_CONTRIBUTION_NOTE', payload: { taskId: task.id, memberId: mid, personalGradeNote: note } })
                    }}
                  />
                )}
              </span>
            )}
            {peer !== undefined && (
              <span className="text-[length:calc(13px*var(--ui-fs,1))] text-[#9CA3AF]" title="과제별 피어리뷰에서 동료들이 매긴 이 과제 안 순위의 평균(본인 평가 제외)">
                동료 {peer.toFixed(1)}위
              </span>
            )}
          </div>
        ),
      }
    })
    lines.push({
      key: 'sum',
      lead: (
        <span className={`text-[length:calc(14px*var(--ui-fs,1))] font-semibold ${ok ? 'text-success' : 'text-danger'}`}>
          기여도 합계 {sum.toFixed(0)}%{ok ? '' : ` -- ${sum > 100 ? `${(sum - 100).toFixed(0)}% 줄이세요` : `${(100 - sum).toFixed(0)}% 더 넣으세요`}`}
        </span>
      ),
      rest: rest.length ? (
        <Select
          value=""
          onChange={(e) => setAdded((cur) => ({ ...cur, [task.id]: [...(cur[task.id] ?? []), e.target.value] }))}
          className="h-7 w-40 rounded-control border border-hairline bg-white px-2 text-[length:calc(14px*var(--ui-fs,1))] text-label-2"
        >
          <option value="" disabled>
            + 참여자 추가
          </option>
          {rest.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      ) : undefined,
    })
    return lines
  }

  // 펼친 줄: 참여자 줄 다음에 L3 목록(회색 행). 앞칸 = 그룹 > · 과제 이름(20px 사이), 목표 열부터 = 상태 · 담당자 · 기간
  function renderDetail(task: Task): DetailLine[] | null {
    if (!expanded.has(task.id)) return null
    const people = participantLines(task)
    if (!task.workItemIds?.length) return people
    return [...people, ...l3Lines(task)]
  }
  function l3Lines(task: Task): DetailLine[] {
    return (task.workItemIds ?? []).map((id) => {
      const it = itemById.get(id)
      if (!it) return { key: id, lead: <span className="text-[length:calc(14px*var(--ui-fs,1))] text-[#9CA3AF]">과제리스트에서 지워진 L3</span> }
      const status = it.fields.status ?? ''
      const people = it.assigneeIds.map((a) => memberName.get(a)).filter(Boolean) as string[]
      const start = it.fields.startDate ?? ''
      const done = it.fields.doneDate ?? ''
      const group = groupName.get(it.groupId) ?? ''
      return {
        key: id,
        lead: (
          <div className="flex min-w-0 items-center gap-5 text-[length:calc(14px*var(--ui-fs,1))]">
            {group && (
              <span className="min-w-0 max-w-[45%] shrink truncate text-[#646971]" title={group}>
                {group} &gt;
              </span>
            )}
            <span className="min-w-0 whitespace-pre-line break-words font-medium leading-snug text-[#1F2937]">{it.name}</span>
          </div>
        ),
        rest: (
          <div className="flex items-center gap-5 text-[length:calc(14px*var(--ui-fs,1))]">
            <span className="shrink-0">
              {status ? <span className={`${CHIP_BASE} ${STATUS_TONE[status] ?? MUTED}`}>{status}</span> : <span className="text-[#9CA3AF]">-</span>}
            </span>
            <span className="min-w-0 break-words text-[#4B5563]">{people.join(', ') || '-'}</span>
            <span className="shrink-0 tabular-nums text-[#9CA3AF]">{start || done ? `${start || '?'} ~ ${done}` : '-'}</span>
          </div>
        ),
      }
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton onClick={history.undo} disabled={!history.canUndo} title="되돌리기 (⌘Z)" aria-label="되돌리기">
            <Undo2 {...ic} />
          </IconButton>
          <IconButton onClick={history.redo} disabled={!history.canRedo} title="다시 하기 (⌘⇧Z)" aria-label="다시 하기">
            <Redo2 {...ic} />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={addTask} title="과제리스트와 상관없는 평가과제를 만듭니다">
            <Plus {...ic} />
            과제 추가
          </Button>
          <CurrentDataDownloadControls
            disabled={state.tasks.length === 0}
            onExcelDownload={() => downloadCurrentTasksExcel(state.tasks, state.criteria)}
            onPdfDownload={() => downloadTasksPdf(teamName, periodName, state.tasks, state.criteria)}
          />
        </div>
      </div>
      <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
        과제리스트에서 "평가 대상"을 체크한 L3 · 묶음이 한 줄씩 나옵니다. 성과등급 · 목표 · 성과를 넣고, 줄을 펼쳐(›) 참여자 기여도 · 개인수행등급을 매깁니다.
        과제명 · 과제등급 · 묶기는 과제리스트에서 바꿉니다.
      </p>
      <OutOfSyncBanner />

      {state.tasks.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-separator px-6 py-12 text-center">
          <p className="text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label">아직 평가과제가 없습니다</p>
          <p className="mt-1 text-xs text-label-2">
            과제리스트에서 L3의 "평가 대상"을 체크하면 여기에 바로 생깁니다. 과제리스트와 상관없는 과제는 위 "과제 추가"로 만듭니다.
          </p>
          {onGoToWork && (
            <Button variant="primary" onClick={onGoToWork} className="mt-4">
              과제리스트로 이동
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <DataGrid
            columns={columns}
            rows={state.tasks}
            fixedColumns
            getText={textOf}
            isReadOnly={(t, colId) => (colId === 'importance' || colId === 'name') && linked(t)}
            renderCell={renderCell}
            rowDetail={renderDetail}
            rowDetailSplit="objective"
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
                .join(
                  '\n',
                )}${deleting.length > 5 ? `\n외 ${deleting.length - 5}개` : ''}\n\n평가하기에 입력한 기여도·등급도 함께 지워집니다.\n과제관리의 L3는 그대로 남고, ⌘Z로 되돌릴 수 있습니다.`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

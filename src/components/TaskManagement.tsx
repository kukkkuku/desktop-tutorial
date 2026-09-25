import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Importance, PerformanceGrade, Task, Workload } from '../types'
import { IMPORTANCE_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import ConfirmDialog from './ConfirmDialog'
import { IMPORTANCE_COLORS, WORKLOAD_COLORS } from '../utils/badgeColors'
import { GRADE_COLORS, calcAllTaskScores } from '../utils/calculations'
import { useResizableColumns } from '../hooks/useResizableColumns'
import ResizableTh from './table/ResizableTh'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import { downloadCurrentTasksExcel } from '../utils/excel'
import { downloadTasksPdf } from '../utils/pdfReports'
import Button from './Button'
import IconButton from './IconButton'

const TASK_COLUMNS = {
  name: 200,
  taskGrade: 110,
  performanceGrade: 110,
  workload: 100,
  objective: 180,
  achievement: 180,
  manage: 100,
}

interface TaskFormValues {
  name: string
  importance: Importance
  workload: Workload
  performanceGrade: PerformanceGrade | null
  objective: string
  achievement: string
}

// 평가과제는 과제관리에서 내보내 만든다(여기서 직접 추가하지 않음 -- 출처를 하나로).
export default function TaskManagement({ onGoToWork }: { onGoToWork?: () => void }) {
  const { state, dispatch, recentlyAddedIds } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const cols = useResizableColumns(TASK_COLUMNS)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TaskFormValues>({
    name: '',
    importance: '일반',
    workload: '중',
    performanceGrade: null,
    objective: '',
    achievement: '',
  })
  const [editFormError, setEditFormError] = useState('')

  const isImportanceUsed = state.criteria.taskGradeWeight > 0
  const isWorkloadUsed = state.criteria.workloadWeight > 0
  const isPerformanceGradeUsed = state.criteria.performanceGradeWeight > 0

  const taskScores = calcAllTaskScores(state.tasks, state.criteria)
  const scoreByTaskId = new Map(taskScores.map((row) => [row.task.id, row.score]))
  const participantCountByTaskId = new Map(
    state.tasks.map((t) => [
      t.id,
      state.contributions.filter((c) => c.taskId === t.id && c.contributionPercent > 0).length,
    ]),
  )

  function startEdit(task: Task) {
    setEditingId(task.id)
    setEditForm({
      name: task.name,
      importance: task.importance,
      workload: task.workload,
      performanceGrade: task.performanceGrade,
      objective: task.objective,
      achievement: task.achievement,
    })
    setEditFormError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditFormError('')
  }

  function saveEdit(task: Task) {
    const trimmedName = editForm.name.trim()
    if (!trimmedName) {
      setEditFormError('과제명을 입력하세요.')
      return
    }
    if (state.tasks.some((t) => t.name === trimmedName && t.id !== task.id)) {
      setEditFormError(`과제명 '${trimmedName}'은(는) 이미 존재합니다.`)
      return
    }
    dispatch({
      type: 'UPDATE_TASK',
      payload: {
        ...task,
        name: trimmedName,
        importance: editForm.importance,
        workload: editForm.workload,
        performanceGrade: editForm.performanceGrade,
        objective: editForm.objective.trim(),
        achievement: editForm.achievement.trim(),
      },
    })
    setEditingId(null)
  }

  function handleDeleteConfirm() {
    if (deletingTask) {
      dispatch({ type: 'DELETE_TASK', payload: { id: deletingTask.id } })
      setDeletingTask(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold text-label">과제 관리</h3>
        <div className="flex flex-wrap items-center gap-2">
          <CurrentDataDownloadControls
            disabled={state.tasks.length === 0}
            onExcelDownload={() => downloadCurrentTasksExcel(state.tasks, state.criteria)}
            onPdfDownload={() => downloadTasksPdf(teamName, periodName, state.tasks, state.criteria)}
          />
          {onGoToWork && (
            <Button variant="secondary" onClick={onGoToWork}>
              과제관리에서 추가
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[13px] text-label-2">
        과제관리에서 내보낸 평가과제입니다. 등급과 이름은 여기서 고치고, 새 과제는 과제관리에서 묶어 내보내세요. 삭제하면 그 과제의 평가 데이터도 함께 지워집니다.
      </p>


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
      <div className="mt-4 overflow-x-auto rounded-card border border-separator">
        {/* 팀원관리 표와 같은 규칙 -- 컨테이너를 꽉 채우되(width 100%), 너무
            좁아지면 가로 스크롤로 넘긴다(minWidth). 예전에는 폭을 컬럼 너비의
            합(cols.totalWidth = 980px)으로 고정해서, 넓은 화면에서는 표가 화면
            중간에서 끊기고 오른쪽이 빈 채로 남았다. minWidth에서 성과 컬럼을
            빼는 것은 목표·성과처럼 글이 들어가는 칸이 조금 줄어드는 편이
            등급·업무량 같은 짧은 칸이 줄어드는 것보다 낫기 때문이다(팀원관리도
            같은 이유로 역할 컬럼을 뺀다). */}
        <table
          className="table-fixed text-left text-[13px]"
          style={{ width: '100%', minWidth: cols.totalWidth - cols.widths.achievement }}
        >
          <thead className="bg-[#F7F7F9] text-label">
            <tr>
              {(
                [
                  ['name', '과제명'],
                  ['taskGrade', '과제등급'],
                  ['performanceGrade', '성과등급'],
                  ['workload', '업무량'],
                  ['objective', '목표'],
                  ['achievement', '성과'],
                  ['manage', '관리'],
                ] as const
              ).filter(([key]) => key !== 'workload' || isWorkloadUsed).map(([key, label]) => (
                <ResizableTh
                  key={key}
                  width={cols.widths[key]}
                  resizable={key !== 'manage'}
                  onResizeStart={cols.startResize(key)}
                  onResizeMove={cols.onResizeMove}
                  onResizeEnd={cols.onResizeEnd}
                >
                  {label}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.tasks.map((task) => {
              const isEditing = editingId === task.id

              if (isEditing) {
                return (
                  <tr key={task.id} className="border-t border-separator bg-accent-soft/40 text-label">
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className={`w-full rounded-control border px-2 py-1.5 text-[13px] text-label ${
                          editFormError ? 'border-danger' : 'border-separator'
                        }`}
                      />
                      {editFormError && <p className="mt-1 text-xs text-danger">{editFormError}</p>}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <select
                        value={editForm.importance}
                        onChange={(e) => setEditForm((f) => ({ ...f, importance: e.target.value as Importance }))}
                        disabled={!isImportanceUsed}
                        className="h-8 w-full rounded-control border border-hairline px-2.5 text-[13px] text-label disabled:cursor-not-allowed disabled:bg-black/[0.05] disabled:text-label-3"
                      >
                        {(IMPORTANCE_OPTIONS.includes(editForm.importance) ? IMPORTANCE_OPTIONS : [...IMPORTANCE_OPTIONS, editForm.importance]).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                            {IMPORTANCE_OPTIONS.includes(opt) ? '' : ' (이전 기준)'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <select
                        value={editForm.performanceGrade ?? ''}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, performanceGrade: e.target.value ? (e.target.value as PerformanceGrade) : null }))
                        }
                        disabled={!isPerformanceGradeUsed}
                        className="h-8 w-full rounded-control border border-hairline px-2.5 text-[13px] text-label disabled:cursor-not-allowed disabled:bg-black/[0.05] disabled:text-label-3"
                      >
                        <option value="">미입력</option>
                        {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    {isWorkloadUsed && (
                    <td className="px-4 py-2 align-top">
                      <select
                        value={editForm.workload}
                        onChange={(e) => setEditForm((f) => ({ ...f, workload: e.target.value as Workload }))}
                        disabled={!isWorkloadUsed}
                        className="h-8 w-full rounded-control border border-hairline px-2.5 text-[13px] text-label disabled:cursor-not-allowed disabled:bg-black/[0.05] disabled:text-label-3"
                      >
                        {WORKLOAD_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    )}
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.objective}
                        onChange={(e) => setEditForm((f) => ({ ...f, objective: e.target.value }))}
                        className="h-8 w-full rounded-control border border-hairline px-2.5 text-[13px] text-label"
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.achievement}
                        onChange={(e) => setEditForm((f) => ({ ...f, achievement: e.target.value }))}
                        className="h-8 w-full rounded-control border border-hairline px-2.5 text-[13px] text-label"
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <IconButton onClick={() => saveEdit(task)} title="저장" aria-label="저장">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </IconButton>
                        <IconButton onClick={cancelEdit} title="취소" aria-label="취소" tone="danger">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
              <tr key={task.id} className="border-t border-separator text-label">
                <td className="px-4 py-3 font-medium">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {task.name}
                    {!task.workItemIds?.length && (
                      <span className="rounded-full bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-label-2" title="과제관리에서 내보내지 않고 직접 만든 과제입니다">
                        과제관리 연결 없음
                      </span>
                    )}
                    {recentlyAddedIds.has(task.id) && (
                      <span className="rounded-full bg-success px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        N
                      </span>
                    )}
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {(scoreByTaskId.get(task.id) ?? 0).toFixed(1)}점
                    </span>
                    <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-label-2">
                      {participantCountByTaskId.get(task.id) ?? 0}명
                    </span>
                    {(task.workItemIds?.length ?? 0) > 0 && (
                      <span
                        className="rounded-full bg-[#14161A] px-2 py-0.5 text-[11px] font-semibold text-white"
                        title={state.workBoard.items
                          .filter((i) => task.workItemIds!.includes(i.id))
                          .map((i) => i.name)
                          .join('\n')}
                      >
                        {task.workItemIds!.length > 1 ? `L3 ${task.workItemIds!.length}건 묶음` : 'L3 연결'}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      isImportanceUsed ? IMPORTANCE_COLORS[task.importance] : 'bg-black/[0.05] text-label-3'
                    }`}
                  >
                    {task.importance}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      isPerformanceGradeUsed && task.performanceGrade ? GRADE_COLORS[task.performanceGrade] : 'bg-black/[0.05] text-label-3'
                    }`}
                    title={task.performanceGrade ? undefined : '아직 안 매김 -- 점수에 들어가지 않습니다'}
                  >
                    {task.performanceGrade ?? '미입력'}
                  </span>
                </td>
                {isWorkloadUsed && (
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      isWorkloadUsed ? WORKLOAD_COLORS[task.workload] : 'bg-black/[0.05] text-label-3'
                    }`}
                  >
                    {task.workload}
                  </span>
                </td>
                )}
                <td className="px-4 py-3 text-label-2">{task.objective || '-'}</td>
                <td className="px-4 py-3 text-label-2">{task.achievement || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <IconButton onClick={() => startEdit(task)} title="수정" aria-label="수정">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </IconButton>
                    <span className="h-4 w-px bg-black/[0.08]" />
                    <IconButton onClick={() => setDeletingTask(task)} title="삭제" aria-label="삭제" tone="danger">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </IconButton>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      <ConfirmDialog
        open={deletingTask !== null}
        title="과제 삭제"
        message={`'${deletingTask?.name}' 과제를 삭제하시겠습니까? 관련된 기여도 데이터도 함께 삭제됩니다.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingTask(null)}
      />
    </div>
  )
}

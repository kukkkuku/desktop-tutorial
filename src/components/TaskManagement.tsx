import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Importance, PerformanceGrade, Task, Workload } from '../types'
import { IMPORTANCE_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import ConfirmDialog from './ConfirmDialog'
import { IMPORTANCE_COLORS, WORKLOAD_COLORS } from '../utils/badgeColors'
import { GRADE_COLORS, calcAllTaskScores } from '../utils/calculations'
import { useResizableColumns } from '../hooks/useResizableColumns'
import ResizableTh from './table/ResizableTh'
import TitleUploadControls from './TitleUploadControls'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import EmptyStateDropzone from './EmptyStateDropzone'
import { downloadCurrentTasksExcel, downloadTaskTemplate, parseTaskWorkbook } from '../utils/excel'
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
  performanceGrade: PerformanceGrade
  objective: string
  achievement: string
}

export default function TaskManagement() {
  const { state, dispatch, recentlyAddedIds, markRecentlyAdded } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const cols = useResizableColumns(TASK_COLUMNS)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

  const [newName, setNewName] = useState('')
  const [newImportance, setNewImportance] = useState<Importance>('일반')
  const [newWorkload, setNewWorkload] = useState<Workload>('중')
  const [newPerformanceGrade, setNewPerformanceGrade] = useState<PerformanceGrade>('B')
  const [newObjective, setNewObjective] = useState('')
  const [newAchievement, setNewAchievement] = useState('')
  const [newFormError, setNewFormError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TaskFormValues>({
    name: '',
    importance: '일반',
    workload: '중',
    performanceGrade: 'B',
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

  function handleQuickAdd() {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      setNewFormError('과제명을 입력하세요.')
      return
    }
    if (state.tasks.some((t) => t.name === trimmedName)) {
      setNewFormError(`과제명 '${trimmedName}'은(는) 이미 존재합니다.`)
      return
    }
    const task: Task = {
      id: uuidv4(),
      name: trimmedName,
      importance: newImportance,
      performanceGrade: newPerformanceGrade,
      workload: newWorkload,
      objective: newObjective.trim(),
      achievement: newAchievement.trim(),
    }
    dispatch({ type: 'ADD_TASK', payload: task })
    markRecentlyAdded([task.id])
    setNewName('')
    setNewImportance('일반')
    setNewWorkload('중')
    setNewPerformanceGrade('B')
    setNewObjective('')
    setNewAchievement('')
    setNewFormError('')
  }

  async function handleUploadFiles(files: File[]) {
    let list = state.tasks
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const result = parseTaskWorkbook(buffer, list)
      list = result.tasks
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => (files.length > 1 ? `[${file.name}] ${m}` : m)))
    }
    dispatch({ type: 'IMPORT_TASKS', payload: list })
    return { addedCount, updatedCount, errors }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-black">과제 관리</h3>
        <div className="flex flex-wrap items-center gap-2">
          <CurrentDataDownloadControls
            disabled={state.tasks.length === 0}
            onExcelDownload={() => downloadCurrentTasksExcel(state.tasks, state.criteria)}
            onPdfDownload={() => downloadTasksPdf(teamName, periodName, state.tasks, state.criteria)}
          />
          <TitleUploadControls busyLabel="과제 업로드 중..." onDownload={downloadTaskTemplate} onFiles={handleUploadFiles} />
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        과제를 추가/삭제하면 평가 매트릭스와 리포트에 즉시 반영됩니다. 삭제 시 관련된 모든 평가 데이터도 함께 제거됩니다.
      </p>

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_2fr_2fr_auto]">
          <div>
            <label className="block text-sm font-medium text-black">
              과제명 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 신규 랜딩페이지 제작"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                newFormError ? 'border-danger' : 'border-gray-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">과제등급</label>
            <select
              value={newImportance}
              onChange={(e) => setNewImportance(e.target.value as Importance)}
              disabled={!isImportanceUsed}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {IMPORTANCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black">업무량</label>
            <select
              value={newWorkload}
              onChange={(e) => setNewWorkload(e.target.value as Workload)}
              disabled={!isWorkloadUsed}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {WORKLOAD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black">성과등급</label>
            <select
              value={newPerformanceGrade}
              onChange={(e) => setNewPerformanceGrade(e.target.value as PerformanceGrade)}
              disabled={!isPerformanceGradeUsed}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >
              {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black">목표</label>
            <input
              type="text"
              value={newObjective}
              onChange={(e) => setNewObjective(e.target.value)}
              placeholder="예: 전환율 15% 개선"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">성과</label>
            <input
              type="text"
              value={newAchievement}
              onChange={(e) => setNewAchievement(e.target.value)}
              placeholder="예: 전환율 18% 달성 (선택)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            />
          </div>
          <div className="flex items-end">
            <Button variant="primary" onClick={handleQuickAdd} className="w-full whitespace-nowrap sm:w-auto">
              + 과제 추가
            </Button>
          </div>
        </div>

        {newFormError && <p className="mt-2 text-xs text-danger">{newFormError}</p>}
      </div>

      {state.tasks.length === 0 ? (
        <EmptyStateDropzone
          title="등록된 과제가 없습니다"
          addHint="위의 '+ 과제 추가' 버튼으로 하나씩 등록하거나, 엑셀 파일로 한 번에 등록하세요"
          busyLabel="과제 업로드 중..."
          onDownloadTemplate={downloadTaskTemplate}
          onFiles={handleUploadFiles}
        />
      ) : (
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        {/* 팀원관리 표와 같은 규칙 -- 컨테이너를 꽉 채우되(width 100%), 너무
            좁아지면 가로 스크롤로 넘긴다(minWidth). 예전에는 폭을 컬럼 너비의
            합(cols.totalWidth = 980px)으로 고정해서, 넓은 화면에서는 표가 화면
            중간에서 끊기고 오른쪽이 빈 채로 남았다. minWidth에서 성과 컬럼을
            빼는 것은 목표·성과처럼 글이 들어가는 칸이 조금 줄어드는 편이
            등급·업무량 같은 짧은 칸이 줄어드는 것보다 낫기 때문이다(팀원관리도
            같은 이유로 역할 컬럼을 뺀다). */}
        <table
          className="table-fixed text-left text-sm"
          style={{ width: '100%', minWidth: cols.totalWidth - cols.widths.achievement }}
        >
          <thead className="bg-[#F3F4F6] text-black">
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
              ).map(([key, label]) => (
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
                  <tr key={task.id} className="border-t border-gray-200 bg-blue-50/40 text-black">
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className={`w-full rounded-md border px-2 py-1.5 text-sm text-black ${
                          editFormError ? 'border-danger' : 'border-gray-300'
                        }`}
                      />
                      {editFormError && <p className="mt-1 text-xs text-danger">{editFormError}</p>}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <select
                        value={editForm.importance}
                        onChange={(e) => setEditForm((f) => ({ ...f, importance: e.target.value as Importance }))}
                        disabled={!isImportanceUsed}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        {IMPORTANCE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <select
                        value={editForm.performanceGrade}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, performanceGrade: e.target.value as PerformanceGrade }))
                        }
                        disabled={!isPerformanceGradeUsed}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <select
                        value={editForm.workload}
                        onChange={(e) => setEditForm((f) => ({ ...f, workload: e.target.value as Workload }))}
                        disabled={!isWorkloadUsed}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        {WORKLOAD_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.objective}
                        onChange={(e) => setEditForm((f) => ({ ...f, objective: e.target.value }))}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.achievement}
                        onChange={(e) => setEditForm((f) => ({ ...f, achievement: e.target.value }))}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
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
              <tr key={task.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-medium">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {task.name}
                    {recentlyAddedIds.has(task.id) && (
                      <span className="rounded-full bg-success px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        N
                      </span>
                    )}
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {(scoreByTaskId.get(task.id) ?? 0).toFixed(1)}점
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {participantCountByTaskId.get(task.id) ?? 0}명
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      isImportanceUsed ? IMPORTANCE_COLORS[task.importance] : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {task.importance}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      isPerformanceGradeUsed ? GRADE_COLORS[task.performanceGrade] : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {task.performanceGrade}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      isWorkloadUsed ? WORKLOAD_COLORS[task.workload] : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {task.workload}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{task.objective || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{task.achievement || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <IconButton onClick={() => startEdit(task)} title="수정" aria-label="수정">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </IconButton>
                    <span className="h-4 w-px bg-gray-200" />
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

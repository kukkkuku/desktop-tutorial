import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Task } from '../types'
import TaskModal from './TaskModal'
import ConfirmDialog from './ConfirmDialog'
import ImportFeedback from './ImportFeedback'
import Spinner from './Spinner'
import { downloadTaskTemplate, parseTaskWorkbook, type TaskImportResult } from '../utils/excel'
import { IMPORTANCE_COLORS, WORKLOAD_COLORS } from '../utils/badgeColors'
import { GRADE_COLORS } from '../utils/calculations'

export default function TaskManagement() {
  const { state, dispatch } = useAppState()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [importResult, setImportResult] = useState<TaskImportResult | null>(null)
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set())
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function openAddModal() {
    setEditingTask(null)
    setModalOpen(true)
  }

  function openEditModal(task: Task) {
    setEditingTask(task)
    setModalOpen(true)
  }

  function handleSave(task: Task) {
    if (editingTask) {
      dispatch({ type: 'UPDATE_TASK', payload: task })
    } else {
      dispatch({ type: 'ADD_TASK', payload: task })
    }
    setModalOpen(false)
    setEditingTask(null)
  }

  function handleDeleteConfirm() {
    if (deletingTask) {
      dispatch({ type: 'DELETE_TASK', payload: { id: deletingTask.id } })
      setDeletingTask(null)
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setIsUploading(true)
    let tasks = state.tasks
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    const addedIds: string[] = []

    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const result = parseTaskWorkbook(buffer, tasks)
      tasks = result.tasks
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      addedIds.push(...result.addedIds)
      errors.push(...result.errors.map((msg) => (files.length > 1 ? `[${file.name}] ${msg}` : msg)))
    }

    dispatch({ type: 'IMPORT_TASKS', payload: tasks })
    setImportResult({ tasks, errors, importedCount: addedCount + updatedCount, addedCount, updatedCount, addedIds })
    setRecentlyAddedIds(new Set(addedIds))
    setIsUploading(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-black">과제 관리</h2>
        <button
          onClick={openAddModal}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + 과제 추가
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        과제를 추가/삭제하면 평가 매트릭스와 리포트에 즉시 반영됩니다. 삭제 시 관련된 모든 평가 데이터도 함께 제거됩니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
        <button
          onClick={downloadTaskTemplate}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-100"
        >
          엑셀 양식 다운로드
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 rounded-md border-2 border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading && <Spinner />}
          {isUploading ? '업로드 중...' : '엑셀로 업로드'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={handleFileSelected}
        />
        <span className="text-sm text-gray-500">
          과제명, 과제등급(중점/핵심/일반/지원), 업무량(대/중/소), 목표, 성과, 성과등급(S/A/B/C/D) 컬럼을 포함한 엑셀 파일을 업로드하세요. 여러 파일을 한 번에 선택할 수 있습니다.
        </span>
      </div>

      {importResult && (
        <ImportFeedback
          addedCount={importResult.addedCount}
          updatedCount={importResult.updatedCount}
          errors={importResult.errors}
          onDismiss={() => {
            setImportResult(null)
            setRecentlyAddedIds(new Set())
          }}
        />
      )}

      {state.tasks.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm leading-relaxed text-gray-500">
          등록된 과제가 없습니다.
          <br />
          '+ 과제 추가' 버튼으로 직접 등록하거나,
          <br />
          위의 '엑셀로 업로드' 버튼으로 여러 과제를 한 번에 등록할 수 있습니다.
        </p>
      ) : (
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">과제명</th>
              <th className="px-4 py-3 font-semibold">과제등급</th>
              <th className="px-4 py-3 font-semibold">성과등급</th>
              <th className="px-4 py-3 font-semibold">업무량</th>
              <th className="px-4 py-3 font-semibold">목표</th>
              <th className="px-4 py-3 font-semibold">성과</th>
              <th className="px-4 py-3 font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {state.tasks.map((task) => (
              <tr key={task.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {task.name}
                    {recentlyAddedIds.has(task.id) && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        N
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${IMPORTANCE_COLORS[task.importance]}`}>
                    {task.importance}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${GRADE_COLORS[task.performanceGrade]}`}>
                    {task.performanceGrade}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${WORKLOAD_COLORS[task.workload]}`}>
                    {task.workload}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{task.objective || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{task.achievement || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(task)}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-100"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => setDeletingTask(task)}
                      className="rounded-md border border-danger px-3 py-1 text-xs font-medium text-danger hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {modalOpen && (
        <TaskModal
          initialTask={editingTask}
          existingNames={state.tasks.map((t) => t.name)}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false)
            setEditingTask(null)
          }}
        />
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

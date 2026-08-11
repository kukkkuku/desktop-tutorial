import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { Task } from '../types'
import TaskModal from './TaskModal'
import ConfirmDialog from './ConfirmDialog'

export default function TaskManagement() {
  const { state, dispatch } = useAppState()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

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

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">과제명</th>
              <th className="px-4 py-3 font-semibold">중요도</th>
              <th className="px-4 py-3 font-semibold">성과등급</th>
              <th className="px-4 py-3 font-semibold">업무량</th>
              <th className="px-4 py-3 font-semibold">목표</th>
              <th className="px-4 py-3 font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {state.tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  등록된 과제가 없습니다. '+ 과제 추가' 버튼을 눌러 과제를 등록하세요.
                </td>
              </tr>
            )}
            {state.tasks.map((task) => (
              <tr key={task.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-medium">{task.name}</td>
                <td className="px-4 py-3">{task.importance}</td>
                <td className="px-4 py-3">{task.performanceGrade}</td>
                <td className="px-4 py-3">{task.workload}</td>
                <td className="px-4 py-3 text-gray-600">{task.objective}</td>
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

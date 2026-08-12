import { useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { useWorkspaces, workspaceStateKey } from '../state/WorkspaceContext'
import WorkspaceModal from './WorkspaceModal'
import ConfirmDialog from './ConfirmDialog'

function readWorkspaceCounts(id: string): { taskCount: number; memberCount: number } {
  try {
    const raw = localStorage.getItem(workspaceStateKey(id))
    if (!raw) return { taskCount: 0, memberCount: 0 }
    const parsed = JSON.parse(raw)
    return {
      taskCount: Array.isArray(parsed.tasks) ? parsed.tasks.length : 0,
      memberCount: Array.isArray(parsed.members) ? parsed.members.length : 0,
    }
  } catch {
    return { taskCount: 0, memberCount: 0 }
  }
}

export default function WorkspaceLanding() {
  const { workspaces, createWorkspace, selectWorkspace, deleteWorkspace, renameWorkspace } = useWorkspaces()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)

  function openCreateModal() {
    setEditingWorkspace(null)
    setModalOpen(true)
  }

  function openEditModal(e: React.MouseEvent, workspace: WorkspaceMeta) {
    e.stopPropagation()
    setEditingWorkspace(workspace)
    setModalOpen(true)
  }

  function handleSave(teamName: string, periodName: string) {
    if (editingWorkspace) {
      renameWorkspace(editingWorkspace.id, teamName, periodName)
    } else {
      createWorkspace(teamName, periodName)
    }
    setModalOpen(false)
    setEditingWorkspace(null)
  }

  function handleDeleteConfirm() {
    if (deletingWorkspace) {
      deleteWorkspace(deletingWorkspace.id)
      setDeletingWorkspace(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-3 sm:px-6">
          <div className="text-lg font-bold text-black">UX팀 성과평가 시스템</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-black">평가 선택</h1>
            <p className="mt-1 text-sm text-gray-600">팀과 평가 기간별로 데이터를 나눠서 관리할 수 있습니다.</p>
          </div>
          <button
            onClick={openCreateModal}
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + 새 평가 만들기
          </button>
        </div>

        {workspaces.length === 0 ? (
          <p className="mt-8 rounded-md bg-gray-50 px-4 py-10 text-center text-sm leading-relaxed text-gray-500">
            아직 만들어진 평가가 없습니다.
            <br />
            '+ 새 평가 만들기' 버튼을 눌러 팀 이름과 평가 기간을 입력하고 시작하세요.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {workspaces.map((workspace) => {
              const { taskCount, memberCount } = readWorkspaceCounts(workspace.id)
              return (
                <div
                  key={workspace.id}
                  onClick={() => selectWorkspace(workspace.id)}
                  className="cursor-pointer rounded-lg border border-gray-200 px-4 py-4 text-left hover:border-accent hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-black">{workspace.teamName}</p>
                      <p className="mt-0.5 text-sm text-gray-600">{workspace.periodName}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={(e) => openEditModal(e, workspace)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-black hover:bg-gray-100"
                      >
                        수정
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletingWorkspace(workspace)
                        }}
                        className="rounded-md border border-danger px-2 py-1 text-xs font-medium text-danger hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    과제 {taskCount}건 · 팀원 {memberCount}명
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {modalOpen && (
        <WorkspaceModal
          initialWorkspace={editingWorkspace}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false)
            setEditingWorkspace(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deletingWorkspace !== null}
        title="평가 삭제"
        message={`'${deletingWorkspace?.teamName} - ${deletingWorkspace?.periodName}' 평가를 삭제하시겠습니까? 저장된 모든 데이터가 함께 삭제되며 되돌릴 수 없습니다.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingWorkspace(null)}
      />
    </div>
  )
}

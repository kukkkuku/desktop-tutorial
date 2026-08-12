import { useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { useWorkspaces, workspaceStateKey } from '../state/WorkspaceContext'
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
  const [selectedId, setSelectedId] = useState(workspaces[0]?.id ?? '')
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renameTeamName, setRenameTeamName] = useState('')
  const [renamePeriodName, setRenamePeriodName] = useState('')

  const [newTeamName, setNewTeamName] = useState('')
  const [newPeriodName, setNewPeriodName] = useState('')
  const [createError, setCreateError] = useState('')

  const selectedWorkspace = workspaces.find((w) => w.id === selectedId) ?? null

  function handleOpen() {
    if (selectedWorkspace) selectWorkspace(selectedWorkspace.id)
  }

  function openRename(workspace: WorkspaceMeta) {
    setRenamingWorkspace(workspace)
    setRenameTeamName(workspace.teamName)
    setRenamePeriodName(workspace.periodName)
  }

  function handleRenameSave() {
    if (!renamingWorkspace) return
    if (!renameTeamName.trim() || !renamePeriodName.trim()) return
    renameWorkspace(renamingWorkspace.id, renameTeamName, renamePeriodName)
    setRenamingWorkspace(null)
  }

  function handleDeleteConfirm() {
    if (deletingWorkspace) {
      deleteWorkspace(deletingWorkspace.id)
      if (selectedId === deletingWorkspace.id) setSelectedId('')
      setDeletingWorkspace(null)
    }
  }

  function handleCreate() {
    if (!newTeamName.trim()) {
      setCreateError('팀 이름을 입력하세요.')
      return
    }
    if (!newPeriodName.trim()) {
      setCreateError('평가 기간을 입력하세요.')
      return
    }
    createWorkspace(newTeamName, newPeriodName)
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-3 sm:px-6">
          <h1 className="text-lg font-bold text-black">성과관리</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-12 sm:px-6">
        <p className="text-center text-sm text-gray-600">팀과 평가 기간을 선택하거나 새로 시작하세요.</p>

        <section className="mt-8 w-full rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500">기존 평가 열기</h2>
          {workspaces.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">아직 만들어진 평가가 없습니다.</p>
          ) : (
            <>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.teamName} · {w.periodName}
                  </option>
                ))}
              </select>
              {selectedWorkspace && (
                <p className="mt-2 text-xs text-gray-500">
                  과제 {readWorkspaceCounts(selectedWorkspace.id).taskCount}건 · 팀원{' '}
                  {readWorkspaceCounts(selectedWorkspace.id).memberCount}명
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleOpen}
                  className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  열기
                </button>
                <button
                  onClick={() => selectedWorkspace && openRename(selectedWorkspace)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-100"
                >
                  수정
                </button>
                <button
                  onClick={() => selectedWorkspace && setDeletingWorkspace(selectedWorkspace)}
                  className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            </>
          )}
        </section>

        <div className="my-6 flex w-full items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          또는
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <section className="w-full rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500">새 평가 시작하기</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-sm font-medium text-black">팀 이름</label>
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="예: UX팀"
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                  createError && !newTeamName.trim() ? 'border-danger' : 'border-gray-300'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black">평가 기간</label>
              <input
                type="text"
                value={newPeriodName}
                onChange={(e) => setNewPeriodName(e.target.value)}
                placeholder="예: 2026 상반기"
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                  createError && !newPeriodName.trim() ? 'border-danger' : 'border-gray-300'
                }`}
              />
            </div>
            {createError && <p className="text-xs text-danger">{createError}</p>}
            <button
              onClick={handleCreate}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              시작하기
            </button>
          </div>
        </section>
      </main>

      {renamingWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-black">평가 정보 수정</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-black">팀 이름</label>
                <input
                  type="text"
                  value={renameTeamName}
                  onChange={(e) => setRenameTeamName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black">평가 기간</label>
                <input
                  type="text"
                  value={renamePeriodName}
                  onChange={(e) => setRenamePeriodName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setRenamingWorkspace(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={handleRenameSave}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                저장
              </button>
            </div>
          </div>
        </div>
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

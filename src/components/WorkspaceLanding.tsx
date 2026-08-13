import { useEffect, useState } from 'react'
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
  // Default to the most recently created workspace, not the first one ever
  // made, so returning users land on the team/period they were just using.
  const mostRecentWorkspace = workspaces[workspaces.length - 1]
  const [selectedId, setSelectedId] = useState(mostRecentWorkspace?.id ?? '')
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renameTeamName, setRenameTeamName] = useState('')
  const [renamePeriodName, setRenamePeriodName] = useState('')

  const [newTeamName, setNewTeamName] = useState(mostRecentWorkspace?.teamName ?? '')
  const [newPeriodName, setNewPeriodName] = useState('')
  const [createError, setCreateError] = useState('')
  const [teamNameFocused, setTeamNameFocused] = useState(false)

  const selectedWorkspace = workspaces.find((w) => w.id === selectedId) ?? null

  // Keep the "새 평가 시작하기" team name in sync with whichever workspace is
  // currently picked in "기존 평가 열기" above it, so it's never stuck showing
  // the very first team ever created when there are multiple teams.
  useEffect(() => {
    setNewTeamName(selectedWorkspace?.teamName ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])
  const existingTeamNames = Array.from(new Set(workspaces.map((w) => w.teamName)))
  const trimmedNewTeamName = newTeamName.trim()
  const isExactExistingTeam = existingTeamNames.includes(trimmedNewTeamName)
  const teamNameSuggestions = trimmedNewTeamName
    ? existingTeamNames.filter(
        (name) => name !== trimmedNewTeamName && name.toLowerCase().includes(trimmedNewTeamName.toLowerCase()),
      )
    : existingTeamNames

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
      <main className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-16 sm:px-6">
        <h1 className="text-center text-3xl font-black text-black">성과관리</h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          팀 성과 평가를 시작하거나 기존 평가를 이어서 작업하세요.
        </p>

        <section className="mt-10 w-full rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-500">기존 평가 열기</h2>
          {workspaces.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">아직 만들어진 평가가 없습니다.</p>
          ) : (
            <>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-black"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.teamName} · {w.periodName}
                  </option>
                ))}
              </select>
              {selectedWorkspace && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-4 py-3 text-sm">
                  <span className="font-medium text-black">
                    {selectedWorkspace.teamName} · {selectedWorkspace.periodName}
                  </span>
                  <span className="text-gray-500">
                    과제 {readWorkspaceCounts(selectedWorkspace.id).taskCount}개 &nbsp; 팀원{' '}
                    {readWorkspaceCounts(selectedWorkspace.id).memberCount}명
                  </span>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleOpen}
                  className="flex-1 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
                >
                  열기
                </button>
                <button
                  onClick={() => selectedWorkspace && openRename(selectedWorkspace)}
                  className="rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-black hover:bg-gray-100"
                >
                  수정
                </button>
                <button
                  onClick={() => selectedWorkspace && setDeletingWorkspace(selectedWorkspace)}
                  className="rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-black hover:bg-gray-100"
                >
                  삭제
                </button>
              </div>
            </>
          )}
        </section>

        <div className="my-8 flex w-full items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          또는
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <section className="w-full rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-500">새 평가 시작하기</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative">
              <label className="block text-sm font-medium text-black">팀 이름</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onFocus={() => setTeamNameFocused(true)}
                  onBlur={() => setTeamNameFocused(false)}
                  placeholder="예: UX팀"
                  autoComplete="off"
                  className={`w-full rounded-md border px-3 py-2.5 text-sm text-black ${
                    newTeamName ? 'pr-9' : ''
                  } ${createError && !newTeamName.trim() ? 'border-danger' : 'border-gray-300'}`}
                />
                {newTeamName && (
                  <button
                    type="button"
                    onClick={() => setNewTeamName('')}
                    aria-label="팀 이름 지우기"
                    className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
                      <path d="M18 6 6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {teamNameFocused && teamNameSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
                  {teamNameSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setNewTeamName(name)}
                      className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-50"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {isExactExistingTeam && (
                <p className="mt-1 text-xs text-gray-500">기존 '{trimmedNewTeamName}' 팀에 새 기간으로 추가돼요.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-black">평가 기간</label>
              <input
                type="text"
                value={newPeriodName}
                onChange={(e) => setNewPeriodName(e.target.value)}
                placeholder="예: 2026 상반기"
                className={`mt-1 w-full rounded-md border px-3 py-2.5 text-sm text-black ${
                  createError && !newPeriodName.trim() ? 'border-danger' : 'border-gray-300'
                }`}
              />
            </div>
          </div>
          {createError && <p className="mt-3 text-xs text-danger">{createError}</p>}
          <button
            onClick={handleCreate}
            className="mt-4 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            새 평가 시작하기 →
          </button>
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

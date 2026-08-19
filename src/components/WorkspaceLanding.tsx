import { useMemo, useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { useWorkspaces } from '../state/WorkspaceContext'
import ConfirmDialog from './ConfirmDialog'
import EvaluationPeriodPicker from './EvaluationPeriodPicker'
import IconButton from './IconButton'

export default function WorkspaceLanding() {
  const { workspaces, selectWorkspace, deleteWorkspace, renameWorkspace } = useWorkspaces()
  const existingTeamNames = useMemo(() => Array.from(new Set(workspaces.map((w) => w.teamName))), [workspaces])
  const mostRecentTeam = useMemo(() => {
    const sorted = [...workspaces].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return sorted[sorted.length - 1]?.teamName ?? ''
  }, [workspaces])

  const [teamName, setTeamName] = useState(mostRecentTeam)
  const [addingNewTeam, setAddingNewTeam] = useState(existingTeamNames.length === 0)
  const [newTeamInput, setNewTeamInput] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renameTeamName, setRenameTeamName] = useState('')
  const [renamePeriodName, setRenamePeriodName] = useState('')

  const activeTeamName = addingNewTeam ? newTeamInput.trim() : teamName
  const teamWorkspaces = workspaces
    .filter((w) => w.teamName === teamName)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

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
      setDeletingWorkspace(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-16 sm:px-6">
        <h1 className="text-center text-3xl font-black text-black">성과관리</h1>
        <p className="mt-2 text-center text-sm text-gray-500">평가 기간을 고르면 이어서 작업하거나 새로 시작합니다.</p>

        {existingTeamNames.length > 0 && (
          <div className="mt-8 w-full">
            <label className="block text-sm font-medium text-black">팀</label>
            {addingNewTeam ? (
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newTeamInput}
                  onChange={(e) => setNewTeamInput(e.target.value)}
                  placeholder="새 팀 이름"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2.5 text-sm text-black"
                />
                <button
                  onClick={() => {
                    setAddingNewTeam(false)
                    setNewTeamInput('')
                  }}
                  className="shrink-0 rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-black hover:bg-gray-50"
                >
                  취소
                </button>
              </div>
            ) : (
              <div className="mt-1 flex gap-2">
                <select
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-black"
                >
                  {existingTeamNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setAddingNewTeam(true)}
                  className="shrink-0 rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-black hover:bg-gray-50"
                >
                  + 새 팀
                </button>
              </div>
            )}
          </div>
        )}

        {addingNewTeam && existingTeamNames.length === 0 && (
          <div className="mt-8 w-full">
            <label className="block text-sm font-medium text-black">팀 이름</label>
            <input
              type="text"
              autoFocus
              value={newTeamInput}
              onChange={(e) => setNewTeamInput(e.target.value)}
              placeholder="예: UX팀"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-black"
            />
          </div>
        )}

        {activeTeamName && (
          <div className="mt-4 w-full">
            <label className="block text-sm font-medium text-black">평가 기간</label>
            <div className="mt-1">
              <EvaluationPeriodPicker key={activeTeamName} teamName={activeTeamName} onDone={selectWorkspace} />
            </div>
          </div>
        )}

        {!addingNewTeam && teamWorkspaces.length > 1 && (
          <div className="mt-6 w-full">
            <button
              onClick={() => setManageOpen((v) => !v)}
              className="text-xs font-medium text-gray-400 hover:text-gray-600"
            >
              {manageOpen ? '평가 목록 접기' : `이 팀의 다른 평가 보기 (${teamWorkspaces.length})`}
            </button>
            {manageOpen && (
              <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                {teamWorkspaces.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <button onClick={() => selectWorkspace(w.id)} className="text-left text-black hover:text-accent hover:underline">
                      {w.evaluationYear} {w.periodName}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton onClick={() => openRename(w)} title="수정" aria-label="수정">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </IconButton>
                      <IconButton onClick={() => setDeletingWorkspace(w)} title="삭제" aria-label="삭제" tone="danger">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
                <label className="block text-sm font-medium text-black">평가 기간 표시명</label>
                <input
                  type="text"
                  value={renamePeriodName}
                  onChange={(e) => setRenamePeriodName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                />
                <p className="mt-1 text-xs text-gray-400">화면에 보이는 이름만 바뀝니다. 연도/주기 값은 유지됩니다.</p>
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

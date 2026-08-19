import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import ConfirmDialog from './ConfirmDialog'
import EvaluationPeriodPicker from './EvaluationPeriodPicker'
import IconButton from './IconButton'

export default function WorkspaceLanding() {
  const { workspaces, selectWorkspace, deleteWorkspace, renameWorkspace } = useWorkspaces()
  const existingTeamNames = useMemo(() => Array.from(new Set(workspaces.map((w) => w.teamName))), [workspaces])
  const mostRecentTeam = useMemo(() => {
    const sorted = [...workspaces].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    return sorted[sorted.length - 1]?.teamName ?? ''
  }, [workspaces])

  const [teamName, setTeamName] = useState(mostRecentTeam)
  const [addingNewTeam, setAddingNewTeam] = useState(existingTeamNames.length === 0)
  const [newTeamInput, setNewTeamInput] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renameTeamName, setRenameTeamName] = useState('')
  const [renamePeriodName, setRenamePeriodName] = useState('')

  // teamName/addingNewTeam은 useState 초기값이라 마운트 시점 이후로는 저절로
  // 안 바뀐다. 그래서 선택돼 있던 팀을 지워 팀이 하나도 안 남거나(팀 이름
  // 입력창을 다시 보여줘야 함), 다른 팀을 지워서 지금 선택된 teamName이
  // 더 이상 존재하지 않게 되면 상태가 붕 떠서 "팀은 안 보이는데 평가
  // 만들기 화면만 뜨는" 상태가 됐다. 목록이 바뀔 때마다 유효한 팀을
  // 가리키도록 다시 맞춘다.
  useEffect(() => {
    if (addingNewTeam) return
    if (existingTeamNames.length === 0) {
      setAddingNewTeam(true)
      return
    }
    if (!existingTeamNames.includes(teamName)) {
      setTeamName(mostRecentTeam || existingTeamNames[0])
    }
  }, [existingTeamNames, teamName, mostRecentTeam, addingNewTeam])

  const activeTeamName = addingNewTeam ? newTeamInput.trim() : teamName
  // 최근 수정한 평가가 맨 위로 오도록 정렬 -- "지금까지 만들어진 평가가
  // 뭐가 있는지" 한눈에 보이는 게 이 화면의 첫 번째 목적이라, 평가기간
  // 선택기보다 이 목록을 먼저 보여준다.
  const teamWorkspaces = workspaces
    .filter((w) => w.teamName === teamName)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

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
        <p className="mt-2 text-center text-sm text-gray-500">진행 중인 평가를 이어서 작업하거나 새로 시작합니다.</p>

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
                  onChange={(e) => {
                    setTeamName(e.target.value)
                    setCreatingNew(false)
                  }}
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

        {activeTeamName && !addingNewTeam && teamWorkspaces.length > 0 && (
          <div className="mt-6 w-full">
            <label className="block text-sm font-medium text-black">평가 목록</label>
            <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {teamWorkspaces.map((w) => {
                const counts = readWorkspaceCounts(w.id)
                return (
                  <li key={w.id} className="flex items-center gap-2 px-4 py-3">
                    <button onClick={() => selectWorkspace(w.id)} className="min-w-0 flex-1 text-left">
                      <p className="font-semibold text-black">
                        {w.evaluationYear} {w.periodName}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        과제 {counts.taskCount}개 · 팀원 {counts.memberCount}명 · 최근 수정 {fmtWorkspaceDate(w.updatedAt)}
                      </p>
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
                )
              })}
            </ul>

            {!creatingNew ? (
              <button onClick={() => setCreatingNew(true)} className="mt-3 text-sm font-semibold text-accent hover:underline">
                + 새 평가 만들기
              </button>
            ) : (
              <div className="mt-3 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-black">평가 기간</label>
                  <IconButton onClick={() => setCreatingNew(false)} aria-label="닫기" title="닫기">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
                      <path d="M18 6 6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </IconButton>
                </div>
                <div className="mt-1">
                  <EvaluationPeriodPicker key={activeTeamName} teamName={activeTeamName} onDone={selectWorkspace} />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTeamName && (addingNewTeam || teamWorkspaces.length === 0) && (
          <div className="mt-4 w-full">
            <label className="block text-sm font-medium text-black">평가 기간</label>
            <div className="mt-1">
              <EvaluationPeriodPicker key={activeTeamName} teamName={activeTeamName} onDone={selectWorkspace} />
            </div>
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

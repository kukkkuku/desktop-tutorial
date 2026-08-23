import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import Badge from './Badge'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import EvaluationPeriodPicker from './EvaluationPeriodPicker'
import IconButton from './IconButton'

const MAX_VISIBLE_AVATARS = 6

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

// 팀원 이니셜(2자) 아바타 -- 색은 인덱스(카드마다 0부터 다시 시작)로
// 정하지 않고 전부 같은 중립 톤으로 통일한다. 순환 색상을 쓰면 카드마다
// "몇 번째로 나열됐는가"에 따라 색이 정해져서 실제로는 다른 사람인데
// 같은 색으로 보이는 경우가 생기고, 카드가 여러 개면 화면 전체가 알록달록
// 산만해진다. 카드 폭(300px)을 넘지 않도록 일정 인원 이상은 "+N"으로 접는다.
// 4명까지는 여백을 둔 채 나란히, 그 이상은 메신저 아바타 스택처럼
// 1/4씩 겹쳐서 항상 한 줄에 들어오게 한다. 겹칠 때는 뒤 아바타가 앞
// 아바타 위로 올라오는 게 자연스럽도록 흰 테두리(2px)로 구분한다.
function AvatarRow({ names }: { names: string[] }) {
  const overlapped = names.length > 4
  const visible = names.slice(0, MAX_VISIBLE_AVATARS)
  const overflow = names.length - visible.length
  const circleClass = `flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[15px] font-semibold text-gray-600 ${
    overlapped ? 'border-2 border-white' : ''
  }`
  const overlapStyle = (i: number) => (overlapped && i > 0 ? { marginLeft: '-10px' } : undefined)

  return (
    <div className={`flex flex-nowrap items-center ${overlapped ? '' : 'gap-2'}`}>
      {visible.map((name, i) => (
        <span key={`${name}-${i}`} className={circleClass} style={overlapStyle(i)} title={name}>
          {name.slice(0, 2)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[15px] font-semibold text-gray-500 ${
            overlapped ? 'border-2 border-white' : ''
          }`}
          style={overlapStyle(visible.length)}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}

interface ProjectCardProps {
  workspace: WorkspaceMeta
  onOpen: (id: string) => void
  onEdit: (workspace: WorkspaceMeta) => void
  onDelete: (workspace: WorkspaceMeta) => void
}

function ProjectCard({ workspace, onOpen, onEdit, onDelete }: ProjectCardProps) {
  const counts = readWorkspaceCounts(workspace.id)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(workspace.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(workspace.id)
      }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-[0_8px_24px_0_rgba(15,23,42,0.02)] transition-shadow hover:shadow-[0_8px_24px_0_rgba(15,23,42,0.08)]"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-black">
              {workspace.evaluationYear} {workspace.periodName}
            </p>
            <p className="mt-1.5 text-xs text-gray-400">최근 수정 {fmtWorkspaceDate(workspace.updatedAt)}</p>
          </div>
          <Badge className="shrink-0">팀원 {counts.memberCount}명</Badge>
        </div>
        <AvatarRow names={counts.memberNames} />
      </div>
      <div className="border-t border-gray-100" />
      <div className="flex items-center justify-between bg-[#fcfdfe] px-6 py-4">
        <span className="flex items-center gap-1 text-sm font-semibold text-accent">
          프로젝트 열기
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
        <div className="flex items-center gap-4 text-sm font-medium">
          <button onClick={(e) => { e.stopPropagation(); onEdit(workspace) }} className="text-gray-500 hover:text-black">
            수정
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(workspace) }} className="text-danger hover:opacity-80">
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

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
      <main className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">
        <p className="text-sm text-gray-500">진행할 팀과 평가기간을 선택하세요.</p>

        {existingTeamNames.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-8">
            {addingNewTeam ? (
              <div className="flex flex-1 gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newTeamInput}
                  onChange={(e) => setNewTeamInput(e.target.value)}
                  placeholder="새 팀 이름"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2.5 text-sm text-black"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAddingNewTeam(false)
                    setNewTeamInput('')
                  }}
                >
                  취소
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {existingTeamNames.map((name) => {
                    const teamWs = workspaces.filter((w) => w.teamName === name)
                    const mostRecentWs = [...teamWs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
                    const memberCount = mostRecentWs ? readWorkspaceCounts(mostRecentWs.id).memberCount : 0
                    const active = name === teamName
                    return (
                      <button
                        key={name}
                        onClick={() => {
                          setTeamName(name)
                          setCreatingNew(false)
                        }}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-4 py-2.5 text-sm transition-colors ${
                          active ? 'border-accent text-accent' : 'border-gray-300 text-gray-500 hover:border-gray-400'
                        }`}
                      >
                        <span className="font-bold">{name}</span>
                        <span className="font-medium opacity-70">
                          {memberCount}명 · {teamWs.length}개
                        </span>
                      </button>
                    )
                  })}
                </div>
                <Button variant="secondary" onClick={() => setAddingNewTeam(true)} className="flex shrink-0 items-center gap-1.5">
                  <PlusIcon className="h-3.5 w-3.5" /> 새 팀
                </Button>
              </>
            )}
          </div>
        )}

        {addingNewTeam && existingTeamNames.length === 0 && (
          <div className="mt-8">
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

        {activeTeamName && addingNewTeam && (
          <div className="mt-8">
            <label className="block text-sm font-medium text-black">평가 기간</label>
            <div className="mt-1">
              <EvaluationPeriodPicker key={activeTeamName} teamName={activeTeamName} onDone={selectWorkspace} />
            </div>
          </div>
        )}

        {activeTeamName && !addingNewTeam && (
          <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-end gap-3">
                <h2 className="text-xl font-bold text-black">{teamName}</h2>
                <span className="text-sm text-gray-500">평가 프로젝트 {teamWorkspaces.length}개</span>
              </div>
              {teamWorkspaces.length > 0 && !creatingNew && (
                <Button variant="primary" onClick={() => setCreatingNew(true)} className="flex items-center gap-1.5">
                  <PlusIcon className="h-3.5 w-3.5" /> 새 평가 만들기
                </Button>
              )}
            </div>

            {teamWorkspaces.length === 0 || creatingNew ? (
              <div className="mt-4 rounded-lg border border-gray-200 p-4">
                {teamWorkspaces.length > 0 && (
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-black">평가 기간</label>
                    <IconButton onClick={() => setCreatingNew(false)} aria-label="닫기" title="닫기">
                      <XIcon className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
                <div className="mt-1">
                  <EvaluationPeriodPicker key={activeTeamName} teamName={activeTeamName} onDone={selectWorkspace} />
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {teamWorkspaces.map((w) => (
                  <ProjectCard key={w.id} workspace={w} onOpen={selectWorkspace} onEdit={openRename} onDelete={setDeletingWorkspace} />
                ))}
              </div>
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

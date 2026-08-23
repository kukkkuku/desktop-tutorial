import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import { useGoogleAccount } from '../hooks/useGoogleAccount'
import { connectDifferentAccount } from '../utils/googleDrive'
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

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
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

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="10" r="4" />
    </svg>
  )
}

// 팀원 이니셜(2자) 아바타 -- 색은 인덱스(카드마다 0부터 다시 시작)로
// 정하지 않고 전부 같은 중립 톤으로 통일한다. 순환 색상을 쓰면 카드마다
// "몇 번째로 나열됐는가"에 따라 색이 정해져서 실제로는 다른 사람인데
// 같은 색으로 보이는 경우가 생기고, 카드가 여러 개면 화면 전체가 알록달록
// 산만해진다.
// 겹침 여부는 인원 수로 고정하지 않고, 실제 카드 폭에 다 나란히 들어갈
// 여유가 있는지 측정해서 정한다 -- 여유가 있으면 그냥 나란히 두고,
// 폭이 부족할 때만 메신저 아바타 스택처럼 1/4씩 겹쳐서 항상 한 줄에
// 들어오게 한다. 겹칠 때는 뒤 아바타가 앞 아바타 위로 올라오는 게
// 자연스럽도록 흰 테두리(2px)로 구분한다.
const AVATAR_SIZE = 32
const AVATAR_GAP = 6
const AVATAR_OVERLAP = 8

function AvatarRow({ names }: { names: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [overlapped, setOverlapped] = useState(false)
  const visible = names.slice(0, MAX_VISIBLE_AVATARS)
  const overflow = names.length - visible.length
  const itemCount = visible.length + (overflow > 0 ? 1 : 0)

  useEffect(() => {
    const el = containerRef.current
    if (!el || itemCount === 0) return
    const spacedWidth = itemCount * AVATAR_SIZE + (itemCount - 1) * AVATAR_GAP
    const update = () => setOverlapped(el.getBoundingClientRect().width < spacedWidth)
    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [itemCount])

  const circleClass = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 ${
    overlapped ? 'border-2 border-white' : ''
  }`
  const overlapStyle = (i: number) => (overlapped && i > 0 ? { marginLeft: `-${AVATAR_OVERLAP}px` } : undefined)

  return (
    <div ref={containerRef} className={`flex flex-nowrap items-center ${overlapped ? '' : 'gap-1.5'}`}>
      {visible.map((name, i) => (
        <span key={`${name}-${i}`} className={circleClass} style={overlapStyle(i)} title={name}>
          {name.slice(0, 2)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500 ${
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
      className="flex cursor-pointer flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-6 text-left shadow-[0_8px_24px_0_rgba(15,23,42,0.02)] transition-shadow hover:shadow-[0_8px_24px_0_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-lg font-bold text-black">
          {workspace.evaluationYear} {workspace.periodName}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            onClick={(e) => {
              e.stopPropagation()
              onEdit(workspace)
            }}
            title="수정"
            aria-label="수정"
          >
            <PencilIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            onClick={(e) => {
              e.stopPropagation()
              onDelete(workspace)
            }}
            title="삭제"
            aria-label="삭제"
            tone="danger"
          >
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-gray-400">최근 수정 {fmtWorkspaceDate(workspace.updatedAt)}</p>
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">팀원 {counts.memberCount}명</span>
      </div>
      <AvatarRow names={counts.memberNames} />
    </div>
  )
}

export default function WorkspaceLanding() {
  const { workspaces, selectWorkspace, deleteWorkspace, renameWorkspace } = useWorkspaces()
  const { accountEmail, isAdminUser, refreshAccount, handleLogout } = useGoogleAccount()
  const [switchingAccount, setSwitchingAccount] = useState(false)

  async function handleConnectDifferentAccount() {
    setSwitchingAccount(true)
    try {
      await connectDifferentAccount()
      refreshAccount()
    } catch {
      // 계정 전환 실패는 조용히 무시 -- 기존 계정으로 계속 쓸 수 있다.
    } finally {
      setSwitchingAccount(false)
    }
  }

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
      <header className="border-b border-gray-100 bg-white px-6 py-5 sm:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <p className="whitespace-nowrap text-[22px] font-extrabold text-black">성과·성장관리</p>
          {accountEmail && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="whitespace-nowrap text-[13px] text-gray-600">{accountEmail}</span>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-700">
                <CloudIcon className="h-3 w-3" />
                Google 연결됨
              </span>
              {isAdminUser && (
                <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">관리자</span>
              )}
              <button
                onClick={() => void handleConnectDifferentAccount()}
                disabled={switchingAccount}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserIcon className="h-3.5 w-3.5" />
                {switchingAccount ? '전환하는 중...' : '다른 계정'}
              </button>
              <button
                onClick={handleLogout}
                className="shrink-0 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] font-semibold text-danger hover:bg-red-100"
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </header>
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

import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import { useGoogleAccount } from '../hooks/useGoogleAccount'
import { getConnectedEmail } from '../utils/googleDrive'
import { ChevronDown, Copy, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import EvaluationPeriodPicker from './EvaluationPeriodPicker'
import GoogleAccountMenu from './GoogleAccountMenu'
import IconButton from './IconButton'
import AreaSwitch from './AreaSwitch'
import { ic, icSm } from './ui/icon'

const MAX_VISIBLE_AVATARS = 6

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

  const circleClass = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[13px] font-semibold text-label-2 ${
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
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[13px] font-semibold text-label-2 ${
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
  isCurrent: boolean
  onOpen: (id: string) => void
  onRename: (workspace: WorkspaceMeta, periodName: string, year: number) => void
  onEdit: (workspace: WorkspaceMeta) => void
  onDuplicate: (workspace: WorkspaceMeta) => void
  onDelete: (workspace: WorkspaceMeta) => void
}

// 프로젝트 카드: 누르면 들어가기 · 마우스를 올리면 연필(이름 바꾸기) · 우클릭하면 복제 · 삭제
function ProjectCard({ workspace, isCurrent, onOpen, onRename, onEdit, onDuplicate, onDelete }: ProjectCardProps) {
  const counts = readWorkspaceCounts(workspace.id)
  const [renaming, setRenaming] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])
  const item = 'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !renaming && onOpen(workspace.id)}
      onKeyDown={(e) => {
        if (renaming) return
        if (e.key === 'Enter' || e.key === ' ') onOpen(workspace.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 140) })
      }}
      title="눌러서 들어가기 · 우클릭: 복제 · 삭제"
      className={`group flex cursor-pointer flex-col gap-3 rounded-card bg-white p-5 text-left transition-shadow ${
        isCurrent ? 'shadow-card ring-[1.5px] ring-accent' : 'shadow-card hover:shadow-[0_0_0_0.5px_rgba(0,0,0,0.1),0_4px_14px_rgba(0,0,0,0.08)]'
      }`}
    >
      {isCurrent && (
        <span className="mac-badge w-fit shrink-0 gap-1 bg-accent-soft text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          평가 진행중
        </span>
      )}
      <div className="flex min-h-7 items-center justify-between gap-2">
        {renaming ? (
          // 연도 · 기간 이름을 그 자리에서 고친다(Enter 저장 · Esc 취소 · 카드 밖을 누르면 저장)
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-semibold text-label"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const y = Number(f.get('year'))
              const name = String(f.get('period') ?? '').trim()
              const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : workspace.evaluationYear
              if ((name && name !== workspace.periodName) || year !== workspace.evaluationYear) onRename(workspace, name || workspace.periodName, year)
              setRenaming(false)
            }}
            onBlur={(e) => {
              // 두 칸 사이를 오갈 때는 닫지 않는다
              if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.requestSubmit()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setRenaming(false)
              }
            }}
          >
            <input
              name="year"
              type="number"
              min={2000}
              max={2100}
              defaultValue={workspace.evaluationYear}
              aria-label="연도"
              className="h-7 w-[4.6em] shrink-0 rounded-control border border-hairline px-1.5 text-[15px] font-semibold tabular-nums"
            />
            <input
              name="period"
              autoFocus
              defaultValue={workspace.periodName}
              onFocus={(e) => e.target.select()}
              aria-label="기간 이름"
              className="h-7 min-w-0 flex-1 rounded-control border border-accent px-1.5 text-[15px] font-semibold"
            />
          </form>
        ) : (
          <>
            <p className="min-w-0 truncate text-[15px] font-semibold text-label">
              {workspace.evaluationYear} {workspace.periodName}
            </p>
            <IconButton
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(true)
              }}
              title="연도 · 이름 바꾸기"
              aria-label="이름 바꾸기"
              className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Pencil {...ic} />
            </IconButton>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] text-label-2">최근 수정 {fmtWorkspaceDate(workspace.updatedAt)}</p>
        <span className="shrink-0 text-[13px] text-label-3">팀원 {counts.memberCount}명</span>
      </div>
      <AvatarRow names={counts.memberNames} />
      {menu &&
        createPortal(
          <div
            className="mac-pop fixed z-50 w-[230px] py-1 text-[13px]"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={item}
              onClick={() => {
                setMenu(null)
                onDuplicate(workspace)
              }}
            >
              <Copy {...icSm} />
              복제해서 새 프로젝트 만들기
            </button>
            <button
              className={item}
              onClick={() => {
                setMenu(null)
                setRenaming(true)
              }}
            >
              <Pencil {...icSm} />
              연도 · 이름 바꾸기
            </button>
            <button
              className={item}
              onClick={() => {
                setMenu(null)
                onEdit(workspace)
              }}
            >
              <Users {...icSm} />
              팀 이름까지 바꾸기…
            </button>
            <div className="mac-menu-sep" />
            <button
              className={`${item} text-danger`}
              onClick={() => {
                setMenu(null)
                onDelete(workspace)
              }}
            >
              <Trash2 {...icSm} />
              삭제하기
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default function WorkspaceLanding() {
  const { workspaces, selectWorkspace, deleteWorkspace, renameWorkspace, duplicateWorkspace, reloadForAccount } = useWorkspaces()
  const [dupError, setDupError] = useState('')
  const { accountEmail, isAdminUser, refreshAccount, handleLogout } = useGoogleAccount()

  // "계정이 바뀌었을 수 있다"는 신호가 실제 전환이 아닐 수도 있으므로,
  // 이메일이 실제로 달라졌을 때만 워크스페이스 목록을 다시 읽는다(이미
  // 이 랜딩 화면에 있으므로 별도로 exitToLanding을 부를 필요는 없다).
  function handleAccountChange() {
    const previousEmail = accountEmail
    refreshAccount()
    if (getConnectedEmail() !== previousEmail) reloadForAccount()
  }
  const existingTeamNames = useMemo(() => Array.from(new Set(workspaces.map((w) => w.teamName))), [workspaces])
  const sortedByRecency = useMemo(() => [...workspaces].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)), [workspaces])
  const mostRecentTeam = sortedByRecency[sortedByRecency.length - 1]?.teamName ?? ''
  // 방금까지 하던 평가(전체 팀 통틀어 가장 최근에 수정된 워크스페이스) --
  // 카드 목록에서 "평가 진행중" 배지로 구분해 바로 이어할 수 있게 한다.
  const mostRecentWorkspaceId = sortedByRecency[sortedByRecency.length - 1]?.id ?? null

  const [teamName, setTeamName] = useState(mostRecentTeam)
  const [newTeamInput, setNewTeamInput] = useState('')
  const [teamNameModalOpen, setTeamNameModalOpen] = useState(false)
  const [periodModalTeam, setPeriodModalTeam] = useState<string | null>(null)
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renameTeamName, setRenameTeamName] = useState('')
  const [renamePeriodName, setRenamePeriodName] = useState('')

  // teamName은 useState 초기값이라 마운트 시점 이후로는 저절로 안 바뀐다.
  // 선택돼 있던 팀을 지워서 지금 선택된 teamName이 더 이상 존재하지
  // 않게 되면 상태가 붕 떠버리므로, 목록이 바뀔 때마다 유효한 팀을
  // 가리키도록 다시 맞춘다.
  useEffect(() => {
    if (existingTeamNames.length === 0) return
    if (!existingTeamNames.includes(teamName)) {
      setTeamName(mostRecentTeam || existingTeamNames[0])
    }
  }, [existingTeamNames, teamName, mostRecentTeam])

  function confirmTeamName() {
    const name = newTeamInput.trim()
    if (!name) return
    setTeamNameModalOpen(false)
    setPeriodModalTeam(name)
  }
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
    <div className="min-h-screen bg-window">
      {/* 다른 화면과 같은 머리글(영역 전환 자리가 화면마다 같게) */}
      <header className="sticky top-0 z-40 border-b border-separator bg-[#FBFBFD]/85 backdrop-blur-xl">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <AreaSwitch className="-ml-1" />
            <span className="h-5 w-px bg-separator" />
            <p className="whitespace-nowrap text-[15px] font-bold text-label">프로젝트 목록</p>
          </div>
          {accountEmail && (
            <div className="flex shrink-0 items-center gap-3">
              <GoogleAccountMenu
                className="flex h-7 items-center gap-1.5 rounded-control px-2 text-[13px] text-label hover:bg-black/[0.05]"
                onAccountChange={handleAccountChange}
              >
                {accountEmail}
                {isAdminUser && (
                  <span className="mac-badge bg-accent-soft text-accent">관리자</span>
                )}
                <ChevronDown {...icSm} className="text-label-3" />
              </GoogleAccountMenu>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                로그아웃
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-10">
        <p className="text-[13px] text-label-2">진행할 팀과 평가기간을 선택하세요. 프로젝트를 우클릭하면 복제하거나 지울 수 있습니다.</p>
        {dupError && <p className="mt-2 text-[13px] text-danger">{dupError}</p>}

        {existingTeamNames.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-separator pb-6">
            <div className="flex flex-wrap items-center gap-2">
              {existingTeamNames.map((name) => {
                const teamWs = workspaces.filter((w) => w.teamName === name)
                const mostRecentWs = [...teamWs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
                const memberCount = mostRecentWs ? readWorkspaceCounts(mostRecentWs.id).memberCount : 0
                const active = name === teamName
                return (
                  <button
                    key={name}
                    onClick={() => setTeamName(name)}
                    className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors ${
                      active ? 'bg-accent text-white' : 'bg-white text-label shadow-control hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <span className="font-semibold">{name}</span>
                    <span className="opacity-70">
                      {memberCount}명 · {teamWs.length}개
                    </span>
                  </button>
                )
              })}
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setNewTeamInput('')
                setTeamNameModalOpen(true)
              }}
              className="shrink-0"
            >
              <Plus {...icSm} /> 새 팀
            </Button>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-separator px-6 py-16 text-center">
            <p className="text-[13px] text-label-2">첫 팀을 만들어 성과관리를 시작하세요.</p>
            <Button
              variant="primary"
              onClick={() => {
                setNewTeamInput('')
                setTeamNameModalOpen(true)
              }}
            >
              <Plus {...icSm} /> 팀 만들기
            </Button>
          </div>
        )}

        {teamName && (
          <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-end gap-3">
                <h2 className="text-[17px] font-semibold text-label">{teamName}</h2>
                <span className="text-[13px] text-label-2">평가 프로젝트 {teamWorkspaces.length}개</span>
              </div>
              <Button variant="primary" onClick={() => setPeriodModalTeam(teamName)}>
                <Plus {...icSm} /> 새 평가 만들기
              </Button>
            </div>

            {teamWorkspaces.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-1 rounded-card border-2 border-dashed border-separator px-6 py-16 text-center">
                <p className="text-[13px] text-label-2">첫 평가를 만들어 시작하세요.</p>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {teamWorkspaces.map((w) => (
                  <ProjectCard
                    key={w.id}
                    workspace={w}
                    isCurrent={w.id === mostRecentWorkspaceId}
                    onOpen={selectWorkspace}
                    onRename={(ws, periodName, year) => renameWorkspace(ws.id, ws.teamName, periodName, year)}
                    onEdit={openRename}
                    onDuplicate={(ws) => {
                      if (!duplicateWorkspace(ws.id)) setDupError('저장 공간이 모자라 복제하지 못했습니다. 데이터 백업 후 필요 없는 프로젝트를 지워 주세요.')
                    }}
                    onDelete={setDeletingWorkspace}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {teamNameModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          onClick={() => setTeamNameModalOpen(false)}
        >
          <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-label">새 팀 만들기</h3>
            <div className="mt-4">
              <label className="block text-[13px] font-medium text-label-2">팀명</label>
              <input
                type="text"
                autoFocus
                value={newTeamInput}
                onChange={(e) => setNewTeamInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmTeamName()
                }}
                placeholder="예: UX팀"
                className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mt-1 w-full text-label"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                onClick={() => setTeamNameModalOpen(false)}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={confirmTeamName}
                disabled={!newTeamInput.trim()}
              >
                다음
              </Button>
            </div>
          </div>
        </div>
      )}

      {periodModalTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          onClick={() => setPeriodModalTeam(null)}
        >
          <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-label">새 평가 프로젝트</h3>
              <IconButton onClick={() => setPeriodModalTeam(null)} aria-label="닫기" title="닫기">
                <X {...ic} />
              </IconButton>
            </div>
            <div className="mt-4">
              <EvaluationPeriodPicker
                key={periodModalTeam}
                teamName={periodModalTeam}
                onDone={(id) => {
                  setPeriodModalTeam(null)
                  selectWorkspace(id)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {renamingWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-dialog">
            <h3 className="text-[15px] font-semibold text-label">평가 정보 수정</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-label-2">팀 이름</label>
                <input
                  type="text"
                  value={renameTeamName}
                  onChange={(e) => setRenameTeamName(e.target.value)}
                  className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mt-1 w-full text-label"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-label-2">평가 기간 표시명</label>
                <input
                  type="text"
                  value={renamePeriodName}
                  onChange={(e) => setRenamePeriodName(e.target.value)}
                  className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mt-1 w-full text-label"
                />
                <p className="mt-1 text-[13px] text-label-3">화면에 보이는 이름만 바뀝니다. 연도/주기 값은 유지됩니다.</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                onClick={() => setRenamingWorkspace(null)}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleRenameSave}
              >
                저장
              </Button>
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

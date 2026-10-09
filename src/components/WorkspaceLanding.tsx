import { errText } from '../utils/googleError'
import { useEffect, useMemo, useState } from 'react'
import { setAppYear, useAppYear } from '../utils/appYear'
import { toast } from './ui/Toast'
import type { WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import { Copy, Ellipsis, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import TeamInviteDialog, { teamMembersOf } from './TeamInviteDialog'
import Modal from './ui/Modal'
import { useAccessData } from '../hooks/useAccessData'
import { createPortal } from 'react-dom'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import EvaluationPeriodPicker from './EvaluationPeriodPicker'
import { markNewWorkspace } from './work/PerfStartDialog'
import IconButton from './IconButton'
import AppShell, { PageHeader } from './shell/AppShell'
import YearPicker from './YearPicker'
import { ic, icSm } from './ui/icon'
import { isPendingEmail, updateUsers } from '../utils/accessSheet'
import { getConnectedEmail } from '../utils/googleDrive'
import { useAppMode, type PerfStage } from '../state/AppMode'

const MAX_VISIBLE_AVATARS = 6


// 팀원 이니셜(2자) 아바타 -- 색은 인덱스(카드마다 0부터 다시 시작)로
// 정하지 않고 전부 같은 중립 톤으로 통일한다. 순환 색상을 쓰면 카드마다
// "몇 번째로 나열됐는가"에 따라 색이 정해져서 실제로는 다른 사람인데
// 같은 색으로 보이는 경우가 생기고, 카드가 여러 개면 화면 전체가 알록달록
// 산만해진다.
// 팀은 많아야 5~6명이라 겹치지 않고 나란히 둔다(카드보다 넓으면 다음 줄로).
function AvatarRow({ names }: { names: string[] }) {
  const visible = names.slice(0, MAX_VISIBLE_AVATARS)
  const overflow = names.length - visible.length
  const circleClass =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[length:calc(12.5px*var(--ui-fs,1))] font-semibold text-label-2'
  return (
    <span className="flex flex-wrap items-center gap-1">
      {visible.map((name, i) => (
        <span key={`${name}-${i}`} className={circleClass} title={name}>
          {name.slice(0, 2)}
        </span>
      ))}
      {overflow > 0 && <span className={circleClass}>+{overflow}</span>}
    </span>
  )
}

interface ProjectCardProps {
  workspace: WorkspaceMeta
  isCurrent: boolean
  onOpen: (id: string) => void
  // 평가 안의 그 화면으로 바로(아바타 = 팀원관리, 「과제관리」 버튼)
  onOpenAt: (id: string, stage: PerfStage) => void
  onRename: (workspace: WorkspaceMeta, periodName: string, year: number) => void
  onEdit: (workspace: WorkspaceMeta) => void
  onDuplicate: (workspace: WorkspaceMeta) => void
  onDelete: (workspace: WorkspaceMeta) => void
}

// 프로젝트 카드: 누르면 들어가기 · 마우스를 올리면 연필(이름 바꾸기) · 우클릭하면 복제 · 삭제
function ProjectCard({ workspace, isCurrent, onOpen, onOpenAt, onRename, onEdit, onDuplicate, onDelete }: ProjectCardProps) {
  const counts = readWorkspaceCounts(workspace.id)
  const [renaming, setRenaming] = useState(false)
  const [editYear, setEditYear] = useState(workspace.evaluationYear)
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
            className="flex min-w-0 flex-1 items-center gap-1.5 text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const name = String(f.get('period') ?? '').trim()
              const year = editYear
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
            {/* 연도는 앱 공통 연도 피커(연도 그리드) */}
            <YearPicker year={editYear} onChange={setEditYear} className="shrink-0" />
            <input
              name="period"
              autoFocus
              defaultValue={workspace.periodName}
              onFocus={(e) => e.target.select()}
              aria-label="기간 이름"
              className="h-7 min-w-0 flex-1 rounded-control border border-accent px-1.5 text-[length:calc(15px*var(--ui-fs,1))] font-semibold"
            />
          </form>
        ) : (
          <>
            <p className="min-w-0 truncate text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">
              {workspace.evaluationYear} {workspace.periodName}
            </p>
            <IconButton
              onClick={(e) => {
                e.stopPropagation()
                setEditYear(workspace.evaluationYear)
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
        <p className="min-w-0 flex-1 truncate text-[length:calc(14px*var(--ui-fs,1))] text-label-2">최근 수정 {fmtWorkspaceDate(workspace.updatedAt)}</p>
        <span className="shrink-0 text-[length:calc(14px*var(--ui-fs,1))] text-label-3">팀원 {counts.memberCount}명</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenAt(workspace.id, 'members')
          }}
          title="팀원관리로"
          className="-m-1 min-w-0 rounded-control p-1 hover:bg-black/[0.04]"
        >
          {counts.memberNames.length ? <AvatarRow names={counts.memberNames} /> : <span className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">팀원 넣기</span>}
        </button>
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onOpenAt(workspace.id, 'work')
          }}
          title="과제관리로"
          className="shrink-0 !px-2.5"
        >
          과제관리
        </Button>
      </div>
      {menu &&
        createPortal(
          <div
            className="mac-pop fixed z-50 w-[230px] py-1 text-[length:calc(14px*var(--ui-fs,1))]"
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
              복제해서 새 평가 만들기
            </button>
            <button
              className={item}
              onClick={() => {
                setMenu(null)
                setEditYear(workspace.evaluationYear)
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
              <Users {...icSm} />팀 이름까지 바꾸기…
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

const LAST_TEAM = 'landing-last-team'

export default function WorkspaceLanding() {
  const { workspaces, teamNames, addTeam, renameTeam, removeTeam, selectWorkspace, deleteWorkspace, renameWorkspace, duplicateWorkspace } = useWorkspaces()
  const { setPerfStage } = useAppMode()
  const me = (getConnectedEmail() ?? '').toLowerCase()
  const { data: access } = useAccessData(false)
  const [dupError, setDupError] = useState('')
  const sortedByRecency = useMemo(() => [...workspaces].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)), [workspaces])
  // 방금까지 하던 평가(전체 팀 통틀어 가장 최근에 수정된 평가) -- 카드에 "평가 진행중" 배지
  const mostRecentWorkspaceId = sortedByRecency[sortedByRecency.length - 1]?.id ?? null
  const mostRecentTeam = sortedByRecency[sortedByRecency.length - 1]?.teamName ?? ''

  // 마지막으로 고른 팀을 기억(새로고침해도 그 팀), 없으면 최근 평가의 팀
  const [teamName, setTeamName] = useState(() => {
    let last = ''
    try {
      last = localStorage.getItem(LAST_TEAM) ?? ''
    } catch {
      // 없으면 최근 평가의 팀
    }
    return teamNames.includes(last) ? last : mostRecentTeam || teamNames[0] || ''
  })
  useEffect(() => {
    try {
      if (teamName) localStorage.setItem(LAST_TEAM, teamName)
    } catch {
      // ignore
    }
  }, [teamName])
  // 고른 팀이 지워지거나 이름이 바뀌어 목록에 없으면 첫 팀으로
  useEffect(() => {
    if (!teamNames.includes(teamName)) setTeamName(teamNames[0] ?? '')
  }, [teamNames, teamName])

  // 팝업: 새 팀 · 팀 이름 바꾸기 · 팀 삭제 · 팀원 초대 · 새 평가
  const [dialog, setDialog] = useState<null | 'newTeam' | 'renameTeam' | 'deleteTeam' | 'invite' | 'newEval'>(null)
  const [teamMenu, setTeamMenu] = useState(false)
  const close = () => setDialog(null)

  const myTeam = useMemo(() => access?.users.find((u) => u.email === me)?.team ?? '', [access, me])
  const members = useMemo(() => teamMembersOf(access, teamName, me), [access, teamName, me])
  const teamWorkspaces = workspaces.filter((w) => w.teamName === teamName).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  // 보는 연도(과제 입력과 같이 바뀜): 그 해 평가만 목록에 보인다
  const appYear = useAppYear()
  const yearWorkspaces = teamWorkspaces.filter((w) => w.evaluationYear === appYear)
  const evalYears = Array.from(new Set([...teamWorkspaces.map((w) => w.evaluationYear), new Date().getFullYear(), appYear])).sort((a, b) => b - a)

  // 팀 이름 바꾸기: 팀원 명단(권한 시트)에 이 팀으로 적힌 사람도 같이 바꿀지 -- 관리자가 추가한 팀원까지 모두
  // (예전엔 내가 추가한 사람만 바꿔서 관리자가 넣은 팀원은 옛 팀에 남았다)
  const accessHits = useMemo(() => (access && me ? access.users.filter((u) => u.team.trim() === teamName.trim()) : []), [access, me, teamName])
  const othersAdded = accessHits.filter((u) => u.email !== me && u.addedBy !== me).length
  // 팀 이름 맞추기 안내: 권한 시트의 내 팀이 이 평가 목록 팀 이름과 다르고,
  // 평가 목록 이름의 팀이 권한 시트에서 사라졌거나(관리자가 이름을 바꿈) 팀장이 없을 때(내가 다른 팀으로 옮겨짐).
  // 내가 여러 팀을 맡아 평가 목록에 팀이 여럿이어도, 그 팀이 권한 시트에 살아 있으면 묻지 않는다.
  const alignTo = useMemo(() => {
    const mine = myTeam.trim()
    const t = teamName.trim()
    if (!access || !mine || !t || mine === t) return ''
    const inSheet = access.users.filter((u) => u.team.trim() === t)
    const gone = inSheet.length === 0
    const leaderless = !inSheet.some((u) => u.role !== 'member')
    return gone || leaderless ? mine : ''
  }, [access, myTeam, teamName])
  const alignKey = `team-align-later:${teamName}->${alignTo}`
  const [alignLater, setAlignLater] = useState(() => {
    try {
      return sessionStorage.getItem(alignKey) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      setAlignLater(sessionStorage.getItem(alignKey) === '1')
    } catch {
      setAlignLater(false)
    }
  }, [alignKey])
  async function doRenameTeam(to: string, alsoAccess: boolean) {
    const from = teamName
    renameTeam(from, to)
    setTeamName(to)
    close()
    if (!alsoAccess || !access || !accessHits.length) return
    try {
      await updateUsers(access.id, (users) => users.map((u) => (u.team.trim() === from.trim() ? { ...u, team: to } : u)), me, [
        `팀 이름(성과관리에서 바꿈): ${from} → ${to}`,
      ])
    } catch (e) {
      toast(`팀원 명단의 팀 이름은 바꾸지 못했습니다: ${errText(e)}`, 'error')
    }
  }

  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renameTeamName, setRenameTeamName] = useState('')
  const [renamePeriodName, setRenamePeriodName] = useState('')
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
    <AppShell header={<PageHeader area="과제관리" title="평가 목록" />}>
      <main className="w-full max-w-6xl flex-1 px-6 pb-12 pt-5 lg:px-8">
        {dupError && (
          <p className={`mb-4 flex items-center gap-2 rounded-card bg-subtle px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2`}>
            <span className="flex-1">{dupError}</span>
            <button onClick={() => setDupError('')} className="text-label-3 hover:text-label" aria-label="닫기">
              <X {...icSm} />
            </button>
          </p>
        )}

        {/* 팀 이름 맞추기: 권한 시트의 내 팀과 평가 목록 팀 이름이 다를 때(관리자가 이름을 바꿨거나 팀을 옮김) */}
        {alignTo && !alignLater && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-accent/30 bg-accent-soft px-4 py-3 text-[length:calc(14px*var(--ui-fs,1))] text-label">
            <span className="min-w-0 flex-1">
              관리에서 내 팀이 <b className="text-accent">「{alignTo}」</b>(으)로 되어 있습니다(평가 목록은 「{teamName}」). 평가 목록 팀 이름도 맞출까요?
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void doRenameTeam(alignTo, false)}>
                「{alignTo}」(으)로 맞추기
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  try {
                    sessionStorage.setItem(alignKey, '1')
                  } catch {
                    // 기억 못 해도 지금은 닫는다
                  }
                  setAlignLater(true)
                }}
              >
                나중에
              </Button>
            </span>
            <span className="basis-full text-[length:calc(12.5px*var(--ui-fs,1))] text-label-2">
              이 팀의 평가{teamWorkspaces.length ? ` ${teamWorkspaces.length}개` : ''} · 인사평가 이력 · 승진 기준이 새 이름으로 함께 옮겨집니다. 드라이브 백업 폴더 · 면담 캘린더는 새 이름으로 새로
              만들어집니다(이전 것은 그대로). 맞추기 전에는 「{alignTo}」 팀원이 이 팀 평가에 자동으로 들어오지 않습니다.
            </span>
          </div>
        )}
        {teamNames.length === 0 ? (
          // 팀이 하나도 없을 때: 가운데 카드 하나
          <section className="mx-auto mt-16 max-w-md rounded-[16px] bg-white px-8 py-10 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
              <Users size={24} strokeWidth={1.8} />
            </span>
            <h2 className={`mt-4 text-[length:calc(20px*var(--ui-fs,1))] font-semibold tracking-[-0.01em] text-label`}>첫 팀을 만들어 시작하세요</h2>
            <p className={`mt-1.5 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed text-label-2`}>팀을 만들면 팀원을 초대하고, 연도 · 기간별 평가를 만들 수 있습니다.</p>
            <Button variant="primary" className="mt-6" onClick={() => setDialog('newTeam')}>
              <Plus {...icSm} /> 팀 만들기
            </Button>
          </section>
        ) : (
          <>
            {/* 팀 탭 */}
            <nav className="flex flex-wrap items-center gap-1" aria-label="팀">
              {teamNames.map((name) => {
                const on = name === teamName
                return (
                  <button
                    key={name}
                    onClick={() => setTeamName(name)}
                    aria-current={on ? 'true' : undefined}
                    className={`h-8 whitespace-nowrap rounded-[9px] px-3 text-[length:calc(14px*var(--ui-fs,1))] transition-colors ${on ? 'bg-white font-semibold text-label shadow-control' : 'text-label-2 hover:bg-black/[0.04] hover:text-label'}`}
                  >
                    {name}
                  </button>
                )
              })}
              <button onClick={() => setDialog('newTeam')} className={`flex h-8 items-center gap-1 rounded-[9px] px-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2 hover:bg-black/[0.04] hover:text-label`}>
                <Plus {...icSm} /> 새 팀
              </button>
            </nav>

            {/* 팀 머리: 이름 · ⋯(이름 바꾸기 · 삭제) · 팀원 초대 · 새 평가 */}
            <header className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-3">
              <h2 className="text-[length:calc(26px*var(--ui-fs,1))] font-semibold tracking-[-0.02em] text-label">{teamName}</h2>
              <div className="relative">
                <IconButton onClick={() => setTeamMenu(!teamMenu)} aria-label="팀 메뉴" title="팀 이름 바꾸기 · 삭제" aria-expanded={teamMenu}>
                  <Ellipsis size={18} strokeWidth={1.8} />
                </IconButton>
                {teamMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onMouseDown={() => setTeamMenu(false)} />
                    <div className="mac-pop absolute left-0 top-9 z-50 w-44 py-1">
                      <button className="mac-menu-item" onClick={() => (setTeamMenu(false), setDialog('renameTeam'))}>
                        <Pencil {...icSm} /> 팀 이름 바꾸기
                      </button>
                      <button className="mac-menu-item text-danger" onClick={() => (setTeamMenu(false), setDialog('deleteTeam'))}>
                        <Trash2 {...icSm} /> 팀 삭제
                      </button>
                    </div>
                  </>
                )}
              </div>
              <select
                value={appYear}
                onChange={(e) => setAppYear(Number(e.target.value))}
                aria-label="보는 연도"
                title="연도를 바꾸면 과제 입력과 평가 목록이 그 해 것만 보입니다"
                className="h-8 rounded-control border border-hairline bg-white px-2 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label"
              >
                {evalYears.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <span className="ml-auto flex items-center gap-2">
                <Button onClick={() => setDialog('invite')}>
                  <UserPlus {...icSm} /> 팀원 초대
                </Button>
                <Button variant="primary" onClick={() => setDialog('newEval')}>
                  <Plus {...icSm} /> 새 평가
                </Button>
              </span>
            </header>

            {/* 팀원 한 줄: 이름 · 초대 상태(● 초대함 ○ 안 보냄 · 흐림 Gmail 없음). 누르면 팀원 초대 */}
            <button onClick={() => setDialog('invite')} className="group mt-2 flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-left" title="팀원 초대 열기">
              <span className={`text-[length:calc(14px*var(--ui-fs,1))] text-label-2`}>팀원 {members.length}명</span>
              {members.length === 0 ? (
                <span className={`text-[length:calc(14px*var(--ui-fs,1))] text-accent group-hover:underline`}>Gmail 아이디로 초대하기</span>
              ) : (
                <>
                  {members.slice(0, 10).map((u) => {
                    const pend = isPendingEmail(u.email)
                    return (
                      <span key={u.email} className={`flex items-center gap-1.5 text-[length:calc(14px*var(--ui-fs,1))] ${pend ? 'text-label-3' : 'text-label'}`}>
                        <span
                          className={`h-2 w-2 rounded-full ${pend ? 'bg-black/15' : u.invitedAt ? 'bg-success' : 'border-[1.5px] border-label-3'}`}
                          title={pend ? 'Gmail 없음' : u.invitedAt ? `초대함 ${u.invitedAt.slice(0, 10)}` : '초대 안 보냄'}
                        />
                        {u.name || u.email.split('@')[0]}
                      </span>
                    )
                  })}
                  {members.length > 10 && <span className={`text-[length:calc(14px*var(--ui-fs,1))] text-label-3`}>외 {members.length - 10}명</span>}
                </>
              )}
            </button>

            {/* 평가 */}
            <section className="mt-8">
              {yearWorkspaces.length === 0 ? (
                <div className="flex flex-col items-center rounded-[16px] border border-dashed border-separator px-6 py-12 text-center">
                  <p className={`text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label`}>{appYear}년 평가가 아직 없습니다</p>
                  <p className={`mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2`}>연도와 기간(상반기 등)을 고르면 바로 만들어집니다.</p>
                  <Button variant="primary" className="mt-5" onClick={() => setDialog('newEval')}>
                    <Plus {...icSm} /> {appYear}년 평가 만들기
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className={`mb-3 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label-2`}>
                    {appYear}년 평가 {yearWorkspaces.length}개 <span className="ml-1.5 font-normal text-label-3">눌러서 들어가기 · 우클릭으로 복제 · 삭제</span>
                  </h2>
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {yearWorkspaces.map((w) => (
                      <ProjectCard
                        key={w.id}
                        workspace={w}
                        isCurrent={w.id === mostRecentWorkspaceId}
                        onOpen={(id) => {
                          setAppYear(w.evaluationYear)
                          selectWorkspace(id)
                        }}
                        onOpenAt={(id, stage) => {
                          setPerfStage(stage)
                          selectWorkspace(id)
                        }}
                        onRename={(ws, periodName, year) => renameWorkspace(ws.id, ws.teamName, periodName, year)}
                        onEdit={openRename}
                        onDuplicate={(ws) => {
                          if (!duplicateWorkspace(ws.id)) setDupError('저장 공간이 모자라 복제하지 못했습니다. 데이터 백업 후 필요 없는 평가를 지워 주세요.')
                        }}
                        onDelete={setDeletingWorkspace}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {dialog === 'newTeam' && (
        <TeamNameDialog
          title="새 팀"
          initial={teamNames.length === 0 && myTeam && !teamNames.includes(myTeam) ? myTeam : ''}
          taken={teamNames}
          confirmLabel="만들기"
          onClose={close}
          onSave={(name) => {
            addTeam(name)
            setTeamName(name)
            close()
          }}
        />
      )}
      {dialog === 'renameTeam' && (
        <TeamNameDialog
          title="팀 이름 바꾸기"
          initial={teamName}
          taken={teamNames.filter((x) => x !== teamName)}
          confirmLabel="바꾸기"
          note={`${teamWorkspaces.length ? `이 팀의 평가 ${teamWorkspaces.length}개 · ` : ''}인사평가 이력 · 승진 기준이 새 이름으로 함께 옮겨집니다.`}
          accessCount={accessHits.length}
          accessNote={othersAdded ? `관리자 등이 추가한 ${othersAdded}명 포함 · 끄면 내 평가 목록 이름만 바뀝니다` : '끄면 내 평가 목록 이름만 바뀝니다'}
          mustChange
          onClose={close}
          onSave={(name, alsoAccess) => void doRenameTeam(name, alsoAccess)}
        />
      )}
      <ConfirmDialog
        open={dialog === 'deleteTeam'}
        title={`「${teamName}」 팀 삭제`}
        message={
          (teamWorkspaces.length
            ? `이 팀의 평가 ${teamWorkspaces.length}개와 그 안의 과제 · 평가 · 면담 데이터가 모두 지워지며 되돌릴 수 없습니다.\n먼저 데이터 백업을 권합니다.\n\n`
            : '') + '팀원 명단(권한 시트)과 과제 입력 데이터는 그대로입니다.'
        }
        confirmLabel="팀 삭제"
        onConfirm={() => {
          removeTeam(teamName)
          close()
        }}
        onCancel={close}
      />
      {dialog === 'invite' && <TeamInviteDialog teamName={teamName} onClose={close} />}
      {dialog === 'newEval' && (
        <Modal title="새 평가" sub={teamName} onClose={close} size="md">
          <EvaluationPeriodPicker
            key={teamName}
            teamName={teamName}
            defaultYear={appYear}
            onDone={(id, created) => {
              close()
              if (created) markNewWorkspace(id) // 새로 만들었으면 들어가서 "어떻게 시작할까요?" 안내를 한 번 띄운다
              selectWorkspace(id)
            }}
          />
        </Modal>
      )}

      {renamingWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-dialog">
            <h3 className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">평가 정보 수정</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label-2">팀 이름</label>
                <input
                  type="text"
                  value={renameTeamName}
                  onChange={(e) => setRenameTeamName(e.target.value)}
                  className="h-8 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] mt-1 w-full text-label"
                />
              </div>
              <div>
                <label className="block text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label-2">평가 기간 표시명</label>
                <input
                  type="text"
                  value={renamePeriodName}
                  onChange={(e) => setRenamePeriodName(e.target.value)}
                  className="h-8 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] mt-1 w-full text-label"
                />
                <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-3">화면에 보이는 이름만 바뀝니다. 연도/주기 값은 유지됩니다.</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setRenamingWorkspace(null)}>취소</Button>
              <Button variant="primary" onClick={handleRenameSave}>
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
    </AppShell>
  )
}

// 팀 이름 입력 팝업(새 팀 · 이름 바꾸기). 같은 이름이 있으면 막는다
function TeamNameDialog({
  title,
  initial,
  taken,
  confirmLabel,
  note,
  accessCount = 0,
  accessNote,
  mustChange,
  onClose,
  onSave,
}: {
  title: string
  initial: string
  taken: string[]
  confirmLabel: string
  note?: string
  accessCount?: number
  accessNote?: string
  mustChange?: boolean
  onClose: () => void
  onSave: (name: string, alsoAccess: boolean) => void
}) {
  const [name, setName] = useState(initial)
  const [alsoAccess, setAlsoAccess] = useState(true)
  const v = name.trim()
  const dup = taken.includes(v)
  // 이름 바꾸기는 바뀌었을 때만(새 팀은 채워 둔 이름 그대로도 됨)
  const ok = !!v && !dup && !(mustChange && v === initial.trim())
  const save = () => ok && onSave(v, alsoAccess)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save} disabled={!ok}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <label className="text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label">팀 이름</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="예: UX팀"
        className="mt-1.5 h-10 w-full rounded-control border border-hairline px-3 text-[length:calc(15px*var(--ui-fs,1))] text-label outline-none focus:border-accent"
      />
      <p className={`mt-1.5 text-[length:calc(12.5px*var(--ui-fs,1))] ${dup ? 'text-danger' : 'text-label-3'}`}>{dup ? '이미 있는 팀 이름입니다' : note ?? ''}</p>
      {accessCount > 0 && (
        <label className="mt-2 flex items-start gap-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
          <input type="checkbox" className="mt-[3px]" checked={alsoAccess} onChange={(e) => setAlsoAccess(e.target.checked)} />
          <span>
            권한 시트에서 이 팀으로 적힌 {accessCount}명의 팀 이름도 함께 바꾸기
            {accessNote && <span className="block text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">{accessNote}</span>}
          </span>
        </label>
      )}
    </Modal>
  )
}

import { errText } from '../utils/googleError'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import { ArrowRight, Check, ChevronDown, Copy, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import TeamAccountsPanel from './TeamAccountsPanel'
import { createPortal } from 'react-dom'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import EvaluationPeriodPicker from './EvaluationPeriodPicker'
import { markNewWorkspace } from './work/PerfStartDialog'
import IconButton from './IconButton'
import AppShell, { PageHeader } from './shell/AppShell'
import YearPicker from './YearPicker'
import { ic, icSm } from './ui/icon'
import { isPendingEmail, readAccessCache, updateUsers } from '../utils/accessSheet'
import { getConnectedEmail } from '../utils/googleDrive'
import { isAdminEmail } from '../utils/roles'
import { renameEvalTeam } from '../utils/teamRename'

const MAX_VISIBLE_AVATARS = 6

// 지운 팀(평가 목록 탭에서 숨김) -- 권한 시트의 내 팀처럼 평가 없이 보이던 팀도 다시 안 보이게. 같은 이름으로 새 팀을 만들면 다시 보인다
const HIDDEN_TEAMS = 'hidden-teams'
function readHiddenTeams(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_TEAMS) ?? '[]') as string[]
  } catch {
    return []
  }
}
function writeHiddenTeams(v: string[]) {
  try {
    localStorage.setItem(HIDDEN_TEAMS, JSON.stringify(v))
  } catch {
    // 못 남기면 다음에 다시 보인다
  }
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

  const circleClass = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label-2 ${
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
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label-2 ${
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
      <AvatarRow names={counts.memberNames} />
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

export default function WorkspaceLanding() {
  const { workspaces, selectWorkspace, deleteWorkspace, renameWorkspace, duplicateWorkspace } = useWorkspaces()
  const [dupError, setDupError] = useState('')
  const existingTeamNames = useMemo(() => Array.from(new Set(workspaces.map((w) => w.teamName))), [workspaces])
  const sortedByRecency = useMemo(() => [...workspaces].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)), [workspaces])
  const mostRecentTeam = sortedByRecency[sortedByRecency.length - 1]?.teamName ?? ''
  // 방금까지 하던 평가(전체 팀 통틀어 가장 최근에 수정된 워크스페이스) --
  // 카드 목록에서 "평가 진행중" 배지로 구분해 바로 이어할 수 있게 한다.
  const mostRecentWorkspaceId = sortedByRecency[sortedByRecency.length - 1]?.id ?? null

  const [teamName, setTeamName] = useState(() => {
    if (mostRecentTeam) return mostRecentTeam
    const mine = readAccessCache()?.users.find((u) => u.email === (getConnectedEmail() ?? '').toLowerCase())?.team || ''
    return readHiddenTeams().includes(mine) ? '' : mine
  })
  const [newTeamInput, setNewTeamInput] = useState('')
  // 팝업 없이 이 화면 안에서: 새 팀 이름 칸 · 새 평가(기간 고르기) 칸 · 팀원 명단 펼치기
  const [addingTeam, setAddingTeam] = useState(false)
  const [newEvalOpen, setNewEvalOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const startTeam = (prefill = '') => {
    setNewTeamInput(prefill)
    setAddingTeam(true)
  }
  const [deletingWorkspace, setDeletingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceMeta | null>(null)
  const [renameTeamName, setRenameTeamName] = useState('')
  const [renamePeriodName, setRenamePeriodName] = useState('')
  // 팀 이름 바꾸기(그 팀의 모든 평가 · 팀원 담당팀까지)
  const [teamRename, setTeamRename] = useState<{ from: string; to: string } | null>(null)
  function saveTeamRename() {
    if (!teamRename) return
    const to = teamRename.to.trim()
    const { from } = teamRename
    if (!to || to === from) return setTeamRename(null)
    renameEvalTeam(workspaces, renameWorkspace, from, to)
    setTeamName(to)
    setTeamRename(null)
    // 관리(권한 시트)의 팀 이름은 바로 바꾸지 않고, 바뀌는 사람을 보여 주고 고르게 한다
    const access = readAccessCache()
    const me = (getConnectedEmail() ?? '').toLowerCase()
    if (access && me) {
      const admin = isAdminEmail(me)
      const hit = access.users.filter((u) => u.team === from && (admin || u.email === me || u.addedBy === me))
      if (hit.length) setAccessRename({ from, to, people: hit.map((u) => u.name || u.email) })
    }
  }
  const [accessRename, setAccessRename] = useState<{ from: string; to: string; people: string[] } | null>(null)
  const [accessRenameNote, setAccessRenameNote] = useState('')
  async function applyAccessRename() {
    const r = accessRename
    const access = readAccessCache()
    const me = (getConnectedEmail() ?? '').toLowerCase()
    setAccessRename(null)
    if (!r || !access) return
    const admin = isAdminEmail(me)
    try {
      await updateUsers(
        access.id,
        (users) => users.map((u) => (u.team === r.from && (admin || u.email === me || u.addedBy === me) ? { ...u, team: r.to } : u)),
        me,
        [`팀 이름(성과관리에서 바꿈): ${r.from} → ${r.to}`],
      )
      setAccessRenameNote(`관리의 팀 이름도 「${r.to}」로 바꿨습니다(${r.people.length}명).`)
    } catch (e) {
      setAccessRenameNote(`관리의 팀 이름을 바꾸지 못했습니다: ${errText(e)} 팀원관리 › 초대 · 계정에서 「평가 목록 이름으로 맞추기」를 눌러 주세요.`)
    }
  }

  // teamName은 useState 초기값이라 마운트 시점 이후로는 저절로 안 바뀐다.
  // 선택돼 있던 팀을 지워서 지금 선택된 teamName이 더 이상 존재하지
  // 않게 되면 상태가 붕 떠버리므로, 목록이 바뀔 때마다 유효한 팀을
  // 가리키도록 다시 맞춘다.
  // (평가 목록이 바뀔 때만 -- 방금 만든, 아직 평가 없는 새 팀은 그대로 둔다)
  const prevTeams = useRef(existingTeamNames)
  useEffect(() => {
    const before = prevTeams.current
    prevTeams.current = existingTeamNames
    if (before.includes(teamName) && !existingTeamNames.includes(teamName)) setTeamName(mostRecentTeam || existingTeamNames[0] || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTeamNames])

  // 새 팀: 이름을 넣으면 그 팀을 고르고 바로 아래 「새 평가」 칸을 연다(팀은 첫 평가를 만들 때 생긴다)
  function confirmTeamName() {
    const name = newTeamInput.trim()
    if (!name) return
    setAddingTeam(false)
    setTeamName(name)
    setNewEvalOpen(true)
    if (hiddenTeams.includes(name)) {
      const hidden = hiddenTeams.filter((t) => t !== name)
      setHiddenTeams(hidden)
      writeHiddenTeams(hidden)
    }
  }
  // 최근 수정한 평가가 맨 위로 오도록 정렬 -- "지금까지 만들어진 평가가
  // 뭐가 있는지" 한눈에 보이는 게 이 화면의 첫 번째 목적이라, 평가기간
  // 선택기보다 이 목록을 먼저 보여준다.
  // 고른 팀의 팀원 명단(권한 시트) 숫자: 팀원 · Gmail 없음 · 초대 안 보냄. 명단을 닫을 때 다시 센다
  const roster = useMemo(() => {
    const access = readAccessCache()
    if (!access) return null
    const me = (getConnectedEmail() ?? '').toLowerCase()
    const ms = access.users.filter((u) => u.role === 'member' && (u.team ? u.team === teamName : u.addedBy === me))
    const noMail = ms.filter((u) => isPendingEmail(u.email)).length
    return { n: ms.length, noMail, withMail: ms.length - noMail, notInv: ms.filter((u) => !isPendingEmail(u.email) && !u.invitedAt).length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamName, rosterOpen])
  // 권한 시트의 내 팀 · 내가 추가한 팀원의 팀도 팀 목록에(평가가 아직 없어도 보이게)
  const { myTeam, accessTeams } = useMemo(() => {
    const access = readAccessCache()
    const me = (getConnectedEmail() ?? '').toLowerCase()
    if (!access || !me) return { myTeam: '', accessTeams: [] as string[] }
    const mine = access.users.find((u) => u.email === me)?.team ?? ''
    const added = access.users.filter((u) => u.addedBy === me && u.team).map((u) => u.team)
    return { myTeam: mine, accessTeams: [mine, ...added].filter(Boolean) }
  }, [])
  const [hiddenTeams, setHiddenTeams] = useState(readHiddenTeams)
  const teamList = useMemo(
    () => Array.from(new Set([...existingTeamNames, ...accessTeams.filter((t) => !hiddenTeams.includes(t)), ...(teamName ? [teamName] : [])])),
    [existingTeamNames, accessTeams, hiddenTeams, teamName],
  )
  // 팀 삭제: 그 팀의 평가를 모두 지우고 탭에서 숨긴다(팀원 명단 = 권한 시트는 그대로)
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null)
  function handleDeleteTeam() {
    const name = deletingTeam
    setDeletingTeam(null)
    if (!name) return
    workspaces.filter((w) => w.teamName === name).forEach((w) => deleteWorkspace(w.id))
    const hidden = Array.from(new Set([...hiddenTeams, name]))
    setHiddenTeams(hidden)
    writeHiddenTeams(hidden)
    setRosterOpen(false)
    setNewEvalOpen(false)
    setTeamName(existingTeamNames.find((t) => t !== name) ?? accessTeams.find((t) => t !== name && !hidden.includes(t)) ?? '')
  }
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (rosterOpen || newEvalOpen) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [rosterOpen, newEvalOpen])
  const teamWorkspaces = workspaces.filter((w) => w.teamName === teamName).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const openRoster = () => {
    setNewEvalOpen(false)
    setRosterOpen(!rosterOpen)
  }
  const steps = [
    {
      title: '팀원 명단',
      status: !roster
        ? '명단을 열면 팀원 수와 Gmail 상태가 보입니다'
        : roster.n === 0
          ? '아직 팀원이 없습니다. 이름과 Gmail을 넣어 주세요'
          : `${roster.n}명${roster.noMail ? ` · Gmail 없는 사람 ${roster.noMail}명` : ' · 모두 Gmail 있음'}`,
      done: !!roster && roster.n > 0 && roster.noMail === 0,
      action: !roster || roster.n === 0 ? '팀원 추가' : roster.noMail ? 'Gmail 채우기' : '명단 보기',
      open: rosterOpen,
      onClick: openRoster,
    },
    {
      title: '초대 메일',
      status: !roster || roster.withMail === 0
        ? 'Gmail이 있는 팀원에게 앱 시작 링크를 보냅니다'
        : roster.notInv
          ? `아직 안 보낸 사람 ${roster.notInv}명`
          : `${roster.withMail}명 모두 보냄`,
      done: !!roster && roster.withMail > 0 && roster.notInv === 0,
      action: '초대 메일 보내기',
      open: false,
      onClick: () => {
        setNewEvalOpen(false)
        setRosterOpen(true)
      },
    },
    {
      title: '평가 만들기',
      status: teamWorkspaces.length
        ? `평가 ${teamWorkspaces.length}개 · 최근 ${teamWorkspaces[0].evaluationYear} ${teamWorkspaces[0].periodName}`
        : '연도와 기간(상반기 등)을 고르면 바로 만들어집니다',
      done: teamWorkspaces.length > 0,
      action: teamWorkspaces.length ? '새 평가 만들기' : '첫 평가 만들기',
      open: newEvalOpen,
      onClick: () => {
        setRosterOpen(false)
        setNewEvalOpen(!newEvalOpen)
      },
    },
  ]
  const firstOpen = steps.findIndex((s) => !s.done)
  const nextStep = rosterOpen || newEvalOpen ? -1 : firstOpen

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
    <AppShell header={<PageHeader area="성과관리" title="평가 목록" />}>
      <main className="w-full max-w-7xl flex-1 px-6 pb-10 pt-5 lg:px-8">
        {accessRenameNote && (
          <p className="mt-2 flex items-center gap-2 rounded-card bg-subtle px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
            <span className="flex-1">{accessRenameNote}</span>
            <button onClick={() => setAccessRenameNote('')} className="text-label-3 hover:text-label" aria-label="닫기">
              <X {...icSm} />
            </button>
          </p>
        )}
        {dupError && <p className="mt-2 text-[length:calc(14px*var(--ui-fs,1))] text-danger">{dupError}</p>}

        {/* 팀 바꾸기: 팀 이름 탭 · + 새 팀(그 자리에서 이름 넣기) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {teamList.map((name) => {
            const active = name === teamName
            return (
              <button
                key={name}
                onClick={() => {
                  setTeamName(name)
                  setNewEvalOpen(false)
                  setRosterOpen(false)
                  setTeamRename(null)
                }}
                className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[length:calc(14px*var(--ui-fs,1))] transition-colors ${
                  active ? 'bg-white font-semibold text-label shadow-control' : 'text-label-2 hover:bg-black/[0.04] hover:text-label'
                }`}
              >
                {name}
              </button>
            )
          })}
          {addingTeam ? (
            <span className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newTeamInput}
                onChange={(e) => setNewTeamInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmTeamName()
                  if (e.key === 'Escape') setAddingTeam(false)
                }}
                placeholder="새 팀 이름(예: UX팀)"
                className="h-8 w-48 rounded-[9px] border border-accent bg-white px-3 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none"
              />
              <Button variant="primary" size="sm" onClick={confirmTeamName} disabled={!newTeamInput.trim() || teamList.includes(newTeamInput.trim())}>
                만들기
              </Button>
              <Button size="sm" onClick={() => setAddingTeam(false)}>
                취소
              </Button>
              {teamList.includes(newTeamInput.trim()) && <span className="text-[length:calc(13px*var(--ui-fs,1))] text-danger">이미 있는 팀입니다</span>}
            </span>
          ) : (
            <button
              onClick={() => startTeam()}
              className="flex h-8 items-center gap-1 rounded-[9px] px-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2 hover:bg-black/[0.04] hover:text-accent"
            >
              <Plus {...icSm} /> 새 팀
            </button>
          )}
        </div>

        {!teamName && !addingTeam && (
          <section className="mt-6 max-w-xl rounded-[14px] bg-white p-6 shadow-card">
            <h2 className="text-[length:calc(20px*var(--ui-fs,1))] font-semibold text-label">팀부터 만들어요</h2>
            <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">팀을 만들면 팀원 명단 → 초대 메일 → 평가 만들기 순서로 안내합니다.</p>
            <Button variant="primary" className="mt-4" onClick={() => startTeam(myTeam)}>
              <Plus {...icSm} /> 팀 만들기
            </Button>
          </section>
        )}

        {teamName && (
          <>
            {/* 팀 이름(✎ 그 자리에서 바꾸기) */}
            <header className="mt-6 flex flex-wrap items-center gap-2">
              {teamRename ? (
                <>
                  <input
                    autoFocus
                    value={teamRename.to}
                    onChange={(e) => setTeamRename({ ...teamRename, to: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTeamRename()
                      if (e.key === 'Escape') setTeamRename(null)
                    }}
                    onBlur={() => saveTeamRename()}
                    className="h-10 w-72 rounded-[10px] border border-accent bg-white px-3 text-[length:calc(22px*var(--ui-fs,1))] font-semibold text-label outline-none"
                  />
                  <span className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">
                    {teamList.includes(teamRename.to.trim()) && teamRename.to.trim() !== teamRename.from ? <span className="text-danger">이미 있는 팀 이름</span> : 'Enter 저장 · Esc 취소'}
                  </span>
                </>
              ) : (
                <>
                  <h1 className="text-[length:calc(24px*var(--ui-fs,1))] font-semibold tracking-[-0.02em] text-label">{teamName}</h1>
                  <IconButton onClick={() => setTeamRename({ from: teamName, to: teamName })} title="팀 이름 바꾸기" aria-label="팀 이름 바꾸기">
                    <Pencil {...icSm} />
                  </IconButton>
                  <IconButton onClick={() => setDeletingTeam(teamName)} title="팀 삭제" aria-label="팀 삭제" className="hover:!text-danger">
                    <Trash2 {...icSm} />
                  </IconButton>
                </>
              )}
            </header>

            {/* 할 일 순서: 팀원 명단 → 초대 메일 → 평가 만들기. 다음에 할 칸이 파랗게 */}
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {steps.map((s, i) => {
                const now = i === nextStep
                return (
                  <li
                    key={s.title}
                    className={`flex flex-col rounded-[14px] bg-white p-5 shadow-card ${now ? 'ring-2 ring-accent/60' : ''} ${s.open ? 'ring-2 ring-ink/80' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[length:calc(13px*var(--ui-fs,1))] font-semibold ${
                          s.done ? 'bg-success text-white' : now ? 'bg-accent text-white' : 'bg-black/[0.06] text-label-2'
                        }`}
                      >
                        {s.done ? <Check size={14} strokeWidth={2.6} /> : i + 1}
                      </span>
                      <span className="text-[length:calc(15.5px*var(--ui-fs,1))] font-semibold text-label">{s.title}</span>
                    </div>
                    <p className="mt-2 flex-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">{s.status}</p>
                    <div className="mt-4">
                      <Button variant={now && !s.open ? 'primary' : 'secondary'} size="sm" onClick={s.onClick}>
                        {s.open ? (
                          <>
                            접기 <ChevronDown size={14} strokeWidth={2} className="rotate-180" />
                          </>
                        ) : (
                          <>
                            {s.action} <ArrowRight size={14} strokeWidth={2} />
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ol>

            {/* 펼친 칸: 팀원 명단(추가 · Gmail · 초대 메일) 또는 새 평가(연도 · 기간) */}
            {rosterOpen && (
              <section ref={panelRef} className="mt-3 rounded-[14px] bg-white p-5 shadow-card">
                <TeamAccountsPanel />
              </section>
            )}
            {newEvalOpen && (
              <section ref={panelRef} className="mt-3 max-w-2xl rounded-[14px] bg-white p-5 shadow-card">
                <p className="mb-3 text-[length:calc(15.5px*var(--ui-fs,1))] font-semibold text-label">새 평가 · {teamName}</p>
                <EvaluationPeriodPicker
                  key={teamName}
                  teamName={teamName}
                  onDone={(id, created) => {
                    setNewEvalOpen(false)
                    if (created) markNewWorkspace(id) // 새로 만들었으면 들어가서 "어떻게 시작할까요?" 안내를 한 번 띄운다
                    selectWorkspace(id)
                  }}
                />
              </section>
            )}

            {/* 이 팀의 평가 */}
            {teamWorkspaces.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">
                  평가 <span className="font-normal text-label-3">{teamWorkspaces.length}</span>
                  <span className="ml-2 text-[length:calc(13px*var(--ui-fs,1))] font-normal text-label-3">눌러서 들어가기 · 우클릭으로 복제 · 삭제</span>
                </h2>
                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {teamWorkspaces.map((w) => (
                    <ProjectCard
                      key={w.id}
                      workspace={w}
                      isCurrent={w.id === mostRecentWorkspaceId}
                      onOpen={selectWorkspace}
                      onRename={(ws, periodName, year) => renameWorkspace(ws.id, ws.teamName, periodName, year)}
                      onEdit={openRename}
                      onDuplicate={(ws) => {
                        if (!duplicateWorkspace(ws.id)) setDupError('저장 공간이 모자라 복제하지 못했습니다. 데이터 백업 후 필요 없는 평가를 지워 주세요.')
                      }}
                      onDelete={setDeletingWorkspace}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>




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
        open={!!accessRename}
        title="관리의 팀 이름도 바꿀까요?"
        message={
          accessRename
            ? `성과관리의 팀 이름을 「${accessRename.from}」에서 「${accessRename.to}」로 바꿨습니다.\n팀원 명단(초대 · 계정)에도 「${accessRename.from}」로 적힌 사람이 ${accessRename.people.length}명 있습니다:\n${accessRename.people.slice(0, 12).join(', ')}${accessRename.people.length > 12 ? ' …' : ''}\n\n관리에도 「${accessRename.to}」로 바꿀까요? 안 바꾸면 나중에 관리 화면에서 맞출 수 있습니다.`
            : ''
        }
        confirmLabel="관리에도 적용"
        tone="accent"
        onConfirm={() => void applyAccessRename()}
        onCancel={() => setAccessRename(null)}
      />
      <ConfirmDialog
        open={deletingTeam !== null}
        title="팀 삭제"
        message={(() => {
          const n = workspaces.filter((w) => w.teamName === deletingTeam).length
          return `「${deletingTeam}」 팀을 지웁니다.${n ? `\n이 팀의 평가 ${n}개와 그 안의 과제 · 평가 · 면담 데이터가 모두 지워지며 되돌릴 수 없습니다(먼저 데이터 백업 권장).` : ''}\n팀원 명단(권한 시트)과 과제 입력 데이터는 그대로입니다.`
        })()}
        confirmLabel="팀 삭제"
        onConfirm={handleDeleteTeam}
        onCancel={() => setDeletingTeam(null)}
      />
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


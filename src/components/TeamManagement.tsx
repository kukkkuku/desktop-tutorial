import { errText } from '../utils/googleError'
import { useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Level, MemberTableConfig, PeerReview, TeamMember } from '../types'
import { LEVEL_OPTIONS } from '../types'
import { calcMemberParticipation, GRADE_COLORS } from '../utils/calculations'
import { calcServiceYearMonth, countFoundingAnniversaries, levelOrdinalOf, readFoundingDay, writeFoundingDay } from '../utils/tenure'
import { removeUnmatchedAssignees, unmatchedAssigneeSummary } from '../utils/workBoard'
import { useStateHistory } from '../hooks/useStateHistory'
import { normalizeDateText } from '../utils/sheetImport'
import ConfirmDialog from './ConfirmDialog'
import Button from './Button'
import HRCardImportModal from './HRCardImportModal'
import DataGrid, { CHIP_BASE, type CellEdit, type GridColumn } from './grid/DataGrid'
import { toast } from './ui/Toast'
import { accessUserOf, effectiveTeam } from '../utils/memberTeam'
import IconButton from './IconButton'
import { ArrowRightLeft, Check, IdCard, MessageSquareText, PanelRightOpen, Redo2, Send, Settings2, Undo2, X } from 'lucide-react'
import { ic, icLg, icSm } from './ui/icon'
import { isPendingEmail, readHandovers, updateUsers, writeHandover, type AccessUser, type Handover } from '../utils/accessSheet'
import { useAccessData } from '../hooks/useAccessData'
import { addRosterSkip, normalizeGmail, readRosterSkip, rosterChanges, rosterMissing, rosterUserOf } from '../utils/teamRoster'
import TeamInviteDialog from './TeamInviteDialog'
import { hasSheetsTokenNow } from '../utils/sheetSources'
import { getConnectedEmail } from '../utils/googleDrive'

// 입사일이 있으면 자동 계산한 근속연차를 우선 쓰고, 없으면 예전처럼 수동 입력된
// yearsOfService(엑셀 업로드 등으로 채워질 수 있음)로 대체 표시한다.
// 근속년월(창립기념일 기준): "1년 8개월(1년)" -- 앞은 입사일부터 만, 괄호는 지난 창립기념일 횟수.
function displayServiceYears(member: TeamMember, foundingDay: string | null): string {
  // 팀장이 직접 적은 값이 먼저(비우면 다시 자동)
  if (member.serviceManual) return member.serviceManual
  const ym = calcServiceYearMonth(member.hireDate)
  if (ym) {
    const base = `${ym.years}년 ${ym.months}개월`
    const f = countFoundingAnniversaries(member.hireDate, foundingDay)
    // 창립기념일을 안 정했으면 괄호 없이
    return f === null ? base : `${base}(${f}년)`
  }
  return member.yearsOfService != null ? `${member.yearsOfService}년` : '-'
}

// "직급" 컬럼이 바로 옆에 따로 있으므로, 여기서는 연차만 표시하고 직급명은
// 반복하지 않는다(formatLevelTenureLabel은 "대리 1년차"처럼 직급명을
// 포함해서 다른 화면(성장 관리 등, 직급 컬럼이 따로 없는 곳)에서 쓴다).
function formatTenureOnly(ordinal: number | null): string {
  return ordinal === null ? '-' : `${ordinal}년차`
}

// 팀원 명단 저장 중(이 탭 전체에서 하나만)
let rosterSaving = false

export default function TeamManagement() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const { openMemberDetail } = useMemberDetail()
  const history = useStateHistory()
  const [deleting, setDeleting] = useState<TeamMember[] | null>(null)
  const [viewingPeerReviewsFor, setViewingPeerReviewsFor] = useState<TeamMember | null>(null)
  const [deletingPeerReview, setDeletingPeerReview] = useState<PeerReview | null>(null)
  const [pickedUnmatched, setPickedUnmatched] = useState<Set<string>>(new Set())
  // 시트 담당자 중 팀원 아닌 사람 목록 -- 평소엔 한 줄로 접어 둔다.
  const [movedOpen, setMovedOpen] = useState(false)
  const [unmatchedOpen, setUnmatchedOpen] = useState(false)
  // ---- 팀원 명단(권한 시트)과 이 표를 뒤에서 맞춘다(teamRoster) -- 팀장은 이 표 하나로 추가 · Gmail · 초대까지
  const { data: access } = useAccessData()
  const me = (getConnectedEmail() ?? '').toLowerCase()
  const wsId = currentWorkspace?.id ?? null
  // 명단 → 이 표: 우리 팀 명단에 있는데 이 평가에 없는 사람을 넣는다(이 평가에서 지운 사람은 빼고)
  useEffect(() => {
    if (!access || !me || !wsId) return
    const seen = new Set<string>()
    const miss = rosterMissing(access, state.members, teamName, me, readRosterSkip(wsId)).filter((u) => {
      const k = u.name.trim() || u.email
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (!miss.length) return
    const added = miss.map((u) => ({ ...blankMember(u.name.trim() || u.email.split('@')[0]), email: isPendingEmail(u.email) ? undefined : u.email }))
    dispatch({ type: 'IMPORT_MEMBERS', payload: [...state.members, ...added] })
    toast(`팀원 명단에 있는 ${added.map((m) => m.name).join(', ')}님을 이 평가에 넣었습니다. 평가하지 않을 사람은 행을 지우면 됩니다.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, wsId, teamName])
  // 이 표 → 명단: 이름 · Gmail을 고치면 잠시 뒤 명단에도(초대 메일 · 로그인에 쓰임).
  // 뒤에서는 권한이 이미 있을 때만 조용히 저장하고, 없으면 로그인 창 대신 「팀원 명단 저장」 버튼 하나만 보여 준다(누를 때 한 번 로그인).
  const syncFailed = useRef(false)
  const lastSent = useRef('')
  const rosterCh = access && me && teamName.trim() ? rosterChanges(access, state.members, teamName, me) : null
  const [rosterBusy, setRosterBusy] = useState(false)
  async function saveRoster() {
    const ch = access && me ? rosterChanges(access, state.members, teamName, me) : null
    if (!ch || !access) return
    // 이 탭에서 명단 저장이 겹쳐 돌지 않게(둘 다 「아직 없음」을 보고 같은 사람을 두 번 넣지 않게)
    if (rosterSaving) return
    rosterSaving = true
    lastSent.current = ch.log.join()
    setRosterBusy(true)
    try {
      await updateUsers(access.id, ch.apply, me, ch.log)
    } catch (e) {
      syncFailed.current = true
      toast(`팀원 명단에 저장하지 못했습니다: ${errText(e)} 권한 시트 편집 권한이 없으면 관리자에게 공유를 요청해 주세요.`, 'error')
    } finally {
      rosterSaving = false
      setRosterBusy(false)
    }
  }
  useEffect(() => {
    if (!rosterCh || syncFailed.current || !hasSheetsTokenNow()) return
    // 같은 변경을 두 번 보내지 않는다(시트가 아직 안 바뀐 것처럼 읽혀도 되풀이하지 않게)
    if (rosterCh.log.join() === lastSent.current) return
    const t = window.setTimeout(() => void saveRoster(), 1200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, state.members, teamName, me])
  const [inviteOpen, setInviteOpen] = useState(false)
  // 초대 대상: 이 표에서 Gmail이 있는 팀원(명단 저장이 아직 안 끝났어도 보이게 -- 초대한 날은 명단에서)
  const invitePeople = access
    ? state.members
        .filter((m) => (m.email ?? '').includes('@'))
        .map((m) => {
          const e = m.email!.toLowerCase()
          const u = access.users.find((x) => x.email === e)
          return u ?? { email: e, name: m.name, role: 'member' as const, team: teamName.trim(), addedBy: me }
        })
    : []
  const [alsoRoster, setAlsoRoster] = useState(false)
  // ---- 팀 이동: 관리 명단에서 다른 팀으로 옮긴 팀원(이전 팀장 쪽) · 이전 팀장 의견(새 팀장 쪽)
  const moved = useMemo(() => {
    const t = teamName.trim()
    if (!t || !access) return []
    const byEmail = new Map(access.users.map((u) => [u.email, u]))
    // Gmail 없는 팀원은 이름으로(같은 이름이 한 사람일 때만 -- 둘 이상이면 누군지 몰라 건너뜀)
    const byName = (name: string) => {
      const hit = access.users.filter((u) => u.name.trim() === name.trim())
      return hit.length === 1 ? hit[0] : undefined
    }
    return state.members
      .filter((m) => m.active && (m.email || m.name.trim()))
      .map((m) => ({ m, u: m.email ? byEmail.get(m.email.toLowerCase()) : byName(m.name) }))
      .filter((x): x is { m: TeamMember; u: NonNullable<typeof x.u> } => !!x.u && !!x.u.team && x.u.team !== t)
  }, [access, state.members, teamName])
  const [handovers, setHandovers] = useState<Handover[]>([])
  useEffect(() => {
    if (!access?.id) return
    let live = true
    void readHandovers(access.id).then((h) => live && setHandovers(h))
    return () => {
      live = false
    }
  }, [access?.id])
  // 이 팀원에 대한 가장 최근 인수인계(우리 팀으로 온 것)
  const handoverOf = (m: TeamMember) =>
    [...handovers]
      .reverse()
      .find((h) => (m.email ? h.email === m.email.toLowerCase() : h.name.trim() === m.name.trim()) && (!teamName.trim() || h.toTeam === teamName.trim()))
  const [handoverView, setHandoverView] = useState<Handover | null>(null)
  const [handoverFor, setHandoverFor] = useState<{ m: TeamMember; toTeam: string } | null>(null)
  const [opinion, setOpinion] = useState('')
  const [handoverBusy, setHandoverBusy] = useState(false)
  const tasksOf = (m: TeamMember) =>
    state.contributions
      .filter((c) => c.memberId === m.id && c.contributionPercent > 0)
      .map((c) => {
        const t = state.tasks.find((x) => x.id === c.taskId)
        return t ? `${t.name} ${c.contributionPercent}%` : ''
      })
      .filter(Boolean)
      .join(' / ')
  async function submitHandover() {
    if (!handoverFor || !access) return
    const { m, toTeam } = handoverFor
    setHandoverBusy(true)
    try {
      await writeHandover(access.id, {
        // Gmail 없는 팀원은 명단의 자리표시 계정(이름으로 찾음)
        email: (m.email ?? access.users.find((u) => u.name.trim() === m.name.trim())?.email ?? '').toLowerCase(),
        name: m.name,
        fromTeam: teamName.trim(),
        toTeam,
        by: getConnectedEmail() ?? '',
        opinion: opinion.trim(),
        tasks: tasksOf(m),
      })
      // 이번 평가에서는 비활성(지난 기록은 그대로)
      save(
        state.members.map((x) => (x.id === m.id ? { ...x, active: false } : x)),
        [],
      )
      setHandoverFor(null)
      setOpinion('')
      toast(`${m.name}: 의견을 남기고 비활성으로 바꿨습니다. 새 팀장(「${toTeam}」)이 팀원관리에서 볼 수 있습니다.`)
    } catch (e) {
      toast(`의견을 남기지 못했습니다: ${errText(e)}`, 'error')
    } finally {
      setHandoverBusy(false)
    }
  }
  const [hrOpen, setHrOpen] = useState(false)
  function applyHRCards(updates: TeamMember[], adds: TeamMember[]) {
    history.record()
    for (const m of updates) dispatch({ type: 'UPDATE_MEMBER', payload: m })
    for (const m of adds) dispatch({ type: 'ADD_MEMBER', payload: m })
    setHrOpen(false)
  }

  // 권한 시트의 팀 이름들 · 이 팀원의 권한 시트 줄(Gmail, 없으면 같은 이름이 한 사람일 때)
  const sheetTeamNames = useMemo(
    () => (access ? Array.from(new Set(access.users.map((u) => u.team.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')) : []),
    [access],
  )
  const accessUserFor = (m: TeamMember): AccessUser | undefined => accessUserOf(m, access?.users)
  const boardTeams = useMemo(
    () => Array.from(new Set(state.workBoard.items.map((i) => i.fields.team).filter(Boolean) as string[])).sort(),
    [state.workBoard.items],
  )
  const workCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of state.workBoard.items) for (const id of i.assigneeIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [state.workBoard.items])
  const peerCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of state.peerReviews) m.set(r.targetMemberId, (m.get(r.targetMemberId) ?? 0) + 1)
    return m
  }, [state.peerReviews])

  const baseColumns: GridColumn[] = [
    { id: 'name', label: '이름', type: 'text', width: 80, system: true },
    // 팀원 명단 · 초대: 이름 바로 뒤(Gmail 아이디만 보이고, 오른쪽 끝에 초대 상태 -- 초대 전 / ✓ ○.○)
    { id: 'email', label: 'Gmail', type: 'text', width: 132, system: true },
    { id: 'hireDate', label: '입사일', type: 'date', width: 100, system: true },
    { id: 'service', label: '근속', type: 'text', width: 100, system: true },
    { id: 'level', label: '직급', type: 'select', width: 66, system: true, picker: { options: LEVEL_OPTIONS, tone: () => 'bg-black/[0.05] text-label' } },
    { id: 'currentLevelSince', label: '직급 발령일', type: 'date', width: 100, system: true },
    { id: 'levelTenure', label: '직급 연차', type: 'text', width: 74, system: true },
    { id: 'role', label: '역할', type: 'text', width: 64, system: true },
    // 팀 = 관리(권한 시트)의 팀과 같은 값 -- 목록도 권한 시트 팀 이름(이름이 갈리지 않게). 바꾸면 권한 시트에도 저장
    {
      id: 'team',
      label: '팀',
      type: 'select',
      width: 112,
      system: true,
      picker: { options: sheetTeamNames.length ? sheetTeamNames : boardTeams, allowNew: true, tone: () => 'bg-black/[0.05] text-label' },
    },
    {
      id: 'active',
      label: '상태',
      type: 'select',
      width: 66,
      system: true,
      // 칸 안 토글로 켜고 끈다(목록에서 고르지 않음)
      readOnly: true,
    },
    { id: 'work', label: '담당 L3', type: 'text', width: 64, system: true, readOnly: true },
    { id: 'tasks', label: '평가과제', type: 'text', width: 66, system: true, readOnly: true },
    { id: 'peer', label: '피어리뷰', type: 'text', width: 84, system: true, readOnly: true },
  ]
  // 열 설정(순서·숨김·폭·이름·추가 열)은 이 평가 프로젝트에 저장한다.
  const cfg: MemberTableConfig = state.memberTable ?? { order: [], hidden: [], widths: {}, labels: {}, custom: [] }
  const customCols: GridColumn[] = cfg.custom.map((c) => ({ id: c.id, label: c.label, type: 'text', width: 140, system: false }))
  const allCols = [...baseColumns, ...customCols]
  // 저장된 순서에 없는 열(새로 생긴 기본 열 등)은 기본 순서의 바로 앞 열 뒤에 끼운다
  const orderIds = (() => {
    const out = cfg.order.filter((id) => allCols.some((c) => c.id === id))
    allCols.forEach((c, i) => {
      if (out.includes(c.id)) return
      const prev = i > 0 ? out.indexOf(allCols[i - 1].id) : -1
      out.splice(prev + 1, 0, c.id)
    })
    return out
  })()
  const hiddenSet = new Set(cfg.hidden.filter((id) => id !== 'name'))
  const columns: GridColumn[] = orderIds
    .map((id) => allCols.find((c) => c.id === id)!)
    .filter((c) => !hiddenSet.has(c.id))
    .map((c) => ({ ...c, width: cfg.widths[c.id] ?? c.width, label: cfg.labels[c.id] ?? c.label }))
  function saveCfg(patch: Partial<MemberTableConfig>) {
    dispatch({ type: 'SET_MEMBER_TABLE', payload: { ...cfg, order: orderIds, ...patch } })
  }
  function insertColumn(visIndex: number) {
    const id = `c_${uuidv4().slice(0, 8)}`
    let n = cfg.custom.length + 1
    while (allCols.some((c) => c.label === `새 열 ${n}`)) n += 1
    const at = visIndex < columns.length ? orderIds.indexOf(columns[visIndex].id) : orderIds.length
    saveCfg({ custom: [...cfg.custom, { id, label: `새 열 ${n}` }], order: [...orderIds.slice(0, at), id, ...orderIds.slice(at)] })
  }
  function deleteColumns(ids: string[]) {
    const custom = ids.filter((id) => cfg.custom.some((c) => c.id === id))
    if (custom.length === 0) {
      toast('기본 열은 지울 수 없습니다. 대신 숨길 수 있습니다.', 'error')
      return
    }
    history.record()
    saveCfg({ custom: cfg.custom.filter((c) => !custom.includes(c.id)), order: orderIds.filter((id) => !custom.includes(id)) })
  }
  function moveColumns(ids: string[], toVisIndex: number) {
    const moving = orderIds.filter((id) => ids.includes(id))
    const rest = orderIds.filter((id) => !ids.includes(id))
    const target = columns[toVisIndex]?.id
    const at = target && !ids.includes(target) ? rest.indexOf(target) : rest.length
    saveCfg({ order: [...rest.slice(0, at), ...moving, ...rest.slice(at)] })
  }
  const [colMenuOpen, setColMenuOpen] = useState(false)
  // 창립기념일은 팀 데이터에 저장한다(다른 기기에서도 같게). 예전에 브라우저에만 넣어 둔 값이 있으면 그것을 쓴다.
  const foundingDay = cfg.foundingDay ?? readFoundingDay()
  function setFoundingDay(v: string | null) {
    const { foundingDay: _drop, ...rest } = cfg
    void _drop
    dispatch({ type: 'SET_MEMBER_TABLE', payload: { ...rest, order: orderIds, ...(v ? { foundingDay: v } : {}) } })
    if (!v) writeFoundingDay(null)
  }

  function textOf(m: TeamMember, colId: string): string {
    switch (colId) {
      case 'name':
        return m.name
      case 'hireDate':
        return m.hireDate ?? ''
      case 'service':
        return displayServiceYears(m, foundingDay)
      case 'level':
        return m.level
      case 'currentLevelSince':
        return m.currentLevelSince ?? ''
      case 'levelTenure':
        return formatTenureOnly(levelOrdinalOf(m))
      case 'role':
        return m.role
      case 'team':
        // 권한 시트에 있는 사람이면 그 팀(모두가 보는 값), 아니면 이 평가에 적힌 값
        return effectiveTeam(m, access?.users)
      case 'email':
        return m.email ?? ''
      case 'invite': {
        const u = rosterUserOf(access, m, teamName, me)
        // 시트 공유 상태는 관리자만 본다(팀장에게는 초대 여부만)
        if (!m.email) return 'Gmail 없음'
        return u?.invitedAt ? `${u.invitedAt.slice(5, 10).replace('-', '.')} 보냄` : '초대 전'
      }
      case 'active':
        return m.active ? '활성' : '비활성'
      case 'work':
        return `${workCount.get(m.id) ?? 0}건`
      case 'tasks':
        return `${calcMemberParticipation(m, state.tasks, state.contributions).count}건`
      case 'peer':
        return `${peerCount.get(m.id) ?? 0}건`
      default:
        return m.extra?.[colId] ?? ''
    }
  }

  // 이름은 비울 수 없고 겹치면 안 된다. 새 행은 "새 팀원"으로 만들어 두고 바로 덮어쓰게 한다.
  function freshName(taken: Set<string>): string {
    let name = '새 팀원'
    for (let n = 2; taken.has(name); n += 1) name = `새 팀원 ${n}`
    taken.add(name)
    return name
  }
  function blankMember(name: string): TeamMember {
    return { id: uuidv4(), name, active: true, level: '', yearsOfService: null, role: '', comment: '', hireDate: null, currentLevelSince: null }
  }

  // edits를 list에 적용한 새 목록. 맞지 않는 값은 건너뛰고 problems에 적는다.
  function withEdits(list: TeamMember[], edits: CellEdit[], problems: string[]): TeamMember[] {
    const next = list.map((m) => ({ ...m }))
    const byId = new Map(next.map((m) => [m.id, m]))
    for (const e of edits) {
      const m = byId.get(e.rowId)
      if (!m) continue
      const v = e.text.trim()
      switch (e.colId) {
        case 'name':
          if (!v) problems.push('이름은 비울 수 없습니다')
          else if (next.some((o) => o.id !== m.id && o.name === v)) problems.push(`'${v}' 팀원이 이미 있습니다`)
          else m.name = v
          break
        case 'hireDate':
        case 'currentLevelSince': {
          const d = v ? normalizeDateText(v) : ''
          if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) problems.push(`'${v}'은(는) 날짜로 읽을 수 없습니다 (예: 2024-03-02)`)
          else m[e.colId] = d || null
          break
        }
        case 'level':
          if (!v || LEVEL_OPTIONS.includes(v as Level)) m.level = v as Level | ''
          else problems.push(`직급 '${v}'은(는) 없는 값입니다`)
          break
        // 근속 · 직급 연차: 자동 값 그대로면 바꾸지 않고, 비우면 다시 자동
        case 'service': {
          const auto = displayServiceYears({ ...m, serviceManual: null }, foundingDay)
          if (!v || v === '-') m.serviceManual = null
          else if (v !== auto) m.serviceManual = /^\d+(\.\d+)?$/.test(v) ? `${v}년` : v
          break
        }
        case 'levelTenure': {
          const auto = formatTenureOnly(levelOrdinalOf({ ...m, levelYearsManual: null }))
          if (!v || v === '-') m.levelYearsManual = null
          else if (v !== auto) {
            const n = Number(v.replace(/년차|년/g, '').trim())
            if (Number.isInteger(n) && n >= 1 && n <= 60) m.levelYearsManual = n
            else problems.push(`직급 연차 '${v}'은(는) 숫자로 적어 주세요 (예: 3)`)
          }
          break
        }
        case 'role':
          m.role = v
          break
        case 'team':
          m.team = v || undefined
          break
        case 'email':
          // 아이디만 적으면 @gmail.com
          m.email = normalizeGmail(v) || undefined
          break
        case 'active':
          if (v === '활성' || v === '비활성') m.active = v === '활성'
          break
        default:
          if (cfg.custom.some((c) => c.id === e.colId)) {
            const extra = { ...(m.extra ?? {}) }
            if (v) extra[e.colId] = v
            else delete extra[e.colId]
            m.extra = Object.keys(extra).length ? extra : undefined
          }
      }
    }
    return next
  }

  function save(next: TeamMember[], problems: string[]) {
    if (problems.length) toast(Array.from(new Set(problems)).join(' · '), 'error')
    if (JSON.stringify(next) === JSON.stringify(state.members)) return
    history.record()
    // 활성 여부가 바뀐 팀원은 기여도 자동 배분을 다시 해야 해서 UPDATE_MEMBER로 보낸다.
    const prev = new Map(state.members.map((m) => [m.id, m]))
    const sameSet = next.length === state.members.length && next.every((m) => prev.has(m.id))
    if (sameSet) {
      for (const m of next) if (JSON.stringify(m) !== JSON.stringify(prev.get(m.id))) dispatch({ type: 'UPDATE_MEMBER', payload: m })
    } else dispatch({ type: 'IMPORT_MEMBERS', payload: next })
  }

  function commit(edits: CellEdit[]) {
    const problems: string[] = []
    save(withEdits(state.members, edits, problems), problems)
    // 팀을 직접 바꾼 칸만 권한 시트에도(관리 화면 · 그 팀장 명단에 반영). 옛 평가에 적혀 있던 값은 뒤에서 밀어 넣지 않는다
    if (!access) return
    const moves = edits
      .filter((e) => e.colId === 'team')
      .map((e) => {
        const m = state.members.find((x) => x.id === e.rowId)
        const u = m ? accessUserFor(m) : undefined
        return u && u.team.trim() !== e.text.trim() ? { u, to: e.text.trim() } : null
      })
      .filter((x): x is { u: AccessUser; to: string } => !!x)
    if (!moves.length) return
    const to = new Map(moves.map((x) => [x.u.email, x.to]))
    void updateUsers(access.id, (users) => users.map((x) => (to.has(x.email) ? { ...x, team: to.get(x.email)! } : x)), me, [
      `팀(팀원관리에서): ${moves.map((x) => `${x.u.name || x.u.email} → ${x.to || '(없음)'}`).join(', ')}`,
    ])
      .then(() => toast(`${moves.map((x) => x.u.name || x.u.email).join(', ')}님의 팀을 바꿔 관리(권한 시트)에도 저장했습니다.`))
      .catch((err) => toast(`팀을 권한 시트에 저장하지 못했습니다: ${errText(err)} 권한 시트 편집 권한이 없으면 관리자에게 요청해 주세요.`, 'error'))
  }

  function insertRows(index: number, count: number) {
    const taken = new Set(state.members.map((m) => m.name))
    const added = Array.from({ length: count }, () => blankMember(freshName(taken)))
    history.record()
    dispatch({ type: 'IMPORT_MEMBERS', payload: [...state.members.slice(0, index), ...added, ...state.members.slice(index)] })
  }

  // 붙여넣기: 표보다 긴 줄은 새 팀원으로 추가한다.
  function paste(rowIndex: number, colIndex: number, matrix: string[][]) {
    const taken = new Set(state.members.map((m) => m.name))
    const nameCol = columns.findIndex((c) => c.id === 'name')
    const list = [...state.members]
    const edits: CellEdit[] = []
    matrix.forEach((line, i) => {
      let m = list[rowIndex + i]
      if (!m) {
        const typed = nameCol >= colIndex ? (line[nameCol - colIndex] ?? '').trim() : ''
        m = blankMember(typed && !taken.has(typed) ? typed : freshName(taken))
        taken.add(m.name)
        list.push(m)
      }
      line.forEach((text, j) => {
        const col = columns[colIndex + j]
        if (col && !col.readOnly) edits.push({ rowId: m!.id, colId: col.id, text })
      })
    })
    const problems: string[] = []
    save(withEdits(list, edits, problems), problems)
  }

  function moveRows(ids: string[], toIndex: number) {
    const set = new Set(ids)
    const moving = state.members.filter((m) => set.has(m.id))
    const rest = state.members.filter((m) => !set.has(m.id))
    const at = state.members.slice(0, toIndex).filter((m) => !set.has(m.id)).length
    history.record()
    dispatch({ type: 'IMPORT_MEMBERS', payload: [...rest.slice(0, at), ...moving, ...rest.slice(at)] })
  }

  function confirmDelete() {
    if (!deleting) return
    history.record()
    for (const m of deleting) dispatch({ type: 'DELETE_MEMBER', payload: { id: m.id } })
    // 다시 자동으로 들어오지 않게. 「팀 명단에서도 빼기」면 로그인 · 초대 목록에서도 뺀다
    addRosterSkip(wsId, deleting.flatMap((m) => [m.name.trim(), (m.email ?? '').toLowerCase()]))
    if (alsoRoster && access) {
      const gone = deleting.map((m) => rosterUserOf(access, m, teamName, me)).filter((u) => !!u && u.role === 'member' && u.email !== me)
      if (gone.length)
        void updateUsers(access.id, (users) => users.filter((u) => !gone.some((g) => g!.email === u.email)), me, [`팀원관리에서 팀 명단 빼기: ${gone.map((u) => u!.name || u!.email).join(', ')}`]).catch(
          (e) => toast(`팀 명단에서 빼지 못했습니다: ${errText(e)}`, 'error'),
        )
    }
    setAlsoRoster(false)
    setDeleting(null)
  }

  function renderCell(m: TeamMember, col: GridColumn) {
    if (col.id === 'name')
      return (
        <div className="group/name flex items-center gap-1 py-1.5">
          <span className={`min-w-0 truncate ${handoverOf(m) ? '' : 'flex-1'}`}>{m.name}</span>
          {handoverOf(m) && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setHandoverView(handoverOf(m)!)}
              title="이전 팀장 의견 보기"
              aria-label="이전 팀장 의견"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200"
            >
              <MessageSquareText size={12} strokeWidth={2} />
            </button>
          )}
          {handoverOf(m) && <span className="flex-1" />}
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => openMemberDetail(m.id)}
            title="팀원 상세 열기"
            className="shrink-0 rounded-control p-0.5 text-label-3 opacity-0 hover:bg-black/[0.07] hover:text-label group-hover/row:opacity-100"
          >
            <PanelRightOpen {...icSm} />
          </button>
        </div>
      )
    // Gmail: 아이디만(@gmail.com은 머리글이 말해 준다) + 오른쪽 끝 초대 상태
    if (col.id === 'email') {
      if (!m.email) return <span className="text-label-3/70">Gmail 아이디</span>
      const t = textOf(m, 'invite')
      const sent = t.endsWith('보냄')
      return (
        <span className="flex min-w-0 items-center gap-2" title={m.email}>
          <span className="min-w-0 flex-1 truncate">{m.email.replace(/@gmail\.com$/i, '')}</span>
          <span className={`shrink-0 text-[length:calc(12px*var(--ui-fs,1))] ${sent ? 'text-success' : 'text-label-3'}`}>{sent ? `✓ ${t.replace(' 보냄', '')}` : '초대 전'}</span>
        </span>
      )
    }
    if (col.id === 'level') return m.level ? <span className={`${CHIP_BASE} bg-black/[0.05] text-label`}>{m.level}</span> : null
    if (col.id === 'team') {
      const t = accessUserFor(m)?.team || m.team
      return t ? <span className={`${CHIP_BASE} bg-black/[0.05] text-label`}>{t}</span> : null
    }
    if (col.id === 'active')
      return (
        <button
          type="button"
          role="switch"
          aria-checked={m.active}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => save(state.members.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)), [])}
          title={m.active ? '누르면 비활성(평가 · 기여도 배분에서 빠짐)' : '누르면 활성'}
          // 켬/끔 뱃지(평가 기준 「사용 / 미사용」과 같은 모양)
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium transition-colors ${
            m.active ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-black/[0.05] text-label-2 hover:bg-black/[0.08]'
          }`}
        >
          {m.active ? '활성' : '비활성'}
        </button>
      )
    if (col.id === 'service' || col.id === 'levelTenure') {
      const manual = col.id === 'service' ? !!m.serviceManual : m.levelYearsManual != null
      return (
        <span className={`whitespace-nowrap tabular-nums ${manual ? 'text-label' : 'text-label-2'}`} title={manual ? '직접 입력한 값 -- 지우면 다시 자동 계산' : '입사일 · 발령일로 자동 계산 -- 눌러서 직접 고칠 수 있음'}>
          {textOf(m, col.id)}
          {/* 직접 적은 값 = 작은 파란 점 */}
          {manual && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />}
        </span>
      )
    }
    if (col.id === 'work' || col.id === 'tasks')
      return <span className="tabular-nums text-label-2">{textOf(m, col.id)}</span>
    if (col.id === 'peer')
      return (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setViewingPeerReviewsFor(m)}
          className="whitespace-nowrap rounded-full bg-black/[0.05] px-2 py-0.5 text-xs font-medium text-label-2 hover:bg-black/[0.08]"
        >
          {textOf(m, 'peer')} 확인
        </button>
      )
    return undefined
  }

  function handleDeletePeerReviewConfirm() {
    if (deletingPeerReview) {
      dispatch({ type: 'DELETE_PEER_REVIEW', payload: { id: deletingPeerReview.id } })
      setDeletingPeerReview(null)
    }
  }

  const peerReviewsForViewing = viewingPeerReviewsFor ? state.peerReviews.filter((r) => r.targetMemberId === viewingPeerReviewsFor.id) : []

  // 과제관리(시트)에 담당자로 나오지만 팀원 목록에 없는 사람들
  const unmatched = unmatchedAssigneeSummary(state.workBoard)
  function addFromWork(names: string[]) {
    const existingNames = new Set(state.members.map((m) => m.name))
    const added: TeamMember[] = unmatched
      .filter((u) => names.includes(u.name) && !existingNames.has(u.name))
      .map((u) => ({
        id: uuidv4(),
        name: u.name,
        active: true,
        level: '',
        yearsOfService: null,
        role: '',
        comment: '',
        hireDate: null,
        currentLevelSince: null,
        team: u.team ?? undefined,
      }))
    if (added.length > 0) dispatch({ type: 'IMPORT_MEMBERS', payload: [...state.members, ...added] })
    setPickedUnmatched(new Set())
  }

  function removeFromUnmatched(names: string[]) {
    if (names.length === 0) return
    dispatch({ type: 'SET_WORK_BOARD', payload: removeUnmatchedAssignees(state.workBoard, names) })
    setPickedUnmatched(new Set())
  }

  return (
    <div>
      {/* 한 줄 도구: 왼쪽 = 알림 칩(눌러서 펼침) · 오른쪽 = 표 도구와 버튼. 설명 글은 매뉴얼로 */}
      <div className="flex flex-wrap items-center gap-2">
        {moved.length > 0 && (
          <button
            onClick={() => setMovedOpen((v) => !v)}
            aria-expanded={movedOpen}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium ${movedOpen ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-amber-300/70 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
            title="관리에서 다른 팀으로 옮긴 팀원 -- 의견을 남기고 비활성"
          >
            <ArrowRightLeft {...icSm} />
            팀 이동 {moved.length}명
          </button>
        )}
        {unmatched.length > 0 && (
          <button
            onClick={() => setUnmatchedOpen((v) => !v)}
            aria-expanded={unmatchedOpen}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium ${unmatchedOpen ? 'border-black/25 bg-black/[0.05] text-label' : 'border-separator bg-white text-label-2 hover:text-label'}`}
            title="시트에서 가져온 과제의 담당자 중 팀원 목록에 없는 사람"
          >
            목록에 없는 담당자 {unmatched.length}명
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <IconButton onClick={history.undo} disabled={!history.canUndo} title="되돌리기 (⌘Z)" aria-label="되돌리기">
            <Undo2 {...ic} />
          </IconButton>
          <IconButton onClick={history.redo} disabled={!history.canRedo} title="다시 하기 (⌘⇧Z)" aria-label="다시 하기">
            <Redo2 {...ic} />
          </IconButton>
          <div className="relative">
            <IconButton
              onClick={() => setColMenuOpen((v) => !v)}
              title="표시할 열 · 근속 기준"
              aria-label="열 표시 설정"
              className={colMenuOpen ? 'bg-black/[0.05] text-label' : ''}
            >
              <Settings2 {...ic} />
            </IconButton>
            {colMenuOpen && (
              <div
                className="mac-pop absolute right-0 top-9 z-30 max-h-[70vh] w-64 overflow-y-auto py-1 text-[length:calc(14px*var(--ui-fs,1))]"
                onMouseLeave={() => setColMenuOpen(false)}
              >
                <label className="flex items-center gap-2 px-3 py-2 text-label-2">
                  창립기념일
                  <input
                    type="text"
                    placeholder="MM-DD"
                    key={foundingDay ?? ''}
                    defaultValue={foundingDay ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim().replace(/[./]/g, '-')
                      const m = v.match(/^(\d{1,2})-(\d{1,2})$/)
                      setFoundingDay(m ? `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null)
                    }}
                    className="h-7 w-20 rounded-control border border-hairline px-2 text-center text-[length:calc(14px*var(--ui-fs,1))]"
                    title="근속년월 괄호 안의 '창립기념일 기준' 년수를 세는 날짜(월-일)"
                  />
                </label>
                <div className="mac-menu-sep" />
                {orderIds.map((id) => {
                  const c = allCols.find((x) => x.id === id)!
                  return (
                    <label key={id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-black/[0.04]">
                      <input
                        type="checkbox"
                        checked={!hiddenSet.has(id)}
                        disabled={id === 'name'}
                        onChange={() => saveCfg({ hidden: hiddenSet.has(id) ? cfg.hidden.filter((x) => x !== id) : [...cfg.hidden, id] })}
                      />
                      <span className="truncate">{cfg.labels[id] ?? c.label}</span>
                      {!c.system && <span className="ml-auto text-[length:calc(12px*var(--ui-fs,1))] text-label-3">추가</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <span className="mx-1.5 h-5 w-px bg-separator" />
          {access && (
            <Button variant="primary" onClick={() => setInviteOpen(true)} title="Gmail이 있는 팀원에게 앱 초대 메일(실적관리 시트 공유는 관리자가)">
              <Send {...icSm} />
              초대 메일 보내기
            </Button>
          )}
          <Button variant="secondary" onClick={() => setHrOpen(true)} title="종합 인사기록카드 엑셀로 직급·입사일·발령일·소속 맞추기">
            <IdCard {...ic} />
            인사기록 불러오기
          </Button>
        </div>
      </div>

      {rosterCh && !hasSheetsTokenNow() && rosterCh.log.join() !== lastSent.current && (
        <p className="mt-3 flex items-center gap-2 rounded-card bg-subtle px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
          <span className="flex-1">바꾼 팀원 · Gmail을 팀원 명단(초대 · 로그인용)에 아직 저장하지 않았습니다.</span>
          <Button variant="secondary" size="sm" onClick={() => void saveRoster()} disabled={rosterBusy}>
            팀원 명단 저장
          </Button>
        </p>
      )}
      {/* 다른 팀으로 옮긴 팀원(관리 명단 기준): 의견을 남기고 비활성 -- 평가는 새 팀장이 */}
      {/* 평소엔 한 줄로 접어 두고, 눌러야 펼친다(「과제 담당자 중 …」 줄과 같은 방식) */}
      {moved.length > 0 && movedOpen && (
        <div className="relative mt-3 rounded-card border border-amber-300/60 bg-amber-50 px-4 py-3 pr-11 text-[length:calc(14px*var(--ui-fs,1))]">
          <button
            type="button"
            onClick={() => setMovedOpen(false)}
            className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-800 hover:bg-amber-200/60"
            title="닫기(위의 「팀 이동」 버튼으로 다시 열 수 있습니다)"
            aria-label="팀 이동 알림 닫기"
          >
            <X {...ic} />
          </button>
          <p className="text-amber-900">평가는 새 팀장이 합니다. 의견을 남기면 새 팀장이 참고합니다.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {moved.map(({ m, u }) => (
              <span key={m.id} className="flex items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 text-label">
                {m.name} → 「{u.team}」
                <button
                  onClick={() => {
                    setOpinion('')
                    setHandoverFor({ m, toTeam: u.team })
                  }}
                  className="rounded-full bg-amber-600 px-2.5 py-0.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-white hover:bg-amber-700"
                >
                  의견 남기고 비활성
                </button>
                <button
                  onClick={() => setDeleting([m])}
                  className="rounded-full border border-danger/40 px-2.5 py-0.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-danger hover:bg-danger/10"
                  title="이 팀원을 우리 팀에서 삭제합니다(확인 창이 뜨고, ⌘Z로 되돌릴 수 있음)"
                >
                  팀원 삭제
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      {unmatched.length > 0 && unmatchedOpen && (
        <div className="relative mt-3 rounded-card border border-dashed border-separator bg-subtle p-4">
          <button
            type="button"
            onClick={() => setUnmatchedOpen(false)}
            className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-label-3 hover:bg-black/[0.06] hover:text-label"
            title="닫기(위의 「목록에 없는 담당자」 버튼으로 다시 열 수 있습니다)"
            aria-label="목록에 없는 담당자 닫기"
          >
            <X {...ic} />
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-9">
            <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">우리 팀 사람만 골라 추가하세요 -- 과제관리 담당자와 자동으로 연결됩니다.</p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                onClick={() => removeFromUnmatched(Array.from(pickedUnmatched))}
                disabled={pickedUnmatched.size === 0}
                size="sm"
                title="팀원으로 넣지 않고 이 목록에서만 지웁니다(과제는 그대로)"
              >
                선택한 {pickedUnmatched.size}명 목록에서 지우기
              </Button>
              <Button variant="primary" onClick={() => addFromWork(Array.from(pickedUnmatched))} disabled={pickedUnmatched.size === 0} size="sm">
                선택한 {pickedUnmatched.size}명 추가
              </Button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unmatched.map((u) => {
              const on = pickedUnmatched.has(u.name)
              return (
                <span
                  key={u.name}
                  className={`inline-flex items-center rounded-full border text-xs ${on ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-separator bg-white text-label-2 hover:border-black/25'}`}
                >
                  <button
                    onClick={() => {
                      const next = new Set(pickedUnmatched)
                      if (on) next.delete(u.name)
                      else next.add(u.name)
                      setPickedUnmatched(next)
                    }}
                    className="inline-flex items-center gap-1 py-1 pl-2.5 pr-1"
                  >
                    {on && <Check {...icSm} />}
                    {u.name}{' '}
                    <span className="text-label-3">
                      {u.team ? `${u.team} · ` : ''}L3 {u.count}
                    </span>
                  </button>
                  <button
                    onClick={() => removeFromUnmatched([u.name])}
                    className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-label-3 hover:bg-black/[0.08] hover:text-label"
                    title={`${u.name} 목록에서 지우기(팀원으로 넣지 않음)`}
                    aria-label={`${u.name} 목록에서 지우기`}
                  >
                    <X {...icSm} />
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <DataGrid
          columns={columns}
          rows={state.members}
          getText={textOf}
          onInsertColumn={insertColumn}
          onDeleteColumns={deleteColumns}
          onHideColumns={(ids) => saveCfg({ hidden: Array.from(new Set([...cfg.hidden, ...ids.filter((id) => id !== 'name')])) })}
          onRenameColumn={(id, label) =>
            cfg.custom.some((c) => c.id === id)
              ? saveCfg({ custom: cfg.custom.map((c) => (c.id === id ? { ...c, label } : c)) })
              : saveCfg({ labels: { ...cfg.labels, [id]: label } })
          }
          onMoveColumns={moveColumns}
          renderCell={renderCell}
          rowClassName={(m) => (m.active ? '' : 'text-label-2')}
          onCommit={commit}
          onPaste={paste}
          onInsertRows={insertRows}
          onDeleteRows={(ids) => setDeleting(state.members.filter((m) => ids.includes(m.id)))}
          onMoveRows={moveRows}
          onResizeColumn={(id, w) => saveCfg({ widths: { ...cfg.widths, [id]: w } })}
          onUndo={history.undo}
          onRedo={history.redo}
          storageKey="members"
          addRowLabel="팀원 추가"
          emptyText="등록된 팀원이 없습니다. 아래 '팀원 추가'를 누르거나 인사기록을 불러오세요."
        />
      </div>

      {hrOpen && <HRCardImportModal members={state.members} onApply={applyHRCards} onClose={() => setHrOpen(false)} />}

      {/* 이전 팀장: 의견 남기기 */}
      {handoverFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={() => !handoverBusy && setHandoverFor(null)}>
          <div className="w-full max-w-lg rounded-[12px] bg-white p-5 shadow-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">
              {handoverFor.m.name} → 「{handoverFor.toTeam}」 · 이전 팀장 의견
            </h3>
            <p className="mt-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">새 팀장이 평가할 때 참고합니다. 팀원 본인에게는 보이지 않습니다.</p>
            <p className="mt-3 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-3">우리 팀에서 맡았던 과제(이번 평가 · 기여도)</p>
            <p className="mt-1 rounded-control bg-subtle px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">{tasksOf(handoverFor.m) || '(기여도를 입력한 과제가 없습니다)'}</p>
            <textarea
              autoFocus
              value={opinion}
              onChange={(e) => setOpinion(e.target.value)}
              rows={5}
              placeholder="성과 · 강점 · 아쉬운 점 등 새 팀장에게 전할 의견"
              className="mt-3 w-full rounded-control border border-hairline px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setHandoverFor(null)} disabled={handoverBusy}>
                취소
              </Button>
              <Button variant="primary" onClick={() => void submitHandover()} disabled={handoverBusy}>
                남기고 비활성
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 새 팀장: 이전 팀장 의견 보기 */}
      {handoverView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={() => setHandoverView(null)}>
          <div className="w-full max-w-lg rounded-[12px] bg-white p-5 shadow-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">{handoverView.name} · 이전 팀장 의견</h3>
            <p className="mt-1 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">
              「{handoverView.fromTeam}」 → 「{handoverView.toTeam}」 · {access?.users.find((u) => u.email === handoverView.by)?.name || handoverView.by} · {handoverView.at.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1.$2.$3')}
            </p>
            <p className="mt-3 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-3">이전 팀에서 맡았던 과제</p>
            <p className="mt-1 rounded-control bg-subtle px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">{handoverView.tasks || '(없음)'}</p>
            <p className="mt-3 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-3">의견</p>
            <p className="mt-1 whitespace-pre-line text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed text-label">{handoverView.opinion || '(의견 없음)'}</p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setHandoverView(null)}>
                닫기
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={deleting && deleting.length > 1 ? `팀원 ${deleting.length}명 삭제` : '팀원 삭제'}
        message={
          deleting
            ? `${deleting
                .slice(0, 8)
                .map((m) => m.name)
                .join(
                  ', ',
                )}${deleting.length > 8 ? ` 외 ${deleting.length - 8}명` : ''}\n\n기여도·피어리뷰·면담 기록도 함께 지워집니다.\n과제관리의 담당자 표시는 이름만 남습니다.\n⌘Z로 되돌릴 수 있습니다.`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => {
          setAlsoRoster(false)
          setDeleting(null)
        }}
      >
        {access && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-card bg-subtle px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
            <input type="checkbox" className="mt-0.5" checked={alsoRoster} onChange={(e) => setAlsoRoster(e.target.checked)} />
            <span>
              <b className="font-semibold text-label">팀 명단에서도 빼기</b> -- 앱 로그인 · 초대 목록에서도 빠집니다(퇴사 · 팀 이동 등). 끄면 이번 평가에서만 빠집니다.
            </span>
          </label>
        )}
      </ConfirmDialog>
      {/* 초대 창(평가 목록 · 관리 메뉴와 같은 창): 아직 초대 안 한 팀원이 받는 사람으로 들어가 있다 */}
      {inviteOpen && (
        <TeamInviteDialog
          teamName={teamName.trim()}
          preset={invitePeople.filter((u) => !u.invitedAt).map((u) => ({ email: u.email, name: u.name || undefined, sendTo: u.sendTo || undefined }))}
          onClose={() => setInviteOpen(false)}
          onSent={(sent) => toast(`${sent.length}명에게 초대 메일을 보냈습니다. 실적관리 시트 공유는 관리자가 합니다.`)}
        />
      )}

      {viewingPeerReviewsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-dialog">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">{viewingPeerReviewsFor.name}님이 받은 피어리뷰</h3>
              <IconButton onClick={() => setViewingPeerReviewsFor(null)} aria-label="닫기" className="shrink-0">
                <X {...icLg} />
              </IconButton>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
              {peerReviewsForViewing.length === 0 ? (
                <p className="rounded-control bg-black/[0.03] px-4 py-4 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-2">아직 받은 피어리뷰가 없습니다.</p>
              ) : (
                peerReviewsForViewing.map((review) => (
                  <div key={review.id} className="flex items-center justify-between gap-3 rounded-control border border-separator px-4 py-2">
                    <span className="text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label">{review.reviewerName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${GRADE_COLORS[review.grade]}`}>{review.grade}</span>
                      <Button variant="danger" onClick={() => setDeletingPeerReview(review)} size="sm">
                        삭제
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingPeerReview !== null}
        title="피어리뷰 삭제"
        message={`${deletingPeerReview?.reviewerName}님이 남긴 피어리뷰를 삭제하시겠습니까?`}
        onConfirm={handleDeletePeerReviewConfirm}
        onCancel={() => setDeletingPeerReview(null)}
      />
    </div>
  )
}

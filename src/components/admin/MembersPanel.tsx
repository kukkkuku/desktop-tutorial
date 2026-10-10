// 팀원 명단: 관리 › 팀장 · 팀원(관리자) 탭과 성과관리 › 팀원관리 › 초대 · 계정(팀장)에서 같이 쓴다. 추가 · 초대 메일 · 목록 관리.
//   팀장은 자기가 추가한 사람만 보고 관리하고, 관리자는 모두(누가 추가했는지 함께) 본다.
//   추가하면 권한 시트 「사용자」 탭에 팀원으로 바로 적힌다(역할을 바꾸는 것은 관리자의 「권한」 탭에서).
import { errText } from '../../utils/googleError'
import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { toast } from '../ui/Toast'
import { ArrowRightLeft, ChevronDown, GripVertical, FileSpreadsheet, Mail, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import Button from '../Button'
import Spinner from '../Spinner'
import ConfirmDialog from '../ConfirmDialog'
import { ic, icSm, ListChevronsDownUp, ListChevronsUpDown } from '../ui/icon'
import IconButton from '../IconButton'
import { isEmail, parseInviteText, parseInviteWorkbook, type InviteEntry } from '../../utils/adminInvite'
import { PENDING_SUFFIX, type SheetShare, isPendingEmail, pendingDuplicates, withoutPendingDuplicates, newPendingEmail, ROLE_WORD, type AccessRole, type ContactMode, contactModeOf, setAccessSetting, accessSheetUrl, taskSheetOf, updateUsers, type AccessData, type AccessUser } from '../../utils/accessSheet'
import { withGoogleAccount } from '../../utils/googleDrive'
import { ADMIN_EMAILS } from '../../utils/roles'
import { useWorkspaces, workspaceStateKey } from '../../state/WorkspaceContext'
import type { TeamMember } from '../../types'
import { renameEvalTeam } from '../../utils/teamRename'
import TeamInviteDialog from '../TeamInviteDialog'
import Segmented from '../ui/Segmented'
import Select from '../ui/Select'
import Modal from '../ui/Modal'
import AccessSheetStrip from './AccessSheetStrip'
import { loadProgress } from '../../utils/progressBoard'

const ROLES: AccessRole[] = ['admin', 'leader', 'member']

// scope(관리자 화면의 탭): all = 권한 설정(모든 사람, 역할 · 팀 필터), leaders = 관리자 · 팀장, members = 팀원. 없으면 팀장 화면(우리 팀 팀원)
export default function MembersPanel({
  data,
  me,
  isAdmin,
  onChanged,
  scope,
}: {
  data: AccessData
  me: string
  isAdmin: boolean
  onChanged: () => void
  scope?: 'leaders' | 'members' | 'all'
}) {
  const myTeam = data.users.find((u) => u.email === me)?.team ?? ''
  // 역할 설명은 처음 관리자 계정에만
  const isSuper = ADMIN_EMAILS.some((e) => e.toLowerCase() === me)
  // 팀 이름: 성과관리 › 평가 목록에서 만든 팀 이름(팀장 본인 팀). 팀장이 추가하는 팀원도 그 팀으로
  const { currentWorkspace, workspaces, renameWorkspace } = useWorkspaces()
  const evalTeam = (currentWorkspace?.teamName ?? workspaces[0]?.teamName ?? '').trim()
  const defaultTeam = evalTeam || myTeam
  // 팀장: 내가 추가한 사람 + 우리 팀(평가 목록 팀 이름 · 내 팀) 팀원 · 관리자: 모두
  const rows = useMemo(
    () =>
      isAdmin
        ? data.users
            .filter((u) => !scope || scope === 'all' || (scope === 'leaders' ? u.role !== 'member' : u.role === 'member'))
            // 권한 설정: 관리자 → 팀장 → 팀원, 같은 역할은 팀 · 이름 순
            .sort((a, b) =>
              scope === 'all'
                ? ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.team || '\uffff').localeCompare(b.team || '\uffff', 'ko') || (a.name || a.email).localeCompare(b.name || b.email, 'ko')
                : 0,
            )
        : // 팀 칸이 기준: 우리 팀(평가 목록 팀 이름 · 내 팀) 팀원. 팀이 비어 있으면 내가 추가한 사람만. 다른 팀으로 옮기면 빠진다
          data.users.filter((u) => u.email === me || (u.role === 'member' && (u.team ? u.team === evalTeam || u.team === myTeam : u.addedBy === me))),
    [data.users, isAdmin, me, evalTeam, myTeam, scope],
  )
  // 평가 목록(지금 팀) 팀원 중 관리 명단에 없는 사람 -- Gmail을 넣어 명단에 추가하게
  // 명단에서 뺀 사람은 다시 자동으로 불러오지 않는다(평가 목록 이름 기준, 이 브라우저에 기억)
  const evalWs = currentWorkspace ?? workspaces[0]
  const skipKey = evalWs ? `members-import-skip:${evalWs.id}` : ''
  const readSkip = (): string[] => {
    try {
      return skipKey ? (JSON.parse(localStorage.getItem(skipKey) ?? '[]') as string[]) : []
    } catch {
      return []
    }
  }
  const evalMissing = useMemo(() => {
    const ws = evalWs
    if (!ws) return []
    try {
      const st = JSON.parse(localStorage.getItem(workspaceStateKey(ws.id)) ?? 'null') as { members?: TeamMember[] } | null
      const have = new Set(data.users.map((u) => u.email))
      const names = new Set(data.users.map((u) => u.name.trim()).filter(Boolean))
      const skip = new Set(readSkip())
      return (st?.members ?? []).filter((m) => m.active !== false && !skip.has(m.name.trim()) && !have.has((m.email ?? '').toLowerCase()) && !names.has(m.name.trim()))
    } catch {
      return []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, workspaces, data.users])
  // 평가 목록(성과관리) 팀원을 관리 명단으로: 화면을 열면 자동으로(묻지 않음). Gmail을 모르면 이름만 -- 표에서 Gmail 입력
  function importEvalMembers() {
    const have = new Set(data.users.map((u) => u.email))
    const add = evalMissing.map<AccessUser>((m, i) => {
      const mail = (m.email ?? '').trim().toLowerCase()
      return {
        email: mail.includes('@') && !have.has(mail) ? mail : newPendingEmail(i),
        name: m.name.trim(),
        role: 'member',
        team: evalTeam,
        memo: '',
        addedBy: me,
        sendTo: '',
      }
    })
    const noMail = add.filter((u) => isPendingEmail(u.email)).length
    void run(
      () => updateUsers(data.id, (users) => [...users, ...add.filter((a) => !users.some((u) => u.email === a.email))], me, [`평가 목록에서 팀원 추가: ${add.map((u) => u.name).join(', ')}`]),
      `평가 목록 팀원 ${add.length}명을 명단에 불러왔습니다${noMail ? ` · Gmail이 없는 ${noMail}명은 표의 계정 칸에 Gmail을 넣어 주세요` : ''}.`,
    )
  }
  const [query, setQuery] = useState('')
  // 권한 설정: 역할로 골라 보기('' = 전체)
  // 권한 설정 보기: 팀별(관리자 + 팀마다 팀장 · 팀원) | 팀장만(관리자 · 팀장)
  const [view, setView] = useState<'team' | 'leaders'>('team')
  const rolePick: AccessRole | '' = scope === 'all' && view === 'leaders' ? 'leader' : ''
  const roleRows = scope === 'all' && view === 'leaders' ? rows.filter((u) => u.role !== 'member') : rows
  // 관리자 · 팀장만 보는 중(예전 「팀장」 탭과 같음): 추가 기본 역할 팀장, 「추가한 사람」 칸 없음
  const leaderView = scope === 'leaders' || (scope === 'all' && view === 'leaders')
  // 팀별로 골라 보기('' = 전체, NO_TEAM = 팀 없음)
  const NO_TEAM = '\u0000'
  const [teamPick, setTeamPick] = useState('')
  const teamList = useMemo(
    () =>
      scope === 'members' || scope === 'all'
        ? Array.from(new Set(roleRows.map((u) => u.team.trim() || NO_TEAM))).sort((a, b) => (a === NO_TEAM ? 1 : b === NO_TEAM ? -1 : a.localeCompare(b, 'ko')))
        : [],
    [roleRows, scope],
  )
  const teamOn = teamPick && teamList.includes(teamPick) ? teamPick : ''
  // 「시트 공유 대기」만 보기(초대했는데 실적관리 시트 권한을 아직 표시 안 한 사람)
  const [waitOnly, setWaitOnly] = useState(false)
  // 같은 사람이 두 줄(Gmail 없는 자리표시 줄 중복) -- 저장할 때마다 걸러지지만, 이미 생긴 것은 「정리」로
  const dups = useMemo(() => pendingDuplicates(data.users), [data.users])
  const isWaiting = (u: AccessUser) => !isPendingEmail(u.email) && u.email !== me && !u.sheetShare && !!u.invitedAt
  const shown = roleRows
    .filter((u) => !teamOn || (u.team.trim() || NO_TEAM) === teamOn)
    .filter((u) => !waitOnly || isWaiting(u))
    .filter((u) => !query.trim() || `${u.name} ${u.email} ${u.team} ${u.sendTo ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const picked = shown.filter((u) => sel.has(u.email))
  // 초대 메일 대상: Gmail을 아직 모르는 사람은 뺀다(미리보기 · 칩에 자리표시 계정이 보이지 않게)
  const targets = picked.filter((u) => !isPendingEmail(u.email))
  // 화면 · 기록에 쓸 사람 이름(이메일은 이름이 없을 때만, 자리표시 계정은 보이지 않게)
  const label = (u: AccessUser) => u.name || (isPendingEmail(u.email) ? '(이름 없음)' : u.email)
  const nameOf = (email: string) => {
    const u = data.users.find((x) => x.email === email || (x.sendTo ?? '').toLowerCase() === email.toLowerCase())
    return u ? label(u) : email
  }
  const logWho = (u: AccessUser) => (isPendingEmail(u.email) ? label(u) : u.name ? `${u.name}(${u.email})` : u.email)

  const [busy, setBusy] = useState(false)
  // 알림은 화면 아래 토스트로(ui/Toast)
  const setNote = (n: { ok: boolean; text: string } | null) => {
    if (n) toast(n.text, n.ok ? 'ok' : 'error')
  }
  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true)
    setNote(null)
    try {
      await fn()
      onChanged()
      setNote({ ok: true, text: okText })
    } catch (e) {
      setNote({ ok: false, text: errText(e, '저장하지 못했습니다.') })
    } finally {
      setBusy(false)
    }
  }
  // 평가 목록 팀원 자동 불러오기 · 내 팀 채우기 · 팀 이름 맞추기는 팀장 화면(성과관리 › 팀원관리)에서만 -- 관리자 탭에서는 하지 않음
  const autoImported = useRef(false)
  useEffect(() => {
    if (scope || autoImported.current || busy || !evalMissing.length) return
    autoImported.current = true
    importEvalMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalMissing.length, busy])


  // 팀장 · 관리자 본인 줄의 팀이 비어 있으면 평가 목록의 팀 이름을 한 번 채운다(고칠 수 있음)
  useEffect(() => {
    const mine = data.users.find((u) => u.email === me)
    if (scope || !mine || mine.team || !evalTeam || mine.role === 'member') return
    void updateUsers(data.id, (users) => users.map((x) => (x.email === me && !x.team ? { ...x, team: evalTeam } : x)), me, [`팀: ${me} → ${evalTeam}(평가 목록)`]).then(onChanged, () => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, evalTeam])

  // ---- 추가
  const [addOpen, setAddOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [team, setTeam] = useState(defaultTeam)
  const [addRole, setAddRole] = useState<AccessRole>(scope === 'leaders' ? 'leader' : 'member') // 관리자만 고름(팀장이 추가하면 늘 팀원)
  // 권한 설정에서 역할을 골라 보는 중이면 추가할 사람의 역할도 그것으로
  useEffect(() => {
    if (scope === 'all') setAddRole(rolePick || 'member')
  }, [scope, rolePick])
  const fileRef = useRef<HTMLInputElement>(null)
  // ---- 추진현황(실적관리 시트) 담당자에서 가져오기: 담당팀이 이 팀인 과제의 담당자 중 명단에 없는 사람(이름만 -- Gmail은 표에서)
  const [fromTasks, setFromTasks] = useState(false)
  const [allTeams, setAllTeams] = useState(false)
  const [taskPick, setTaskPick] = useState<Set<string>>(new Set())
  const taskPeople = useMemo(() => {
    if (!addOpen) return Object.assign([] as { name: string; n: number }[], { byTeam: false })
    const rows = loadProgress().data?.rows ?? []
    const have = new Set(data.users.map((u) => u.name.trim()).filter(Boolean))
    const count = new Map<string, number>()
    // 담당팀이 이 팀인 과제가 하나도 없으면 모든 팀으로
    const byTeam = !allTeams && !!team.trim() && rows.some((r) => (r.values.team ?? '').trim() === team.trim())
    for (const r of rows) {
      if (byTeam && (r.values.team ?? '').trim() !== team.trim()) continue
      for (const n of (r.values.assignees ?? '').split(/[/,·\n]+/).map((x) => x.trim()).filter(Boolean))
        if (!have.has(n)) count.set(n, (count.get(n) ?? 0) + 1)
    }
    return Object.assign(
      [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([name, n]) => ({ name, n })),
      { byTeam },
    )
  }, [addOpen, allTeams, team, data.users])
  function addFromTasks() {
    const names = taskPeople.filter((x) => taskPick.has(x.name)).map((x) => x.name)
    if (!names.length) return
    const add = names.map<AccessUser>((name, i) => ({ email: newPendingEmail(i), name, role: isAdmin ? addRole : 'member', team: team.trim(), memo: '', addedBy: me, sendTo: '' }))
    void run(
      async () => {
        await updateUsers(data.id, (users) => [...users, ...add], me, [`추진현황 담당자에서 팀원 추가: ${names.join(', ')}`])
        setTaskPick(new Set())
        setFromTasks(false)
        setAddOpen(false)
      },
      `${names.length}명을 추가했습니다 · 표의 계정 칸에 Gmail을 넣어 주세요.`,
    )
  }
  // names: Gmail 없이 이름만 적은 사람 -- 이름만 넣어 두고 표의 계정 칸에 Gmail을 나중에 넣는다(추진현황 담당자에서 가져올 때와 같음)
  function addEntries(entries: InviteEntry[], invalid: string[] = [], names: string[] = []) {
    const haveNames = new Set(data.users.map((u) => u.name.trim()).filter(Boolean))
    const freshNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).filter((n) => !haveNames.has(n))
    const dupNames = names.length - freshNames.length
    if (!entries.length && !names.length) return setNote({ ok: false, text: '추가할 이름이나 Gmail이 없습니다.' })
    const have = new Set(data.users.map((u) => u.email))
    const fresh = entries.filter((e) => !have.has(e.email.toLowerCase()))
    const dup = entries.length - fresh.length
    // 이미 등록됐는데 내 목록에 안 보이는 사람(다른 팀장 · 관리자가 다른 팀으로 등록): 누가 · 어느 팀인지 알려 준다
    const hiddenDup = entries
      .map((e) => data.users.find((u) => u.email === e.email.toLowerCase()))
      .filter((u): u is AccessUser => !!u && !rows.some((r) => r.email === u.email))
    const dupNote = hiddenDup.length
      ? ` ${hiddenDup.map((u) => `${label(u)}: ${u.team ? `「${u.team}」 팀` : '팀 없음'} · ${u.addedBy ? `${nameOf(u.addedBy)}님이 추가` : '처음부터 등록'}`).join(' / ')} -- 우리 팀으로 옮기려면 관리자에게 팀을 바꿔 달라고 하세요.`
      : ''
    if (!fresh.length && !freshNames.length) return setNote({ ok: false, text: `이미 등록된 사람입니다.${dupNote}` })
    void run(
      () =>
        updateUsers(
          data.id,
          (users) => [
            ...users,
            ...fresh
              .filter((e) => !users.some((u) => u.email === e.email.toLowerCase()))
              .map<AccessUser>((e) => ({ email: e.email.toLowerCase(), name: e.name ?? '', role: isAdmin ? addRole : 'member', team: team.trim(), memo: '', addedBy: me, sendTo: e.sendTo ?? '' })),
            ...freshNames.map<AccessUser>((name, i) => ({ email: newPendingEmail(i), name, role: isAdmin ? addRole : 'member', team: team.trim(), memo: '', addedBy: me, sendTo: '' })),
          ],
          me,
          [`팀원 추가: ${[...fresh.map((e) => e.name || e.email), ...freshNames].join(', ')}`],
        ).then(() => {
          setPasteText('')
          setAddOpen(false)
        }),
      `${fresh.length + freshNames.length}명을 추가했습니다${dup + dupNames ? ` · 이미 등록된 ${dup + dupNames}명은 건너뜀` : ''}${invalid.length ? ` · 형식이 틀린 ${invalid.length}개 건너뜀` : ''}. ${freshNames.length ? `이름만 넣은 ${freshNames.length}명은 표의 계정 칸에 Gmail을 넣은 뒤 ` : '이제 '}초대 메일을 보내세요.`,
    )
  }
  async function addFromExcel(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      addEntries(parseInviteWorkbook(await file.arrayBuffer()).entries)
    } catch {
      setNote({ ok: false, text: '엑셀 파일을 읽지 못했습니다.' })
    }
  }

  // ---- 받는 메일 고치기 · 빼기
  const saveSendTo = (u: AccessUser, v: string) =>
    v.trim() !== (u.sendTo ?? '') &&
    void run(() => updateUsers(data.id, (users) => users.map((x) => (x.email === u.email ? { ...x, sendTo: v.trim() } : x)), me, [`받는 메일: ${logWho(u)} → ${v.trim() || '(Gmail)'}`]), '받는 메일을 저장했습니다.')
  const saveField = (u: AccessUser, patch: Partial<AccessUser>, what: string) =>
    void run(() => updateUsers(data.id, (users) => users.map((x) => (x.email === u.email ? { ...x, ...patch } : x)), me, [what]), '저장했습니다.')
  function saveEmail(u: AccessUser, v: string) {
    const raw = v.trim().toLowerCase()
    if (!raw) return
    const mail = raw.includes('@') ? raw : `${raw}@gmail.com`
    if (!isEmail(mail) || mail.endsWith(PENDING_SUFFIX)) return setNote({ ok: false, text: `「${v}」은(는) 메일 주소가 아닙니다.` })
    if (data.users.some((x) => x.email === mail)) return setNote({ ok: false, text: `${mail}은(는) 이미 명단에 있습니다.` })
    saveField(u, { email: mail }, `Gmail: ${u.name} → ${mail}`)
  }
  const [removeAsk, setRemoveAsk] = useState<AccessUser[] | null>(null)
  const canRemove = (u: AccessUser) => u.email !== me && (isAdmin || u.addedBy === me || (u.role === 'member' && !!u.team && (u.team === evalTeam || u.team === myTeam)))

  const taskUrl = taskSheetOf(data)?.url ?? null
  const allOn = shown.length > 0 && shown.every((u) => sel.has(u.email))

  // 초대 메일: 고른 사람을 받는 사람으로 채운 초대 창(평가 목록 · 팀원관리와 같은 창)
  // 초대 메일 창: 고른 사람들(도구 줄) 또는 한 사람(표의 「초대하기」)
  const [inviteFor, setInviteFor] = useState<AccessUser[] | null>(null)
  // ---- 표 열: 끌어서 폭 조절(이 브라우저에 기억) · 받는 메일 열은 켜고 끔 · 메일 쓰는 동안은 이름 · 계정 · e-mail만
  type ColKey = 'name' | 'email' | 'sendTo' | 'team' | 'role' | 'addedBy' | 'invited' | 'share'
  const COL_LABEL: Record<ColKey, string> = { name: '이름', email: '계정(Gmail)', sendTo: 'e-mail', team: '팀', role: '역할', addedBy: '추가한 사람', invited: '초대', share: '시트 권한' }
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('members-col-w') ?? '{}')
    } catch {
      return {}
    }
  })
  const DEF_W: Record<ColKey, number> = { name: 96, email: 150, sendTo: 290, team: 130, role: 100, addedBy: 120, invited: 120, share: 120 }
  // 메일 쓰는 동안은 왼쪽이 좁아 세 열을 알맞게 줄인다(끌어 바꾼 폭은 그대로 우선)
  const colW = (k: ColKey) => widths[k] ?? DEF_W[k]
  function resizeStart(e: React.MouseEvent, k: ColKey) {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = colW(k)
    let last = w0
    const move = (ev: MouseEvent) => {
      last = Math.max(70, Math.min(480, w0 + ev.clientX - x0))
      setWidths((cur) => ({ ...cur, [k]: last }))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setWidths((cur) => {
        try {
          localStorage.setItem('members-col-w', JSON.stringify(cur))
        } catch {
          // 기억 못 해도 지금은 반영
        }
        return cur
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const [mailCol, setMailColState] = useState(() => {
    try {
      return localStorage.getItem('members-mail-col') === '1'
    } catch {
      return false
    }
  })
  const setMailCol = (v: boolean) => {
    setMailColState(v)
    try {
      localStorage.setItem('members-mail-col', v ? '1' : '0')
    } catch {
      // 기억 못 해도 지금은 반영
    }
  }
  const cols: ColKey[] = ['name', 'email', ...(mailCol ? ['sendTo'] : []), 'team', 'role', ...(isAdmin && !leaderView && scope !== 'all' ? ['addedBy'] : []), 'invited', ...(isAdmin && scope ? ['share'] : [])] as ColKey[]
  const cell = (u: AccessUser, k: ColKey) => {
    // 팀장: 보이는 우리 팀 팀원은 이름 · 팀(옮기기) · Gmail을 고칠 수 있다
    const mine = isAdmin || u.addedBy === me || (u.role === 'member' && !!u.team && (u.team === evalTeam || u.team === myTeam))
    switch (k) {
      case 'name':
        // 누가 추가했는지는 이름에 마우스를 올리면(따로 열을 두지 않음)
        return (
          <span title={u.addedBy ? `추가: ${nameOf(u.addedBy)}` : undefined} className="block">
            {mine ? <CellInput value={u.name} placeholder="—" disabled={busy} onSave={(v) => saveField(u, { name: v }, `이름: ${logWho(u)} → ${v}`)} /> : u.name || '—'}
          </span>
        )
      case 'email':
        // Gmail을 아직 모르는 사람: 여기에 넣는다(아이디만 적으면 @gmail.com)
        if (isPendingEmail(u.email))
          return mine ? <CellInput value="" placeholder="Gmail 넣기" disabled={busy} onSave={(v) => saveEmail(u, v)} /> : <span className="text-label-3">Gmail 없음</span>
        // 아이디만(@gmail.com은 머리글 「계정(Gmail)」이 말해 준다). 다른 주소면 그대로
        return <span className="block truncate text-label" title={u.email}>{u.email.replace(/@gmail\.com$/i, '')}</span>
      case 'sendTo':
        return <SendToInput u={u} disabled={busy || !mine} onSave={(v) => saveSendTo(u, v)} />
      case 'team':
        // 권한 설정: 있는 팀에서 고르기 + 새 팀(글자로 치지 않아 「우리팀」/「우리 팀」 같은 오타 팀이 생기지 않게)
        if (mine && scope === 'all')
          return (
            <TeamCell
              value={u.team}
              teams={sheetTeams}
              teamSize={(t) => data.users.filter((x) => x.team.trim() === t).length}
              disabled={busy}
              onSave={(v) => saveField(u, { team: v }, `팀: ${logWho(u)} → ${v || '(없음)'}`)}
              onRenameTeam={isAdmin ? (from, to) => renameWholeTeam(from, to) : undefined}
            />
          )
        return mine ? <CellInput value={u.team} placeholder="—" disabled={busy} onSave={(v) => saveField(u, { team: v }, `팀: ${logWho(u)} → ${v || '(없음)'}`)} /> : u.team || '—'
      case 'role':
        // 역할은 관리자만 바꾼다(자기 자신은 못 바꿈 -- 관리자가 없어지지 않게)
        return isAdmin && u.email !== me ? (
          <span className="relative block">
          <ChevronDown size={13} strokeWidth={2} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-label-3 opacity-0 group-hover/row:opacity-100" />
          <select
            value={u.role}
            disabled={busy}
            onChange={(e) => saveField(u, { role: e.target.value as AccessRole }, `역할: ${logWho(u)} ${ROLE_WORD[u.role]} → ${ROLE_WORD[e.target.value as AccessRole]}`)}
            // 평소엔 글자만, 줄에 마우스를 올리면 고르기 상자(줄마다 테두리 상자가 늘어서지 않게)
            style={{ backgroundImage: 'none' }}
            className={`-mx-1.5 h-8 w-[calc(100%+12px)] cursor-pointer appearance-none rounded-control border border-transparent bg-transparent px-1.5 text-[length:calc(14px*var(--ui-fs,1))] outline-none group-hover/row:border-hairline group-hover/row:bg-white focus:border-accent ${
              u.role === 'admin' ? 'font-semibold text-accent' : u.role === 'leader' ? 'font-semibold text-label' : 'text-label'
            }`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_WORD[r]}
              </option>
            ))}
          </select>
          </span>
        ) : (
          <span className={u.role === 'admin' ? 'font-semibold text-accent' : u.role === 'leader' ? 'font-semibold text-label' : 'text-label'}>{ROLE_WORD[u.role]}</span>
        )
      case 'addedBy':
        return (
          <span className="block truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-3" title={u.addedBy || undefined}>
            {u.addedBy ? nameOf(u.addedBy) : '-'}
          </span>
        )
      case 'share': {
        // 실적관리 시트 권한(관리자가 공유하고 표시). 초대했는데 아직 공유 안 했으면 주황 「공유 대기」
        if (isPendingEmail(u.email)) return <span className="text-label-3">—</span>
        const v = u.sheetShare ?? ''
        const wait = !v && !!u.invitedAt
        const tone = v === '편집자' ? 'text-success' : v === '뷰어' ? 'text-accent' : wait ? 'text-orange-600' : 'text-label-3'
        const dot = v === '편집자' ? 'bg-success' : v === '뷰어' ? 'bg-accent' : wait ? 'bg-orange-500' : 'bg-black/[0.15]'
        return (
          <span className="relative flex items-center">
          <span className={`pointer-events-none absolute left-0 h-1.5 w-1.5 rounded-full ${dot}`} />
          <ChevronDown size={13} strokeWidth={2} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-label-3 opacity-0 group-hover/row:opacity-100" />
          <select
            value={v}
            disabled={busy}
            onChange={(e) => saveField(u, { sheetShare: e.target.value as SheetShare }, `시트 권한: ${logWho(u)} → ${e.target.value || '공유 전'}`)}
            title="실적관리 시트를 공유한 뒤 표시합니다(구글에서 직접 읽지는 않음)"
            style={{ backgroundImage: 'none' }}
            className={`-mr-1.5 h-8 w-[calc(100%+6px)] cursor-pointer appearance-none rounded-control border border-transparent bg-transparent pl-3 pr-1.5 text-[length:calc(14px*var(--ui-fs,1))] outline-none group-hover/row:border-hairline group-hover/row:bg-white focus:border-accent ${tone} ${wait ? 'font-medium' : ''}`}
          >
            <option value="">{wait ? '공유 대기' : '공유 전'}</option>
            <option value="편집자">편집자</option>
            <option value="뷰어">뷰어</option>
          </select>
          </span>
        )
      }
      case 'invited':
        // 보낸 시각만(「보냄」 말 없이). 안 보냈으면 그 사람에게 바로 보내는 「초대하기」. 다시 보내려면 시각을 눌러도 된다
        if (u.invitedAt)
          return (
            <button
              type="button"
              disabled={busy || !mine || u.email === me}
              onClick={() => setInviteFor([u])}
              title="초대 메일을 보낸 시각 · 누르면 다시 보내기"
              className="tabular-nums text-label-2 hover:text-accent disabled:hover:text-label-2"
            >
              {u.invitedAt.replace(/^\d{4}-(\d{2})-(\d{2})/, '$1.$2')}
            </button>
          )
        if (isPendingEmail(u.email) || u.email === me) return <span className="text-label-3">—</span>
        return mine ? (
          <button type="button" disabled={busy} onClick={() => setInviteFor([u])} className="font-medium text-accent hover:underline disabled:opacity-50">
            초대하기
          </button>
        ) : (
          <span className="text-label-3">—</span>
        )
    }
  }

  // ---- 실적관리 시트 공유(관리자): 고른 사람 Gmail을 복사 → 시트를 열어 공유 → 편집자/뷰어로 표시
  const waiting = isAdmin && scope ? rows.filter((u) => !isPendingEmail(u.email) && u.email !== me && !u.sheetShare && !!u.invitedAt) : []
  const shareTargets = picked.filter((u) => !isPendingEmail(u.email))
  const [shareOpen, setShareOpen] = useState<AccessUser[] | null>(null)
  const [copied, setCopied] = useState(false)
  async function openShare() {
    const list = shareTargets
    setShareOpen(list)
    setCopied(false)
    try {
      await navigator.clipboard.writeText(list.map((u) => u.email).join(', '))
      setCopied(true)
    } catch {
      // 복사가 막히면 창의 목록에서 직접 고른다
    }
  }
  function markShared(v: SheetShare) {
    const list = shareOpen ?? []
    setShareOpen(null)
    const set = new Set(list.map((u) => u.email))
    void run(
      () => updateUsers(data.id, (users) => users.map((x) => (set.has(x.email) ? { ...x, sheetShare: v } : x)), me, [`시트 권한 ${v}: ${list.map(logWho).join(', ')}`]),
      `${list.length}명을 「${v}」로 표시했습니다.`,
    )
    setSel(new Set())
  }

  // 권한 설정: 관리자 → 팀마다(팀장 먼저) → 팀 없음 묶음. 다른 화면은 묶지 않는다
  const grouped: { key: string; title: string; sub?: string; rows: AccessUser[] }[] = (() => {
    if (scope !== 'all') return [{ key: 'all', title: '', rows: shown }]
    const byName = (a: AccessUser, b: AccessUser) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.name || a.email).localeCompare(b.name || b.email, 'ko')
    const admins = shown.filter((u) => u.role === 'admin').sort(byName)
    if (view === 'leaders') {
      // 팀장만: 관리자 · 팀장(팀 순)
      const leads = shown.filter((u) => u.role === 'leader').sort((a, b) => (a.team || '\uffff').localeCompare(b.team || '\uffff', 'ko') || byName(a, b))
      return [
        ...(admins.length ? [{ key: 'admin', title: '관리자', rows: admins }] : []),
        ...(leads.length ? [{ key: 'leader', title: '팀장', sub: `${new Set(leads.map((u) => u.team.trim()).filter(Boolean)).size}개 팀`, rows: leads }] : []),
      ]
    }
    const rest = shown.filter((u) => u.role !== 'admin')
    const teams = Array.from(new Set(rest.map((u) => u.team.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'))
    const out: { key: string; title: string; sub?: string; rows: AccessUser[] }[] = []
    if (admins.length) out.push({ key: 'admin', title: '관리자', rows: admins })
    for (const t of teams) {
      const r = rest.filter((u) => u.team.trim() === t).sort(byName)
      const leads = r.filter((u) => u.role === 'leader').map(label)
      out.push({ key: `t:${t}`, title: t, sub: leads.length ? `팀장 ${leads.join(', ')}` : '팀장 없음', rows: r })
    }
    const none = rest.filter((u) => !u.team.trim()).sort(byName)
    if (none.length) out.push({ key: 'none', title: '팀 없음', sub: '팀을 정해 주세요', rows: none })
    return out
  })()

  // 권한 시트에 있는 팀 이름 전부(팀 칸 고르기 목록)
  const sheetTeams = useMemo(() => Array.from(new Set(data.users.map((u) => u.team.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [data.users])
  // 팀 이름 바꾸기(묶음 머리): 그 팀 전원(팀장 포함)을 한 번에
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  function renameWholeTeam(from: string, to: string) {
    const n = data.users.filter((u) => u.team.trim() === from).length
    setRenaming(null)
    void run(
      () => updateUsers(data.id, (users) => users.map((u) => (u.team.trim() === from ? { ...u, team: to } : u)), me, [`팀 이름 바꿈: ${from} → ${to} (${n}명)`]),
      `「${from}」 ${n}명의 팀 이름을 「${to}」(으)로 바꿨습니다. 팀장의 평가 목록에는 다음에 열 때 「팀 이름 맞추기」 안내가 뜹니다.`,
    )
  }

  // 고른 사람 팀 옮기기(아래 검정 줄)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveDraft, setMoveDraft] = useState<string | null>(null)
  // 고른 사람이 없어지면 · 바깥을 누르면 · Esc면 닫는다
  const moveRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!picked.length) setMoveOpen(false)
  }, [picked.length])
  useEffect(() => {
    if (!moveOpen) return
    const out = (e: MouseEvent) => !moveRef.current?.contains(e.target as Node) && setMoveOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMoveOpen(false)
    window.addEventListener('mousedown', out)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', out)
      window.removeEventListener('keydown', key)
    }
  }, [moveOpen])
  function moveToTeam(to: string, who: AccessUser[] = picked) {
    const list = who.filter((u) => u.team.trim() !== to)
    setMoveOpen(false)
    setMoveDraft(null)
    if (!list.length) return
    const set = new Set(list.map((u) => u.email))
    setSel(new Set())
    void run(
      () => updateUsers(data.id, (users) => users.map((x) => (set.has(x.email) ? { ...x, team: to } : x)), me, [`팀 옮김: ${list.map(logWho).join(', ')} → ${to || '(팀 없음)'}`]),
      `${list.length}명을 ${to ? `「${to}」` : '팀 없음'}(으)로 옮겼습니다.`,
    )
  }

  // 줄 고르기(표처럼): 줄을 누르면 그 줄만, Shift = 범위, ⌘/Ctrl = 하나씩 더하기 · 빼기
  const lastPick = useRef<string | null>(null)
  function clickRow(e: React.MouseEvent, u: AccessUser, flat: AccessUser[]) {
    if ((e.target as HTMLElement).closest('input,button,select,textarea,a,[role="listbox"]')) return
    const n = new Set(sel)
    if (e.shiftKey && lastPick.current) {
      const a = flat.findIndex((x) => x.email === lastPick.current)
      const b = flat.findIndex((x) => x.email === u.email)
      if (a >= 0 && b >= 0) for (const x of flat.slice(Math.min(a, b), Math.max(a, b) + 1)) n.add(x.email)
      window.getSelection()?.removeAllRanges()
    } else if (e.metaKey || e.ctrlKey) {
      if (n.has(u.email)) n.delete(u.email)
      else n.add(u.email)
    } else {
      setSel(n.size === 1 && n.has(u.email) ? new Set() : new Set([u.email]))
      lastPick.current = u.email
      return
    }
    lastPick.current = u.email
    setSel(n)
  }
  // 끌어서 팀 옮기기: 고른 줄(손잡이 ⠿)을 다른 팀 묶음 머리에 놓는다
  const [dragIds, setDragIds] = useState<string[] | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const teamOfKey = (k: string): string | null => (k.startsWith('t:') ? k.slice(2) : k === 'none' ? '' : null)

  // 묶음 접기(권한 설정) · 묶음 전체 고르기
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const allFolded = grouped.length > 0 && grouped.every((g) => folded.has(g.key))
  const toggleFold = (k: string) =>
    setFolded((cur) => {
      const n = new Set(cur)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  // 지금 보이는 줄 순서(Shift 범위 고르기)
  const flatRows = grouped.flatMap((g) => (folded.has(g.key) ? [] : g.rows))

  const table =
    rows.length === 0 ? (
      <p className="rounded-card border border-dashed border-separator px-4 py-10 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-3">
        아직 관리 명단에 팀원이 없습니다. <b className="text-label-2">팀원 추가</b>{evalMissing.length > 0 ? ' 또는 위 「평가 목록 팀원 불러오기」' : ''}로 시작하세요.
      </p>
    ) : (
      <div className="overflow-hidden rounded-card border border-separator">
        <div className="max-h-[560px] overflow-auto">
          <table className="table-fixed text-[length:calc(14px*var(--ui-fs,1))]" style={{ width: 40 + cols.reduce((n, k) => n + colW(k), 0), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: scope === 'all' && isAdmin ? 52 : 40 }} />
              {cols.map((k) => (
                <col key={k} style={{ width: colW(k) }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-subtle text-left text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
              <tr>
                <th className={`py-2 ${scope === 'all' && isAdmin ? 'pl-7 pr-2' : 'px-3'}`}>
                  <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((u) => u.email)))} aria-label="모두 고르기" />
                </th>
                {cols.map((k) => (
                  <th key={k} className="relative truncate px-3 py-2 font-medium">
                    {k === 'email' ? (
                      <span className="flex items-center gap-1.5 pr-2">
                        <span className="truncate">{COL_LABEL[k]}</span>
                        {/* +✉ = 받는 메일 열 추가(초대 메일을 Gmail 대신 회사 메일 등으로 받을 때). 켜져 있으면 파랗게 · 다시 누르면 숨김 */}
                        <button
                          type="button"
                          onClick={() => setMailCol(!mailCol)}
                          aria-pressed={mailCol}
                          aria-label="받는 메일 열"
                          title={mailCol ? '받는 메일 열 숨기기' : '받는 메일 추가 · 초대 메일을 Gmail 대신 회사 메일 등으로 받을 때'}
                          className={`flex h-6 shrink-0 items-center gap-px rounded-[6px] px-1 ${mailCol ? 'bg-accent-soft text-accent' : 'text-label-3 hover:bg-black/[0.06] hover:text-label'}`}
                        >
                          <Plus size={11} strokeWidth={2.6} />
                          <Mail size={14} strokeWidth={1.9} />
                        </button>
                      </span>
                    ) : (
                      COL_LABEL[k]
                    )}
                    {k === 'sendTo' && <span className="font-normal text-label-3"> (받는 메일)</span>}
                    <span
                      onMouseDown={(e) => resizeStart(e, k)}
                      onDoubleClick={() => setWidths((cur) => ({ ...cur, [k]: DEF_W[k] }))}
                      title="끌어서 폭 조절 · 더블클릭 = 기본"
                      className="absolute inset-y-1 right-0 w-2 cursor-col-resize border-r-2 border-transparent hover:border-accent"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <Fragment key={g.key}>
                  {g.title &&
                    (() => {
                      const on = g.rows.filter((u) => sel.has(u.email)).length
                      const isFolded = folded.has(g.key)
                      const dropTeam = teamOfKey(g.key)
                      const isDrop = !!dragIds && dropTeam !== null && dropKey === g.key
                      return (
                        <tr
                          className={`border-t border-separator ${isDrop ? 'bg-accent-soft outline outline-2 -outline-offset-2 outline-accent' : 'bg-[#FAFAFB]'}`}
                          onDragOver={(e) => {
                            if (!dragIds || dropTeam === null) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            if (dropKey !== g.key) setDropKey(g.key)
                          }}
                          onDragLeave={(e) => {
                            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropKey((k) => (k === g.key ? null : k))
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const ids = dragIds
                            setDragIds(null)
                            setDropKey(null)
                            if (!ids || dropTeam === null) return
                            moveToTeam(dropTeam, data.users.filter((x) => ids.includes(x.email)))
                          }}
                        >
                          {/* 이 묶음(팀) 전체 고르기 */}
                          <td className={`py-2 ${scope === 'all' && isAdmin ? 'pl-7 pr-2' : 'px-3'}`}>
                            <input
                              type="checkbox"
                              checked={on > 0 && on === g.rows.length}
                              ref={(el) => {
                                if (el) el.indeterminate = on > 0 && on < g.rows.length
                              }}
                              onChange={() => {
                                const n = new Set(sel)
                                if (on === g.rows.length) g.rows.forEach((u) => n.delete(u.email))
                                else g.rows.forEach((u) => n.add(u.email))
                                setSel(n)
                              }}
                              aria-label={`${g.title} 전체 고르기`}
                              title={`${g.title} 전체 고르기`}
                            />
                          </td>
                          <td colSpan={cols.length} className="p-0">
                            {/* 묶음 머리: 빈 곳을 누르면 접기/펴기, 팀 이름 바로 옆 ✎ = 팀 이름 바꾸기 */}
                            <div
                              className="group/head flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-2 hover:bg-black/[0.03]"
                              onClick={() => toggleFold(g.key)}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleFold(g.key)
                                }}
                                aria-expanded={!isFolded}
                                title={isFolded ? '펴기' : '접기'}
                                className="flex items-center gap-1.5 text-left"
                              >
                                <ChevronDown size={14} strokeWidth={2} className={`shrink-0 text-label-3 transition-transform ${isFolded ? '-rotate-90' : ''}`} />
                                <b className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">{g.title}</b>
                              </button>
                              {isAdmin && g.key.startsWith('t:') && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRenameTo(g.title)
                                    setRenaming(g.title)
                                  }}
                                  title="팀 이름 바꾸기(이 팀 전원)"
                                  aria-label={`${g.title} 팀 이름 바꾸기`}
                                  className="flex h-6 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3 hover:bg-black/[0.06] hover:text-label group-hover/head:text-label-2"
                                >
                                  <Pencil size={12} strokeWidth={2} />
                                  <span className="hidden group-hover/head:inline">이름 바꾸기</span>
                                </button>
                              )}
                              <span>{g.rows.length}명</span>
                              {g.sub && <span className="text-label-3">· {g.sub}</span>}
                              {on > 0 && <span className="ml-1 rounded-full bg-accent-soft px-1.5 text-xs font-semibold text-accent">{on}명 고름</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })()}
              {!folded.has(g.key) && g.rows.map((u) => (
                <tr
                  key={u.email}
                  onClick={(e) => clickRow(e, u, flatRows)}
                  className={`group/row border-t border-separator ${sel.has(u.email) ? 'bg-accent-soft/50' : 'hover:bg-black/[0.015]'} ${dragIds?.includes(u.email) ? 'opacity-40' : ''}`}
                >
                  <td className={`relative py-2 ${scope === 'all' && isAdmin ? 'pl-7 pr-2' : 'px-3'}`}>
                    {/* ⠿ 손잡이: 끌어서 다른 팀 묶음 머리에 놓으면 옮긴다(고른 줄이면 고른 줄 전부) */}
                    {isAdmin && scope === 'all' && (
                      <span
                        draggable={!busy}
                        onDragStart={(e) => {
                          const ids = sel.has(u.email) ? [...sel] : [u.email]
                          if (!sel.has(u.email)) setSel(new Set([u.email]))
                          setDragIds(ids)
                          // 마우스를 따라다니는 표시: 「N명 · 팀 묶음에 놓기」
                          const ghost = document.createElement('div')
                          ghost.textContent = `${ids.length}명 옮기기 · 팀 묶음 위에 놓기`
                          ghost.style.cssText = 'position:fixed;top:-100px;left:0;padding:6px 12px;border-radius:999px;background:#18181B;color:#fff;font:600 13px Pretendard,sans-serif;white-space:nowrap'
                          document.body.appendChild(ghost)
                          e.dataTransfer.setDragImage(ghost, 12, 16)
                          window.setTimeout(() => ghost.remove(), 0)
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', ids.join(','))
                        }}
                        onDragEnd={() => {
                          setDragIds(null)
                          setDropKey(null)
                        }}
                        title="끌어서 다른 팀 묶음에 놓기"
                        className={`absolute left-1 top-1/2 flex h-7 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded-[6px] active:cursor-grabbing ${
                          sel.has(u.email) ? 'bg-accent-soft text-accent opacity-100' : 'text-label-3 opacity-0 hover:bg-black/[0.06] hover:text-label group-hover/row:opacity-100'
                        }`}
                      >
                        <GripVertical size={15} strokeWidth={2.2} />
                      </span>
                    )}
                    <input
                      type="checkbox"
                      checked={sel.has(u.email)}
                      onChange={() => {
                        const n = new Set(sel)
                        if (n.has(u.email)) n.delete(u.email)
                        else n.add(u.email)
                        setSel(n)
                      }}
                      aria-label={`${label(u)} 고르기`}
                    />
                  </td>
                  {cols.map((k) => (
                    <td key={k} className={`overflow-hidden px-3 ${k === 'name' || k === 'team' || k === 'sendTo' || k === 'role' ? 'py-1.5' : 'py-2'} ${k === 'name' ? 'font-medium text-label' : 'text-label-2'}`}>
                      {cell(u, k)}
                    </td>
                  ))}
                </tr>
              ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )

  // 초대 창 아래에 붙는 관리자 설정: 로그인 문의 받는 사람
  const contactSetting = isAdmin ? (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
      <span className="font-semibold text-label">로그인 문의 받는 사람</span>
      {(
        [
          ['leader', '초대한 팀장'],
          ['admin', '관리자'],
        ] as [ContactMode, string][]
      ).map(([k, label]) => (
        <label key={k} className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="radio"
            name="contact-mode"
            checked={contactModeOf(data) === k}
            disabled={busy}
            onChange={() => void run(() => setAccessSetting(data.id, 'contact', k, me, `로그인 문의 받는 사람: ${label}`), '문의 받는 사람을 바꿨습니다.')}
          />
          {label}
        </label>
      ))}
    </div>
  ) : null

  return (
    <div className="space-y-4">
      <p className="max-w-4xl text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
        {scope === 'all'
          ? '관리자 · 팀장 · 팀원의 역할과 팀을 정합니다. 바꾸면 바로 아래 권한 시트에 저장됩니다. 팀장을 새로 정하면 오른쪽 위 「편집자 공유」로 그 팀장에게 권한 시트를 공유해 주세요.'
          : scope === 'leaders'
          ? '관리자 · 팀장을 정합니다. 팀장을 추가하면 「권한 시트」 탭에서 그 팀장에게 권한 시트를 편집자로 공유해 주세요(팀장이 팀원을 추가 · 초대할 수 있게). 바꾸면 바로 저장됩니다.'
          : isAdmin
            ? '모든 팀의 팀원입니다. 팀 · 역할을 바로 바꿀 수 있습니다(팀장이 추가한 팀원 포함, 바꾸면 바로 저장). 팀원 추가 · 초대는 보통 팀장이 성과관리 › 팀원관리에서 합니다.'
            : '우리 팀 팀원을 추가하고 초대 메일을 보냅니다. 실적관리 시트 공유는 관리자가 합니다.'}
      </p>

      {/* 팀 이름이 평가 목록과 관리에서 다르면 어느 쪽으로 맞출지 고른다 */}
      {(() => {
        const mine = data.users.find((u) => u.email === me)
        if (scope || !mine || !mine.team || !evalTeam || mine.team === evalTeam || mine.role === 'member') return null
        const old = mine.team
        const also = data.users.filter((u) => u.email !== me && u.addedBy === me && u.team === old).length
        const evalCount = workspaces.filter((w) => w.teamName === evalTeam).length
        return (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-accent/25 bg-accent-soft px-4 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label">
            <span>
              팀 이름이 서로 다릅니다. 평가 목록 <b>「{evalTeam}」</b> · 관리 <b>「{old}」</b>. 어느 이름으로 맞출까요?
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                title={`관리에서 나${also ? `와 내가 추가한 팀원 ${also}명` : ''}의 팀을 「${evalTeam}」로 바꿉니다`}
                onClick={() =>
                  void run(
                    () =>
                      updateUsers(
                        data.id,
                        (users) => users.map((x) => (x.email === me || (x.addedBy === me && x.team === old) ? { ...x, team: evalTeam } : x)),
                        me,
                        [`팀 이름 맞춤: ${old} → ${evalTeam}(평가 목록 기준)`],
                      ),
                    `관리의 팀 이름을 「${evalTeam}」로 맞췄습니다.`,
                  )
                }
              >
                「{evalTeam}」로 맞추기
                <span className="font-normal text-label-3">평가 목록 이름</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                title={`평가 목록에서 「${evalTeam}」 팀의 평가 ${evalCount}개 이름을 「${old}」로 바꿉니다`}
                onClick={() => {
                  renameEvalTeam(workspaces, renameWorkspace, evalTeam, old)
                  // 내가 추가한 팀원 중 평가 목록 이름으로 적힌 사람도 같은 이름으로
                  const stray = data.users.some((u) => u.addedBy === me && u.team === evalTeam)
                  if (stray)
                    void run(
                      () =>
                        updateUsers(
                          data.id,
                          (users) => users.map((x) => (x.addedBy === me && x.team === evalTeam ? { ...x, team: old } : x)),
                          me,
                          [`팀 이름 맞춤: ${evalTeam} → ${old}(관리 기준)`],
                        ),
                      `평가 목록의 팀 이름을 「${old}」로 맞췄습니다.`,
                    )
                  else setNote({ ok: true, text: `평가 목록의 팀 이름을 「${old}」로 맞췄습니다.` })
                }}
              >
                「{old}」로 맞추기
                <span className="font-normal text-label-3">관리 이름</span>
              </Button>
            </span>
          </div>
        )
      })()}

      {/* 권한 시트(예전 「권한 시트」 탭): 명단이 저장되는 곳 · 열기 · 관리자 · 팀장 편집자 공유 */}
      {scope === 'all' && isAdmin && <AccessSheetStrip data={data} me={me} />}

      {/* 도구 줄 한 줄: 추가 · 역할 · 팀 · 공유 대기 · 찾기 (일괄 버튼은 사람을 고르면 아래 검정 줄에) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setAddOpen(!addOpen)} disabled={busy}>
          <Plus {...icSm} />
          {scope === 'all' ? (view === 'leaders' ? '팀장 추가' : '사람 추가') : scope === 'leaders' ? '팀장 추가' : '팀원 추가'}
        </Button>
        {scope === 'all' && (
          <Segmented
            items={[
              { key: 'team' as const, label: <span className="flex items-center gap-1">팀별 보기<span className="tabular-nums text-label-3">{rows.length}</span></span> },
              {
                key: 'leaders' as const,
                label: <span className="flex items-center gap-1">팀장만 보기<span className="tabular-nums text-label-3">{rows.filter((u) => u.role !== 'member').length}</span></span>,
              },
            ]}
            value={view}
            onChange={(k) => {
              setView(k)
              setTeamPick('')
              setSel(new Set())
            }}
          />
        )}
        {/* 묶음 모두 접기 · 펴기(펼친 게 있으면 접기, 다 접혀 있으면 펴기) */}
        {scope === 'all' && grouped.length > 1 && (
          <IconButton
            onClick={() => setFolded(allFolded ? new Set() : new Set(grouped.map((g) => g.key)))}
            title={allFolded ? '모두 펴기' : '모두 접기'}
            aria-label={allFolded ? '모두 펴기' : '모두 접기'}
          >
            {allFolded ? <ListChevronsUpDown {...ic} /> : <ListChevronsDownUp {...ic} />}
          </IconButton>
        )}
        {teamList.length > 1 && (
          <Select
            aria-label="팀"
            value={teamOn}
            onChange={(e) => {
              setTeamPick(e.target.value)
              setSel(new Set())
            }}
            className="h-8 px-2.5 text-[13.5px]"
          >
            <option value="">팀: 전체</option>
            {teamList.map((t) => (
              <option key={t} value={t}>
                {t === NO_TEAM ? '팀 없음' : t} ({roleRows.filter((u) => (u.team.trim() || NO_TEAM) === t).length})
              </option>
            ))}
          </Select>
        )}
        {waiting.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setWaitOnly(!waitOnly)
              setSel(new Set())
            }}
            aria-pressed={waitOnly}
            title="초대 메일을 받았지만 실적관리 시트 권한을 아직 표시하지 않은 사람"
            className={`flex h-8 items-center gap-2 rounded-control border px-3 text-[length:calc(13.5px*var(--ui-fs,1))] ${
              waitOnly ? 'border-orange-500 bg-orange-500 font-semibold text-white' : 'border-orange-200 bg-orange-50 font-semibold text-orange-700 hover:bg-orange-100'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${waitOnly ? 'bg-white' : 'bg-orange-500'}`} />
            시트 공유 대기 {waiting.length}명
            <span className={`border-l pl-2 font-normal ${waitOnly ? 'border-white/40' : 'border-orange-200'}`}>{waitOnly ? '모두 보기' : '대기만 보기'}</span>
          </button>
        )}
        {/* 같은 팀 · 같은 이름의 Gmail 없는 줄이 둘 이상(예전에 겹쳐 저장돼 생김) -- 한 번에 정리 */}
        {isAdmin && dups.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => updateUsers(data.id, withoutPendingDuplicates, me, [`같은 이름 중복 정리: ${Array.from(new Set(dups.map(label))).join(', ')}`]),
                `같은 이름으로 두 번 들어간 ${dups.length}줄을 정리했습니다.`,
              )
            }
            title={`Gmail 없이 이름만 같은 줄: ${Array.from(new Set(dups.map(label))).join(', ')} -- 하나만 남깁니다(Gmail 있는 줄이 있으면 그 줄)`}
            className="flex h-8 items-center gap-2 rounded-control border border-danger/25 bg-danger/[0.05] px-3 text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-danger hover:bg-danger/[0.09] disabled:opacity-50"
          >
            같은 이름 중복 {dups.length}명
            <span className="border-l border-danger/25 pl-2 font-normal">정리</span>
          </button>
        )}
        {busy && <Spinner className="h-4 w-4" />}
        <span className="relative ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="이름 · Gmail · 팀 찾기"
            className="h-8 w-56 rounded-control border border-hairline px-3 pr-8 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="찾기 지우기"
              title="찾기 지우기"
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-label-3 hover:bg-black/[0.07] hover:text-label"
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          )}
        </span>
      </div>

      {addOpen && (
        <section className="rounded-card border border-accent/30 bg-accent-soft/40 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <textarea
                autoFocus
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'hong.gildong, hong@company.com, 홍길동\nkim.cheolsu, kim@company.com, 김철수'}
                rows={4}
                className={`w-full rounded-control border border-hairline bg-white px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed outline-none focus:border-accent`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {isAdmin && (
                  <label className={`flex items-center gap-2 text-[length:calc(14px*var(--ui-fs,1))] text-label-2`}>
                    역할
                    <select
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value as AccessRole)}
                      className={`h-9 rounded-control border border-hairline bg-white px-2 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_WORD[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={`flex items-center gap-2 text-[length:calc(14px*var(--ui-fs,1))] text-label-2`}>
                  팀
                  <input
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    placeholder="팀 이름"
                    className={`h-9 w-40 rounded-control border border-hairline bg-white px-2.5 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent disabled:bg-subtle`}
                  />
                </label>
                <span className="flex-1" />
                <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <FileSpreadsheet {...icSm} />
                  엑셀로 추가
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const parsed = parseInviteText(pasteText)
                    // 메일이 없는 줄은 이름만 적은 것으로 본다(쉼표 · 탭으로 나눈 칸마다 한 사람). @가 들어 있는데 틀린 것은 형식 오류
                    const tokens = parsed.invalid.flatMap((l) => l.split(/[,;\t]+/).map((x) => x.trim()).filter(Boolean))
                    addEntries(
                      parsed.entries,
                      tokens.filter((t) => t.includes('@')),
                      tokens.filter((t) => !t.includes('@')),
                    )
                  }}
                  disabled={!pasteText.trim() || busy}
                >
                  추가
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void addFromExcel(e)} />
              </div>
              {/* 옵션: 추진현황 과제의 담당자에서 골라 가져오기 */}
              {scope !== 'leaders' && (
              <div className="mt-3 border-t border-accent/15 pt-3">
                <button
                  type="button"
                  onClick={() => setFromTasks(!fromTasks)}
                  className="flex items-center gap-1 text-[length:calc(14px*var(--ui-fs,1))] font-medium text-accent hover:underline"
                >
                  {fromTasks ? '▾' : '▸'} 추진현황 담당자에서 가져오기
                </button>
                {fromTasks && (
                  <div className="mt-2">
                    <div className="flex flex-wrap items-center gap-3 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
                      <span>
                        {taskPeople.byTeam
                          ? `담당팀 「${team.trim()}」 과제의 담당자`
                          : !allTeams && team.trim()
                            ? `담당팀이 「${team.trim()}」인 과제가 없어 모든 팀 과제의 담당자`
                            : '모든 팀 과제의 담당자'}{' '}
                        중 명단에 없는 사람 · 많이 맡은 순
                      </span>
                      <label className="flex cursor-pointer items-center gap-1">
                        <input type="checkbox" checked={allTeams} onChange={(e) => setAllTeams(e.target.checked)} />
                        모든 팀
                      </label>
                      {taskPeople.length > 0 && (
                        <button type="button" className="text-accent hover:underline" onClick={() => setTaskPick(taskPick.size === taskPeople.length ? new Set() : new Set(taskPeople.map((x) => x.name)))}>
                          {taskPick.size === taskPeople.length ? '모두 해제' : '모두 고르기'}
                        </button>
                      )}
                    </div>
                    {taskPeople.length === 0 ? (
                      <p className="mt-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">
                        가져올 사람이 없습니다. 추진현황을 한 번 불러왔는지, 담당팀 이름이 팀 칸과 같은지 확인하세요.
                      </p>
                    ) : (
                      <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                        {taskPeople.map(({ name, n }) => {
                          const on = taskPick.has(name)
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                const next = new Set(taskPick)
                                if (on) next.delete(name)
                                else next.add(name)
                                setTaskPick(next)
                              }}
                              className={`rounded-full border px-2.5 py-1 text-[length:calc(13px*var(--ui-fs,1))] ${on ? 'border-accent bg-white font-semibold text-accent' : 'border-separator bg-white text-label-2 hover:border-black/25'}`}
                            >
                              {name} <span className="font-normal text-label-3">{n}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {taskPeople.length > 0 && (
                      <Button variant="primary" size="sm" className="mt-2" onClick={addFromTasks} disabled={!taskPick.size || busy}>
                        선택한 {taskPick.size}명 추가
                      </Button>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>
            <div className={`rounded-card bg-white p-3.5 text-[length:calc(13.5px*var(--ui-fs,1))] leading-relaxed text-label-2`}>
              <p className="font-semibold text-label">한 줄에 한 명</p>
              <p className="mt-1">
                <b>로그인할 Gmail</b>(아이디만 적어도 됨) · <b>받는 메일</b>(회사 메일 등, 없으면 Gmail) · <b>이름</b>
              </p>
              <p className="mt-1.5">
                <b>이름만</b> 적어도 됩니다(예: 양기호, 오희연). 이름만 넣은 사람은 표의 계정 칸에 Gmail을 나중에 넣으세요.
              </p>
              <p className="mt-1.5 text-label-3">쉼표나 탭으로 나눕니다. 엑셀은 한 행에 한 명. 추가한 사람은 팀원으로 등록됩니다.</p>
            </div>
          </div>
        </section>
      )}


      {/* 목록 · 메일 쓰는 동안은 왼쪽 표(이름 · 계정 · e-mail) + 오른쪽 메일 쓰기 */}
      {table}

      {/* 사람을 고르면 아래에 뜨는 일괄 작업 줄(마지막 줄을 가리지 않게 표 아래 여백) */}
      {picked.length > 0 && <div className="h-10" />}
      {picked.length > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-1.5 rounded-[12px] bg-ink py-2 pl-4 pr-2 text-[length:calc(14px*var(--ui-fs,1))] text-white shadow-dialog">
          <b className="mr-2 font-semibold">{picked.length}명 선택</b>
          {/* 고른 사람을 다른 팀으로 한 번에 */}
          {isAdmin && scope === 'all' && (
            <span ref={moveRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setMoveDraft(null)
                  setMoveOpen(!moveOpen)
                }}
                disabled={busy}
                aria-expanded={moveOpen}
                className={`flex h-8 items-center gap-1.5 rounded-control px-3 hover:bg-white/20 disabled:opacity-40 ${moveOpen ? 'bg-white/25' : 'bg-white/10'}`}
              >
                <ArrowRightLeft {...icSm} />
                팀 옮기기
              </button>
              {moveOpen && (
                <div className="mac-pop absolute bottom-[calc(100%+8px)] left-0 z-30 w-[220px] py-1 text-[length:calc(14px*var(--ui-fs,1))] text-label">
                  <p className="px-3 pb-1 pt-1.5 text-xs text-label-3">{picked.length}명을 어느 팀으로?</p>
                  {moveDraft === null ? (
                    <>
                      {sheetTeams.map((t) => {
                        const already = picked.every((u) => u.team.trim() === t)
                        return (
                          <button key={t} type="button" disabled={already} onClick={() => moveToTeam(t)} className="mac-menu-item flex w-full items-center justify-between disabled:opacity-40">
                            {t}
                            <span className="text-xs text-label-3">{data.users.filter((u) => u.team.trim() === t).length}</span>
                          </button>
                        )
                      })}
                      <div className="mac-menu-sep" />
                      <button type="button" onClick={() => setMoveDraft('')} className="mac-menu-item w-full font-semibold text-accent">
                        ＋ 새 팀…
                      </button>
                      <button type="button" onClick={() => moveToTeam('')} className="mac-menu-item w-full text-label-2">
                        팀 없음
                      </button>
                    </>
                  ) : (
                    <div className="px-2 pb-2">
                      <input
                        autoFocus
                        value={moveDraft}
                        onChange={(e) => setMoveDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && moveDraft.trim()) moveToTeam(moveDraft.trim())
                          if (e.key === 'Escape') setMoveDraft(null)
                        }}
                        placeholder="새 팀 이름 · Enter"
                        className="h-8 w-full rounded-control border border-accent px-2 text-[length:calc(14px*var(--ui-fs,1))] outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </span>
          )}
          <button type="button" onClick={() => setInviteFor(targets)} disabled={!targets.length || busy} className="flex h-8 items-center gap-1.5 rounded-control bg-white/10 px-3 hover:bg-white/20 disabled:opacity-40">
            <Send {...icSm} />
            초대 메일
          </button>
          {isAdmin && scope && (
            <button type="button" onClick={() => void openShare()} disabled={!shareTargets.length || busy} title="고른 사람의 Gmail을 복사하고 실적관리 시트를 열어 공유합니다" className="flex h-8 items-center gap-1.5 rounded-control bg-white/10 px-3 hover:bg-white/20 disabled:opacity-40">
              <FileSpreadsheet {...icSm} />
              시트 공유
            </button>
          )}
          <button type="button" onClick={() => setRemoveAsk(picked.filter(canRemove))} disabled={!picked.some(canRemove) || busy} className="flex h-8 items-center gap-1.5 rounded-control bg-white/10 px-3 hover:bg-white/20 disabled:opacity-40">
            <Trash2 {...icSm} />
            목록에서 빼기
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="flex h-8 items-center gap-1 rounded-control px-2.5 text-white/60 hover:text-white">
            선택 해제
            <X size={13} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {isSuper && (
        <dl className={`grid gap-x-4 gap-y-1 rounded-card bg-subtle px-4 py-3 text-[length:calc(13px*var(--ui-fs,1))] text-label-2 sm:grid-cols-[auto_1fr]`}>
          <dt className="font-semibold text-label">관리자</dt>
          <dd>팀장이 하는 것 전부 + 관리 메뉴(팀장 지정 · 모든 팀원 · 역할 · 팀 바꾸기 · 시트 연결)</dd>
          <dt className="font-semibold text-label">팀장</dt>
          <dd>과제 입력 + 성과관리(팀원관리 › 초대 · 계정에서 우리 팀 팀원 추가 · 초대)</dd>
          <dt className="font-semibold text-label">팀원</dt>
          <dd>과제 입력만(추진현황 입력 · 저장, 진척률 보기)</dd>
          <dt className="text-label-3">기록</dt>
          <dd className="text-label-3">
            바꾼 내용은 권한 시트 「변경 기록」 탭에 남습니다.{' '}
            {accessSheetUrl() && (
              <a href={withGoogleAccount(accessSheetUrl()!)} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                원본 시트 보기 ↗
              </a>
            )}
          </dd>
        </dl>
      )}

      {renaming !== null &&
        (() => {
          const from = renaming
          const to = renameTo.trim()
          const n = data.users.filter((u) => u.team.trim() === from).length
          const lead = data.users.filter((u) => u.team.trim() === from && u.role === 'leader').map(label)
          const exists = to !== from && sheetTeams.includes(to)
          const ok = !!to && to !== from
          return (
            <Modal
              title={`「${from}」 팀 이름 바꾸기`}
              sub={`이 팀 ${n}명${lead.length ? `(팀장 ${lead.join(', ')} 포함)` : ''}의 팀이 함께 바뀝니다.`}
              onClose={() => setRenaming(null)}
              footer={
                <>
                  <Button onClick={() => setRenaming(null)}>취소</Button>
                  <Button variant="primary" disabled={!ok} onClick={() => renameWholeTeam(from, to)}>
                    {n}명 팀 이름 바꾸기
                  </Button>
                </>
              }
            >
              <input
                autoFocus
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.key === 'Enter' && ok && renameWholeTeam(from, to)}
                aria-label="새 팀 이름"
                className="h-10 w-full rounded-control border border-hairline px-3 text-[length:calc(15px*var(--ui-fs,1))] outline-none focus:border-accent"
              />
              <p className={`mt-2 rounded-control px-3 py-2 text-[length:calc(12.5px*var(--ui-fs,1))] ${exists ? 'bg-warning-soft text-warning' : 'bg-subtle text-label-2'}`}>
                {exists
                  ? `「${to}」 팀이 이미 있습니다. 바꾸면 두 팀이 하나로 합쳐집니다.`
                  : '팀장의 평가 목록 이름은 팀장이 다음에 앱을 열 때 「팀 이름 맞추기」 안내로 바꿉니다. 바꾼 내용은 권한 시트 「변경 기록」에 남습니다.'}
              </p>
            </Modal>
          )
        })()}
      {inviteFor && (
        <TeamInviteDialog
          teamName=""
          preset={inviteFor.filter((u) => !isPendingEmail(u.email)).map((u) => ({ email: u.email, name: u.name || undefined, sendTo: u.sendTo || undefined }))}
          extra={contactSetting}
          onClose={() => setInviteFor(null)}
          onSent={(sent) => {
            onChanged()
            setSel(new Set())
            setNote({
              ok: true,
              text: `${sent.length}명에게 초대 메일을 보냈습니다.${isAdmin ? ' 「실적관리 시트」 탭에서 시트 공유도 해 주세요.' : ' 실적관리 시트 공유는 관리자가 합니다.'}`,
            })
          }}
        />
      )}

      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={(e) => e.target === e.currentTarget && setShareOpen(null)}>
          <div className="w-full max-w-lg rounded-[14px] bg-white p-5 shadow-dialog">
            <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">실적관리 시트 공유 · {shareOpen.length}명</h3>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
              <li>
                {copied ? <b className="font-semibold text-success">Gmail {shareOpen.length}개를 복사했습니다.</b> : '아래 Gmail을 복사합니다.'}{' '}
                <button
                  className="text-accent hover:underline"
                  onClick={() =>
                    void navigator.clipboard.writeText(shareOpen.map((u) => u.email).join(', ')).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    )
                  }
                >
                  다시 복사
                </button>
              </li>
              <li>
                {taskUrl ? (
                  <a href={withGoogleAccount(taskUrl)} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                    실적관리 시트 열기 ↗
                  </a>
                ) : (
                  '실적관리 시트를 엽니다'
                )}{' '}
                → [공유]에 붙여넣고 권한(편집자 · 뷰어)을 골라 보냅니다. 알림 메일은 꺼도 됩니다.
              </li>
              <li>공유한 권한을 아래에서 눌러 표시합니다.</li>
            </ol>
            <p className="mt-3 max-h-28 select-all overflow-y-auto break-all rounded-control bg-subtle px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
              {shareOpen.map((u) => u.email).join(', ')}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setShareOpen(null)}>
                나중에
              </Button>
              <Button variant="secondary" onClick={() => markShared('뷰어')}>
                뷰어로 공유함
              </Button>
              <Button variant="primary" onClick={() => markShared('편집자')}>
                편집자로 공유함
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!removeAsk}
        title="목록에서 빼기"
        message={`${removeAsk?.map(label).join(', ')}\n앱 권한 목록에서 뺍니다. 시트 공유는 「실적관리 시트」 · 「권한 시트」 탭에서 시트를 열어 해제하세요.`}
        confirmLabel="빼기"
        onCancel={() => setRemoveAsk(null)}
        onConfirm={() => {
          const out = new Set((removeAsk ?? []).map((u) => u.email))
          if (skipKey)
            try {
              localStorage.setItem(skipKey, JSON.stringify(Array.from(new Set([...readSkip(), ...(removeAsk ?? []).map((u) => u.name.trim()).filter(Boolean)]))))
            } catch {
              // 기억 못 하면 다음에 다시 불러올 수 있다
            }
          setRemoveAsk(null)
          setSel(new Set())
          void run(
            () => updateUsers(data.id, (users) => users.filter((x) => !out.has(x.email)), me, [`팀원 빼기: ${(removeAsk ?? []).map(logWho).join(', ')}`]),
            `${out.size}명을 목록에서 뺐습니다.`,
          )
        }}
      />
    </div>
  )
}

// 받는 메일 칸: 아이디 + 도메인 고르기(@osstem.com · @gmail.com). 칸을 떠나거나 도메인을 고르면 저장. 비우면 로그인 Gmail로 보낸다.
// 받는 메일 도메인: 기본 @gmail.com, 회사 메일로 받을 때 @osstem.com
const MAIL_DOMAINS = ['@gmail.com', '@osstem.com']
function SendToInput({ u, disabled, onSave }: { u: AccessUser; disabled?: boolean; onSave: (v: string) => void }) {
  const cur = (u.sendTo ?? '').trim()
  // 받는 메일을 따로 안 정했으면 로그인 Gmail로 간다 -- 그 주소를 기본으로 채워 보여 주고, 고치면 그때 따로 저장한다
  const gmail = isPendingEmail(u.email) ? '' : u.email
  const shownMail = cur || gmail
  const split = (m: string): [string, string] => {
    const k = m.lastIndexOf('@')
    return k > 0 ? [m.slice(0, k), m.slice(k)] : [m, MAIL_DOMAINS[0]]
  }
  const [id, setId] = useState(split(shownMail)[0])
  const [domain, setDomain] = useState(split(shownMail)[1])
  // 다른 곳에서 바뀌면(다시 읽기 · Gmail 넣기) 따라간다
  useEffect(() => {
    const [i, d] = split(shownMail)
    setId(i)
    setDomain(d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownMail])
  // 예전에 적은 다른 도메인도 그대로 고를 수 있게
  const domains = MAIL_DOMAINS.includes(domain) ? MAIL_DOMAINS : [...MAIL_DOMAINS, domain]
  const full = (i: string, d: string) => (i.trim() ? `${i.trim().replace(/@.*$/, '')}${d}` : '')
  const save = (i: string, d: string) => {
    // 로그인 Gmail과 같거나 비우면 따로 저장하지 않는다(= 로그인 Gmail로 보냄). 비웠으면 Gmail을 다시 채워 보여 준다
    const typed = full(i, d)
    const v = typed.toLowerCase() === gmail.toLowerCase() ? '' : typed
    if (!typed && gmail) {
      const [gi, gd] = split(gmail)
      setId(gi)
      setDomain(gd)
    }
    if (v !== cur && (!v || isEmail(v))) onSave(v)
  }
  // 아이디 칸 · 도메인 고르기 칸을 나눠서(시안): [아이디] [@gmail.com ▾]
  const box = `h-8 rounded-[8px] border bg-white text-[length:calc(13.5px*var(--ui-fs,1))] outline-none focus:border-accent ${disabled ? 'border-transparent bg-transparent' : 'border-[#C6C7CC]'}`
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <input
        value={id}
        disabled={disabled}
        onChange={(e) => {
          // 전체 주소를 붙여넣으면 아이디와 도메인으로 나눈다
          const v = e.target.value
          const k = v.lastIndexOf('@')
          if (k > 0 && v.slice(k).includes('.')) {
            setId(v.slice(0, k))
            setDomain(v.slice(k))
          } else setId(v)
        }}
        onBlur={() => save(id, domain)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="아이디"
        className={`${box} min-w-0 flex-1 px-2 text-label placeholder:text-[#8D8E94] disabled:text-label-2`}
      />
      <span className="relative w-[118px] shrink-0">
        <select
          value={domain}
          disabled={disabled}
          aria-label="받는 메일 도메인"
          onChange={(e) => {
            setDomain(e.target.value)
            if (id.trim()) save(id, e.target.value)
          }}
          style={{ backgroundImage: 'none' }}
          className={`${box} w-full appearance-none !pr-6 pl-1.5 text-[#545458]`}
        >
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <ChevronDown size={13} strokeWidth={2} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#545458]" />
      </span>
    </div>
  )
}

const ROLE_ORDER: Record<AccessRole, number> = { admin: 0, leader: 1, member: 2 }

// 팀 칸: 누르면 지금 팀 이름을 바로 고치는 입력칸 + 아래 팀 목록(친 글자로 거름).
//   있는 팀 이름 = 그 팀으로 옮기기. 새 이름 = 「팀 전체 이름 바꾸기」(이 팀 N명) 또는 「이 사람만 새 팀으로」를 고른다
//   (「제품디자인팀」 → 「제품디자인」처럼 이름만 고치려고 새 팀을 따로 만들지 않게).
//   표 칸은 넘친 부분을 자르므로 목록은 화면 맨 위층(portal)에 띄운다.
function TeamCell({
  value,
  teams,
  teamSize,
  disabled,
  onSave,
  onRenameTeam,
}: {
  value: string
  teams: string[]
  teamSize: (t: string) => number
  disabled?: boolean
  onSave: (v: string) => void
  onRenameTeam?: (from: string, to: string) => void
}) {
  const cur = value.trim()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(cur)
  const [ask, setAsk] = useState<string | null>(null) // 새 이름을 쳤을 때: 팀 이름 바꾸기 / 이 사람만
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const place = () => {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) setBox({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 220) })
  }
  const start = () => {
    if (disabled) return
    setText(cur)
    setAsk(null)
    setOpen(true)
    requestAnimationFrame(() => {
      place()
      inputRef.current?.select()
    })
  }
  const close = () => {
    setOpen(false)
    setAsk(null)
    setText(cur)
  }
  const pick = (t: string) => {
    setOpen(false)
    setAsk(null)
    if (t !== cur) onSave(t)
  }
  const commit = () => {
    const v = text.trim()
    if (!v || v === cur) return close()
    if (teams.includes(v)) return pick(v)
    // 새 이름: 지금 팀이 있으면 팀 전체 이름 바꾸기인지 이 사람만인지 묻는다
    if (cur && onRenameTeam) return setAsk(v)
    pick(v)
  }
  // 바깥을 누르면 닫기(입력칸 · 목록 안은 제외)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => {
      const t = e.target as Node
      if (!inputRef.current?.contains(t) && !popRef.current?.contains(t)) close()
    }
    window.addEventListener('mousedown', out)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('mousedown', out)
      window.removeEventListener('scroll', place, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const q = text.trim()
  const list = open && q && q !== cur ? teams.filter((t) => t.includes(q)) : teams
  const quiet = `-mx-[7px] h-8 w-[calc(100%+14px)] rounded-control border px-1.5 text-[length:calc(14px*var(--ui-fs,1))] outline-none`
  if (!open)
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={start}
        title="팀 바꾸기 · 이름 고치기"
        className={`${quiet} relative flex items-center border-transparent bg-transparent text-left group-hover/row:border-hairline group-hover/row:bg-white ${cur ? 'text-label' : 'text-label-3'}`}
      >
        <span className="min-w-0 flex-1 truncate">{cur || '—'}</span>
        <ChevronDown size={13} strokeWidth={2} className="shrink-0 text-label-3 opacity-0 group-hover/row:opacity-100" />
      </button>
    )
  return (
    <>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setAsk(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') close()
        }}
        placeholder="팀 이름"
        aria-label="팀"
        className={`${quiet} border-accent bg-white`}
      />
      {box &&
        createPortal(
          <div ref={popRef} className="mac-pop fixed z-[60] py-1 text-[length:calc(14px*var(--ui-fs,1))] text-label" style={{ left: box.left, top: box.top, width: box.width }}>
            {ask !== null ? (
              <div className="px-2 py-1.5">
                <p className="px-1 pb-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
                  「{cur}」 → <b className="text-label">「{ask}」</b>
                </p>
                <button type="button" onClick={() => (setOpen(false), setAsk(null), onRenameTeam?.(cur, ask))} className="mac-menu-item w-full rounded-control font-semibold">
                  팀 전체 이름 바꾸기 <span className="font-normal text-label-3">({teamSize(cur)}명)</span>
                </button>
                <button type="button" onClick={() => pick(ask)} className="mac-menu-item w-full rounded-control">
                  이 사람만 새 팀으로
                </button>
              </div>
            ) : (
              <>
                {list.map((t) => (
                  <button key={t} type="button" onClick={() => pick(t)} className="mac-menu-item flex w-full items-center justify-between gap-2">
                    <span className={`flex items-center gap-1.5 ${t === cur ? 'font-semibold' : ''}`}>
                      <span className="w-3 text-accent">{t === cur ? '✓' : ''}</span>
                      {t}
                    </span>
                    <span className="text-xs text-label-3">{teamSize(t)}</span>
                  </button>
                ))}
                {q && !teams.includes(q) && (
                  <button type="button" onClick={commit} className="mac-menu-item w-full font-semibold text-accent">
                    「{q}」 {cur ? '(으)로 바꾸기…' : '새 팀으로'} <span className="font-normal text-label-3">Enter</span>
                  </button>
                )}
                <div className="mac-menu-sep" />
                <button type="button" onClick={() => pick('')} className="mac-menu-item w-full text-label-2">
                  팀 없음
                </button>
                <p className="px-3 pb-1 pt-1 text-[length:calc(12px*var(--ui-fs,1))] text-label-3">이름을 고쳐 Enter = 새 이름(팀 전체 바꾸기 · 이 사람만)</p>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

// 표 칸에서 바로 고치기(칸을 떠나거나 Enter면 저장)
function CellInput({ value, placeholder, disabled, onSave }: { value: string; placeholder?: string; disabled?: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  // 다른 곳에서 바뀐 값(맞추기 · 다시 읽기)을 따라간다
  useEffect(() => setV(value), [value])
  return (
    <input
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && onSave(v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      className="-mx-[7px] -my-1 h-8 w-[calc(100%+14px)] min-w-[90px] rounded-control border border-transparent bg-transparent px-1.5 text-[length:calc(14px*var(--ui-fs,1))] text-inherit outline-none hover:border-hairline focus:border-accent focus:bg-white"
    />
  )
}

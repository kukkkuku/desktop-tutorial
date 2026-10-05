// 팀원 명단: 관리 › 팀장 · 팀원(관리자) 탭과 성과관리 › 팀원관리 › 초대 · 계정(팀장)에서 같이 쓴다. 추가 · 초대 메일 · 목록 관리.
//   팀장은 자기가 추가한 사람만 보고 관리하고, 관리자는 모두(누가 추가했는지 함께) 본다.
//   추가하면 권한 시트 「사용자」 탭에 팀원으로 바로 적힌다(역할을 바꾸는 것은 관리자의 「권한」 탭에서).
import { errText } from '../../utils/googleError'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ChevronDown, FileSpreadsheet, Mail, Plus, Send, Trash2, X } from 'lucide-react'
import Button from '../Button'
import Spinner from '../Spinner'
import ConfirmDialog from '../ConfirmDialog'
import { icSm } from '../ui/icon'
import { isEmail, parseInviteText, parseInviteWorkbook, type InviteEntry } from '../../utils/adminInvite'
import { PENDING_SUFFIX, type SheetShare, isPendingEmail, newPendingEmail, ROLE_WORD, type AccessRole, type ContactMode, contactModeOf, setAccessSetting, accessSheetUrl, taskSheetOf, updateUsers, type AccessData, type AccessUser } from '../../utils/accessSheet'
import { withGoogleAccount } from '../../utils/googleDrive'
import { ADMIN_EMAILS } from '../../utils/roles'
import { useWorkspaces, workspaceStateKey } from '../../state/WorkspaceContext'
import type { TeamMember } from '../../types'
import { renameEvalTeam } from '../../utils/teamRename'
import TeamInviteDialog from '../TeamInviteDialog'
import { loadProgress } from '../../utils/progressBoard'

const ROLES: AccessRole[] = ['admin', 'leader', 'member']

// scope(관리자 화면의 탭): leaders = 관리자 · 팀장, members = 팀원. 없으면 팀장 화면(우리 팀 팀원)
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
  scope?: 'leaders' | 'members'
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
        ? data.users.filter((u) => !scope || (scope === 'leaders' ? u.role !== 'member' : u.role === 'member'))
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
  // 팀원 탭: 팀별로 골라 보기('' = 전체, NO_TEAM = 팀 없음)
  const NO_TEAM = '\u0000'
  const [teamPick, setTeamPick] = useState('')
  const teamList = useMemo(
    () =>
      scope === 'members'
        ? Array.from(new Set(rows.map((u) => u.team.trim() || NO_TEAM))).sort((a, b) => (a === NO_TEAM ? 1 : b === NO_TEAM ? -1 : a.localeCompare(b, 'ko')))
        : [],
    [rows, scope],
  )
  const teamOn = teamPick && teamList.includes(teamPick) ? teamPick : ''
  const shown = rows
    .filter((u) => !teamOn || (u.team.trim() || NO_TEAM) === teamOn)
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
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
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
  function addEntries(entries: InviteEntry[], invalid: string[] = []) {
    if (!entries.length) return setNote({ ok: false, text: '추가할 수 있는 Gmail이 없습니다.' })
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
    if (!fresh.length) return setNote({ ok: false, text: `이미 등록된 사람입니다.${dupNote}` })
    void run(
      () =>
        updateUsers(
          data.id,
          (users) => [
            ...users,
            ...fresh
              .filter((e) => !users.some((u) => u.email === e.email.toLowerCase()))
              .map<AccessUser>((e) => ({ email: e.email.toLowerCase(), name: e.name ?? '', role: isAdmin ? addRole : 'member', team: team.trim(), memo: '', addedBy: me, sendTo: e.sendTo ?? '' })),
          ],
          me,
          [`팀원 추가: ${fresh.map((e) => e.name || e.email).join(', ')}`],
        ).then(() => {
          setPasteText('')
          setAddOpen(false)
        }),
      `${fresh.length}명을 추가했습니다${dup ? ` · 이미 등록된 ${dup}명은 건너뜀` : ''}${invalid.length ? ` · 형식이 틀린 ${invalid.length}개 건너뜀` : ''}. 이제 초대 메일을 보내세요.`,
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
  const cols: ColKey[] = ['name', 'email', ...(mailCol ? ['sendTo'] : []), 'team', 'role', ...(isAdmin && scope !== 'leaders' ? ['addedBy'] : []), 'invited', ...(isAdmin && scope ? ['share'] : [])] as ColKey[]
  const cell = (u: AccessUser, k: ColKey) => {
    // 팀장: 보이는 우리 팀 팀원은 이름 · 팀(옮기기) · Gmail을 고칠 수 있다
    const mine = isAdmin || u.addedBy === me || (u.role === 'member' && !!u.team && (u.team === evalTeam || u.team === myTeam))
    switch (k) {
      case 'name':
        return mine ? <CellInput value={u.name} placeholder="이름" disabled={busy} onSave={(v) => saveField(u, { name: v }, `이름: ${logWho(u)} → ${v}`)} /> : u.name || '-'
      case 'email':
        // Gmail을 아직 모르는 사람: 여기에 넣는다(아이디만 적으면 @gmail.com)
        if (isPendingEmail(u.email))
          return mine ? <CellInput value="" placeholder="Gmail 아이디" disabled={busy} onSave={(v) => saveEmail(u, v)} /> : <span className="text-label-3">Gmail 없음</span>
        // 아이디만(@gmail.com은 머리글 「계정(Gmail)」이 말해 준다). 다른 주소면 그대로
        return <span className="block truncate text-label" title={u.email}>{u.email.replace(/@gmail\.com$/i, '')}</span>
      case 'sendTo':
        return <SendToInput u={u} disabled={busy || !mine} onSave={(v) => saveSendTo(u, v)} />
      case 'team':
        return mine ? <CellInput value={u.team} placeholder="팀" disabled={busy} onSave={(v) => saveField(u, { team: v }, `팀: ${logWho(u)} → ${v || '(없음)'}`)} /> : u.team || '-'
      case 'role':
        // 역할은 관리자만 바꾼다(자기 자신은 못 바꿈 -- 관리자가 없어지지 않게)
        return isAdmin && u.email !== me ? (
          <select
            value={u.role}
            disabled={busy}
            onChange={(e) => saveField(u, { role: e.target.value as AccessRole }, `역할: ${logWho(u)} ${ROLE_WORD[u.role]} → ${ROLE_WORD[e.target.value as AccessRole]}`)}
            className={`h-8 w-full rounded-control border bg-white px-1.5 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent ${
              u.role === 'admin' ? 'border-accent/50 text-accent' : u.role === 'leader' ? 'border-hairline font-semibold text-label' : 'border-hairline text-label-2'
            }`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_WORD[r]}
              </option>
            ))}
          </select>
        ) : (
          ROLE_WORD[u.role]
        )
      case 'addedBy':
        return (
          <span className="block truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-3" title={u.addedBy || undefined}>
            {u.addedBy ? nameOf(u.addedBy) : '-'}
          </span>
        )
      case 'share': {
        // 실적관리 시트 권한(관리자가 공유하고 표시). 초대했는데 아직 공유 안 했으면 주황 「공유 대기」
        if (isPendingEmail(u.email)) return <span className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">-</span>
        const v = u.sheetShare ?? ''
        const wait = !v && !!u.invitedAt
        return (
          <select
            value={v}
            disabled={busy}
            onChange={(e) => saveField(u, { sheetShare: e.target.value as SheetShare }, `시트 권한: ${logWho(u)} → ${e.target.value || '공유 전'}`)}
            title="실적관리 시트를 공유한 뒤 표시합니다(구글에서 직접 읽지는 않음)"
            className={`h-8 w-full rounded-control border bg-white px-1.5 text-[length:calc(13.5px*var(--ui-fs,1))] outline-none focus:border-accent ${
              v === '편집자' ? 'border-success/40 text-success' : v === '뷰어' ? 'border-accent/40 text-accent' : wait ? 'border-orange-300 text-orange-600' : 'border-hairline text-label-3'
            }`}
          >
            <option value="">{wait ? '공유 대기' : '공유 전'}</option>
            <option value="편집자">편집자</option>
            <option value="뷰어">뷰어</option>
          </select>
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
              className="text-[length:calc(13px*var(--ui-fs,1))] tabular-nums text-label-2 hover:text-accent disabled:hover:text-label-2"
            >
              {u.invitedAt.replace(/^\d{4}-(\d{2})-(\d{2})/, '$1.$2')}
            </button>
          )
        if (isPendingEmail(u.email) || u.email === me) return <span className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">-</span>
        return mine ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setInviteFor([u])} className="!h-7 !px-2.5">
            <Send {...icSm} />
            초대하기
          </Button>
        ) : (
          <span className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">-</span>
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
              <col style={{ width: 40 }} />
              {cols.map((k) => (
                <col key={k} style={{ width: colW(k) }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-subtle text-left text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
              <tr>
                <th className="px-3 py-2">
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
              {shown.map((u) => (
                <tr key={u.email} className={`border-t border-separator ${sel.has(u.email) ? 'bg-accent-soft/50' : ''}`}>
                  <td className="px-3 py-2">
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
        {scope === 'leaders'
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

      {/* 관리자: 팀장이 초대했는데 아직 실적관리 시트를 공유하지 않은 사람 */}
      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-orange-200 bg-orange-50 px-4 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label">
          <span>
            <b className="font-semibold text-orange-700">시트 공유 대기 {waiting.length}명</b>
            <span className="ml-2 text-label-2">{waiting.slice(0, 6).map(label).join(', ')}{waiting.length > 6 ? ` 외 ${waiting.length - 6}명` : ''} -- 초대 메일을 받았지만 실적관리 시트 권한이 아직 없습니다.</span>
          </span>
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setSel(new Set(waiting.map((u) => u.email)))}>
            대기 {waiting.length}명 고르기
          </Button>
        </div>
      )}
      {/* 도구 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setAddOpen(!addOpen)} disabled={busy}>
          <Plus {...icSm} />
          {scope === 'leaders' ? '팀장 추가' : '팀원 추가'}
        </Button>
        <Button variant="secondary" onClick={() => setInviteFor(targets)} disabled={!targets.some((u) => !isPendingEmail(u.email)) || busy}>
          <Send {...icSm} />
          초대 메일 보내기{targets.length ? ` (${targets.length})` : ''}
        </Button>
        <Button variant="secondary" onClick={() => setRemoveAsk(picked.filter(canRemove))} disabled={!picked.some(canRemove) || busy}>
          <Trash2 {...icSm} />
          목록에서 빼기
        </Button>
        {isAdmin && scope && (
          <Button variant="secondary" onClick={() => void openShare()} disabled={!shareTargets.length || busy} title="고른 사람의 Gmail을 복사하고 실적관리 시트를 열어 공유합니다">
            <FileSpreadsheet {...icSm} />
            시트 공유{shareTargets.length ? ` (${shareTargets.length})` : ''}
          </Button>
        )}
        {busy && <Spinner className="h-4 w-4" />}
        <span className="relative ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="이름 · Gmail · 팀 찾기"
            className="h-9 w-56 rounded-control border border-hairline px-3 pr-8 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent"
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
                    const { entries, invalid } = parseInviteText(pasteText)
                    addEntries(entries, invalid)
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
              <p className="mt-1.5 text-label-3">쉼표나 탭으로 나눕니다. 엑셀은 한 행에 한 명. 추가한 사람은 팀원으로 등록됩니다.</p>
            </div>
          </div>
        </section>
      )}

      {note && <p className={`rounded-card px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] ${note.ok ? 'bg-success/[0.08] text-success' : 'bg-danger/[0.06] text-danger'}`}>{note.text}</p>}

      {/* 목록 · 메일 쓰는 동안은 왼쪽 표(이름 · 계정 · e-mail) + 오른쪽 메일 쓰기 */}
      {/* 팀원 탭: 팀별로 보기(밑줄 탭 대신 칩 -- 팀이 많아도 한 줄에 접혀 들어간다) */}
      {teamList.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {['', ...teamList].map((t) => {
            const on = t === teamOn
            const n = t ? rows.filter((u) => (u.team.trim() || NO_TEAM) === t).length : rows.length
            return (
              <button
                key={t || 'all'}
                type="button"
                onClick={() => {
                  setTeamPick(t)
                  setSel(new Set())
                }}
                className={`flex h-7 items-center gap-1 rounded-full px-3 text-[length:calc(13px*var(--ui-fs,1))] ${on ? 'bg-ink font-semibold text-white' : 'bg-black/[0.05] text-label-2 hover:bg-black/[0.08] hover:text-label'}`}
              >
                {t === '' ? '전체' : t === NO_TEAM ? '팀 없음' : t}
                <span className={`tabular-nums ${on ? 'text-white/70' : 'text-label-3'}`}>{n}</span>
              </button>
            )
          })}
        </div>
      )}
      {table}

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

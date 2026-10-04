// 관리 › 팀원: 팀원 추가 · 초대 메일 · 시트 공유 안내 · 목록 관리.
//   팀장은 자기가 추가한 사람만 보고 관리하고, 관리자는 모두(누가 추가했는지 함께) 본다.
//   추가하면 권한 시트 「사용자」 탭에 팀원으로 바로 적힌다(역할을 바꾸는 것은 관리자의 「권한」 탭에서).
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { FileSpreadsheet, Mail, Plus, Send, Trash2, X } from 'lucide-react'
import Button from '../Button'
import Spinner from '../Spinner'
import ConfirmDialog from '../ConfirmDialog'
import { icSm } from '../ui/icon'
import {
  LOGIN_TOKEN,
  NAME_TOKEN,
  connectAdmin,
  inviteHtml,
  getAdminEmail,
  isAdminConfigured,
  isAdminConnected,
  isEmail,
  parseInviteText,
  parseInviteWorkbook,
  sendInviteEmails,
  type InviteEntry,
} from '../../utils/adminInvite'
import { PENDING_SUFFIX, isPendingEmail, newPendingEmail, ROLE_WORD, type AccessRole, type ContactMode, contactFor, contactModeOf, setAccessSetting, accessSheetUrl, appInviteUrl, taskSheetOf, updateUsers, type AccessData, type AccessUser } from '../../utils/accessSheet'
import { withGoogleAccount } from '../../utils/googleDrive'
import { ADMIN_EMAILS } from '../../utils/roles'
import { useWorkspaces, workspaceStateKey } from '../../state/WorkspaceContext'
import type { TeamMember } from '../../types'
import { renameEvalTeam } from '../../utils/teamRename'

const ROLES: AccessRole[] = ['admin', 'leader', 'member']
const DEFAULT_SUBJECT = '페이스(과제 · 성과관리) 앱 초대'
// 인사말만 고친다. 앱 버튼 · 로그인할 계정 · 처음 로그인 안내는 메일 틀(inviteHtml)이 자동으로 넣는다
const defaultBody = () => `안녕하세요, 팀 과제 · 성과관리 앱 「페이스」에 초대합니다.
아래 시작하는 방법대로 들어와 주세요.`

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function MembersPanel({ data, me, isAdmin, onChanged }: { data: AccessData; me: string; isAdmin: boolean; onChanged: () => void }) {
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
        : data.users.filter((u) => u.email === me || u.addedBy === me || (u.role === 'member' && !!u.team && (u.team === evalTeam || u.team === myTeam))),
    [data.users, isAdmin, me, evalTeam, myTeam],
  )
  // 평가 목록(지금 팀) 팀원 중 관리 명단에 없는 사람 -- Gmail을 넣어 명단에 추가하게
  const evalMissing = useMemo(() => {
    const ws = currentWorkspace ?? workspaces[0]
    if (!ws) return []
    try {
      const st = JSON.parse(localStorage.getItem(workspaceStateKey(ws.id)) ?? 'null') as { members?: TeamMember[] } | null
      const have = new Set(data.users.map((u) => u.email))
      const names = new Set(data.users.map((u) => u.name.trim()).filter(Boolean))
      return (st?.members ?? []).filter((m) => m.active !== false && !have.has((m.email ?? '').toLowerCase()) && !names.has(m.name.trim()))
    } catch {
      return []
    }
  }, [currentWorkspace, workspaces, data.users])
  const [query, setQuery] = useState('')
  const shown = rows.filter((u) => !query.trim() || `${u.name} ${u.email} ${u.team} ${u.sendTo ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const picked = shown.filter((u) => sel.has(u.email))
  const targets = picked.length ? picked : []

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
      setNote({ ok: false, text: e instanceof Error ? e.message : '저장하지 못했습니다.' })
    } finally {
      setBusy(false)
    }
  }

  // 팀장 · 관리자 본인 줄의 팀이 비어 있으면 평가 목록의 팀 이름을 한 번 채운다(고칠 수 있음)
  useEffect(() => {
    const mine = data.users.find((u) => u.email === me)
    if (!mine || mine.team || !evalTeam || mine.role === 'member') return
    void updateUsers(data.id, (users) => users.map((x) => (x.email === me && !x.team ? { ...x, team: evalTeam } : x)), me, [`팀: ${me} → ${evalTeam}(평가 목록)`]).then(onChanged, () => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, evalTeam])

  // ---- 추가
  const [addOpen, setAddOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [team, setTeam] = useState(defaultTeam)
  const [addRole, setAddRole] = useState<AccessRole>('member') // 관리자만 고름(팀장이 추가하면 늘 팀원)
  const fileRef = useRef<HTMLInputElement>(null)
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
      ? ` ${hiddenDup.map((u) => `${u.name || u.email}: ${u.team ? `「${u.team}」 팀` : '팀 없음'} · ${u.addedBy ? `${u.addedBy}가 추가` : '처음부터 등록'}`).join(' / ')} -- 우리 팀으로 옮기려면 관리자에게 팀을 바꿔 달라고 하세요.`
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
    void run(() => updateUsers(data.id, (users) => users.map((x) => (x.email === u.email ? { ...x, sendTo: v.trim() } : x)), me, [`받는 메일: ${u.email} → ${v.trim() || '(Gmail)'}`]), '받는 메일을 저장했습니다.')
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
  const canRemove = (u: AccessUser) => u.email !== me && (isAdmin || u.addedBy === me)

  // ---- 초대 메일
  const [connected, setConnected] = useState(isAdminConnected())
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(defaultBody)
  const [sending, setSending] = useState(false)
  async function send() {
    setSending(true)
    setNote(null)
    try {
      if (!connected) {
        await connectAdmin()
        setConnected(true)
      }
      const res = await sendInviteEmails(
        targets.filter((u) => !isPendingEmail(u.email)).map((u) => ({ email: u.email, sendTo: u.sendTo || undefined, name: u.name || undefined, addedAt: '', lastInvitedAt: null })),
        subject,
        body,
        appInviteUrl(undefined, taskUrl),
        (r) => {
          const u = data.users.find((x) => x.email === r.email)
          return u ? contactFor(data, u, me) : null
        },
      )
      if (res.sent.length) {
        const at = stamp()
        const sent = new Set(res.sent)
        await updateUsers(data.id, (users) => users.map((x) => (sent.has(x.email) ? { ...x, invitedAt: at } : x)), me, [`초대 메일: ${res.sent.join(', ')}`])
        onChanged()
      }
      setCompose(false)
      setSel(new Set())
      setNote(
        res.failed.length
          ? { ok: false, text: `${res.sent.length}명 보냄 · ${res.failed.length}명 실패: ${res.failed.map((f) => `${f.email}(${f.error.slice(0, 60)})`).join(', ')}` }
          : { ok: true, text: `${res.sent.length}명에게 초대 메일을 보냈습니다.${targets.some((u) => isPendingEmail(u.email)) ? ' (Gmail이 없는 사람은 뺐습니다)' : ''} 「실적관리 시트」 탭에서 시트 공유도 해 주세요.` },
      )
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : '보내지 못했습니다.' })
    } finally {
      setSending(false)
    }
  }

  const taskUrl = taskSheetOf(data)?.url ?? null
  const allOn = shown.length > 0 && shown.every((u) => sel.has(u.email))

  const [compose, setCompose] = useState(false)
  // ---- 표 열: 끌어서 폭 조절(이 브라우저에 기억) · 받는 메일 열은 켜고 끔 · 메일 쓰는 동안은 이름 · 계정 · e-mail만
  type ColKey = 'name' | 'email' | 'sendTo' | 'team' | 'role' | 'addedBy' | 'invited'
  const COL_LABEL: Record<ColKey, string> = { name: '이름', email: '계정(Gmail)', sendTo: 'e-mail', team: '팀', role: '역할', addedBy: '추가한 사람', invited: '초대' }
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('members-col-w') ?? '{}')
    } catch {
      return {}
    }
  })
  const DEF_W: Record<ColKey, number> = { name: 120, email: 250, sendTo: 270, team: 130, role: 100, addedBy: 200, invited: 120 }
  // 메일 쓰는 동안은 왼쪽이 좁아 세 열을 알맞게 줄인다(끌어 바꾼 폭은 그대로 우선)
  const colW = (k: ColKey) => widths[k] ?? (compose ? ({ name: 110, email: 210, sendTo: 260 } as Partial<Record<ColKey, number>>)[k] ?? DEF_W[k] : DEF_W[k])
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const cols: ColKey[] = compose
    ? ['name', 'email', 'sendTo']
    : (['name', 'email', ...(mailCol ? ['sendTo'] : []), 'team', 'role', ...(isAdmin ? ['addedBy'] : []), 'invited'] as ColKey[])
  const preview = targets[0]
    ? inviteHtml(
        body.split(LOGIN_TOKEN).join(targets[0].email).split(NAME_TOKEN).join(targets[0].name ?? ''),
        targets[0],
        getAdminEmail() ?? me,
        appInviteUrl(undefined, taskUrl),
        contactFor(data, targets[0], me),
      )
    : ''
  const contactLine = (() => {
    const c = targets[0] ? contactFor(data, targets[0], me) : null
    return c ? (c.name ? `${c.name}(${c.email})` : c.email) : '없음'
  })()
  const canSend = !sending && isAdminConfigured() && targets.length > 0 && !targets.some((u) => !!u.sendTo && !isEmail(u.sendTo))
  const cell = (u: AccessUser, k: ColKey) => {
    const mine = isAdmin || u.addedBy === me
    switch (k) {
      case 'name':
        return mine ? <CellInput value={u.name} placeholder="이름" disabled={busy} onSave={(v) => saveField(u, { name: v }, `이름: ${u.email} → ${v}`)} /> : u.name || '-'
      case 'email':
        // Gmail을 아직 모르는 사람: 여기에 넣는다(아이디만 적으면 @gmail.com)
        if (isPendingEmail(u.email))
          return mine ? <CellInput value="" placeholder="Gmail 입력" disabled={busy} onSave={(v) => saveEmail(u, v)} /> : <span className="text-label-3">Gmail 없음</span>
        return <span className="block truncate text-label" title={u.email}>{u.email}</span>
      case 'sendTo':
        return <SendToInput u={u} disabled={busy || !mine} onSave={(v) => saveSendTo(u, v)} />
      case 'team':
        return mine ? <CellInput value={u.team} placeholder="팀" disabled={busy} onSave={(v) => saveField(u, { team: v }, `팀: ${u.email} → ${v || '(없음)'}`)} /> : u.team || '-'
      case 'role':
        // 역할은 관리자만 바꾼다(자기 자신은 못 바꿈 -- 관리자가 없어지지 않게)
        return isAdmin && u.email !== me ? (
          <select
            value={u.role}
            disabled={busy}
            onChange={(e) => saveField(u, { role: e.target.value as AccessRole }, `역할: ${u.email} ${ROLE_WORD[u.role]} → ${ROLE_WORD[e.target.value as AccessRole]}`)}
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
        return <span className="block truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-3">{u.addedBy || '-'}</span>
      case 'invited':
        return u.invitedAt ? <span className="text-[length:calc(13px*var(--ui-fs,1))] text-success">{u.invitedAt.slice(5)} 보냄</span> : <span className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">안 보냄</span>
    }
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
                    {k === 'email' && !compose ? (
                      <span className="flex items-center gap-2 pr-2">
                        <span className="truncate">{COL_LABEL[k]}</span>
                        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 font-normal text-label-3 hover:text-label-2" title="초대 메일을 Gmail 대신 회사 메일 등으로 받을 때">
                          <input type="checkbox" checked={mailCol} onChange={(e) => setMailCol(e.target.checked)} />
                          받는 메일 열
                        </label>
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
                      aria-label={`${u.name || u.email} 고르기`}
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

  // 오른쪽 메일 쓰기(손그림 시안): 받는 사람 칩(✕로 빼기) · 제목 · 인사말 · 문의 받는 사람 · 미리보기 · 보내기 · 취소
  const composer = (
    <section className="flex min-h-[560px] flex-col rounded-card border border-accent/30 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Mail size={18} strokeWidth={1.8} className="text-accent" />
        <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">초대 메일 쓰기</h3>
        <button onClick={() => setCompose(false)} className="ml-auto flex items-center gap-1 rounded-control px-2 py-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2 hover:bg-black/[0.05]">
          <X size={15} />
          취소
        </button>
      </div>
      <label className="mt-4 block text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2">받는 사람 {targets.length}명</label>
      <div className="mt-1 flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-control border border-hairline px-2 py-1.5">
        {targets.length === 0 && <span className="px-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-3">왼쪽 표에서 받을 사람을 고르세요</span>}
        {targets.map((u) => (
          <span key={u.email} className="flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-accent" title={u.sendTo || u.email}>
            {u.name || u.email}
            <button
              onClick={() => {
                const n = new Set(sel)
                n.delete(u.email)
                setSel(n)
              }}
              aria-label={`${u.name || u.email} 빼기`}
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent/15"
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          </span>
        ))}
      </div>
      <label className="mt-3 block text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2">제목</label>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-10 w-full rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent" />
      <label className="mt-3 block text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2">인사말</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="mt-1 min-h-[180px] w-full flex-1 rounded-control border border-hairline px-3 py-2.5 text-[length:calc(14.5px*var(--ui-fs,1))] leading-relaxed outline-none focus:border-accent"
      />
      <p className="mt-1.5 text-[length:calc(13px*var(--ui-fs,1))] leading-relaxed text-label-3">
        인사말 아래에 <b className="text-label-2">시작하는 방법 1 · 2 · 3</b>, <b className="text-label-2">시작하기 버튼</b>, <b className="text-label-2">문의하기 버튼</b>이 자동으로 들어갑니다.{' '}
        <code>{NAME_TOKEN}</code>은 사람마다 이름으로 바뀝니다.
      </p>
      <div className="mt-3 rounded-card bg-subtle px-3.5 py-2.5 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
        <span className="font-semibold text-label">문의 받는 사람</span>
        {isAdmin ? (
          <span className="ml-3 inline-flex flex-wrap gap-4">
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
          </span>
        ) : null}
        <span className="ml-2 text-label-3">→ {contactLine}</span>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-[length:calc(13px*var(--ui-fs,1))] text-label-3">보내는 계정: {connected ? getAdminEmail() : '보낼 때 Google 계정 연결'}</span>
        <Button variant="secondary" onClick={() => setPreviewOpen(true)} disabled={!targets.length}>
          미리보기
        </Button>
        <Button variant="primary" onClick={() => void send()} disabled={!canSend}>
          {sending ? <Spinner className="h-4 w-4 text-white" /> : <Send size={15} strokeWidth={1.9} />}
          {connected ? `${targets.length}명에게 보내기` : 'Google 연결하고 보내기'}
        </Button>
      </div>
    </section>
  )

  return (
    <div className={`space-y-4 ${compose ? 'max-w-none' : 'max-w-6xl'}`}>
      <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
        {isAdmin ? '모든 사람을 보고 역할 · 팀을 바로 바꿉니다(팀장이 추가한 팀원 포함, 바꾸면 바로 저장).' : '내가 추가한 팀원과 우리 팀 팀원을 보고 관리합니다.'} 추가하면 바로 등록되고, 초대 메일을 보낸 뒤 「실적관리 시트」 탭에서 시트를 공유하면 끝납니다.
      </p>

      {/* 팀 이름이 평가 목록과 관리에서 다르면 어느 쪽으로 맞출지 고른다 */}
      {(() => {
        const mine = data.users.find((u) => u.email === me)
        if (!mine || !mine.team || !evalTeam || mine.team === evalTeam || mine.role === 'member') return null
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

      {/* 평가 목록 팀원 중 명단에 없는 사람: Gmail을 넣어 한 번에 추가 */}
      {evalMissing.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-accent/25 bg-accent-soft px-4 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label">
          <span>
            평가 목록 <b>「{evalTeam}」</b> 팀원 {evalMissing.length}명이 관리 명단에 없습니다
            <span className="text-label-2"> ({evalMissing.slice(0, 6).map((m) => m.name).join(', ')}{evalMissing.length > 6 ? ' …' : ''})</span>
          </span>
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={() => {
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
                `${add.length}명을 추가했습니다${noMail ? ` · Gmail이 없는 ${noMail}명은 표의 계정 칸에 Gmail을 넣어 주세요` : ''}.`,
              )
            }}
          >
            평가 목록 팀원 불러오기
          </Button>
        </div>
      )}

      {/* 도구 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setAddOpen(!addOpen)} disabled={busy}>
          <Plus {...icSm} />
          팀원 추가
        </Button>
        <Button variant="secondary" onClick={() => setCompose(true)} disabled={!targets.length || busy || compose}>
          <Send {...icSm} />
          초대 메일 보내기{targets.length ? ` (${targets.length})` : ''}
        </Button>
        <Button variant="secondary" onClick={() => setRemoveAsk(targets.filter(canRemove))} disabled={!targets.some(canRemove) || busy}>
          <Trash2 {...icSm} />
          목록에서 빼기
        </Button>
        {busy && <Spinner className="h-4 w-4" />}
        <span className="ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · Gmail · 팀 찾기"
            className="h-9 w-56 rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent"
          />
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
      {compose ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
          {table}
          {composer}
        </div>
      ) : (
        table
      )}

      {isSuper && !compose && (
        <dl className={`grid gap-x-4 gap-y-1 rounded-card bg-subtle px-4 py-3 text-[length:calc(13px*var(--ui-fs,1))] text-label-2 sm:grid-cols-[auto_1fr]`}>
          <dt className="font-semibold text-label">관리자</dt>
          <dd>팀장이 하는 것 전부 + 모든 사람 보기 · 역할 · 팀 바꾸기 · 과제 시트 연결</dd>
          <dt className="font-semibold text-label">팀장</dt>
          <dd>과제 입력 + 성과관리 + 관리 › 팀원(내가 추가한 팀원만 초대 · 관리)</dd>
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

      {/* 미리보기 팝업: 닫기 · 보내기 */}
      {previewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setPreviewOpen(false)}>
          <div className="flex max-h-[94vh] w-full max-w-[640px] flex-col rounded-panel bg-white p-4 shadow-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 pb-2">
              <h3 className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">미리보기 · {targets[0]?.name || targets[0]?.email}</h3>
              {targets.length > 1 && <span className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">외 {targets.length - 1}명(이름 · 계정만 사람마다 바뀜)</span>}
            </div>
            <iframe title="초대 메일 미리보기" className="h-[70vh] w-full rounded-card border border-separator bg-[#F3F4F6]" srcDoc={preview} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
                닫기
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setPreviewOpen(false)
                  void send()
                }}
                disabled={!canSend}
              >
                <Send size={15} strokeWidth={1.9} />
                보내기
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removeAsk}
        title="목록에서 빼기"
        message={`${removeAsk?.map((u) => u.name || u.email).join(', ')}\n앱 권한 목록에서 뺍니다. 시트 공유는 「실적관리 시트」 · 「권한 시트」 탭에서 시트를 열어 해제하세요.`}
        confirmLabel="빼기"
        onCancel={() => setRemoveAsk(null)}
        onConfirm={() => {
          const out = new Set((removeAsk ?? []).map((u) => u.email))
          setRemoveAsk(null)
          setSel(new Set())
          void run(
            () => updateUsers(data.id, (users) => users.filter((x) => !out.has(x.email)), me, [`팀원 빼기: ${[...out].join(', ')}`]),
            `${out.size}명을 목록에서 뺐습니다.`,
          )
        }}
      />
    </div>
  )
}

// 받는 메일 칸: 아이디 + 도메인 고르기(@osstem.com · @gmail.com). 칸을 떠나거나 도메인을 고르면 저장. 비우면 로그인 Gmail로 보낸다.
const MAIL_DOMAINS = ['@osstem.com', '@gmail.com']
function SendToInput({ u, disabled, onSave }: { u: AccessUser; disabled?: boolean; onSave: (v: string) => void }) {
  const cur = (u.sendTo ?? '').trim()
  const at = cur.lastIndexOf('@')
  const [id, setId] = useState(at > 0 ? cur.slice(0, at) : cur)
  const [domain, setDomain] = useState(at > 0 ? cur.slice(at) : MAIL_DOMAINS[0])
  // 예전에 적은 다른 도메인도 그대로 고를 수 있게
  const domains = MAIL_DOMAINS.includes(domain) ? MAIL_DOMAINS : [...MAIL_DOMAINS, domain]
  const full = (i: string, d: string) => (i.trim() ? `${i.trim().replace(/@.*$/, '')}${d}` : '')
  const save = (i: string, d: string) => {
    const v = full(i, d)
    if (v !== cur && (!v || isEmail(v))) onSave(v)
  }
  return (
    <div className={`flex h-8 w-full min-w-0 items-center overflow-hidden rounded-control border bg-white focus-within:border-accent ${disabled ? 'border-transparent bg-transparent' : 'border-hairline'}`}>
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
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none disabled:text-label-2"
      />
      <select
        value={domain}
        disabled={disabled}
        onChange={(e) => {
          setDomain(e.target.value)
          if (id.trim()) save(id, e.target.value)
        }}
        className="h-full shrink-0 border-l border-hairline bg-subtle px-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2 outline-none"
      >
        {domains.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
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
      className="h-8 w-full min-w-[90px] rounded-control border border-transparent bg-transparent px-1.5 text-[length:calc(14px*var(--ui-fs,1))] text-inherit outline-none hover:border-hairline focus:border-accent focus:bg-white"
    />
  )
}

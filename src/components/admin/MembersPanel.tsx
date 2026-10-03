// 관리 › 팀원: 팀원 추가 · 초대 메일 · 시트 공유 안내 · 목록 관리.
//   팀장은 자기가 추가한 사람만 보고 관리하고, 관리자는 모두(누가 추가했는지 함께) 본다.
//   추가하면 권한 시트 「사용자」 탭에 팀원으로 바로 적힌다(역할을 바꾸는 것은 관리자의 「권한」 탭에서).
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Copy, FileSpreadsheet, Mail, Plus, Send, Trash2, X } from 'lucide-react'
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
import { ROLE_WORD, type AccessRole, type ContactMode, contactFor, contactModeOf, setAccessSetting, accessSheetUrl, appInviteUrl, taskSheetOf, updateUsers, type AccessData, type AccessUser } from '../../utils/accessSheet'
import { withGoogleAccount } from '../../utils/googleDrive'

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
  // 팀장: 내가 추가한 사람만 · 관리자: 모두
  const rows = useMemo(() => (isAdmin ? data.users : data.users.filter((u) => u.addedBy === me)), [data.users, isAdmin, me])
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

  // ---- 추가
  const [addOpen, setAddOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [team, setTeam] = useState(myTeam)
  const [addRole, setAddRole] = useState<AccessRole>('member') // 관리자만 고름(팀장이 추가하면 늘 팀원)
  const fileRef = useRef<HTMLInputElement>(null)
  function addEntries(entries: InviteEntry[], invalid: string[] = []) {
    if (!entries.length) return setNote({ ok: false, text: '추가할 수 있는 Gmail이 없습니다.' })
    const have = new Set(data.users.map((u) => u.email))
    const fresh = entries.filter((e) => !have.has(e.email.toLowerCase()))
    const dup = entries.length - fresh.length
    if (!fresh.length) return setNote({ ok: false, text: '모두 이미 등록된 사람입니다.' })
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
  const [removeAsk, setRemoveAsk] = useState<AccessUser[] | null>(null)
  const canRemove = (u: AccessUser) => u.email !== me && (isAdmin || u.addedBy === me)

  // ---- 초대 메일
  const [sendOpen, setSendOpen] = useState(false)
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
        targets.map((u) => ({ email: u.email, sendTo: u.sendTo || undefined, name: u.name || undefined, addedAt: '', lastInvitedAt: null })),
        subject,
        body,
        appInviteUrl(),
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
      setSendOpen(false)
      setSel(new Set())
      setNote(
        res.failed.length
          ? { ok: false, text: `${res.sent.length}명 보냄 · ${res.failed.length}명 실패: ${res.failed.map((f) => `${f.email}(${f.error.slice(0, 60)})`).join(', ')}` }
          : { ok: true, text: `${res.sent.length}명에게 초대 메일을 보냈습니다. 시트 공유도 잊지 마세요.` },
      )
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : '보내지 못했습니다.' })
    } finally {
      setSending(false)
    }
  }

  // ---- 시트 공유 안내
  const [copied, setCopied] = useState(false)
  async function copyGmails() {
    try {
      await navigator.clipboard.writeText((targets.length ? targets : shown).map((u) => u.email).join(', '))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 복사가 막히면 표에서 직접 고른다
    }
  }
  const taskUrl = taskSheetOf(data)?.url ?? null
  const allOn = shown.length > 0 && shown.every((u) => sel.has(u.email))

  return (
    <div className="max-w-6xl space-y-4">
      <p className={`text-[length:calc(14px*var(--ui-fs,1))] text-label-2`}>
        {isAdmin ? '모든 사람을 보고 역할 · 팀을 바로 바꿉니다(팀장이 추가한 팀원 포함, 바꾸면 바로 저장).' : '내가 추가한 팀원만 보고 관리합니다.'} 추가하면 바로 등록되고, 초대 메일과 시트 공유로 마무리합니다.
      </p>

      {/* 도구 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setAddOpen(!addOpen)} disabled={busy}>
          <Plus {...icSm} />
          팀원 추가
        </Button>
        <Button variant="secondary" onClick={() => setSendOpen(true)} disabled={!targets.length || busy}>
          <Send {...icSm} />
          초대 메일 보내기{targets.length ? ` (${targets.length})` : ''}
        </Button>
        <Button variant="secondary" onClick={() => setRemoveAsk(targets.filter(canRemove))} disabled={!targets.some(canRemove) || busy}>
          <Trash2 {...icSm} />
          목록에서 빼기
        </Button>
        {busy && <Spinner className="h-4 w-4" />}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 · Gmail · 팀 찾기"
          className={`ml-auto h-9 w-56 rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent`}
        />
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
                    disabled={!isAdmin && !!myTeam}
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

      {/* 목록 */}
      {rows.length === 0 ? (
        <p className={`rounded-card border border-dashed border-separator px-4 py-10 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-3`}>
          아직 추가한 팀원이 없습니다. <b className="text-label-2">팀원 추가</b>로 시작하세요.
        </p>
      ) : (
        <div className="overflow-hidden rounded-card border border-separator">
          <div className="max-h-[520px] overflow-auto">
            <table className={`w-full text-[length:calc(14px*var(--ui-fs,1))]`}>
              <thead className={`sticky top-0 z-10 bg-subtle text-left text-[length:calc(13px*var(--ui-fs,1))] text-label-2`}>
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={() => setSel(allOn ? new Set() : new Set(shown.map((u) => u.email)))}
                      aria-label="모두 고르기"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">로그인 Gmail</th>
                  <th className="px-3 py-2 font-medium">
                    받는 메일 <span className="font-normal text-label-3">(비우면 Gmail로)</span>
                  </th>
                  <th className="px-3 py-2 font-medium">팀</th>
                  <th className="px-3 py-2 font-medium">역할</th>
                  {isAdmin && <th className="px-3 py-2 font-medium">추가한 사람</th>}
                  <th className="px-3 py-2 font-medium">초대</th>
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
                    <td className="px-3 py-1.5 font-medium text-label">
                      {isAdmin || u.addedBy === me ? (
                        <CellInput value={u.name} placeholder="이름" disabled={busy} onSave={(v) => saveField(u, { name: v }, `이름: ${u.email} → ${v}`)} />
                      ) : (
                        u.name || <span className="text-label-3">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-label">{u.email}</td>
                    <td className="px-3 py-1.5">
                      <SendToInput u={u} disabled={busy || !(isAdmin || u.addedBy === me)} onSave={(v) => saveSendTo(u, v)} />
                    </td>
                    <td className="px-3 py-1.5 text-label-2">
                      {isAdmin ? (
                        <CellInput value={u.team} placeholder="팀" disabled={busy} onSave={(v) => saveField(u, { team: v }, `팀: ${u.email} → ${v || '(없음)'}`)} />
                      ) : (
                        u.team || '-'
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-label-2">
                      {/* 역할은 관리자만 바꾼다(자기 자신은 못 바꿈 -- 관리자가 없어지지 않게) */}
                      {isAdmin && u.email !== me ? (
                        <select
                          value={u.role}
                          disabled={busy}
                          onChange={(e) => saveField(u, { role: e.target.value as AccessRole }, `역할: ${u.email} ${ROLE_WORD[u.role]} → ${ROLE_WORD[e.target.value as AccessRole]}`)}
                          className={`h-8 rounded-control border bg-white px-1.5 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent ${
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
                      )}
                    </td>
                    {isAdmin && <td className={`px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-3`}>{u.addedBy || '-'}</td>}
                    <td className={`whitespace-nowrap px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))]`}>
                      {u.invitedAt ? <span className="text-success">{u.invitedAt.slice(5)} 보냄</span> : <span className="text-label-3">안 보냄</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdmin && (
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

      {/* 시트 공유: 초대받은 Gmail이 권한 시트(역할)를 읽고 과제 시트에 저장하려면 두 시트를 그 Gmail에 공유해야 한다 */}
      <section className="rounded-card border border-separator p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label`}>시트 공유</h3>
          <span className={`text-[length:calc(13.5px*var(--ui-fs,1))] text-label-3`}>초대한 사람의 Gmail에 두 시트를 공유해야 앱이 동작합니다.</span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => void copyGmails()} disabled={!shown.length}>
            <Copy {...icSm} />
            {copied ? '복사함' : `Gmail ${targets.length || shown.length}개 복사`}
          </Button>
        </div>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            { url: accessSheetUrl(), name: '권한 시트', role: '뷰어', why: '로그인할 때 역할을 읽는 데 필요' },
            { url: taskUrl, name: '과제(추진현황) 시트', role: '편집자', why: '추진현황을 보고 저장하는 데 필요' },
          ].map((x) => (
            <li key={x.name} className="flex items-center gap-3 rounded-card bg-subtle px-4 py-3">
              <FileSpreadsheet size={18} strokeWidth={1.8} className="shrink-0 text-emerald-700" />
              <div className="min-w-0 flex-1">
                <p className={`text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label`}>
                  {x.name} → <span className="text-accent">{x.role}</span>
                </p>
                <p className={`text-[length:calc(13px*var(--ui-fs,1))] text-label-3`}>{x.why}</p>
              </div>
              {x.url ? (
                <a
                  href={withGoogleAccount(x.url)}
                  target="_blank"
                  rel="noreferrer"
                  className={`shrink-0 rounded-control border border-hairline bg-white px-3 py-1.5 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium text-label hover:bg-black/[0.03]`}
                >
                  열어서 공유 ↗
                </a>
              ) : (
                <span className={`shrink-0 text-[length:calc(13px*var(--ui-fs,1))] text-label-3`}>관리자가 아직 안 정함</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 초대 메일 창 */}
      {sendOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 p-4" onMouseDown={() => !sending && setSendOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-panel bg-white p-5 shadow-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Mail size={18} strokeWidth={1.8} className="text-accent" />
              <h3 className={`text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label`}>초대 메일 보내기 · {targets.length}명</h3>
              <button onClick={() => setSendOpen(false)} className="ml-auto rounded-full p-1.5 text-label-3 hover:bg-black/[0.06]" aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <p className={`mt-1 truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-3`}>받는 사람: {targets.map((u) => u.name || u.email).join(', ')}</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <label className={`block text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2`}>제목</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`mt-1 h-10 w-full rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent`} />
                <label className={`mt-3 block text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2`}>인사말</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={7}
                  className={`mt-1 w-full rounded-control border border-hairline px-3 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed outline-none focus:border-accent`}
                />
                <p className={`mt-1 text-[length:calc(13px*var(--ui-fs,1))] leading-relaxed text-label-3`}>
                  인사말만 쓰면 됩니다. <b className="text-label-2">페이스 시작하기 버튼</b>, 그 사람의 <b className="text-label-2">로그인할 계정</b>, 처음 로그인 안내는 메일에 자동으로 들어갑니다(앱 주소는 버튼 뒤에 숨김).
                  {` `}
                  <code>{LOGIN_TOKEN}</code> · <code>{NAME_TOKEN}</code>을 쓰면 사람마다 바뀝니다.
                </p>
                <p className={`mt-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-3`}>보내는 계정: {connected ? getAdminEmail() : '보낼 때 Google 계정 연결'}</p>
                {/* 메일의 「문의하기」 버튼이 갈 곳: 관리자가 정한다(팀장 화면에서는 보기만) */}
                <div className={`mt-4 rounded-card bg-subtle px-3.5 py-3 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2`}>
                  <p className="font-semibold text-label">로그인 문의 받는 사람</p>
                  {isAdmin ? (
                    <div className="mt-1.5 flex flex-wrap gap-4">
                      {(
                        [
                          ['leader', '초대한 팀장(없으면 그 팀 팀장)'],
                          ['admin', '관리자'],
                        ] as [ContactMode, string][]
                      ).map(([k, label]) => (
                        <label key={k} className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="radio"
                            name="contact-mode"
                            checked={contactModeOf(data) === k}
                            disabled={busy}
                            onChange={() =>
                              void run(() => setAccessSetting(data.id, 'contact', k, me, `로그인 문의 받는 사람: ${label}`), '문의 받는 사람을 바꿨습니다.')
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <p className={`mt-1 text-[length:calc(13px*var(--ui-fs,1))] text-label-3`}>
                    메일의 「문의하기」 버튼 → {(() => {
                      const c = targets[0] ? contactFor(data, targets[0], me) : null
                      return c ? (c.name ? `${c.name}(${c.email})` : c.email) : '없음'
                    })()}
                  </p>
                </div>
              </div>
              <div>
                <p className={`text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2`}>미리보기 · {targets[0]?.name || targets[0]?.email}</p>
                <iframe
                  title="초대 메일 미리보기"
                  className="mt-1 h-[520px] w-full rounded-card border border-separator bg-[#F3F4F6]"
                  srcDoc={
                    targets[0]
                      ? inviteHtml(
                          body.split(LOGIN_TOKEN).join(targets[0].email).split(NAME_TOKEN).join(targets[0].name ?? ''),
                          targets[0],
                          getAdminEmail() ?? me,
                          appInviteUrl(),
                          contactFor(data, targets[0], me),
                        )
                      : ''
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSendOpen(false)} disabled={sending}>
                취소
              </Button>
              <Button variant="primary" onClick={() => void send()} disabled={sending || !isAdminConfigured() || targets.some((u) => !!u.sendTo && !isEmail(u.sendTo))}>
                {sending ? <Spinner className="h-4 w-4 text-white" /> : <Send size={15} strokeWidth={1.9} />}
                {connected ? `${targets.length}명에게 보내기` : 'Google 연결하고 보내기'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removeAsk}
        title="목록에서 빼기"
        message={`${removeAsk?.map((u) => u.name || u.email).join(', ')}\n앱 권한 목록에서 뺍니다. 이 사람은 로그인해도 팀원 메뉴가 보이지 않습니다. 시트 공유는 시트에서 따로 해제하세요.`}
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

// 받는 메일 칸: 칸을 떠날 때(Enter) 저장. 비우면 로그인 Gmail로 보낸다.
function SendToInput({ u, disabled, onSave }: { u: AccessUser; disabled?: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(u.sendTo ?? '')
  const bad = !!v.trim() && !isEmail(v)
  return (
    <input
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => !bad && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="같으면 비워 둠"
      className={`h-8 w-full min-w-[200px] rounded-control border px-2 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none focus:border-accent disabled:bg-transparent disabled:text-label-2 ${bad ? 'border-danger/60' : 'border-hairline'}`}
    />
  )
}

// 표 칸에서 바로 고치기(칸을 떠나거나 Enter면 저장)
function CellInput({ value, placeholder, disabled, onSave }: { value: string; placeholder?: string; disabled?: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
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

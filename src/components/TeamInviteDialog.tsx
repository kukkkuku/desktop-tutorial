// 평가 목록 › 팀원 초대(팝업): Gmail 아이디로 받는 사람을 넣고, 보낼 메일을 오른쪽 미리보기로 확인한 뒤 보낸다.
// 보낸 사람은 팀원 명단(권한 시트)에 이 팀 · 초대한 날짜로 들어간다(이름은 평가의 팀원관리 표에서 채우면 명단에도 맞춰짐).
// 실적관리 시트 공유는 관리자가 한다.
import { useMemo, useState } from 'react'
import { Check, Send, X } from 'lucide-react'
import Button from './Button'
import Spinner from './Spinner'
import Modal from './ui/Modal'
import { errText } from '../utils/googleError'
import { normalizeGmail } from '../utils/teamRoster'
import { getConnectedEmail } from '../utils/googleDrive'
import { useAccessData } from '../hooks/useAccessData'
import { connectAdmin, getAdminEmail, inviteHtml, isAdminConfigured, isAdminConnected, sendInviteEmails } from '../utils/adminInvite'
import { appInviteUrl, contactFor, getAccessSheetId, isPendingEmail, refreshAccess, taskSheetOf, updateUsers, type AccessData, type AccessUser } from '../utils/accessSheet'

const DEFAULT_SUBJECT = '페이스(과제 · 성과관리) 앱 초대'
const DEFAULT_BODY = `안녕하세요, 팀 과제 · 성과관리 앱 「페이스」에 초대합니다.
아래 시작하는 방법대로 들어와 주세요.`
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const okMail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

// 이 팀의 팀원 명단(권한 시트): 팀 칸이 이 팀, 팀이 비었으면 내가 추가한 팀원
export function teamMembersOf(data: AccessData | null, teamName: string, me: string): AccessUser[] {
  if (!data) return []
  return data.users.filter((u) => u.role === 'member' && (u.team ? u.team === teamName : u.addedBy === me))
}

export default function TeamInviteDialog({ teamName, onClose }: { teamName: string; onClose: () => void }) {
  const me = (getConnectedEmail() ?? '').toLowerCase()
  const { data } = useAccessData(false)
  const members = teamMembersOf(data, teamName, me)
  const [emails, setEmails] = useState<string[]>([])
  const [text, setText] = useState('')
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string[] | null>(null)

  // 쉼표 · 띄어쓰기 · 줄바꿈으로 여러 명. 아이디만 쓰면 @gmail.com
  function add(raw: string) {
    const got = raw.split(/[\s,;]+/).map(normalizeGmail).filter(Boolean)
    if (got.length) setEmails((cur) => Array.from(new Set([...cur, ...got])))
    setText('')
  }
  const targets = Array.from(new Set([...emails, ...(text.trim() ? [normalizeGmail(text)] : [])]))
  const bad = targets.filter((e) => !okMail(e))
  const sample = targets.find(okMail) ?? 'hong@gmail.com'
  const from = getAdminEmail() ?? me
  const preview = useMemo(() => {
    const u: AccessUser = data?.users.find((x) => x.email === sample) ?? { email: sample, name: '', role: 'member', team: teamName }
    return inviteHtml(body, { email: sample }, from || '보내는 사람', appInviteUrl(undefined, taskSheetOf(data)?.url ?? null), data ? contactFor(data, u, me) : null)
  }, [body, sample, from, data, teamName, me])

  async function send() {
    setBusy(true)
    setError('')
    try {
      if (!getAccessSheetId()) throw new Error('권한 시트가 연결되지 않았습니다. 관리자에게 문의하세요.')
      const access = data ?? (await refreshAccess())
      if (!access) throw new Error('팀원 명단(권한 시트)을 읽지 못했습니다. 관리자에게 권한 시트 편집자 공유를 요청하세요.')
      if (!isAdminConnected()) await connectAdmin()
      const res = await sendInviteEmails(
        targets.map((email) => ({ email, addedAt: '', lastInvitedAt: null })),
        subject,
        body,
        appInviteUrl(undefined, taskSheetOf(access)?.url ?? null),
        (r) => contactFor(access, access.users.find((x) => x.email === r.email) ?? { email: r.email, name: '', role: 'member', team: teamName }, me),
      )
      if (res.sent.length) {
        const at = stamp()
        const sent = new Set(res.sent)
        await updateUsers(
          access.id,
          (users) => {
            const next = users.map((u) => (sent.has(u.email) ? { ...u, invitedAt: at, team: u.team || teamName } : u))
            res.sent.forEach((email) => {
              if (!next.some((u) => u.email === email)) next.push({ email, name: '', role: 'member', team: teamName, memo: '', addedBy: me, sendTo: '', invitedAt: at })
            })
            return next
          },
          me,
          [`초대 메일(${teamName}): ${res.sent.join(', ')}`],
        )
      }
      if (res.failed.length) {
        setEmails(res.failed.map((f) => f.email))
        setText('')
        setError(`${res.sent.length}명 보냄 · ${res.failed.length}명 실패(${res.failed.map((f) => f.email).join(', ')}): ${res.failed[0].error}`)
      } else setDone(res.sent)
    } catch (e) {
      setError(errText(e, '보내지 못했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <Modal title="초대 메일을 보냈습니다" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>확인</Button>}>
        <p className={`text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed text-label-2`}>
          {done.length}명에게 보냈습니다: <span className="text-label">{done.join(', ')}</span>
          <br />
          팀원 명단에 「{teamName}」으로 들어갔습니다. 실적관리 시트 공유는 관리자가 합니다.
        </p>
      </Modal>
    )

  return (
    <Modal
      size="lg"
      title="팀원 초대"
      sub={`${teamName} · 받은 사람은 메일의 「페이스 시작하기」로 바로 들어옵니다`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <span className={`mr-auto truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-3`}>
            {!isAdminConfigured() ? '이 배포에서는 메일 보내기를 쓸 수 없습니다' : isAdminConnected() ? `보내는 계정: ${getAdminEmail()}` : '보낼 때 Google 계정 연결 창이 한 번 뜹니다'}
          </span>
          <Button onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void send()} disabled={busy || !targets.length || bad.length > 0 || !isAdminConfigured()}>
            {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send size={15} strokeWidth={1.9} />}
            {targets.length ? `${targets.length}명에게 보내기` : '보내기'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className={`text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label`}>받는 사람</label>
            <div
              className="mt-1.5 flex min-h-[76px] cursor-text flex-wrap content-start gap-1.5 rounded-control border border-hairline bg-white p-2 focus-within:border-accent"
              onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
            >
              {emails.map((e) => (
                <span key={e} className={`flex h-7 items-center gap-1 rounded-full pl-2.5 pr-1 text-[length:calc(13.5px*var(--ui-fs,1))] ${okMail(e) ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'}`}>
                  {e}
                  <button onClick={() => setEmails(emails.filter((x) => x !== e))} aria-label={`${e} 빼기`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/[0.06]">
                    <X size={12} strokeWidth={2.2} />
                  </button>
                </span>
              ))}
              <input
                autoFocus
                value={text}
                onChange={(e) => (/[\s,;]$/.test(e.target.value) ? add(e.target.value) : setText(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && text.trim()) {
                    e.preventDefault()
                    add(text)
                  } else if (e.key === 'Backspace' && !text && emails.length) setEmails(emails.slice(0, -1))
                }}
                onBlur={() => text.trim() && add(text)}
                onPaste={(e) => {
                  e.preventDefault()
                  add(text + ' ' + e.clipboardData.getData('text'))
                }}
                placeholder={emails.length ? '' : 'Gmail 아이디 (예: hong)'}
                className={`h-7 min-w-[140px] flex-1 bg-transparent px-1 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none placeholder:text-label-3`}
              />
            </div>
            <p className={`mt-1 text-[length:calc(12.5px*var(--ui-fs,1))] ${bad.length ? 'text-danger' : 'text-label-3'}`}>
              {bad.length ? `메일 주소를 확인해 주세요: ${bad.join(', ')}` : '아이디만 쓰면 @gmail.com이 붙습니다 · 여러 명은 쉼표나 Enter로'}
            </p>
          </div>
          <div>
            <label className={`text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label`}>메일 제목</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`mt-1.5 h-9 w-full rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none focus:border-accent`} />
          </div>
          <div>
            <label className={`text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label`}>인사말</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={`mt-1.5 w-full rounded-control border border-hairline px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed text-label outline-none focus:border-accent`} />
          </div>
          {members.length > 0 && (
            <div>
              <p className={`text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label`}>
                이 팀 명단 <span className="font-normal text-label-3">{members.length}명</span>
              </p>
              <div className="mt-1.5 max-h-[120px] space-y-0.5 overflow-y-auto">
                {members.map((u) => (
                  <div key={u.email} className={`flex items-center gap-2 text-[length:calc(13px*var(--ui-fs,1))]`}>
                    <span className="min-w-0 flex-1 truncate text-label-2">
                      {u.name || u.email.split('@')[0]} {!isPendingEmail(u.email) && <span className="text-label-3">{u.email}</span>}
                    </span>
                    {isPendingEmail(u.email) ? (
                      <span className="shrink-0 text-label-3">Gmail 없음</span>
                    ) : u.invitedAt ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-success">
                        <Check size={12} strokeWidth={2.4} />
                        {u.invitedAt.slice(5, 10).replace('-', '.')} 보냄
                      </span>
                    ) : (
                      <button onClick={() => setEmails((cur) => Array.from(new Set([...cur, u.email])))} className="shrink-0 text-accent hover:underline">
                        받는 사람에 넣기
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <p className={`rounded-card bg-danger/[0.06] px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-danger`}>{error}</p>}
        </div>
        <div className="flex min-h-0 flex-col">
          <p className={`text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label`}>
            미리보기 <span className="font-normal text-label-3">{sample} 에게 가는 메일</span>
          </p>
          <p className={`mt-0.5 text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3`}>제목: {subject}</p>
          <iframe title="초대 메일 미리보기" srcDoc={preview} sandbox="" className="mt-1.5 h-[440px] w-full rounded-card border border-hairline bg-[#F3F4F6]" />
        </div>
      </div>
    </Modal>
  )
}

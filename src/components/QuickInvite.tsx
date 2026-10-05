// 평가 목록 › 팀원 초대: Gmail 아이디만 넣고 바로 초대 메일. 보낸 사람은 팀원 명단(권한 시트)에 우리 팀으로 들어간다
// (이름은 나중에 평가의 팀원관리 표에서 채우면 명단에도 맞춰짐). 실적관리 시트 공유는 관리자가 한다.
import { useState } from 'react'
import { Send, X } from 'lucide-react'
import Button from './Button'
import Spinner from './Spinner'
import TeamAccountsPanel from './TeamAccountsPanel'
import { icSm } from './ui/icon'
import { errText } from '../utils/googleError'
import { normalizeGmail } from '../utils/teamRoster'
import { getConnectedEmail } from '../utils/googleDrive'
import { connectAdmin, isAdminConfigured, isAdminConnected, sendInviteEmails } from '../utils/adminInvite'
import { appInviteUrl, contactFor, getAccessSheetId, readAccessCache, refreshAccess, taskSheetOf, updateUsers, type AccessUser } from '../utils/accessSheet'

const SUBJECT = '페이스(과제 · 성과관리) 앱 초대'
const BODY = `안녕하세요, 팀 과제 · 성과관리 앱 「페이스」에 초대합니다.
아래 시작하는 방법대로 들어와 주세요.`
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const okMail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export default function QuickInvite({ teamName, onSent }: { teamName: string; onSent?: () => void }) {
  const [emails, setEmails] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [fullList, setFullList] = useState(false)

  // 쉼표 · 띄어쓰기 · 줄바꿈으로 여러 명. 아이디만 쓰면 @gmail.com
  function add(raw: string) {
    const got = raw
      .split(/[\s,;]+/)
      .map(normalizeGmail)
      .filter(Boolean)
    if (!got.length) return
    setEmails((cur) => Array.from(new Set([...cur, ...got])))
    setText('')
  }
  const pending = text.trim() ? [normalizeGmail(text)] : []
  const targets = Array.from(new Set([...emails, ...pending]))
  const bad = targets.filter((e) => !okMail(e))

  async function send() {
    setBusy(true)
    setNote(null)
    try {
      if (!getAccessSheetId()) throw new Error('권한 시트가 연결되지 않았습니다. 관리자에게 문의하세요.')
      const data = readAccessCache() ?? (await refreshAccess())
      if (!data) throw new Error('팀원 명단(권한 시트)을 읽지 못했습니다. 관리자에게 권한 시트 편집자 공유를 요청하세요.')
      if (!isAdminConnected()) await connectAdmin()
      const me = (getConnectedEmail() ?? '').toLowerCase()
      const res = await sendInviteEmails(
        targets.map((email) => ({ email, addedAt: '', lastInvitedAt: null })),
        SUBJECT,
        BODY,
        appInviteUrl(undefined, taskSheetOf(data)?.url ?? null),
        (r) => {
          const u: AccessUser = data.users.find((x) => x.email === r.email) ?? { email: r.email, name: '', role: 'member', team: teamName }
          return contactFor(data, u, me)
        },
      )
      if (res.sent.length) {
        const at = stamp()
        const sent = new Set(res.sent)
        await updateUsers(
          data.id,
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
      setEmails(res.failed.map((f) => f.email))
      setText('')
      if (res.failed.length) setNote({ ok: false, text: `${res.sent.length}명 보냄 · ${res.failed.length}명 실패: ${res.failed[0].error}` })
      else setNote({ ok: true, text: `${res.sent.length}명에게 초대 메일을 보냈습니다. 실적관리 시트 공유는 관리자가 합니다.` })
      onSent?.()
    } catch (e) {
      setNote({ ok: false, text: errText(e, '보내지 못했습니다.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-control border border-hairline bg-white px-2 py-1.5 focus-within:border-accent">
          {emails.map((e) => (
            <span
              key={e}
              className={`flex h-7 items-center gap-1 rounded-full pl-2.5 pr-1 text-[length:calc(13.5px*var(--ui-fs,1))] ${okMail(e) ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'}`}
            >
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
              } else if (e.key === 'Enter' && targets.length && !bad.length && !busy) void send()
              else if (e.key === 'Backspace' && !text && emails.length) setEmails(emails.slice(0, -1))
            }}
            onPaste={(e) => {
              e.preventDefault()
              add(text + ' ' + e.clipboardData.getData('text'))
            }}
            placeholder={emails.length ? '' : 'Gmail 아이디(예: hong) -- 여러 명은 쉼표 · Enter로'}
            className="h-7 min-w-[180px] flex-1 bg-transparent px-1 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none placeholder:text-label-3"
          />
        </div>
        <Button variant="primary" onClick={() => void send()} disabled={busy || !targets.length || bad.length > 0 || !isAdminConfigured()} className="h-10">
          {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send {...icSm} />}
          {targets.length ? `${targets.length}명에게 초대 메일` : '초대 메일 보내기'}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:calc(13px*var(--ui-fs,1))]">
        {note ? (
          <span className={note.ok ? 'text-success' : 'text-danger'}>{note.text}</span>
        ) : bad.length ? (
          <span className="text-danger">메일 주소를 확인해 주세요: {bad.join(', ')}</span>
        ) : (
          <span className="text-label-3">아이디만 쓰면 @gmail.com이 붙습니다. 받은 사람은 메일의 「시작하기」로 바로 들어옵니다.</span>
        )}
        <button onClick={() => setFullList(!fullList)} className="ml-auto text-accent hover:underline">
          {fullList ? '명단 접기' : '팀원 명단 보기'}
        </button>
      </div>
      {fullList && (
        <div className="mt-3 border-t border-separator pt-4">
          <TeamAccountsPanel />
        </div>
      )}
    </div>
  )
}

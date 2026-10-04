// 초대 메일 보내기(성과관리 › 팀원관리): Gmail이 있는 팀원 중 고른 사람에게. 처음엔 아직 초대 안 한 사람이 골라져 있다.
// 보내면 권한 시트에 초대한 날을 적는다. 실적관리 시트 공유는 관리자가 한다(관리 › 실적관리 시트).
import { useState } from 'react'
import { Check, Send, X } from 'lucide-react'
import Button from './Button'
import Spinner from './Spinner'
import { errText } from '../utils/googleError'
import { connectAdmin, getAdminEmail, isAdminConfigured, isAdminConnected, sendInviteEmails } from '../utils/adminInvite'
import { appInviteUrl, contactFor, taskSheetOf, updateUsers, type AccessData, type AccessUser } from '../utils/accessSheet'

const DEFAULT_SUBJECT = '페이스(과제 · 성과관리) 앱 초대'
const DEFAULT_BODY = `안녕하세요, 팀 과제 · 성과관리 앱 「페이스」에 초대합니다.
아래 시작하는 방법대로 들어와 주세요.`
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function InviteDialog({
  data,
  people,
  me,
  onClose,
  onSent,
}: {
  data: AccessData
  people: AccessUser[] // Gmail이 있는 우리 팀 팀원
  me: string
  onClose: () => void
  onSent: (text: string) => void
}) {
  const [pick, setPick] = useState<Set<string>>(() => new Set(people.filter((u) => !u.invitedAt).map((u) => u.email)))
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const targets = people.filter((u) => pick.has(u.email))
  async function send() {
    setBusy(true)
    setError('')
    try {
      if (!isAdminConnected()) await connectAdmin()
      const res = await sendInviteEmails(
        targets.map((u) => ({ email: u.email, sendTo: u.sendTo || undefined, name: u.name || undefined, addedAt: '', lastInvitedAt: null })),
        subject,
        body,
        appInviteUrl(undefined, taskSheetOf(data)?.url ?? null),
        (r) => {
          const u = data.users.find((x) => x.email === r.email)
          return u ? contactFor(data, u, me) : null
        },
      )
      if (res.sent.length) {
        const at = stamp()
        const sent = new Set(res.sent)
        await updateUsers(data.id, (users) => users.map((x) => (sent.has(x.email) ? { ...x, invitedAt: at } : x)), me, [`초대 메일: ${res.sent.join(', ')}`])
      }
      const name = (e: string) => people.find((u) => u.email === e)?.name || e
      if (res.failed.length) setError(`${res.sent.length}명 보냄 · ${res.failed.length}명 실패: ${res.failed.map((f) => name(f.email)).join(', ')} -- ${res.failed[0].error}`)
      else {
        onSent(`${res.sent.length}명에게 초대 메일을 보냈습니다. 실적관리 시트 공유는 관리자가 합니다.`)
        onClose()
      }
    } catch (e) {
      setError(errText(e, '보내지 못했습니다.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[14px] bg-white p-5 shadow-dialog">
        <div className="flex items-center gap-2">
          <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">초대 메일 보내기</h3>
          <button onClick={onClose} aria-label="닫기" className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] text-label-2 hover:bg-black/[0.06]">
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <p className="mt-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">받은 사람은 메일의 「시작하기」로 바로 들어옵니다. Gmail이 없는 팀원은 표의 Gmail 칸을 먼저 채워 주세요.</p>
        <div className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded-card border border-hairline p-1.5">
          {people.length === 0 && <p className="px-2 py-3 text-[length:calc(14px*var(--ui-fs,1))] text-label-3">Gmail이 있는 팀원이 없습니다.</p>}
          {people.map((u) => {
            const on = pick.has(u.email)
            return (
              <label key={u.email} className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-black/[0.03]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const next = new Set(pick)
                    if (on) next.delete(u.email)
                    else next.add(u.email)
                    setPick(next)
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[length:calc(14px*var(--ui-fs,1))] text-label">
                  {u.name || u.email} <span className="text-label-3">{u.sendTo || u.email}</span>
                </span>
                {u.invitedAt ? (
                  <span className="flex shrink-0 items-center gap-0.5 text-[length:calc(12.5px*var(--ui-fs,1))] text-success">
                    <Check size={12} strokeWidth={2.4} />
                    {u.invitedAt.slice(5, 10).replace('-', '.')} 보냄
                  </span>
                ) : (
                  <span className="shrink-0 text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">안 보냄</span>
                )}
              </label>
            )
          })}
        </div>
        {editing ? (
          <div className="mt-3 space-y-2">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-full rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))]" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-control border border-hairline px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))]" />
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="mt-2 self-start text-[length:calc(13px*var(--ui-fs,1))] text-accent hover:underline">
            메일 내용 고치기
          </button>
        )}
        {error && <p className="mt-2 rounded-card bg-danger/[0.06] px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-danger">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto truncate text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">
            {isAdminConnected() ? `보내는 계정: ${getAdminEmail()}` : '보낼 때 Google 계정 연결'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void send()} disabled={busy || !targets.length || !isAdminConfigured()}>
            {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send size={15} strokeWidth={1.9} />}
            {targets.length}명에게 보내기
          </Button>
        </div>
      </div>
    </div>
  )
}

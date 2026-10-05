// 평가 목록 › 팀원 초대(팝업). 왼쪽: 받는 사람(Gmail 아이디). 오른쪽: 받는 사람이 보게 될 메일 그대로 --
// 제목 · 인사말은 미리보기 안 점선 칸을 눌러 바로 고친다. 확인하고 「N명에게 보내기」.
// 보낸 사람은 팀원 명단(권한 시트)에 이 팀 · 초대한 날짜로 들어간다(이름은 평가의 팀원관리 표에서 채우면 명단에도 맞춰짐).
// 실적관리 시트 공유는 관리자가 한다.
import { useLayoutEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import Button from './Button'
import Spinner from './Spinner'
import Modal from './ui/Modal'
import { errText } from '../utils/googleError'
import { normalizeGmail } from '../utils/teamRoster'
import { getConnectedEmail } from '../utils/googleDrive'
import { useAccessData } from '../hooks/useAccessData'
import { connectAdmin, getAdminEmail, isAdminConfigured, isAdminConnected, sendInviteEmails } from '../utils/adminInvite'
import { contactFor, getAccessSheetId, appInviteUrl, refreshAccess, taskSheetOf, updateUsers, type AccessData, type AccessUser } from '../utils/accessSheet'

const DEFAULT_SUBJECT = '페이스(과제 · 성과관리) 앱 초대'
const DEFAULT_BODY = `안녕하세요, 팀 과제 · 성과관리 앱 「페이스」에 초대합니다.
아래 시작하는 방법대로 들어와 주세요.`
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
// Gmail 주소: 아이디는 영문 · 숫자 · 점 등만(한글이 섞이면 한/영 전환을 잊은 것)
const okMail = (e: string) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e)
const userOf = (data: AccessData | null, email: string, team: string): AccessUser => data?.users.find((x) => x.email === email) ?? { email, name: '', role: 'member', team }

// 이 팀의 팀원 명단(권한 시트): 팀 칸이 이 팀, 팀이 비었으면 내가 추가한 팀원
export function teamMembersOf(data: AccessData | null, teamName: string, me: string): AccessUser[] {
  if (!data) return []
  return data.users.filter((u) => u.role === 'member' && (u.team ? u.team === teamName : u.addedBy === me))
}

// 줄 수만큼 자라는 입력 칸(인사말)
function AutoText({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} className={className} />
}

export default function TeamInviteDialog({ teamName, onClose }: { teamName: string; onClose: () => void }) {
  const me = (getConnectedEmail() ?? '').toLowerCase()
  const { data } = useAccessData(false)
  const [emails, setEmails] = useState<string[]>([])
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  const [flash, setFlash] = useState('')
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 한글 입력(조합) 중에 쉼표 · Enter를 누르면 조합이 끝난 뒤에 넣는다(마지막 글자가 한 번 더 붙던 문제)
  const composing = useRef(false)
  const pendingAdd = useRef(false)

  // 쉼표 · 띄어쓰기 · 줄바꿈으로 여러 명. 아이디만 쓰면 @gmail.com. 이미 넣은 주소는 알려 준다
  function add(raw: string) {
    const got = raw.split(/[\s,;]+/).map(normalizeGmail).filter(Boolean)
    setText('')
    if (inputRef.current) inputRef.current.value = ''
    if (!got.length) return
    const dup = got.filter((e) => emails.includes(e))
    if (dup.length) {
      setNotice(`이미 넣은 주소입니다: ${dup.join(', ')}`)
      setFlash(dup[0])
      window.setTimeout(() => setFlash(''), 900)
    } else setNotice('')
    setEmails((cur) => Array.from(new Set([...cur, ...got])))
  }
  const targets = Array.from(new Set([...emails, ...(text.trim() ? [normalizeGmail(text)] : [])]))
  const bad = targets.filter((e) => !okMail(e))
  const invitedBefore = targets.filter((e) => okMail(e) && data?.users.find((u) => u.email === e)?.invitedAt)
  const sample = targets.find(okMail) ?? 'hong@gmail.com'
  const from = getAdminEmail() ?? me
  const contact = data ? contactFor(data, userOf(data, sample, teamName), me) : null

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
        (r) => contactFor(access, userOf(access, r.email, teamName), me),
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
        <p className="text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed text-label-2">
          {done.length}명에게 보냈습니다: <span className="text-label">{done.join(', ')}</span>
          <br />
          팀원 명단에 「{teamName}」으로 들어갔습니다. 실적관리 시트 공유는 관리자가 합니다.
        </p>
      </Modal>
    )

  const edit = 'rounded-[6px] border border-dashed border-accent/50 bg-accent-soft/40 outline-none transition-colors hover:border-accent focus:border-solid focus:border-accent focus:bg-white'

  return (
    <Modal
      size="lg"
      title="팀원 초대"
      sub={teamName}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <span className="mr-auto truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-3">
            {!isAdminConfigured() ? '이 배포에서는 메일 보내기를 쓸 수 없습니다' : isAdminConnected() ? `보내는 계정: ${getAdminEmail()}` : '보낼 때 Google 계정 연결 창이 한 번 뜹니다'}
          </span>
          <Button onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={() => void send()} disabled={busy || !targets.length || bad.length > 0 || !subject.trim() || !isAdminConfigured()}>
            {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send size={15} strokeWidth={1.9} />}
            {targets.length ? `${targets.length}명에게 보내기` : '보내기'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* 받는 사람 */}
        <div>
          <label htmlFor="invite-to" className="text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label">
            받는 사람 {targets.length > 0 && <span className="font-normal text-label-3">{targets.length}명</span>}
          </label>
          <div
            className="mt-1.5 flex min-h-[120px] cursor-text flex-wrap content-start gap-1.5 rounded-control border border-hairline bg-white p-2 focus-within:border-accent"
            onClick={() => inputRef.current?.focus()}
          >
            {emails.map((e) => (
              <span
                key={e}
                className={`flex h-7 max-w-full items-center gap-1 rounded-full pl-2.5 pr-1 text-[length:calc(13.5px*var(--ui-fs,1))] transition-shadow ${
                  okMail(e) ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'
                } ${flash === e ? 'ring-2 ring-orange-400' : ''}`}
              >
                <span className="truncate">{e}</span>
                <button onClick={() => setEmails(emails.filter((x) => x !== e))} aria-label={`${e} 빼기`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06]">
                  <X size={12} strokeWidth={2.2} />
                </button>
              </span>
            ))}
            <input
              id="invite-to"
              ref={inputRef}
              autoFocus
              value={text}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={(e) => {
                composing.current = false
                if (pendingAdd.current) {
                  pendingAdd.current = false
                  const el = e.currentTarget
                  window.setTimeout(() => add(el.value), 0)
                }
              }}
              onChange={(e) => {
                const v = e.target.value
                if (/[\s,;]$/.test(v)) {
                  if (composing.current) {
                    pendingAdd.current = true
                    setText(v)
                  } else add(v)
                } else setText(v)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (e.nativeEvent.isComposing || composing.current) pendingAdd.current = true
                  else if (text.trim()) add(text)
                } else if (e.key === 'Backspace' && !text && emails.length) setEmails(emails.slice(0, -1))
              }}
              onBlur={() => text.trim() && !composing.current && add(text)}
              onPaste={(e) => {
                e.preventDefault()
                add(text + ' ' + e.clipboardData.getData('text'))
              }}
              placeholder={emails.length ? '' : 'Gmail 아이디 (예: hong)'}
              className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none placeholder:text-label-3"
            />
          </div>
          <div className="mt-1.5 space-y-1 text-[length:calc(12.5px*var(--ui-fs,1))]">
            {bad.length > 0 ? (
              <p className="text-danger">Gmail 아이디는 영문 · 숫자로 적어 주세요(한/영 전환 확인): {bad.join(', ')}</p>
            ) : (
              <p className="text-label-3">아이디만 쓰면 @gmail.com이 붙습니다 · 여러 명은 쉼표나 Enter로</p>
            )}
            {notice && <p className="text-orange-600">{notice}</p>}
            {invitedBefore.length > 0 && <p className="text-label-2">이미 초대한 적 있는 주소: {invitedBefore.join(', ')} -- 다시 보냅니다</p>}
          </div>
          {error && <p className="mt-3 rounded-card bg-danger/[0.06] px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))] text-danger">{error}</p>}
        </div>

        {/* 보낼 메일: 받는 사람이 보게 될 모양 그대로, 점선 칸은 눌러서 고침 */}
        <div className="min-w-0">
          <p className="text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label">
            보낼 메일 <span className="font-normal text-label-3">점선 칸을 눌러 고칠 수 있습니다</span>
          </p>
          <div className="mt-1.5 rounded-card bg-[#F3F4F6] p-3">
            <div className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2 text-[13px]">
              <span className="shrink-0 text-label-3">제목</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="메일 제목" className={`min-w-0 flex-1 px-1.5 py-0.5 font-semibold text-label ${edit}`} />
            </div>
            <div className="mt-2 rounded-[12px] bg-white px-5 py-4 text-[13px] leading-relaxed text-[#3F434A]">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
                  <span className="h-2 w-2 rounded-full border-2 border-white" />
                </span>
                <span className="text-[13px] font-bold text-label">페이스</span>
              </div>
              <p className="mt-3 text-[17px] font-extrabold text-label">페이스에 초대합니다</p>
              <AutoText value={body} onChange={setBody} className={`mt-1.5 block w-full resize-none overflow-hidden px-1.5 py-1 text-[13px] leading-relaxed text-[#3F434A] ${edit}`} />
              <p className="mt-3 text-[11.5px] font-bold text-label-3">시작하는 방법</p>
              <ol className="mt-1.5 space-y-1.5">
                <li className="flex gap-2">
                  <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">1</span>
                  <span>
                    <b className="text-label">「페이스 시작하기」</b> 버튼을 누릅니다.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">2</span>
                  <span className="min-w-0">
                    <b className="text-label">이 Google 계정으로 로그인</b>합니다.
                    <span className="mt-1 block truncate rounded-[8px] bg-accent-soft px-2.5 py-1 font-bold text-accent">{sample}</span>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#D97706] text-[11px] font-bold text-white">3</span>
                  <span>
                    <b className="text-label">「Google에서 확인하지 않은 앱」</b>이 나오면 고급 → 페이스(으)로 이동
                  </span>
                </li>
              </ol>
              <div className="mt-3 rounded-[10px] bg-accent py-2 text-center text-[14px] font-bold text-white">페이스 시작하기</div>
              {contact && (
                <p className="mt-2 text-center text-[11.5px] text-label-3">로그인 문의: {contact.name ? `${contact.name}(${contact.email})` : contact.email}</p>
              )}
              <p className="mt-3 border-t border-separator pt-2 text-[11.5px] text-label-3">{from || '보내는 사람'} 님이 보낸 페이스 초대입니다.</p>
            </div>
          </div>
          <p className="mt-1.5 text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">받는 사람마다 2번 칸에 그 사람 주소가 들어갑니다.</p>
        </div>
      </div>
    </Modal>
  )
}

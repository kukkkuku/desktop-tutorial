// 평가 목록 › 팀원 초대(팝업). 왼쪽: 받는 사람(Gmail 아이디). 오른쪽: 받는 사람이 보게 될 메일 그대로 --
// 제목 · 인사말은 미리보기 안 점선 칸을 눌러 바로 고친다. 확인하고 「N명에게 보내기」.
// 보낸 사람은 팀원 명단(권한 시트)에 이 팀 · 초대한 날짜로 들어간다(이름은 평가의 팀원관리 표에서 채우면 명단에도 맞춰짐).
// 실적관리 시트 공유는 관리자가 한다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import Button from './Button'
import Spinner from './Spinner'
import Modal from './ui/Modal'
import { errText } from '../utils/googleError'
import { normalizeGmail } from '../utils/teamRoster'
import { getConnectedEmail } from '../utils/googleDrive'
import { useAccessData } from '../hooks/useAccessData'
import { connectAdmin, getAdminEmail, inviteHtml, isAdminConfigured, isAdminConnected, sendInviteEmails } from '../utils/adminInvite'
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

// 실제 메일 미리보기: 메일 HTML을 그대로 띄우고 인사말(#invite-msg)만 그 자리에서 고친다.
// 칸 너비 · 화면 높이에 맞춰 줄여서 안쪽 스크롤 없이 한눈에 보이게 한다.
const MAIL_W = 580
function MailPreview({ html, onBody }: { html: string; onBody: (v: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState(900)
  const [scale, setScale] = useState(0.8)
  const onBodyRef = useRef(onBody)
  onBodyRef.current = onBody
  const fit = () => {
    const doc = frameRef.current?.contentDocument
    const w = wrapRef.current?.clientWidth ?? MAIL_W
    if (!doc) return
    const ch = doc.documentElement.scrollHeight
    setH(ch)
    // 화면 높이에 맞춰 줄이되 글자가 너무 작아지지 않게(0.78 아래로는 안 줄임 -- 그때는 창이 스크롤)
    const room = window.innerHeight * 0.94 - 235
    setScale(Math.min(1, w / MAIL_W, Math.max(0.78, room / ch)))
  }
  useEffect(() => {
    const on = () => fit()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  function onLoad() {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    const msg = doc.getElementById('invite-msg')
    if (msg) {
      msg.contentEditable = 'true'
      msg.spellcheck = false
      Object.assign(msg.style, { outline: '2px dashed rgba(37,99,235,.55)', outlineOffset: '6px', borderRadius: '4px', cursor: 'text' })
      msg.addEventListener('focus', () => (msg.style.outline = '2px solid #2563EB'))
      msg.addEventListener('blur', () => (msg.style.outline = '2px dashed rgba(37,99,235,.55)'))
      msg.addEventListener('input', () => {
        onBodyRef.current(msg.innerText.replace(/\n{3,}/g, '\n\n'))
        fit()
      })
      // 붙여넣기는 글자만
      msg.addEventListener('paste', (e) => {
        e.preventDefault()
        doc.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '')
      })
    }
    // 미리보기 안 버튼 · 링크는 누르지 않게
    doc.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a')) e.preventDefault()
    })
    fit()
  }
  return (
    <div ref={wrapRef} className="mt-2 rounded-card border border-separator bg-[#F3F4F6]">
      <div className="mx-auto overflow-hidden" style={{ width: MAIL_W * scale, height: h * scale }}>
      <iframe
        ref={frameRef}
        title="초대 메일 미리보기"
        srcDoc={html}
        sandbox="allow-same-origin"
        onLoad={onLoad}
        scrolling="no"
        style={{ width: MAIL_W, height: h, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }}
      />
      </div>
    </div>
  )
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
  // 미리보기 안에서 고치는 중에는 메일 틀을 다시 만들지 않도록(커서가 튐) 최신 인사말을 따로 들고 있는다
  const bodyRef = useRef(DEFAULT_BODY)
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
  const appUrl = appInviteUrl(undefined, taskSheetOf(data)?.url ?? null)
  // 받는 사람(2번 칸 주소) · 문의 받는 사람이 바뀔 때만 다시 만든다 -- 인사말을 고칠 때마다 다시 만들면 입력이 끊긴다
  const previewHtml = useMemo(
    () => inviteHtml(bodyRef.current, { email: sample }, from, appUrl, contact),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sample, from, appUrl, contact?.email, contact?.name],
  )

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
      title={`팀원 초대 · ${teamName}`}
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
        {/* 받는 사람: 칸이 왼쪽 세로를 채우고, 사람이 많아지면 더 늘어난다 */}
        <div className="flex flex-col">
          <label htmlFor="invite-to" className="text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label">
            받는 사람 {targets.length > 0 && <span className="font-normal text-label-3">{targets.length}명</span>}
          </label>
          <div
            className="mt-1.5 flex min-h-[160px] flex-1 cursor-text flex-wrap content-start gap-1.5 rounded-control border border-hairline bg-white p-2 focus-within:border-accent"
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

        {/* 보낼 메일: 실제로 가는 메일 그대로(관리 메뉴 초대와 같은 틀). 제목 · 인사말 점선 칸만 고친다 */}
        <div className="min-w-0">
          <p className="text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold text-label">
            보낼 메일 <span className="font-normal text-label-3">점선 칸(제목 · 인사말)을 눌러 고칩니다</span>
          </p>
          <div className="mt-1.5 flex items-center gap-2 rounded-[10px] border border-separator bg-white px-3 py-2 text-[length:calc(13.5px*var(--ui-fs,1))]">
            <span className="shrink-0 text-label-3">제목</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="메일 제목" className={`min-w-0 flex-1 px-1.5 py-0.5 font-semibold text-label ${edit}`} />
          </div>
          <MailPreview
            html={previewHtml}
            onBody={(v) => {
              bodyRef.current = v
              setBody(v)
            }}
          />
        </div>
      </div>
    </Modal>
  )
}

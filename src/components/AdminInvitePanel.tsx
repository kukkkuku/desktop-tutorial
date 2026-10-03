import { useRef, useState, type ChangeEvent } from 'react'
import { FileSpreadsheet, Mail, Send, Trash2 } from 'lucide-react'
import {
  LOGIN_TOKEN,
  addEntriesToList,
  connectAdmin,
  getAdminEmail,
  isAdminConfigured,
  isAdminConnected,
  isEmail,
  loadInviteList,
  mailOf,
  parseInviteText,
  parseInviteWorkbook,
  removeEmailFromList,
  sendInviteEmails,
  setSendTo,
  type InviteRecipient,
} from '../utils/adminInvite'
import Button from './Button'
import IconButton from './IconButton'
import Spinner from './Spinner'
import { icSm } from './ui/icon'
import { appInviteUrl } from '../utils/accessSheet'

const DEFAULT_SUBJECT = '페이스(과제 · 성과관리) 앱 초대'
// 앱 주소는 지금 보고 있는 앱(운영/미리보기) + 권한 관리 시트(?access=) -- 이 링크로 열면 팀원 앱이 그 시트를 읽는다
const defaultBody = () => `안녕하세요, 팀 과제 · 성과관리 앱 「페이스」에 초대합니다.

아래 링크에서 Google 계정으로 로그인하시면 바로 사용하실 수 있습니다.
${appInviteUrl()}

로그인할 Google 계정: ${LOGIN_TOKEN}
(이 계정으로 권한이 정해져 있습니다. 다른 계정으로 로그인하면 메뉴가 다르게 보일 수 있습니다.)

※ 처음 로그인할 때 "Google에서 확인하지 않은 앱" 화면이 나오면 고급 → 페이스(으)로 이동을 누르세요. 이 메일의 링크(페이스 앱 주소)에서만 그렇게 하시면 됩니다.
※ 로그인이 안 되거나 내용이 비어 보이면 이 메일을 보낸 사람에게 알려 주세요.`

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 관리 › 팀원 초대(팀장 · 관리자). 내 계정으로 Google 연결한
// 뒤에만 초대 대상자 추가/삭제와 메일 발송 폼이 보인다.
export default function AdminInvitePanel() {
  const configured = isAdminConfigured()
  const [connected, setConnected] = useState(isAdminConnected())
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const [list, setList] = useState<InviteRecipient[]>(() => loadInviteList())
  const [pasteText, setPasteText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(defaultBody)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: { email: string; error: string }[] } | null>(null)
  const [copyDone, setCopyDone] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!configured) {
    return <p className="px-1 py-6 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-3">Google 연동이 설정되지 않았습니다. 관리자에게 설정을 요청해주세요.</p>
  }

  async function handleConnect() {
    setConnecting(true)
    setConnectError(null)
    try {
      await connectAdmin()
      setConnected(true)
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : '연결에 실패했습니다.')
    } finally {
      setConnecting(false)
    }
  }

  function handleAddPaste() {
    setParseError(null)
    const { entries, invalid } = parseInviteText(pasteText)
    if (entries.length === 0) {
      setParseError('추가할 수 있는 이메일이 없습니다.')
      return
    }
    setList(addEntriesToList(entries))
    setPasteText('')
    if (invalid.length > 0) setParseError(`형식이 올바르지 않아 건너뛴 항목: ${invalid.join(', ')}`)
  }

  async function handleExcelUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setParseError(null)
    try {
      const buffer = await file.arrayBuffer()
      const { entries } = parseInviteWorkbook(buffer)
      if (entries.length === 0) {
        setParseError('파일에서 이메일 형식의 값을 찾지 못했습니다.')
        return
      }
      setList(addEntriesToList(entries))
    } catch {
      setParseError('엑셀 파일을 읽지 못했습니다.')
    }
  }

  function handleRemove(email: string) {
    setList(removeEmailFromList(email))
  }

  async function handleCopyList() {
    try {
      await navigator.clipboard.writeText(list.map((r) => r.email).join('\n'))
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 1500)
    } catch {
      setParseError('클립보드 복사에 실패했습니다.')
    }
  }

  async function handleSend() {
    if (list.length === 0) return
    setSending(true)
    setSendResult(null)
    try {
      const bad = list.filter((r) => r.sendTo && !isEmail(r.sendTo))
      if (bad.length) throw new Error(`받는 메일 모양이 틀렸습니다: ${bad.map((r) => r.sendTo).join(', ')}`)
      const result = await sendInviteEmails(list, subject, body)
      setList(loadInviteList())
      setSendResult({ sent: result.sent.length, failed: result.failed })
    } catch (err) {
      setSendResult({ sent: 0, failed: [{ email: '-', error: err instanceof Error ? err.message : '발송 실패' }] })
    } finally {
      setSending(false)
    }
  }

  if (!connected) {
    return (
      <section className="max-w-3xl rounded-card border border-separator p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
            <Mail size={22} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">초대 메일을 보내려면 내 Google 계정을 연결하세요</h3>
            <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed text-label-2">
              연결한 Gmail 이름으로 팀원들에게 앱 링크가 든 초대 메일을 보냅니다. 팀장 · 관리자만 보낼 수 있습니다(역할은 「권한 · 시트 설정」 탭에서 정함).
            </p>
            <Button variant="primary" onClick={() => void handleConnect()} disabled={connecting} className="mt-4 h-10 px-5 text-[length:calc(14px*var(--ui-fs,1))]">
              {connecting ? <Spinner className="h-4 w-4 text-white" /> : <Mail size={16} strokeWidth={1.9} />}
              {connecting ? '연결하는 중...' : '내 Google 계정으로 연결'}
            </Button>
            {connectError && <p className="mt-2 text-[length:calc(14px*var(--ui-fs,1))] text-danger">{connectError}</p>}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="max-w-6xl space-y-5">
      <p className="flex flex-wrap items-center gap-2 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
        보내는 계정 <b className="font-semibold text-label">{getAdminEmail()}</b>
        <span className="mac-badge bg-success/15 text-success">연결됨</span>
      </p>

      {/* 1. 받는 사람: 붙여넣기(왼쪽) · 설명(오른쪽) → 아래에 넓은 표 */}
      <section className="rounded-card border border-separator p-5">
        <h3 className="flex items-center gap-2 text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[length:calc(13px*var(--ui-fs,1))] font-bold text-white">1</span>
          받는 사람
          <span className="text-[length:calc(14px*var(--ui-fs,1))] font-normal text-label-3">{list.length}명</span>
        </h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'hong.gildong, hong@company.com, 홍길동\nkim.cheolsu, kim@company.com, 김철수'}
              rows={4}
              className="w-full rounded-control border border-hairline px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed outline-none focus:border-accent"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={handleAddPaste} disabled={!pasteText.trim()}>
                목록에 추가
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet {...icSm} />
                엑셀로 추가
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void handleExcelUpload(e)} />
              {parseError && <span className="text-[length:calc(14px*var(--ui-fs,1))] text-danger">{parseError}</span>}
            </div>
          </div>
          <div className="rounded-card bg-subtle p-3.5 text-[length:calc(13.5px*var(--ui-fs,1))] leading-relaxed text-label-2">
            <p className="font-semibold text-label">한 줄에 한 명</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                <b>로그인할 Gmail</b> · 권한 · 로그인용(아이디만 적어도 됨)
              </li>
              <li>
                <b>받는 메일</b> · 회사 메일 등, 없으면 Gmail로
              </li>
              <li>
                <b>이름</b>
              </li>
            </ul>
            <p className="mt-1.5 text-label-3">쉼표나 탭으로 나눕니다. 엑셀은 한 행에 한 명(열 순서 상관없음).</p>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-separator px-4 py-6 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-3">아직 추가된 받는 사람이 없습니다.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-card border border-separator">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-[length:calc(14px*var(--ui-fs,1))]">
                <thead className="sticky top-0 z-10 bg-subtle text-left text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
                  <tr>
                    <th className="px-3 py-2 font-medium">이름</th>
                    <th className="px-3 py-2 font-medium">로그인할 Gmail</th>
                    <th className="px-3 py-2 font-medium">받는 메일 <span className="font-normal text-label-3">(비우면 Gmail로)</span></th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="w-10 px-2 py-2 text-right">
                      <button onClick={() => void handleCopyList()} className="whitespace-nowrap text-[length:calc(13px*var(--ui-fs,1))] font-medium text-accent hover:underline">
                        {copyDone ? '복사됨' : '목록 복사'}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.email} className="border-t border-separator">
                      <td className="px-3 py-2 font-medium text-label">{r.name || <span className="text-label-3">-</span>}</td>
                      <td className="px-3 py-2 text-label">{r.email}</td>
                      <td className="px-3 py-1.5">
                        <SendToInput r={r} onSave={(v) => setList(setSendTo(r.email, v))} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))]">
                        {r.lastInvitedAt ? (
                          <span className="text-success" title={r.lastSentTo && r.lastSentTo !== r.email ? `→ ${r.lastSentTo}` : undefined}>
                            발송됨 · {fmt(r.lastInvitedAt)}
                          </span>
                        ) : (
                          <span className="text-label-3">미발송</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <IconButton tone="danger" onClick={() => handleRemove(r.email)} title="삭제" aria-label="삭제">
                          <Trash2 {...icSm} />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 2. 메일 내용 + 발송 */}
      <section className="rounded-card border border-separator p-5">
        <h3 className="flex items-center gap-2 text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[length:calc(13px*var(--ui-fs,1))] font-bold text-white">2</span>
          메일 내용
        </h3>
        <label className="mt-3 block text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2">제목</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 h-10 w-full rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent"
        />
        <label className="mt-3 block text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2">본문</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="mt-1 w-full rounded-control border border-hairline px-3 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed outline-none focus:border-accent"
        />
        <p className="mt-1.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">
          앱 주소만 있는 줄은 받은 메일에서 「앱 바로 열기」 버튼으로 보입니다. <code>{LOGIN_TOKEN}</code>은 사람마다 그 사람의 로그인 Gmail로 바뀝니다.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-separator pt-4">
          <p className="text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
            받은 사람은 링크로 <b>로그인할 Gmail</b>에 바로 로그인합니다. 추진현황을 보고 저장하려면 그 Gmail에 <b>과제(추진현황) 시트 공유</b>(편집자)가
            필요합니다.
          </p>
          <Button variant="primary" onClick={() => void handleSend()} disabled={sending || list.length === 0} className="h-10 px-5 text-[length:calc(14px*var(--ui-fs,1))]">
            {sending ? <Spinner className="h-4 w-4 text-white" /> : <Send size={16} strokeWidth={1.9} />}
            {sending ? '발송 중...' : `초대 메일 보내기 (${list.length}명)`}
          </Button>
        </div>
        {sendResult && (
          <div
            className={`mt-3 rounded-card px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] ${sendResult.failed.length > 0 ? 'bg-danger/[0.06] text-danger' : 'bg-success/[0.08] text-success'}`}
          >
            <p>
              {sendResult.sent}건 발송 성공{sendResult.failed.length > 0 ? `, ${sendResult.failed.length}건 실패` : ''}
            </p>
            {sendResult.failed.length > 0 && (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {sendResult.failed.map((f) => (
                  <li key={f.email}>
                    {f.email}: {f.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// 받는 메일 칸: 칸을 떠날 때(Enter) 저장. 비우면 로그인 Gmail로 보낸다.
function SendToInput({ r, onSave }: { r: InviteRecipient; onSave: (v: string) => void }) {
  const [v, setV] = useState(r.sendTo ?? '')
  const bad = !!v.trim() && !isEmail(v)
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => !bad && onSave(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="같으면 비워 둠"
      title={`보낼 곳: ${mailOf({ ...r, sendTo: v })}`}
      className={`h-8 w-full min-w-[200px] rounded-control border px-2 text-[length:calc(14px*var(--ui-fs,1))] text-label outline-none focus:border-accent ${bad ? 'border-danger/60' : 'border-hairline'}`}
    />
  )
}

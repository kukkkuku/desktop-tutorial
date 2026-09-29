import { useRef, useState, type ChangeEvent } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'
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

// OAuth 테스트 사용자 등록 화면(프로젝트 493396486126, 이 앱의 Gmail API와
// 같은 GCP 프로젝트) 바로가기 -- 매번 콘솔에서 찾아 들어가는 수고를 던다.
const TEST_USERS_CONSOLE_URL = 'https://console.cloud.google.com/apis/credentials/consent?project=493396486126'
const DEFAULT_SUBJECT = '페이스(과제 · 성과관리) 앱 초대'
// 앱 주소는 지금 보고 있는 앱(운영/미리보기) + 권한 관리 시트(?access=) -- 이 링크로 열면 팀원 앱이 그 시트를 읽는다
const defaultBody = () => `안녕하세요, 팀 과제 · 성과관리 앱 「페이스」에 초대합니다.

아래 링크에서 Google 계정으로 로그인하시면 바로 사용하실 수 있습니다.
${appInviteUrl()}

로그인할 Google 계정: ${LOGIN_TOKEN}
(이 계정으로 권한이 정해져 있습니다. 다른 계정으로 로그인하면 메뉴가 다르게 보일 수 있습니다.)

※ 로그인이 안 되면 이 메일을 보낸 사람에게 알려 주세요(구글 테스트 사용자 등록이 필요할 수 있습니다).`

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
    return <p className="px-1 py-6 text-center text-[13px] text-label-3">Google 연동이 설정되지 않았습니다. 관리자에게 설정을 요청해주세요.</p>
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
      <div className="space-y-3">
        <p className="text-[13px] text-label-2">내 Google 계정(Gmail)으로 연결하면 그 계정 이름으로 팀원들에게 초대 메일을 보낼 수 있습니다.</p>
        <p className="text-[13px] text-label-3">팀장 · 관리자만 보낼 수 있습니다(권한 시트 역할).</p>
        <Button variant="primary" onClick={() => void handleConnect()} disabled={connecting} className="w-full">
          {connecting && <Spinner className="h-3.5 w-3.5 text-white" />}
          {connecting ? '연결하는 중...' : '내 Google 계정으로 연결'}
        </Button>
        {connectError && <p className="text-[13px] text-danger">{connectError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-card bg-[#F7F7F9] px-3 py-2">
        <span className="flex items-center gap-2 text-[13px] text-label">
          {getAdminEmail()}
          <span className="mac-badge bg-success/15 text-success">연결됨</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 왼쪽: 받는 사람 추가 + 목록 */}
        <div className="space-y-4">
          <div>
            <p className="text-[13px] font-semibold text-label">받는 사람 추가</p>
            <p className="mt-0.5 text-[13px] text-label-2">
              한 줄에 한 명: <b>로그인할 Gmail</b>(권한 · 로그인용, 아이디만 적어도 됨), <b>받는 메일</b>(회사 메일 등, 없으면 Gmail로), <b>이름</b>. 쉼표나
              탭으로 나눕니다. 엑셀은 한 행에 한 명(열 순서 상관없음).
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'hong.gildong, hong@company.com, 홍길동\nkim.cheolsu'}
              rows={3}
              className="py-1.5 rounded-control border border-hairline px-2.5 text-[13px] mt-2 w-full"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={handleAddPaste} disabled={!pasteText.trim()}>
                목록에 추가
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                엑셀로 추가
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void handleExcelUpload(e)} />
            </div>
            {parseError && <p className="mt-1.5 text-[13px] text-danger">{parseError}</p>}
          </div>

          <div className="border-t border-separator pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-label">받는 사람 목록 ({list.length}명)</p>
              {list.length > 0 && (
                <button onClick={() => void handleCopyList()} className="text-[13px] font-medium text-accent hover:underline">
                  {copyDone ? '복사됨' : '목록 복사'}
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="mt-2 text-[13px] text-label-3">아직 추가된 받는 사람이 없습니다.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {list.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-2 rounded-control border border-separator px-2.5 py-1.5 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-label" title="로그인할 Gmail(권한 · 로그인용)">
                        {r.name && <b className="mr-1.5">{r.name}</b>}
                        {r.email}
                      </p>
                      {/* 받는 메일: 비우면 로그인 Gmail로 보낸다 */}
                      <label className="mt-1 flex items-center gap-1.5 text-[12px] text-label-3">
                        받는 메일
                        <SendToInput r={r} onSave={(v) => setList(setSendTo(r.email, v))} />
                      </label>
                      <p className="mt-0.5 text-[12px] text-label-3">
                        {r.lastInvitedAt ? `발송됨 · ${fmt(r.lastInvitedAt)}${r.lastSentTo && r.lastSentTo !== r.email ? ` → ${r.lastSentTo}` : ''}` : '미발송'}
                      </p>
                    </div>
                    <IconButton tone="danger" onClick={() => handleRemove(r.email)} title="삭제" aria-label="삭제" className="shrink-0">
                      <Trash2 {...icSm} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 rounded-card bg-accent-soft px-3 py-2.5 text-[13px] text-label-2">
              <p>
                메일 발송과 별개로, <b>로그인할 Gmail</b>이 실제로 로그인까지 하려면 Google Cloud Console의 테스트 사용자 목록에도 등록해야 합니다. 위 "목록
                복사"(로그인 Gmail만 복사)로 복사한 뒤, 아래 링크에서 "+ ADD USERS"로 붙여넣으면 됩니다.
              </p>
              <a
                href={TEST_USERS_CONSOLE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                테스트 사용자 등록 페이지 열기 <ArrowRight {...icSm} />
              </a>
            </div>
          </div>
        </div>

        {/* 오른쪽: 메일 내용 + 발송 */}
        <div className="space-y-3 border-l border-separator pl-6">
          <p className="text-[13px] font-semibold text-label">초대 메일 내용</p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 rounded-control border border-hairline px-2.5 text-[13px] w-full"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="py-1.5 rounded-control border border-hairline px-2.5 text-[13px] w-full"
          />
          <p className="text-[12px] text-label-3">
            앱 주소만 있는 줄은 받은 메일에서 「앱 바로 열기」 버튼으로 보입니다(누르면 바로 접속). <code>{LOGIN_TOKEN}</code>은 사람마다 그 사람의 로그인
            Gmail로 바뀝니다.
          </p>
          <Button variant="primary" onClick={() => void handleSend()} disabled={sending || list.length === 0} className="w-full">
            {sending && <Spinner className="h-3.5 w-3.5 text-white" />}
            {sending ? '발송 중...' : `초대 메일 발송 (${list.length}명)`}
          </Button>
          {sendResult && (
            <div
              className={`rounded-card px-3 py-2 text-[13px] ${sendResult.failed.length > 0 ? 'bg-danger/[0.06] text-danger' : 'bg-success/[0.08] text-success'}`}
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
        </div>
      </div>
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
      placeholder={`${r.email} (같으면 비워 둠)`}
      title={`보낼 곳: ${mailOf({ ...r, sendTo: v })}`}
      className={`h-6 min-w-0 flex-1 rounded border px-1.5 text-[12px] text-label outline-none focus:border-accent ${bad ? 'border-danger/60' : 'border-hairline'}`}
    />
  )
}

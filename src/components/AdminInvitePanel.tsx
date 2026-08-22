import { useRef, useState, type ChangeEvent } from 'react'
import {
  ADMIN_EMAILS,
  addEmailsToList,
  connectAdmin,
  getAdminEmail,
  isAdminConfigured,
  isAdminConnected,
  loadInviteList,
  parseEmailText,
  parseEmailWorkbook,
  removeEmailFromList,
  sendInviteEmails,
  type InviteRecipient,
} from '../utils/adminInvite'
import Button from './Button'
import Spinner from './Spinner'

const APP_URL = 'https://kukkkuku.github.io/desktop-tutorial/preview-v2/'
const DEFAULT_SUBJECT = '성과·성장관리 앱 초대'
const DEFAULT_BODY = `안녕하세요, 팀 성과·성장관리 앱에 초대합니다.

아래 링크에서 Google 계정으로 로그인하시면 바로 사용하실 수 있습니다.
${APP_URL}

※ 로그인이 안 되면 관리자에게 문의해주세요(테스트 사용자 등록이 필요할 수 있습니다).`

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// "데이터 관리" 드로어의 관리자 탭 내용. 관리자 계정으로 Google 연결한
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
  const [body, setBody] = useState(DEFAULT_BODY)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: { email: string; error: string }[] } | null>(null)
  const [copyDone, setCopyDone] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!configured) {
    return <p className="px-1 py-6 text-center text-sm text-gray-400">Google 연동이 설정되지 않았습니다. 관리자에게 설정을 요청해주세요.</p>
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
    const { emails, invalid } = parseEmailText(pasteText)
    if (emails.length === 0) {
      setParseError('추가할 수 있는 이메일이 없습니다.')
      return
    }
    setList(addEmailsToList(emails))
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
      const { emails } = parseEmailWorkbook(buffer)
      if (emails.length === 0) {
        setParseError('파일에서 이메일 형식의 값을 찾지 못했습니다.')
        return
      }
      setList(addEmailsToList(emails))
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
      const result = await sendInviteEmails(list.map((r) => r.email), subject, body)
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
        <p className="text-sm text-gray-600">관리자 계정으로 Google 연결하면 팀원들에게 초대 메일을 보낼 수 있습니다.</p>
        <p className="text-xs text-gray-400">허용된 관리자: {ADMIN_EMAILS.join(', ')}</p>
        <Button
          variant="primary"
          onClick={() => void handleConnect()}
          disabled={connecting}
          className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5"
        >
          {connecting && <Spinner className="h-3.5 w-3.5 text-white" />}
          {connecting ? '연결하는 중...' : '관리자로 Google 연결'}
        </Button>
        {connectError && <p className="text-xs text-danger">{connectError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
        <span className="flex items-center gap-2 text-sm text-gray-700">
          {getAdminEmail()}
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">관리자 연결됨</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 왼쪽: 받는 사람 추가 + 목록 */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-black">받는 사람 추가</p>
            <p className="mt-0.5 text-xs text-gray-500">
              모두 Gmail이면 아이디만 적어도 됩니다(@gmail.com 자동 추가). 줄바꿈/쉼표로 구분해 붙여넣거나, 엑셀 파일을 업로드하세요.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'hong.gildong\nkim.cheolsu'}
              rows={3}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={handleAddPaste} disabled={!pasteText.trim()} className="px-3 py-1.5 text-sm">
                목록에 추가
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm">
                엑셀로 추가
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void handleExcelUpload(e)} />
            </div>
            {parseError && <p className="mt-1.5 text-xs text-danger">{parseError}</p>}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-black">받는 사람 목록 ({list.length}명)</p>
              {list.length > 0 && (
                <button onClick={() => void handleCopyList()} className="text-xs font-medium text-accent hover:underline">
                  {copyDone ? '복사됨' : '목록 복사'}
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">아직 추가된 받는 사람이 없습니다.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {list.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate text-black">{r.email}</p>
                      <p className="text-[11px] text-gray-400">{r.lastInvitedAt ? `발송됨 · ${fmt(r.lastInvitedAt)}` : '미발송'}</p>
                    </div>
                    <button onClick={() => handleRemove(r.email)} className="shrink-0 text-gray-400 hover:text-danger">
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 rounded-md bg-blue-50 px-2.5 py-2 text-[11px] text-gray-600">
              메일 발송과 별개로, 이 이메일들이 실제로 로그인까지 하려면 Google Cloud Console → OAuth 동의 화면 → 테스트 사용자에도 등록해야
              합니다. 위 "목록 복사"로 복사해 그대로 붙여넣으면 됩니다.
            </p>
          </div>
        </div>

        {/* 오른쪽: 메일 내용 + 발송 */}
        <div className="space-y-3 border-l border-gray-100 pl-6">
          <p className="text-sm font-semibold text-black">초대 메일 내용</p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <Button
            variant="primary"
            onClick={() => void handleSend()}
            disabled={sending || list.length === 0}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5"
          >
            {sending && <Spinner className="h-3.5 w-3.5 text-white" />}
            {sending ? '발송 중...' : `초대 메일 발송 (${list.length}명)`}
          </Button>
          {sendResult && (
            <div className={`rounded-md px-2.5 py-2 text-xs ${sendResult.failed.length > 0 ? 'bg-red-50 text-danger' : 'bg-green-50 text-green-700'}`}>
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

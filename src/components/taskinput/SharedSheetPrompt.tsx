// 추진현황 시트 고르기: 먼저 관리자가 공유한 시트를 「파일 제목 › 탭 제목」으로 보여 주고 "이 시트로 연결할까요?",
// 아니면 아래에서 공유받은 다른 링크를 붙여 넣는다(처음부터 링크를 치게 하지 않는다).
// 파일 제목을 읽으려면 구글 권한 창이 떠야 해서(자동으로 띄우면 막힘) 모르면 "시트 이름 확인"을 눌러 읽고,
// 한 번 읽은(또는 불러온 적 있는) 이름은 이 브라우저에 기억한다.
import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import Button from '../Button'
import Spinner from '../Spinner'
import { fetchSpreadsheetTabs, parseSheetUrl, pickDefaultTab } from '../../utils/sheetSources'

const metaKey = (id: string) => `sheet-meta:${id}`
export function readSheetMeta(id: string | undefined | null): { title: string; tab: string } | null {
  if (!id) return null
  try {
    const v = JSON.parse(localStorage.getItem(metaKey(id)) ?? 'null')
    return v && typeof v.title === 'string' ? v : null
  } catch {
    return null
  }
}
export function writeSheetMeta(id: string, title: string, tab: string) {
  try {
    localStorage.setItem(metaKey(id), JSON.stringify({ title, tab }))
  } catch {
    // 이름을 기억 못 해도 연결은 된다
  }
}

export default function SharedSheetPrompt({
  url,
  label,
  tab,
  year,
  busy,
  readOnlyNote,
  onConnect,
}: {
  url: string // 먼저 권할 시트(관리자가 공유한 시트)
  label: string // 예: "관리자가 공유한 시트"
  tab?: string | null // 이 시트에서 열 탭(이 브라우저에서 마지막으로 연 탭)
  year: number
  busy?: boolean
  readOnlyNote?: string // 운영 팀 시트 등: 읽기만 한다는 안내
  onConnect: (url: string) => void
}) {
  const id = parseSheetUrl(url)?.spreadsheetId
  const [meta, setMeta] = useState(() => readSheetMeta(id))
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [pasting, setPasting] = useState(false)
  const [link, setLink] = useState('')

  async function check() {
    if (!id) return
    setChecking(true)
    setCheckError('')
    try {
      const info = await fetchSpreadsheetTabs(id)
      const t = (tab && info.tabs.some((x) => x.title === tab) ? tab : pickDefaultTab(info.tabs, year)) ?? ''
      writeSheetMeta(id, info.title, t)
      setMeta({ title: info.title, tab: t })
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : '시트를 읽지 못했습니다.')
    } finally {
      setChecking(false)
    }
  }

  const tabName = tab ?? meta?.tab
  return (
    <div className="text-left">
      <p className="text-[12px] font-semibold text-label-3">{label}</p>
      <div className="mt-1.5 flex items-center gap-2 rounded-control border border-separator bg-subtle px-3 py-2">
        <FileSpreadsheet size={16} strokeWidth={1.8} className="shrink-0 text-success" />
        {meta ? (
          <span className="min-w-0 flex-1 truncate text-[13px] text-label" title={url}>
            <b className="font-semibold">{meta.title}</b>
            {tabName && <span className="text-label-2"> › {tabName}</span>}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-label-2" title={url}>
            {url}
          </span>
        )}
        {!meta && id && (
          <button onClick={() => void check()} disabled={checking} className="shrink-0 text-[12px] font-medium text-accent hover:underline disabled:opacity-50">
            {checking ? <Spinner className="h-3.5 w-3.5" /> : '시트 이름 확인'}
          </button>
        )}
      </div>
      {checkError && <p className="mt-1 text-[12px] text-danger">{checkError}</p>}
      {readOnlyNote && <p className="mt-1 text-[12px] text-label-3">{readOnlyNote}</p>}
      <p className="mt-2.5 text-[13px] text-label">
        {meta ? `「${meta.title}${tabName ? ` › ${tabName}` : ''}」 시트로 연결할까요?` : '이 시트로 연결할까요?'}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button onClick={() => setPasting((v) => !v)} className="text-[12.5px] font-medium text-label-2 hover:text-accent">
          {pasting ? '닫기' : '아니요, 공유받은 다른 링크 붙여넣기'}
        </button>
        <Button variant="primary" size="sm" onClick={() => onConnect(url)} disabled={busy}>
          {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
          연결
        </Button>
      </div>
      {pasting && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (link.trim()) onConnect(link.trim())
          }}
          className="mt-2 flex gap-2"
        >
          <input
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="h-8 min-w-0 flex-1 rounded-control border border-hairline px-2.5 text-[12.5px] outline-none focus:border-accent"
          />
          <Button variant="secondary" size="sm" type="submit" disabled={!link.trim() || busy}>
            이 링크로 연결
          </Button>
        </form>
      )}
    </div>
  )
}

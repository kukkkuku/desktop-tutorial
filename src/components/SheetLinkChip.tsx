// 연결된 구글시트 칩 -- 누르면 연결 정보와 링크 입력창이 뜬다(다른 시트로 바꿔 연결 · 다시 불러오기 · 시트 열기).
// 과제관리(성과관리)와 과제 입력(추진현황)이 같이 쓴다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ExternalLink, RotateCw } from 'lucide-react'
import Button from './Button'
import SheetsIcon from './SheetsIcon'
import { icSm } from './ui/icon'
import { parseSheetUrl } from '../utils/sheetSources'

export default function SheetLinkChip({
  label,
  sub,
  meta,
  currentUrl,
  openUrl,
  note,
  onConnect,
  onReload,
  reloadDisabled,
  reloading,
  extra,
}: {
  label: string // 시트 파일 이름
  sub?: string // 탭 이름(마우스를 올리면 보임)
  meta?: ReactNode // 옆에 붙는 작은 표시(예: "3시간 전")
  currentUrl: string | null // 링크 입력창에 미리 채울 주소(xlsx면 null)
  openUrl?: string | null // "시트 열기" 주소
  note?: ReactNode // 팝오버 안 설명
  onConnect: (url: string) => void
  onReload?: () => void
  reloadDisabled?: boolean
  reloading?: boolean
  extra?: ReactNode // 팝오버 맨 아래 추가 동작(예: xlsx 올리기)
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(currentUrl ?? '')
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setUrl(currentUrl ?? '')
    setError('')
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, currentUrl])

  function submit() {
    if (!parseSheetUrl(url)) {
      setError('구글시트 링크를 알아볼 수 없습니다. 주소창의 https://docs.google.com/spreadsheets/d/... 전체를 붙여넣어 주세요.')
      return
    }
    setOpen(false)
    onConnect(url.trim())
  }

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-1.5 text-xs text-label-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`${label}${sub ? ` › ${sub}` : ''}\n눌러서 연결 링크 바꾸기`}
        className={`flex max-w-[320px] items-center gap-1.5 rounded-control px-1.5 py-1 font-medium hover:bg-black/[0.05] hover:text-label ${open ? 'bg-black/[0.05] text-label' : ''}`}
      >
        <SheetsIcon className="h-4 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown size={12} strokeWidth={2} className="shrink-0 text-label-3" />
      </button>
      {meta}
      {onReload && (
        <button
          onClick={onReload}
          disabled={reloadDisabled || reloading}
          title="시트에서 다시 불러오기"
          aria-label="시트에서 다시 불러오기"
          className="flex h-7 w-7 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-accent disabled:opacity-40"
        >
          <RotateCw {...icSm} className={reloading ? 'animate-spin' : ''} />
        </button>
      )}

      {open && (
        <div className="mac-pop absolute right-0 top-full z-50 mt-1.5 w-[440px] p-3 text-[13px]">
          <p className="font-semibold text-label">연결된 구글시트</p>
          <p className="mt-0.5 truncate text-[12px] text-label">
            {label}
            {sub && <span className="text-label-3"> › {sub}</span>}
          </p>
          {note && <div className="mt-0.5 text-[12px] text-label-2">{note}</div>}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="mt-2 flex gap-1.5"
          >
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="h-8 min-w-0 flex-1 rounded-control border border-hairline bg-white px-2.5 text-[12px]"
            />
            <Button variant="primary" size="sm" type="submit" disabled={!url.trim()}>
              연결
            </Button>
          </form>
          {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
          {(openUrl || extra) && (
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-separator pt-2">
              {openUrl ? (
                <a href={openUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
                  <ExternalLink {...icSm} />
                  구글시트로 바로 가기
                </a>
              ) : (
                <span />
              )}
              {extra}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

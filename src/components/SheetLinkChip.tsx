// 연결된 구글시트 칩 -- 시트 아이콘과 다시 불러오기만 보이고, 아이콘을 누르면 파일·탭 이름, 불러온 때,
// 링크 입력창이 뜬다(다른 시트로 바꿔 연결 · 시트 열기).
// 과제관리(성과관리)와 과제 입력(추진현황)이 같이 쓴다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, RotateCw } from 'lucide-react'
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
  meta?: ReactNode // 팝오버 안 이름 옆 작은 표시(예: "3시간 전")
  currentUrl: string | null // 링크 입력창에 미리 채울 주소(xlsx면 null)
  openUrl?: string | null // "시트 열기" 주소
  note?: ReactNode // 팝오버 안 설명
  onConnect?: (url: string) => void // 없으면 링크 입력칸을 숨긴다(관리자만 연결을 바꾼다)
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
    onConnect?.(url.trim())
  }

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-1.5 text-xs text-label-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`${label}${sub ? ` › ${sub}` : ''}\n눌러서 연결 정보 보기·링크 바꾸기`}
        aria-label="연결된 구글시트"
        className={`flex h-7 w-7 items-center justify-center rounded-control hover:bg-black/[0.05] ${open ? 'bg-black/[0.05]' : ''}`}
      >
        <SheetsIcon className="h-4 w-3.5 shrink-0" />
      </button>
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
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-label">
            <span className="min-w-0 truncate">
              {label}
              {sub && <span className="text-label-3"> › {sub}</span>}
            </span>
            {meta && <span className="shrink-0">{meta}</span>}
          </div>
          {note && <div className="mt-0.5 text-[12px] text-label-2">{note}</div>}
          {onConnect && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="mt-2 flex gap-1.5"
          >
            <input
              autoFocus={!!onConnect}
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
          )}
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

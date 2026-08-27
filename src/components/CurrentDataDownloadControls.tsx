import { useEffect, useRef, useState } from 'react'
import Spinner from './Spinner'
import Button from './Button'

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

interface CurrentDataDownloadControlsProps {
  label?: string
  disabled?: boolean
  onExcelDownload: () => void | Promise<void>
  onPdfDownload: () => void | Promise<void>
}

// 빈 양식(TitleUploadControls)과 짝을 이루는, "지금 입력된 데이터"를 그대로
// 리포트로 내려받는 버튼. 클릭하면 엑셀/PDF 중 원하는 형식을 골라(둘 다 가능)
// 한 번에 받을 수 있는 팝오버가 열린다. 내려받을 데이터 자체가 없을 때는
// disabled로 꺼둔다 -- 빈 리포트를 받게 하지 않는다.
export default function CurrentDataDownloadControls({ label = '리포트 다운로드', disabled = false, onExcelDownload, onPdfDownload }: CurrentDataDownloadControlsProps) {
  const [open, setOpen] = useState(false)
  const [wantExcel, setWantExcel] = useState(true)
  const [wantPdf, setWantPdf] = useState(true)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleDownload() {
    if (!wantExcel && !wantPdf) return
    setBusy(true)
    try {
      if (wantExcel) await onExcelDownload()
      if (wantPdf) await onPdfDownload()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} disabled={disabled} className="flex items-center gap-1.5 px-3 py-1.5">
        <DownloadIcon className="h-4 w-4" /> {label}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-md border border-gray-200 bg-white p-3 shadow-md">
          <p className="text-xs font-semibold text-gray-500">받을 형식 선택</p>
          <div className="mt-2 space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-black hover:bg-gray-50">
              <input
                type="checkbox"
                checked={wantExcel}
                onChange={(e) => setWantExcel(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
              />
              엑셀
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-black hover:bg-gray-50">
              <input
                type="checkbox"
                checked={wantPdf}
                onChange={(e) => setWantPdf(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
              />
              PDF
            </label>
          </div>
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={busy || (!wantExcel && !wantPdf)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 px-3 py-1.5"
          >
            {busy && <Spinner className="h-3.5 w-3.5 text-white" />}
            {busy ? '생성 중...' : '다운로드'}
          </Button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import Spinner from './Spinner'

interface CurrentDataDownloadControlsProps {
  onExcelDownload: () => void | Promise<void>
  onPdfDownload: () => void | Promise<void>
}

// 빈 양식(TitleUploadControls)과 짝을 이루는, "지금 입력된 데이터"를 그대로
// 리포트로 내려받는 버튼. 클릭하면 엑셀/PDF 중 원하는 형식을 골라(둘 다 가능)
// 한 번에 받을 수 있는 팝오버가 열린다.
export default function CurrentDataDownloadControls({ onExcelDownload, onPdfDownload }: CurrentDataDownloadControlsProps) {
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100"
      >
        리포트 다운로드
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-md border border-gray-200 bg-white p-3 shadow-md">
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
          <button
            onClick={handleDownload}
            disabled={busy || (!wantExcel && !wantPdf)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Spinner className="h-3.5 w-3.5 text-white" />}
            {busy ? '생성 중...' : '다운로드'}
          </button>
        </div>
      )}
    </div>
  )
}

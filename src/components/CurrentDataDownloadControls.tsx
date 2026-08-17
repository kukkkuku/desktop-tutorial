import { useState } from 'react'
import Spinner from './Spinner'

interface CurrentDataDownloadControlsProps {
  onExcelDownload: () => void | Promise<void>
  onPdfDownload: () => void | Promise<void>
}

// 빈 양식(TitleUploadControls)과 짝을 이루는, "지금 입력된 데이터"를 그대로
// 내려받는 버튼 쌍. 엑셀은 원본 데이터 그대로, PDF는 한눈에 보는 요약
// 리포트(pdfReport.tsx 템플릿)로 만든다.
export default function CurrentDataDownloadControls({ onExcelDownload, onPdfDownload }: CurrentDataDownloadControlsProps) {
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null)

  async function handle(kind: 'excel' | 'pdf', fn: () => void | Promise<void>) {
    setBusy(kind)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {busy && (
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          {busy === 'excel' ? '엑셀 생성 중...' : 'PDF 생성 중...'}
        </span>
      )}
      <button
        onClick={() => handle('excel', onExcelDownload)}
        disabled={busy !== null}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        현재 데이터 다운로드
      </button>
      <button
        onClick={() => handle('pdf', onPdfDownload)}
        disabled={busy !== null}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        PDF 다운로드
      </button>
    </div>
  )
}

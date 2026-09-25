import { useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload, X } from 'lucide-react'
import Button from './Button'
import IconButton from './IconButton'
import Spinner from './Spinner'
import { ic, icSm } from './ui/icon'

interface UploadSummary {
  addedCount: number
  updatedCount: number
  errors: string[]
}

interface TitleUploadControlsProps {
  busyLabel: string
  onDownload: () => void | Promise<void>
  onFiles: (files: File[]) => Promise<UploadSummary>
}

// Compact 엑셀양식 다운로드 / 엑셀양식 업로드 pair for a section title row. Each
// management tab (과제/팀원/피어리뷰) owns its own instance -- upload results
// surface as a small dropdown right under the buttons instead of a shared
// panel elsewhere on the page.
export default function TitleUploadControls({ busyLabel, onDownload, onFiles }: TitleUploadControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<UploadSummary | null>(null)

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    setSummary(null)
    setBusy(true)
    const result = await onFiles(files)
    setBusy(false)
    setSummary(result)
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    handleFiles(files)
  }

  return (
    <div className="relative flex shrink-0 flex-wrap items-center gap-2">
      {busy && (
        <span className="flex items-center gap-1.5 text-[13px] text-label-2">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          {busyLabel}
        </span>
      )}
      <Button onClick={() => onDownload()} disabled={busy}>
        <Download {...ic} /> 빈양식 다운로드
      </Button>
      <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload {...ic} /> 엑셀데이터 업로드
      </Button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onInputChange} />

      {summary && (
        <div
          className="mac-pop absolute right-0 top-full z-30 mt-1.5 w-80 px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            <p className={`text-[13px] font-semibold ${summary.errors.length > 0 ? 'text-danger' : 'text-success'}`}>
              {summary.addedCount > 0 || summary.updatedCount > 0
                ? `신규 ${summary.addedCount}건 추가, 기존 ${summary.updatedCount}건 업데이트되었습니다.`
                : '변경된 건이 없습니다.'}
              {summary.errors.length > 0 && ` (${summary.errors.length}건 오류)`}
            </p>
            <IconButton onClick={() => setSummary(null)} title="닫기" aria-label="닫기" className="-mr-1 -mt-1 shrink-0">
              <X {...icSm} />
            </IconButton>
          </div>
          {summary.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-danger">
              {summary.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

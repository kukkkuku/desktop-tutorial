import { useRef, useState, type ChangeEvent } from 'react'
import Spinner from './Spinner'

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

// Compact 양식 다운로드 / 데이터 업로드 pair for a section title row. Each
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
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          {busyLabel}
        </span>
      )}
      <button
        onClick={() => onDownload()}
        disabled={busy}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        양식 다운로드
      </button>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md border-2 border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        데이터 업로드
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onInputChange} />

      {summary && (
        <div
          className={`absolute right-0 top-full z-10 mt-2 w-80 rounded-md border px-3 py-2.5 shadow-md ${
            summary.errors.length > 0 ? 'border-danger/30 bg-red-50' : 'border-success/30 bg-green-50'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className={`text-xs font-semibold ${summary.errors.length > 0 ? 'text-danger' : 'text-success'}`}>
              {summary.addedCount > 0 || summary.updatedCount > 0
                ? `신규 ${summary.addedCount}건 추가, 기존 ${summary.updatedCount}건 업데이트되었습니다.`
                : '변경된 건이 없습니다.'}
              {summary.errors.length > 0 && ` (${summary.errors.length}건 오류)`}
            </p>
            <button
              onClick={() => setSummary(null)}
              className="shrink-0 rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-black hover:bg-gray-100"
            >
              닫기
            </button>
          </div>
          {summary.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-danger">
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

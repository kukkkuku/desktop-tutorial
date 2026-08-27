import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import Spinner from './Spinner'

const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i

interface UploadSummary {
  addedCount: number
  updatedCount: number
  errors: string[]
}

interface EmptyStateDropzoneProps {
  title: string
  addHint: string
  busyLabel: string
  onDownloadTemplate: () => void | Promise<void>
  onFiles: (files: File[]) => Promise<UploadSummary>
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

// 목록이 비어있을 때 설명만 잔뜩 늘어놓는 대신, 그 자리에 바로 파일을
// 끌어다 놓거나 눌러서 업로드할 수 있는 영역을 둔다 -- 첫 화면(데이터 없음)과
// 데이터가 쌓인 뒤의 화면이 다르게 보이도록, 첫 화면 쪽에 실제로 할 수 있는
// 행동(업로드)을 바로 배치한다.
export default function EmptyStateDropzone({ title, addHint, busyLabel, onDownloadTemplate, onFiles }: EmptyStateDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
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
    void handleFiles(files)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (busy) return
    const files = Array.from(e.dataTransfer.files).filter((f) => FILE_NAME_PATTERN.test(f.name))
    void handleFiles(files)
  }

  return (
    <div className="mt-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragOver ? 'border-accent bg-blue-50' : 'border-gray-200 bg-gray-50 hover:bg-blue-50/40'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? <Spinner className="h-6 w-6 text-accent" /> : <UploadIcon className="h-6 w-6 text-gray-400" />}
        <p className="text-sm font-semibold text-black">{busy ? busyLabel : title}</p>
        {!busy && (
          <>
            <p className="text-xs text-gray-500">{addHint}</p>
            <p className="text-xs text-gray-400">엑셀 파일을 여기로 끌어다 놓거나 눌러서 업로드하세요 (.xlsx)</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void onDownloadTemplate()
              }}
              className="mt-1 text-xs font-medium text-accent underline hover:opacity-80"
            >
              빈양식 다운로드
            </button>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onInputChange} />

      {summary && (
        <div className={`mt-3 rounded-md border px-4 py-3 ${summary.errors.length > 0 ? 'border-danger/30 bg-red-50' : 'border-success/30 bg-green-50'}`}>
          <div className="flex items-start justify-between gap-4">
            <p className={`text-sm font-semibold ${summary.errors.length > 0 ? 'text-danger' : 'text-success'}`}>
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

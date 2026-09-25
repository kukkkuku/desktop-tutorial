import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Upload, X } from 'lucide-react'
import IconButton from './IconButton'
import Spinner from './Spinner'
import { icSm } from './ui/icon'

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
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragOver ? 'border-accent bg-accent-soft' : 'border-separator bg-[#F7F7F9] hover:bg-accent-soft/40'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {busy ? <Spinner className="h-6 w-6 text-accent" /> : <Upload size={24} strokeWidth={1.5} className="text-label-3" />}
        <p className="text-[13px] font-semibold text-label">{busy ? busyLabel : title}</p>
        {!busy && (
          <>
            <p className="text-[13px] text-label-2">{addHint}</p>
            <p className="text-[13px] text-label-3">엑셀 파일을 여기로 끌어다 놓거나 눌러서 업로드하세요 (.xlsx)</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void onDownloadTemplate()
              }}
              className="mt-1 text-[13px] font-medium text-accent hover:underline"
            >
              빈양식 다운로드
            </button>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onInputChange} />

      {summary && (
        <div className={`mt-3 rounded-card border px-4 py-3 ${summary.errors.length > 0 ? 'border-danger/30 bg-danger/[0.06]' : 'border-success/30 bg-success/[0.06]'}`}>
          <div className="flex items-start justify-between gap-4">
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

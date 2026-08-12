interface ImportFeedbackProps {
  addedCount: number
  updatedCount: number
  errors: string[]
  onDismiss: () => void
}

export default function ImportFeedback({ addedCount, updatedCount, errors, onDismiss }: ImportFeedbackProps) {
  const hasErrors = errors.length > 0
  const parts: string[] = []
  if (addedCount > 0) parts.push(`신규 ${addedCount}건 추가`)
  if (updatedCount > 0) parts.push(`기존 ${updatedCount}건 업데이트`)
  const summary = parts.length > 0 ? `${parts.join(', ')}되었습니다.` : '변경된 건이 없습니다.'

  return (
    <div
      className={`mt-4 rounded-md border px-4 py-3 ${
        hasErrors ? 'border-danger/30 bg-red-50' : 'border-success/30 bg-green-50'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${hasErrors ? 'text-danger' : 'text-success'}`}>
            {summary}
            {hasErrors && ` (${errors.length}건 오류)`}
          </p>
          {hasErrors && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-danger">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-black hover:bg-gray-100"
        >
          닫기
        </button>
      </div>
    </div>
  )
}

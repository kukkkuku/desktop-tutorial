import { useAppState } from '../state/AppContext'
import type { UploadsLog } from '../utils/uploadLog'

interface DataUploadBarProps {
  expanded: boolean
  onToggle: () => void
  uploadsLog: UploadsLog
}

// Always a single collapsed line. DataStage wraps this together with the
// upload panel in a `sticky bottom-0` container, so once the page scrolls
// past it this bar floats pinned to the bottom of the viewport, sitting on
// top of the table. Expanding it grows the panel above this bar via a
// max-height transition -- reads as sliding up out of the floating bar. The
// chevron points down while collapsed (more above once opened) and flips up
// once expanded (click to collapse it back).
export default function DataUploadBar({ expanded, onToggle, uploadsLog }: DataUploadBarProps) {
  const { state } = useAppState()
  const { tasks, members, peerReviews } = state
  const hasData = tasks.length > 0 || members.length > 0 || peerReviews.length > 0

  return (
    <button
      onClick={onToggle}
      className="flex w-full flex-wrap items-center gap-2 overflow-hidden rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100"
    >
      {hasData ? (
        <>
          <span className="shrink-0 text-xs font-medium text-gray-500">데이터 :</span>
          {(
            [
              { key: 'task' as const, count: tasks.length, fallback: `과제 ${tasks.length}건` },
              { key: 'member' as const, count: members.length, fallback: `팀원 ${members.length}명` },
              { key: 'peer' as const, count: peerReviews.length, fallback: `피어리뷰 ${peerReviews.length}건` },
            ] as { key: keyof UploadsLog; count: number; fallback: string }[]
          )
            .filter((item) => item.count > 0)
            .map((item) => {
              const record = uploadsLog[item.key]
              return (
                <span
                  key={item.key}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-black"
                >
                  {record ? (
                    <>
                      <span>{record.name}</span>
                      <span className="text-gray-400">{record.date}</span>
                    </>
                  ) : (
                    <span>{item.fallback}</span>
                  )}
                </span>
              )
            })}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-gray-500">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m17 8-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
          <span className="shrink-0 text-sm font-medium text-gray-600">통합 업로드</span>
          <span className="truncate text-xs text-gray-400">— 과제·팀원·피어리뷰 데이터를 한 번에 업로드하거나 초기화</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </>
      )}
    </button>
  )
}

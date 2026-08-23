import IconButton from './IconButton'
import ImportFromPreviousPanel from './ImportFromPreviousPanel'

interface ImportFromPreviousDialogProps {
  teamName: string
  currentWorkspaceId: string
  onClose: () => void
}

// 화면 어디서든 띄울 수 있는 독립 다이얼로그 -- 실제 내용(원본 평가 선택,
// 가져오기 항목 체크, 가져오기 실행)은 빠른 시작 팝업의 탭과 공유하는
// ImportFromPreviousPanel에 있다.
export default function ImportFromPreviousDialog({ teamName, currentWorkspaceId, onClose }: ImportFromPreviousDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-black">이전 평가에서 가져오기</h3>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </IconButton>
        </div>
        <ImportFromPreviousPanel teamName={teamName} currentWorkspaceId={currentWorkspaceId} onCancel={onClose} />
      </div>
    </div>
  )
}

import EvaluationPeriodPicker from './EvaluationPeriodPicker'
import IconButton from './IconButton'

interface AddPeriodModalProps {
  teamName: string
  onDone: (workspaceId: string) => void
  onClose: () => void
}

export default function AddPeriodModal({ teamName, onDone, onClose }: AddPeriodModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">평가 기간 선택</h3>
            <p className="mt-1 text-sm text-gray-600">'{teamName}' 팀의 평가 기간을 고릅니다.</p>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </IconButton>
        </div>

        <div className="mt-4">
          <EvaluationPeriodPicker teamName={teamName} onDone={onDone} />
        </div>
      </div>
    </div>
  )
}

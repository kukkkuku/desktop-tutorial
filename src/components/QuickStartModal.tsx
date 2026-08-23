import { useState, type ReactNode } from 'react'
import ImportFromPreviousDialog from './ImportFromPreviousDialog'
import IconButton from './IconButton'

interface QuickStartModalProps {
  teamName: string
  currentWorkspaceId: string
  hasOtherPeriods: boolean
  onClose: () => void
  // "Excel로 시작" -- 이미 데이터 관리 > 로컬 파일 탭에 있는 "전체 일괄
  // 업로드"(과제·팀원·피어리뷰 자동 구분)를 그대로 쓴다. 여기서 새로
  // 만들지 않고 그 화면을 열어준다.
  onOpenDataManager: () => void
  // "직접 입력" -- 과제관리 탭으로 이동시켜 위에 있는 입력 폼부터
  // 쓰게 한다.
  onDirectEntry: () => void
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 5v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

function OptionCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-accent hover:bg-blue-50/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-accent">{icon}</span>
      <span>
        <p className="text-sm font-semibold text-black">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
      </span>
    </button>
  )
}

// 헤더의 번개 아이콘("빠른 시작")으로 어디서든 열 수 있는 시작 방법
// 선택 모달. 과제관리 빈 화면에 있는 온보딩과 목적은 같지만(시작 방법
// 고르기), 특정 탭이 빈 상태일 때만 보이는 게 아니라 언제든 누를 수
// 있는 진입점이다. 세 선택지 모두 새로 구현하지 않고 이미 있는 화면을
// 그대로 연결한다 -- Excel은 데이터 관리 드로어, 직접 입력은 과제관리
// 탭 이동, 이전 평가는 기존 ImportFromPreviousDialog.
export default function QuickStartModal({
  teamName,
  currentWorkspaceId,
  hasOtherPeriods,
  onClose,
  onOpenDataManager,
  onDirectEntry,
}: QuickStartModalProps) {
  const [importOpen, setImportOpen] = useState(false)

  if (importOpen) {
    return <ImportFromPreviousDialog teamName={teamName} currentWorkspaceId={currentWorkspaceId} onClose={onClose} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">빠른 시작</h3>
            <p className="mt-1 text-sm text-gray-500">과제·팀원을 등록하는 방법을 선택하세요.</p>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <XIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <OptionCard
            icon={<ExcelIcon className="h-5 w-5" />}
            title="Excel로 한 번에 시작"
            hint="과제·팀원 양식을 받아서 채운 뒤 업로드하면 한 번에 등록됩니다"
            onClick={onOpenDataManager}
          />
          <OptionCard
            icon={<PencilIcon className="h-5 w-5" />}
            title="직접 입력"
            hint="과제관리에서 과제부터 하나씩 추가하고 팀원을 등록하세요"
            onClick={onDirectEntry}
          />
          {hasOtherPeriods && (
            <OptionCard
              icon={<HistoryIcon className="h-5 w-5" />}
              title="이전 평가에서 가져오기"
              hint="과제·팀원을 이전 기간에서 이어받으세요"
              onClick={() => setImportOpen(true)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

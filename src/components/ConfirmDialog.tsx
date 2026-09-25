import type { ReactNode } from 'react'
import Button from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  // 기본은 삭제 확인(빨간 버튼). 삭제가 아닌 확인(예: 평가 확정)은 accent 톤으로.
  confirmLabel?: string
  tone?: 'danger' | 'accent'
  // 메시지 아래에 덧붙이는 선택 항목 등
  children?: ReactNode
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = '삭제',
  tone = 'danger',
  children,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]">
      <div className={`w-full ${children ? 'max-w-md' : 'max-w-sm'} rounded-[12px] bg-white/95 p-5 shadow-dialog backdrop-blur-xl`}>
        <h3 className="text-[15px] font-semibold text-label">{title}</h3>
        <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-label-2">{message}</p>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

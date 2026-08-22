interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
}

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = '삭제' }: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel max-w-sm">
        <h3 className="ui-modal-title">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="ui-modal-actions">
          <button
            onClick={onCancel}
            className="ui-button ui-button-secondary"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="ui-button ui-button-danger"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

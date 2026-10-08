// 가운데 작은 창(팝업) 틀: 제목 · ✕ · 본문 · 아래 버튼 줄. Esc · 바깥 누르면 닫힘(busy면 안 닫힘)
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import IconButton from '../IconButton'
import { ic } from './icon'

const WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-4xl' } as const

export default function Modal({
  title,
  sub,
  onClose,
  footer,
  children,
  size = 'sm',
  busy,
}: {
  title: ReactNode
  sub?: ReactNode
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
  size?: keyof typeof WIDTH
  busy?: boolean
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [busy, onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2238]/25 p-4 backdrop-blur-md" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" className={`flex max-h-[94vh] w-full ${WIDTH[size]} flex-col rounded-[28px] border border-white/80 bg-white/95 shadow-dialog`}>
        <div className="flex items-start gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">{title}</h3>
            {sub && <p className="mt-0.5 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">{sub}</p>}
          </div>
          <IconButton onClick={onClose} disabled={busy} aria-label="닫기" title="닫기">
            <X {...ic} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-separator px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

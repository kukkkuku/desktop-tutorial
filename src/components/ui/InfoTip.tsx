// 설명 글을 화면에 늘어놓지 않고, 필요한 사람만 눌러서 보게 하는 정보(i) 아이콘.
// 누르면 작은 설명 상자가 열리고, 다시 누르거나 바깥을 누르거나 Esc로 닫는다. 설명이 꼭 있어야만 쓸 수 있는 화면이면 화면을 고치는 게 먼저다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'

export default function InfoTip({ children, label = '도움말', align = 'left', width = 300, className = '' }: { children: ReactNode; label?: string; align?: 'left' | 'right'; width?: number; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-label-3 transition-colors hover:bg-black/[0.06] hover:text-label ${open ? 'bg-black/[0.06] text-label' : ''}`}
      >
        <Info size={15} strokeWidth={1.8} />
      </button>
      {open && (
        <span
          role="note"
          style={{ width }}
          className={`mac-pop absolute top-full z-40 mt-1.5 max-w-[80vw] px-3.5 py-2.5 text-left text-[length:calc(13.5px*var(--ui-fs,1))] font-normal leading-relaxed text-label-2 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </span>
      )}
    </span>
  )
}

// 추진현황 파일 메뉴(머리 오른쪽 ⋯) -- 지금 연도로 할 일: 다시 불러오기 · 시트 열기 · 엑셀 받기/열기 · 구글시트로 만들기 · 시트 연결 설정.
// 연도 고르기(무엇을 보나)와 나눠, 연도 메뉴는 고르기만 한다. 메뉴 안 항목을 누르면 메뉴가 닫힌다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis } from 'lucide-react'

const W = 290

export default function FileMenu({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - W) })
    function down(e: PointerEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        title="파일 -- 다시 불러오기 · 엑셀 · 시트 연결"
        aria-label="파일 메뉴"
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-[7px] text-label-2 hover:bg-black/[0.05] hover:text-label disabled:opacity-40 ${open ? 'bg-black/[0.05] text-label' : ''}`}
      >
        <Ellipsis size={17} strokeWidth={1.8} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: W }}
            className="mac-pop z-50 overflow-hidden py-1"
            onClick={(e) => {
              // 링크 · 버튼을 누르면 닫는다(구분선 · 글 줄은 그대로)
              if ((e.target as HTMLElement).closest('button, a')) setOpen(false)
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}

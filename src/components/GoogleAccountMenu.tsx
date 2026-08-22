import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  )
}

function DriveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7.5 3h9L22 12l-4.5 8h-11L2 12z" />
      <path d="M7.5 3 12 12l-4.5 8M16.5 3 12 12l4.5 8M2 12h20" />
    </svg>
  )
}

const ACCOUNT_LINKS = [
  { label: '캘린더 이동', href: 'https://calendar.google.com/', Icon: CalendarIcon },
  { label: '구글메일 이동', href: 'https://mail.google.com/', Icon: MailIcon },
  { label: '구글 드라이브로 이동', href: 'https://drive.google.com/', Icon: DriveIcon },
] as const

interface GoogleAccountMenuProps {
  // 버튼에 보여줄 내용(이메일, 배지 등) -- 호출부마다 스타일이 달라서
  // 자유롭게 넘긴다.
  children: ReactNode
  className?: string
}

// 연결된 계정 칩을 누르면 계정 상세정보 대신 캘린더/Gmail/Drive로 바로 넘어갈
// 수 있는 짧은 메뉴만 띄운다. 헤더(StageTabs)와 데이터 관리 드로어의 Google
// Drive 탭(GoogleDrivePanel) 양쪽에서 같은 동작을 쓴다.
export default function GoogleAccountMenu({ children, className }: GoogleAccountMenuProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)} className={className}>
        {children}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-50 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
          >
            {ACCOUNT_LINKS.map(({ label, href, Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-black"
              >
                <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                {label}
              </a>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

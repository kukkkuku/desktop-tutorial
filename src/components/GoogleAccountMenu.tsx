import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { connectDifferentAccount, getConnectedEmail } from '../utils/googleDrive'

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
  // 다른 계정으로 전환 성공 시 알려준다 -- 호출부(헤더/데이터 관리)가
  // 각자 들고 있는 accountEmail 표시를 새로 읽어오도록.
  onAccountChange?: () => void
}

// 연결된 계정 칩을 누르면 지금 계정 정보 + 다른 계정으로 전환하는 액션,
// 그리고 캘린더/Gmail/Drive로 바로 넘어갈 수 있는 짧은 메뉴를 띄운다.
// 헤더(StageTabs)와 데이터 관리 드로어의 Google Drive 탭(GoogleDrivePanel)
// 양쪽에서 같은 동작을 쓴다.
export default function GoogleAccountMenu({ children, className, onAccountChange }: GoogleAccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  async function handleConnectDifferentAccount() {
    setSwitchError(null)
    setSwitching(true)
    try {
      await connectDifferentAccount()
      onAccountChange?.()
      setOpen(false)
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : '계정 전환에 실패했습니다.')
    } finally {
      setSwitching(false)
    }
  }

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
            className="z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
          >
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="truncate text-xs text-gray-400">현재 계정 · {getConnectedEmail() ?? '연결 안 됨'}</p>
              <button
                type="button"
                onClick={() => void handleConnectDifferentAccount()}
                disabled={switching}
                className="mt-1.5 flex w-full items-center gap-1.5 whitespace-nowrap text-sm font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base leading-none">+</span>
                {switching ? '전환하는 중...' : '다른 Google 계정 연결'}
              </button>
              {switchError && <p className="mt-1 text-[11px] text-danger">{switchError}</p>}
            </div>

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

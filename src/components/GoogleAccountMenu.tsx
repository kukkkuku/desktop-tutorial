import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, HardDrive, Mail, Plus } from 'lucide-react'
import { icSm } from './ui/icon'
import { connectDifferentAccount, getConnectedEmail, withGoogleAccount } from '../utils/googleDrive'

const ACCOUNT_LINKS = [
  { label: '캘린더 이동', href: 'https://calendar.google.com/', Icon: Calendar },
  { label: '구글메일 이동', href: 'https://mail.google.com/', Icon: Mail },
  { label: '구글 드라이브로 이동', href: 'https://drive.google.com/', Icon: HardDrive },
] as const

interface GoogleAccountMenuProps {
  // 버튼에 보여줄 내용(이메일, 배지 등) -- 호출부마다 스타일이 달라서
  // 자유롭게 넘긴다.
  children: ReactNode
  className?: string
  // 다른 계정으로 전환 성공 시 알려준다 -- 호출부(헤더/데이터 관리)가
  // 각자 들고 있는 accountEmail 표시를 새로 읽어오도록.
  onAccountChange?: () => void
  // 호출부가 덧붙이는 바로가기(예: 연결된 구글시트). 목록 맨 위에 놓는다.
  extraLinks?: { label: string; href: string; icon: ReactNode }[]
}

// 연결된 계정 칩을 누르면 지금 계정 정보 + 다른 계정으로 전환하는 액션,
// 그리고 캘린더/Gmail/Drive로 바로 넘어갈 수 있는 짧은 메뉴를 띄운다.
// 헤더(StageTabs)와 데이터 관리 드로어의 Google Drive 탭(GoogleDrivePanel)
// 양쪽에서 같은 동작을 쓴다.
export default function GoogleAccountMenu({ children, className, onAccountChange, extraLinks = [] }: GoogleAccountMenuProps) {
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
            className="mac-pop z-50 w-60 overflow-hidden py-1"
          >
            <div className="px-3.5 py-1.5">
              <p className="truncate text-[13px] text-label-2">현재 계정 · {getConnectedEmail() ?? '연결 안 됨'}</p>
              <button
                type="button"
                onClick={() => void handleConnectDifferentAccount()}
                disabled={switching}
                className="mt-1 flex w-full items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus {...icSm} className="shrink-0" />
                {switching ? '전환하는 중...' : '다른 Google 계정 연결'}
              </button>
              {switchError && <p className="mt-1 text-[13px] text-danger">{switchError}</p>}
            </div>
            <div className="mac-menu-sep" />

            {extraLinks.map(({ label, href, icon }) => (
              <a
                key={href}
                href={withGoogleAccount(href)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="mac-menu-item whitespace-nowrap"
              >
                {icon}
                {label}
              </a>
            ))}
            {ACCOUNT_LINKS.map(({ label, href, Icon }) => (
              <a
                key={href}
                href={withGoogleAccount(href)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="mac-menu-item whitespace-nowrap"
              >
                <Icon {...icSm} className="shrink-0" />
                {label}
              </a>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

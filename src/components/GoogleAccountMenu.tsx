import { errText } from '../utils/googleError'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { GmailIcon, GoogleCalendarIcon, GoogleDriveIcon } from './ui/GoogleIcons'
import { connectDifferentAccount, getConnectedEmail, withGoogleAccount } from '../utils/googleDrive'

const ACCOUNT_LINKS = [
  { label: '캘린더', href: 'https://calendar.google.com/', Icon: GoogleCalendarIcon },
  { label: '구글메일', href: 'https://mail.google.com/', Icon: GmailIcon },
  { label: '구글 드라이브', href: 'https://drive.google.com/', Icon: GoogleDriveIcon },
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
  // 'up' = 단추 위로 연다(사이드바 맨 아래 계정 칸)
  placement?: 'down' | 'up'
  // 메뉴 맨 아래에 덧붙이는 항목(예: 로그아웃)
  footer?: ReactNode
  title?: string
  // 계정 줄 아래에 보이는 역할(관리자 · 팀장 · 팀원) -- 주면 보여 준다
  roleLabel?: string
}

// 연결된 계정 칩을 누르면 지금 계정 정보 + 다른 계정으로 전환하는 액션,
// 그리고 캘린더/Gmail/Drive로 바로 넘어갈 수 있는 짧은 메뉴를 띄운다.
// 헤더(StageTabs)와 데이터 관리 드로어의 Google Drive 탭(GoogleDrivePanel)
// 양쪽에서 같은 동작을 쓴다.
export default function GoogleAccountMenu({ children, className, onAccountChange, extraLinks = [], placement = 'down', footer, title, roleLabel }: GoogleAccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)

  async function handleConnectDifferentAccount() {
    setSwitchError(null)
    setSwitching(true)
    try {
      await connectDifferentAccount()
      onAccountChange?.()
      setOpen(false)
    } catch (err) {
      setSwitchError(errText(err, '계정 전환에 실패했습니다.'))
    } finally {
      setSwitching(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const rect = btnRef.current?.getBoundingClientRect()
    // 화면 오른쪽 끝(위 메뉴의 계정 칸)에서 열어도 메뉴가 화면 밖으로 나가지 않게
    const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 300)) : 0
    if (rect) setPos(placement === 'up' ? { bottom: window.innerHeight - rect.top + 6, left } : { top: rect.bottom + 6, left })
  }, [open, placement])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      // 메뉴 옆으로 펼친 작은 메뉴(디스플레이 등)도 메뉴의 일부다
      if ((target as Element).closest?.('[data-menu-sub]')) return
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
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)} className={className} title={title}>
        {children}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left }}
            className="mac-pop z-50 w-72 overflow-hidden py-1"
          >
            {/* 계정: 동그라미 + 이메일 한 줄, 그 아래 역할 · 다른 계정 연결 */}
            <div className="px-3.5 pb-1 pt-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">
                  {(getConnectedEmail() ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label" title={getConnectedEmail() ?? ''}>
                    {getConnectedEmail() ?? '연결 안 됨'}
                  </p>
                  <p className="flex items-center gap-1.5 whitespace-nowrap text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">
                    {roleLabel && <span>{roleLabel}</span>}
                    {roleLabel && <span>·</span>}
                    <button
                      type="button"
                      onClick={() => void handleConnectDifferentAccount()}
                      disabled={switching}
                      className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus size={12} strokeWidth={2} className="shrink-0" />
                      {switching ? '전환하는 중...' : '다른 계정 연결'}
                    </button>
                  </p>
                </div>
              </div>
              {switchError && <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-danger">{switchError}</p>}
              {/* 구글 바로가기: 아이콘만 나란히(이름은 마우스를 올리면) */}
              <div className="mt-2.5 flex gap-1.5">
                {[...extraLinks.map((l) => ({ label: l.label, href: l.href, icon: l.icon })), ...ACCOUNT_LINKS.map(({ label, href, Icon }) => ({ label, href, icon: <Icon size={18} className="shrink-0" /> }))].map(({ label, href, icon }) => (
                  <a
                    key={href}
                    href={withGoogleAccount(href)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                    title={label}
                    aria-label={label}
                    className="flex h-9 flex-1 items-center justify-center rounded-control bg-black/[0.04] text-label-2 hover:bg-black/[0.08] hover:text-label"
                  >
                    {icon}
                  </a>
                ))}
              </div>
            </div>
            <div className="mac-menu-sep" />

            {footer && (
              <>
                <div className="mac-menu-sep" />
                <div onClick={() => setOpen(false)}>{footer}</div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

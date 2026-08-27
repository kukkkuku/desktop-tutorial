import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkspaceMeta } from '../types'

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

interface WorkspaceSwitcherProps {
  teamName: string
  currentWorkspaceId: string
  periods: WorkspaceMeta[]
  onSelectPeriod: (id: string) => void
  onOpenProjectManagement: () => void
}

// 헤더 좌측의 팀/기간 전환 -- 예전엔 홈 아이콘 + "{팀} 성과관리" 고정
// 텍스트 + <select> + "새 기간 추가" 버튼이 따로따로 있었는데, 하나의
// 드롭다운으로 합쳤다: 버튼을 누르면 같은 팀의 다른 기간들과 "프로젝트
// 관리"(랜딩 화면으로 이동, 예전 홈 아이콘 역할을 대신함) 항목이 뜬다.
// 워크스페이스 안에서 새 평가 기간을 만드는 흐름은 없앴다 -- 랜딩 화면의
// "새 평가 만들기"로 이미 충분해서 중복이었다.
export default function WorkspaceSwitcher({
  teamName,
  currentWorkspaceId,
  periods,
  onSelectPeriod,
  onOpenProjectManagement,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const current = periods.find((p) => p.id === currentWorkspaceId)
  // 팀 이름에 "팀"을 안 붙이고 짓는 경우(예: "디자인")가 많아서, 화면에는
  // 항상 "~팀"으로 붙여서 보여준다. 이미 "팀"으로 끝나면 중복으로
  // 붙이지 않는다.
  const displayTeamName = teamName.endsWith('팀') ? teamName : `${teamName}팀`

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
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xl font-bold text-black transition-colors hover:bg-gray-50 ${
          open ? 'bg-gray-50' : ''
        }`}
      >
        <FolderIcon className="h-5 w-5 shrink-0 text-accent" />
        <span className="whitespace-nowrap">
          {displayTeamName} {current ? `${current.evaluationYear} ${current.periodName}` : ''}
        </span>
        <ChevronDownIcon className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-50 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1.5 shadow-xl"
          >
            <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-gray-400">{displayTeamName}</p>
            <div className="px-1">
              {periods.map((p) => {
                const selected = p.id === currentWorkspaceId
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectPeriod(p.id)
                      setOpen(false)
                    }}
                    className={`block w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                      selected ? 'bg-blue-50 font-bold text-accent' : 'font-medium text-gray-700 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {p.evaluationYear} {p.periodName}
                  </button>
                )
              })}
            </div>
            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenProjectManagement()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-black"
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-gray-400" />
                프로젝트 관리
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

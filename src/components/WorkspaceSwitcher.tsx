import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Folder } from 'lucide-react'
import type { WorkspaceMeta } from '../types'
import { ic, icLg, icSm } from './ui/icon'

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
        className={`flex h-8 shrink-0 items-center gap-2 rounded-control px-2 text-[17px] font-semibold text-label transition-colors hover:bg-black/[0.05] ${
          open ? 'bg-black/[0.05]' : ''
        }`}
      >
        <Folder {...icLg} className="shrink-0 text-accent" />
        <span className="whitespace-nowrap">
          {displayTeamName} {current ? `${current.evaluationYear} ${current.periodName}` : ''}
        </span>
        <ChevronDown {...ic} className={`shrink-0 text-label-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="mac-pop z-50 w-60 overflow-hidden py-1"
          >
            <p className="px-3.5 pb-1 pt-1 text-[13px] font-semibold text-label-3">{displayTeamName}</p>
            <div>
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
                    className={`mac-menu-item ${selected ? 'font-semibold' : ''}`}
                  >
                    <Check {...icSm} className={`shrink-0 ${selected ? '' : 'invisible'}`} />
                    {p.evaluationYear} {p.periodName}
                  </button>
                )
              })}
            </div>
            <div className="mac-menu-sep" />
            <div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenProjectManagement()
                }}
                className="mac-menu-item"
              >
                <Folder {...icSm} className="shrink-0" />
                프로젝트 관리
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

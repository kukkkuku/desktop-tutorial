// 실적관리 연도 고르기 -- 성과관리 머리글의 프로젝트(팀 · 평가기간) 고르기와 같은 모양.
// 한 해의 실적관리(추진현황 · 진척률)를 고른다. 시트의 「YYYY 추진현황」 탭이 그 해다.
// 올해는 입력, 지난 연도는 보기 전용.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Folder } from 'lucide-react'
import Spinner from '../Spinner'
import { ic, icLg, icSm } from '../ui/icon'

// 「2026 추진현황」 → 「2026 실적관리」(연도를 못 찾으면 탭 이름 그대로)
function yearLabel(tab: string): string {
  const y = tab.match(/(20\d{2})/)?.[1]
  return y ? `${y} 실적관리` : tab
}

export default function YearSwitcher({
  title,
  tabs,
  editableTitle,
  loading,
  disabled,
  onPick,
}: {
  title: string // 지금 보는 탭
  tabs: string[] // 같은 파일의 추진현황 탭들(최근 연도부터)
  editableTitle: string // 입력할 수 있는 올해 탭
  loading?: boolean
  disabled?: boolean
  onPick: (title: string) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const readOnly = title !== editableTitle
  const canPick = tabs.length > 1 && !disabled

  useEffect(() => {
    if (!open) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left })
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
        onClick={() => canPick && setOpen((v) => !v)}
        title={canPick ? `연도 고르기 · 지난 연도는 보기 전용 (시트 탭: ${title})` : `시트 탭: ${title}`}
        className={`flex h-8 shrink-0 items-center gap-2 rounded-control px-2 text-[17px] font-semibold text-label transition-colors ${
          canPick ? 'hover:bg-black/[0.05]' : 'cursor-default'
        } ${open ? 'bg-black/[0.05]' : ''}`}
      >
        <Folder {...icLg} className={`shrink-0 ${readOnly ? 'text-orange-500' : 'text-accent'}`} />
        <span className="whitespace-nowrap">{yearLabel(title)}</span>
        {readOnly && <span className="mac-badge bg-orange-100 text-[11px] text-orange-700">보기 전용</span>}
        {loading ? (
          <Spinner className="h-3.5 w-3.5 text-label-3" />
        ) : (
          canPick && <ChevronDown {...ic} className={`shrink-0 text-label-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left }} className="mac-pop z-50 w-60 overflow-hidden py-1">
            <p className="px-3.5 pb-1 pt-1 text-[13px] font-semibold text-label-3">실적관리 연도</p>
            {tabs.map((t) => {
              const selected = t === title
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onPick(t)
                    setOpen(false)
                  }}
                  className={`mac-menu-item ${selected ? 'font-semibold' : ''}`}
                >
                  <Check {...icSm} className={`shrink-0 ${selected ? '' : 'invisible'}`} />
                  {yearLabel(t)}
                  {t !== editableTitle && <span className="ml-auto text-[11px] text-label-3">보기 전용</span>}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}

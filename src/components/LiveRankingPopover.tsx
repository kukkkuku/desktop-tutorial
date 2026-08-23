import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MemberResultRow } from '../utils/calculations'
import { GRADE_COLORS } from '../utils/calculations'

interface LiveRankingPopoverProps {
  results: MemberResultRow[]
  open: boolean
  onClose: () => void
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  )
}

const PANEL_WIDTH = 232

// 평가 매트릭스에서 기여도·개인수행등급을 조정하는 동안 팀원별 순위·등급이
// 어떻게 바뀌는지 표 밖에서 바로 확인할 수 있게 띄우는 작은 패널. 우측
// 상단에 기본으로 뜨고, 헤더를 드래그해서 위치를 옮기거나 X로 닫을 수
// 있다. 데이터는 부모가 넘겨주는 memberResults를 그대로 보여주므로,
// 매트릭스 입력이 바뀌어 재계산될 때마다 자동으로 갱신된다.
export default function LiveRankingPopover({ results, open, onClose }: LiveRankingPopoverProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; startTop: number; startLeft: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setPos((prev) => prev ?? { top: 96, left: Math.max(16, window.innerWidth - PANEL_WIDTH - 24) })
  }, [open])

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!pos) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTop: pos.top, startLeft: pos.left }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    const nextLeft = Math.min(Math.max(0, drag.startLeft + (e.clientX - drag.startX)), window.innerWidth - PANEL_WIDTH)
    const nextTop = Math.max(0, drag.startTop + (e.clientY - drag.startY))
    setPos({ top: nextTop, left: nextLeft })
  }

  function onDragEnd() {
    dragRef.current = null
  }

  if (!open || !pos) return null

  return createPortal(
    <div
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_WIDTH }}
      className="z-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        style={{ touchAction: 'none' }}
        className="flex cursor-grab items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-2.5 py-2 active:cursor-grabbing"
      >
        <DragHandleIcon className="h-3.5 w-3.5 shrink-0 text-gray-300" />
        <span className="flex-1 text-xs font-semibold text-gray-600">실시간 순위</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="닫기"
          aria-label="닫기"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-black"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {results.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-gray-400">활성 팀원이 없습니다.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <div className="grid grid-cols-[1fr_40px_44px] gap-1 px-2.5 pt-2 text-[11px] font-semibold text-gray-400">
            <span>팀원</span>
            <span className="text-center">순위</span>
            <span className="text-center">등급</span>
          </div>
          <div className="divide-y divide-gray-50 px-2.5 pb-2">
            {results.map((r, i) => (
              <div key={r.member.id} className="grid grid-cols-[1fr_40px_44px] items-center gap-1 py-1.5">
                <span className="truncate text-sm font-medium text-black">{r.member.name}</span>
                <span className="text-center text-sm font-mono text-gray-500">{i + 1}위</span>
                <span className="flex justify-center">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${GRADE_COLORS[r.grade]}`}>{r.grade}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

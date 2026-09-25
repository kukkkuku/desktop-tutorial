import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MemberResultRow } from '../utils/calculations'
import { GRADE_COLORS } from '../utils/calculations'
import { GripVertical, X } from 'lucide-react'
import IconButton from './IconButton'
import { icSm } from './ui/icon'

interface LiveRankingPopoverProps {
  results: MemberResultRow[]
  open: boolean
  onClose: () => void
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
      className="mac-pop z-40 overflow-hidden"
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        style={{ touchAction: 'none' }}
        className="flex cursor-grab items-center gap-1.5 border-b border-separator px-2.5 py-1.5 active:cursor-grabbing"
      >
        <GripVertical {...icSm} className="shrink-0 text-label-3" />
        <span className="flex-1 text-[13px] font-semibold text-label">실시간 순위</span>
        <IconButton
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="닫기"
          aria-label="닫기"
          className="h-6 min-w-6 shrink-0"
        >
          <X {...icSm} />
        </IconButton>
      </div>

      {results.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-label-3">활성 팀원이 없습니다.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <div className="grid grid-cols-[1fr_40px_44px] gap-1 px-2.5 pt-2 text-[11px] font-semibold text-label-3">
            <span>팀원</span>
            <span className="text-center">순위</span>
            <span className="text-center">등급</span>
          </div>
          <div className="divide-y divide-separator px-2.5 pb-2">
            {results.map((r, i) => (
              <div key={r.member.id} className="grid grid-cols-[1fr_40px_44px] items-center gap-1 py-1.5">
                <span className="truncate text-[13px] font-medium text-label">{r.member.name}</span>
                <span className="text-center text-[13px] tabular-nums text-label-2">{i + 1}위</span>
                <span className="flex justify-center">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${GRADE_COLORS[r.grade]}`}>{r.grade}</span>
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

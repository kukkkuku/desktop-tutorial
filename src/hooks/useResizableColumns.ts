import { useCallback, useRef, useState } from 'react'

export type ColumnWidths<K extends string> = Record<K, number>

const MIN_COLUMN_WIDTH = 56

// 모든 테이블에서 공유하는 컬럼 너비 조절 로직. CriteriaPanel의 스플리터와 같은
// 방식(포인터 캡처 + 같은 요소에서 move/up 처리)을 써서 document 레벨 리스너 없이
// 동작한다. 너비는 이 훅을 쓰는 컴포넌트가 리마운트되면 기본값으로 초기화된다.
export function useResizableColumns<K extends string>(defaults: ColumnWidths<K>) {
  const [widths, setWidths] = useState<ColumnWidths<K>>(defaults)
  const dragRef = useRef<{ key: K; startX: number; startWidth: number } | null>(null)

  const startResize = useCallback(
    (key: K) => (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault()
      dragRef.current = { key, startX: e.clientX, startWidth: widths[key] }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [widths],
  )

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const next = Math.max(MIN_COLUMN_WIDTH, drag.startWidth + (e.clientX - drag.startX))
    setWidths((prev) => ({ ...prev, [drag.key]: next }))
  }, [])

  const onResizeEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  return { widths, startResize, onResizeMove, onResizeEnd }
}

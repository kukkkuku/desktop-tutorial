// 옆으로 넘치는 표 틀: 오른쪽(왼쪽)에 더 있으면 그쪽 끝에 옅은 그림자를 띄워 「밀면 더 있다」를 알린다.
// overflow-x-auto 틀 대신 그대로 쓴다(className -- 테두리 · 모서리 · 여백 -- 은 바깥 틀에 붙는다).
// 틀 모양이 다른 곳(DataGrid)은 useScrollEdges + ScrollEdgeShades만 쓴다.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

export function useScrollEdges(ref: RefObject<HTMLElement>) {
  const [edge, setEdge] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setEdge({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    Array.from(el.children).forEach((c) => ro.observe(c))
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [ref])
  return edge
}

export function ScrollEdgeShades({ left, right }: { left: boolean; right: boolean }) {
  return (
    <>
      {right && <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-8 bg-gradient-to-l from-black/[0.12] to-transparent" />}
      {left && <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-8 bg-gradient-to-r from-black/[0.09] to-transparent" />}
    </>
  )
}

export default function ScrollX({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const edge = useScrollEdges(ref)
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
      <ScrollEdgeShades {...edge} />
    </div>
  )
}

import { useEffect, useState, type RefObject } from 'react'

// 브라우저 탭처럼 줄어드는 탭 줄: 탭 하나에 돌아가는 폭이 좁으면(기본 100px 미만) "좁게" 모드로
// 여백을 줄이고 개수 숫자를 숨겨 이름이 조금이라도 더 보이게 한다.
export function useTabFit(ref: RefObject<HTMLElement>, count: number, min = 100): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setCompact(count > 0 && el.getBoundingClientRect().width / count < min)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, count, min])
  return compact
}

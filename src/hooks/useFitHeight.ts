// 표 틀의 높이를 브라우저 창에 맞춘다: 창 높이 - 틀의 위치(맨 위로 스크롤했을 때) - 아래 여백.
// 표가 길어도 페이지는 스크롤되지 않고 표 안에서만 스크롤돼서, 가로 스크롤 막대가 늘 화면 안에 보인다.
// 틀이 나중에 그려져도(데이터를 불러온 뒤) 재도록 콜백 ref를 돌려준다: <div ref={ref} style={{ maxHeight: h }}>
import { useLayoutEffect, useState } from 'react'

export function useFitHeight(bottomGap: number, min = 240) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [h, setH] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (!el) return
    const update = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      setH(Math.max(min, Math.floor(window.innerHeight - top - bottomGap)))
    }
    update()
    window.addEventListener('resize', update)
    // 위쪽(머리 · 도구 줄) 높이가 바뀌면 다시 잰다
    const ro = new ResizeObserver(update)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => {
      window.removeEventListener('resize', update)
      ro.disconnect()
    }
  }, [el, bottomGap, min])
  return [setEl, h] as const
}

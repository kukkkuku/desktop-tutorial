// 앱 전체가 같이 쓰는 「보는 연도」 -- 과제 입력(그 해 추진현황)과 성과관리(그 해 평가)가 함께 따라간다.
// 이 브라우저에 기억한다(없으면 올해).
import { useSyncExternalStore } from 'react'

const KEY = 'app-year'
const EVENT = 'app-year-change'

export function readAppYear(): number {
  try {
    const n = Number(localStorage.getItem(KEY))
    if (n >= 2000 && n < 2100) return n
  } catch {
    // 저장소를 못 읽으면 올해
  }
  return new Date().getFullYear()
}

export function setAppYear(y: number) {
  if (y === readAppYear()) return
  try {
    localStorage.setItem(KEY, String(y))
  } catch {
    // 못 저장해도 이번 화면에는 반영
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useAppYear(): number {
  return useSyncExternalStore(subscribe, readAppYear)
}

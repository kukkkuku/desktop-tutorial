// 「이대로 두기」로 닫은 알림 표시를 모아 둔다 -- 알림 배너와 위쪽 종(NoticeBell)이 같은 목록을 본다.
// 표시(sig)에 담당자 · 기여도 상태가 들어 있어서, 상태가 또 바뀌면 달라져 알림이 다시 배너로 뜬다.
import { useCallback, useEffect, useState } from 'react'

const KEY = 'out-of-sync-dismissed'
const EVENT = 'dismissed-notices-changed'

function load(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

export function useDismissedNotices() {
  const [dismissed, setDismissed] = useState<Set<string>>(load)
  useEffect(() => {
    const on = () => setDismissed(load())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  const write = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...next].slice(-300)))
    } catch {
      /* 저장 실패는 무시 */
    }
    setDismissed(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])
  const dismiss = useCallback((sigs: string[]) => write(new Set([...load(), ...sigs])), [write])
  const restore = useCallback((sigs: string[]) => write(new Set([...load()].filter((s) => !sigs.includes(s)))), [write])
  return { dismissed, dismiss, restore }
}

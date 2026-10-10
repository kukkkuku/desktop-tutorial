// 알림을 닫거나 지운 표시를 모아 둔다 -- 알림 배너 · 팀원관리 안내 상자와 위쪽 종(NoticeBell)이 같은 목록을 본다.
//   dismissed = ✕ / 「이대로 두기」로 닫음 → 제자리에서는 안 보이고 종에 모임
//   deleted   = 종 목록에서 삭제 → 어디에도 안 보임
// 표시(sig)에 담당자 · 기여도 같은 상태가 들어 있어서, 상태가 또 바뀌면 달라져 알림이 다시 제자리에 뜬다.
import { useCallback, useEffect, useState } from 'react'

const KEY = 'out-of-sync-dismissed'
const DEL_KEY = 'notices-deleted'
const EVENT = 'dismissed-notices-changed'

function load(key: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]'))
  } catch {
    return new Set()
  }
}
function save(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set].slice(-300)))
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function useDismissedNotices() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => load(KEY))
  const [deleted, setDeleted] = useState<Set<string>>(() => load(DEL_KEY))
  useEffect(() => {
    const on = () => {
      setDismissed(load(KEY))
      setDeleted(load(DEL_KEY))
    }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  const changed = useCallback(() => window.dispatchEvent(new Event(EVENT)), [])
  const dismiss = useCallback(
    (sigs: string[]) => {
      save(KEY, new Set([...load(KEY), ...sigs]))
      changed()
    },
    [changed],
  )
  const restore = useCallback(
    (sigs: string[]) => {
      save(KEY, new Set([...load(KEY)].filter((s) => !sigs.includes(s))))
      changed()
    },
    [changed],
  )
  // 종에서 지우기(닫아 둔 표시는 같이 정리)
  const remove = useCallback(
    (sigs: string[]) => {
      save(DEL_KEY, new Set([...load(DEL_KEY), ...sigs]))
      save(KEY, new Set([...load(KEY)].filter((s) => !sigs.includes(s))))
      changed()
    },
    [changed],
  )
  return { dismissed, deleted, dismiss, restore, remove }
}

// 종에서 「보기」를 누르면 팀원관리가 열릴 때 그 상자를 펼쳐 둔다
export const OPEN_TEAM_NOTICE_KEY = 'open-team-notice'
export const OPEN_EVAL_NOTICE_KEY = 'open-eval-notice'

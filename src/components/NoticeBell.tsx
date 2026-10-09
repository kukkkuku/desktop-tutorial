// 머리줄의 종: 「이대로 두기」로 닫은 알림을 모아 둔다. 눌러서 펼치면 다시 확인 · 맞추기 · 알림으로 되돌리기.
// 지금도 다른 과제만 보인다(담당자나 기여도를 고쳐 같아졌으면 목록에서 저절로 빠진다).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAppState } from '../state/AppContext'
import { outOfSyncDetails } from '../utils/assigneeSync'
import { useDismissedNotices } from '../utils/dismissedNotices'
import IconButton from './IconButton'
import Button from './Button'
import { ic } from './ui/icon'

export default function NoticeBell() {
  const { state, dispatch } = useAppState()
  const { dismissed, restore } = useDismissedNotices()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const list = useMemo(() => outOfSyncDetails(state).filter((d) => dismissed.has(d.sig)), [state, dismissed])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <IconButton
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`알림 ${list.length}개`}
        title={list.length ? `닫아 둔 알림 ${list.length}개` : '닫아 둔 알림이 없습니다'}
        className={`relative ${open ? 'bg-black/[0.05] text-label' : ''}`}
      >
        <Bell {...ic} />
        {list.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {list.length}
          </span>
        )}
      </IconButton>
      {open && (
        <div className="mac-pop absolute right-0 top-9 z-40 max-h-[70vh] w-[min(420px,90vw)] overflow-y-auto p-3 text-[length:calc(14px*var(--ui-fs,1))]">
          <p className="mb-2 font-semibold text-label">닫아 둔 알림</p>
          {list.length === 0 ? (
            <p className="py-3 text-center text-label-3">닫아 둔 알림이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((d) => (
                <li key={d.task.id} className="rounded-control bg-black/[0.03] px-3 py-2 text-label">
                  <div className="text-xs text-label-3">담당자와 기여도가 다른 평가과제</div>
                  <div className="truncate font-medium" title={d.task.name}>
                    {d.task.name}
                  </div>
                  <div className="text-xs text-label-2">
                    담당자: {d.assignees.join(', ') || '없음'} · 기여도 입력: {d.participants.join(', ') || '없음'}
                  </div>
                  <div className="text-xs text-orange-800">
                    {d.missing.length > 0 && <span>담당자인데 기여도 0: <b>{d.missing.join(', ')}</b></span>}
                    {d.missing.length > 0 && d.extra.length > 0 && ' · '}
                    {d.extra.length > 0 && <span>담당자가 아닌데 기여도 있음: <b>{d.extra.join(', ')}</b></span>}
                  </div>
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <Button type="button" size="sm" variant="secondary" onClick={() => restore([d.sig])} title="평가하기 위쪽 알림으로 다시 띄웁니다">
                      알림으로 다시 보기
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => dispatch({ type: 'SYNC_CONTRIBUTIONS_TO_ASSIGNEES', payload: { taskIds: [d.task.id] } })}
                    >
                      담당자대로 맞추기
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

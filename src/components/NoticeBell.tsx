// 머리줄의 종: 알림을 한 줄씩 모아 보여 준다. 맨 위는 「새 버전」(새로고침 단추), 그 아래는 화면별 알림(PerfNoticeSource가 올림).
//   줄을 누르면 그 화면으로 가서 알림을 다시 띄워 보여 주고, 「영구 삭제」를 누르면 지워진다.
// 알림이 있으면 종에 작은 빨간 점. 없으면 눌리지 않는다.
import { useEffect, useRef, useState } from 'react'
import { Bell, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { useNoticeCenter } from '../state/NoticeCenter'
import { refreshToLatest, useUpdateState } from '../utils/appUpdate'
import IconButton from './IconButton'
import Button from './Button'
import { ic, icSm } from './ui/icon'

export default function NoticeBell() {
  const { rows } = useNoticeCenter()
  const update = useUpdateState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const count = rows.length + (update.next ? 1 : 0)

  useEffect(() => {
    if (count === 0) setOpen(false)
  }, [count])
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
        disabled={count === 0}
        aria-expanded={open}
        aria-label={count ? `알림 ${count}개` : '알림 없음'}
        title={count ? `알림 ${count}개` : '알림이 없습니다'}
        className={`relative ${open ? 'bg-black/[0.05] text-label' : ''}`}
      >
        <Bell {...ic} />
        {count > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-canvas" aria-hidden="true" />}
      </IconButton>
      {open && count > 0 && (
        <div className="mac-pop absolute right-0 top-9 z-40 max-h-[70vh] w-[min(380px,90vw)] overflow-y-auto py-1 text-[length:calc(14px*var(--ui-fs,1))]">
          <ul>
            {update.next && (
              <li className="flex items-center gap-2 bg-orange-50/70 px-3 py-2">
                <Sparkles size={16} strokeWidth={1.9} className="shrink-0 text-orange-600" />
                <div className="min-w-0 flex-1">
                  <span className="block text-xs text-orange-700">새 버전</span>
                  <span className="block text-label" title={update.next.notes.join(' · ')}>
                    {update.waiting ? '새 버전을 내려받는 중입니다. 준비되면 저절로 새로고침합니다(1~10분)' : update.checking ? '새 버전을 확인하는 중입니다…' : update.next.notes[0] ?? '새 버전이 나왔습니다. 새로고침해야 반영됩니다.'}
                  </span>
                </div>
                <Button variant="primary" size="sm" disabled={update.checking} onClick={() => void refreshToLatest()} title="저장 안 한 고친 내용은 이 브라우저에 남아 있어 사라지지 않습니다" className="shrink-0">
                  <RefreshCw {...icSm} className={update.waiting || update.checking ? 'animate-spin' : ''} />
                  {update.waiting ? '지금 다시 시도' : '새로고침'}
                </Button>
              </li>
            )}
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-1 pr-1.5 hover:bg-black/[0.04]">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    r.go?.()
                  }}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                  title="눌러서 해당 화면에서 보기"
                >
                  <span className="block text-xs text-label-3">{r.kind}</span>
                  <span className="block truncate text-label">{r.text}</span>
                </button>
                {r.onDelete && (
                  <button
                    type="button"
                    onClick={r.onDelete}
                    className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-xs text-label-3 hover:bg-black/[0.06] hover:text-danger"
                    title="이 알림을 영구 삭제합니다"
                  >
                    <Trash2 {...icSm} />
                    영구 삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

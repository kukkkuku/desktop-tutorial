// 화면 아래에 잠깐 떠 있다 사라지는 알림(토스트). 앱 어디서나 toast('…')로 띄운다.
// 화면 위에 줄을 끼워 넣지 않으니 표 · 버튼이 밀리지 않는다.
// 구글시트에 저장하라는 안내처럼 사용자가 해야 할 일이 남은 알림은 토스트로 쓰지 않는다(화면에 그대로).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastTone = 'info' | 'ok' | 'error'
interface ToastItem {
  id: number
  text: string
  tone: ToastTone
}

let seq = 0
let items: ToastItem[] = []
const listeners = new Set<(list: ToastItem[]) => void>()
const timers = new Map<number, number>()

function emit() {
  for (const l of listeners) l(items)
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id)
  const t = timers.get(id)
  if (t) window.clearTimeout(t)
  timers.delete(id)
  emit()
}

// 글이 길면 조금 더 오래(오류는 더 길게). 같은 글이 이미 떠 있으면 다시 띄우지 않고 시간만 늘린다.
export function toast(text: string, tone: ToastTone = 'ok') {
  const msg = text.trim()
  if (!msg) return
  const ms = Math.min(tone === 'error' ? 15000 : 9000, (tone === 'error' ? 6000 : 3500) + msg.length * 45)
  const same = items.find((t) => t.text === msg && t.tone === tone)
  const id = same ? same.id : ++seq
  if (!same) items = [...items.slice(-2), { id, text: msg, tone }]
  const old = timers.get(id)
  if (old) window.clearTimeout(old)
  timers.set(id, window.setTimeout(() => dismissToast(id), ms))
  emit()
}

const TONE: Record<ToastTone, { Icon: typeof Info; cls: string }> = {
  ok: { Icon: CheckCircle2, cls: 'text-emerald-300' },
  info: { Icon: Info, cls: 'text-sky-300' },
  error: { Icon: AlertCircle, cls: 'text-red-300' },
}

// App 맨 바깥에 한 번만 둔다.
export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items)
  useEffect(() => {
    listeners.add(setList)
    return () => {
      listeners.delete(setList)
    }
  }, [])
  if (list.length === 0) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {list.map((t) => {
        const { Icon, cls } = TONE[t.tone]
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-[640px] animate-[toast-in_.18s_ease-out] items-start gap-2.5 rounded-[12px] bg-[#27272A] py-2.5 pl-3.5 pr-2 text-[length:calc(14px*var(--ui-fs,1))] leading-snug text-white shadow-[0_8px_28px_rgba(0,0,0,0.25)]"
          >
            <Icon size={17} strokeWidth={2} className={`mt-px shrink-0 ${cls}`} />
            <span className="min-w-0 flex-1">{t.text}</span>
            <button onClick={() => dismissToast(t.id)} aria-label="닫기" className="shrink-0 rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white">
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

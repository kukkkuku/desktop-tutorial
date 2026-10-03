// 새 버전 알림: 배포된 version.json의 id가 지금 앱(__APP_BUILD__)과 다르면 화면 위에 띄워 새로고침하게 한다.
// 앱을 열 때 · 로그인할 때 · 창으로 돌아올 때 · 10분마다 확인한다. 닫기 없이 새로고침만(옛 화면을 계속 쓰지 않게).
// 저장 안 한 고친 내용은 이 브라우저에 남아 있어 새로고침해도 사라지지 않는다.
import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { LOGIN_EVENT } from '../utils/googleDrive'

interface Remote {
  id: string
  notes: string[]
}

async function fetchRemote(): Promise<Remote | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const v = (await r.json()) as Remote
    return v && typeof v.id === 'string' ? v : null
  } catch {
    return null
  }
}

export default function UpdateToast() {
  const [next, setNext] = useState<Remote | null>(null)
  useEffect(() => {
    if (import.meta.env.DEV) return
    let last = 0
    const check = async () => {
      if (Date.now() - last < 30 * 1000) return
      last = Date.now()
      const v = await fetchRemote()
      if (v && v.id !== __APP_BUILD__) setNext(v)
    }
    void check()
    const t = window.setInterval(() => void check(), 10 * 60 * 1000)
    const onBack = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener(LOGIN_EVENT, check)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener(LOGIN_EVENT, check)
    }
  }, [])
  if (!next) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex max-w-[760px] items-center gap-3 rounded-[12px] border border-[#F5B48A] bg-[#FFF3EA] px-4 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-[#7C2D12] shadow-pop"
      >
        <Sparkles size={17} strokeWidth={1.9} className="shrink-0 text-[#C2410C]" />
        <div className="min-w-0">
          <p className="font-semibold">새 버전이 나왔습니다. 새로고침해야 반영됩니다.</p>
          {next.notes.length > 0 && <p className="mt-0.5 truncate text-[length:calc(13px*var(--ui-fs,1))] text-[#9A3412]/85">{next.notes.join(' · ')}</p>}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-[#C2410C] px-3 font-semibold text-white hover:bg-[#9A3412]"
          title="저장 안 한 고친 내용은 이 브라우저에 남아 있어 사라지지 않습니다"
        >
          <RefreshCw size={15} strokeWidth={2} />
          새로고침
        </button>
      </div>
    </div>
  )
}

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

// 새 버전으로 새로고침: GitHub Pages는 index.html을 브라우저 · CDN에 최대 10분 캐시한다. version.json은 바로 새것이 와도
// index.html은 한동안 옛것이 와서, 그냥 새로고침하면 옛 화면이 다시 뜨고 알림도 다시 뜬다.
// 그래서 ① 캐시를 건너뛰고 index.html을 받아 그 안의 빌드 id(<meta name="app-build">)가 새 버전인지 확인하고
// ② 맞으면 처음 쓰는 주소(?v=새버전&t=시각)로 연다. 아직 옛것이면 잠시 뒤 다시 확인한다(알림에 「반영 중」).
async function htmlBuildId(): Promise<string | null> {
  try {
    const r = await fetch(`${window.location.pathname}?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const m = (await r.text()).match(/<meta name="app-build" content="([^"]+)"/)
    return m ? m[1] : null
  } catch {
    return null
  }
}
function openLatest(id: string) {
  const u = new URL(window.location.href)
  u.searchParams.set('v', id)
  u.searchParams.set('t', String(Date.now()))
  window.location.replace(u.toString())
}
// 새로고침으로 붙인 ?v= · ?t=는 주소에서 지운다(북마크 · 공유 주소가 지저분해지지 않게)
function dropVersionParam() {
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('v')) return
    u.searchParams.delete('v')
    u.searchParams.delete('t')
    window.history.replaceState(window.history.state, '', u.toString())
  } catch {
    // 무시
  }
}
// 방금 ?v=새버전으로 열었는데도 옛 화면이면(캐시가 아직 안 바뀜) 바로 「반영 중」으로 시작한다
const openedFor = (() => {
  try {
    return new URL(window.location.href).searchParams.get('v')
  } catch {
    return null
  }
})()

export default function UpdateToast() {
  useEffect(dropVersionParam, [])
  const [next, setNext] = useState<Remote | null>(null)
  // 새로고침을 눌렀는데 새 index.html이 아직 안 내려옴 → 15초마다 다시 확인하고, 내려오면 저절로 새로고침
  const [waiting, setWaiting] = useState(() => !!openedFor && openedFor !== __APP_BUILD__)
  const reload = async (id: string) => {
    const got = await htmlBuildId()
    // id를 못 읽으면(옛 빌드라 meta가 없는 등) 그냥 연다
    if (got === null || got === id) return openLatest(id)
    setWaiting(true)
  }
  useEffect(() => {
    if (!waiting || !next) return
    let tries = 0
    const t = window.setInterval(async () => {
      tries++
      const got = await htmlBuildId()
      if (got === next.id || tries >= 40) openLatest(next.id)
    }, 15 * 1000)
    return () => window.clearInterval(t)
  }, [waiting, next])
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
          <p className="font-semibold">
            {waiting ? '새 버전을 내려받는 중입니다. 준비되면 저절로 새로고침합니다(1~10분).' : '새 버전이 나왔습니다. 새로고침해야 반영됩니다.'}
          </p>
          {next.notes.length > 0 && <p className="mt-0.5 truncate text-[length:calc(13px*var(--ui-fs,1))] text-[#9A3412]/85">{next.notes.join(' · ')}</p>}
        </div>
        <button
          onClick={() => void (waiting ? openLatest(next.id) : reload(next.id))}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-[#C2410C] px-3 font-semibold text-white hover:bg-[#9A3412]"
          title="저장 안 한 고친 내용은 이 브라우저에 남아 있어 사라지지 않습니다"
        >
          <RefreshCw size={15} strokeWidth={2} className={waiting ? 'animate-spin' : ''} />
          {waiting ? '지금 다시 시도' : '새로고침'}
        </button>
      </div>
    </div>
  )
}

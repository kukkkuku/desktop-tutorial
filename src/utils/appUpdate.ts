// 새 버전 확인 · 새로고침(알림 종과 같이 쓰는 값).
// 배포된 version.json의 id가 지금 앱(__APP_BUILD__)보다 새것이면 「새 버전」 알림이 종 맨 위에 뜬다.
// id는 커밋 시각(ISO)이라 글자 크기 비교 = 시간 비교(서버가 잠깐 옛 version.json을 줘도 이미 새 화면이면 알림이 다시 뜨지 않는다).
// 앱을 열 때 · 로그인할 때 · 창으로 돌아올 때 · 10분마다 확인한다. 저장 안 한 고친 내용은 이 브라우저에 남아 있어 새로고침해도 사라지지 않는다.
//
// 새로고침이 안 먹히던 까닭: GitHub Pages는 index.html을 브라우저 · CDN에 최대 10분 캐시해서, version.json은 새것이 와도 index.html은 옛것이 온다.
//  ① 캐시를 건너뛰고 index.html을 받아 안의 빌드 id(<meta name="app-build">)가 새 버전인지 확인하고
//  ② 맞으면 처음 쓰는 주소(?v=새버전&t=시각)로 연다. 아직 옛것이면 15초마다 다시 확인한다(「반영 중」).
//  ③ 그리고 index.html 안에도 같은 확인(옛 화면으로 열렸으면 스스로 새 주소로 다시 열기)이 있어, 단추를 안 눌러도 옛 화면이 고쳐진다.
import { useSyncExternalStore } from 'react'
import { LOGIN_EVENT } from './googleDrive'

export interface UpdateState {
  next: { id: string; notes: string[] } | null
  waiting: boolean // 새 index.html이 아직 안 내려와 15초마다 다시 확인 중
  checking: boolean // 누른 직후 새 화면 파일을 확인하는 몇 초
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

let state: UpdateState = { next: null, waiting: !!openedFor && openedFor > __APP_BUILD__, checking: false }
const listeners = new Set<() => void>()
function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

// 응답이 오지 않아 버튼이 멈춘 것처럼 보이지 않게 8초에서 끊는다
function fetchFresh(url: string): Promise<Response> {
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined
  return fetch(url, { cache: 'no-store', signal })
}
async function fetchRemote(): Promise<{ id: string; notes: string[] } | null> {
  try {
    const r = await fetchFresh(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`)
    if (!r.ok) return null
    const v = (await r.json()) as { id?: unknown; notes?: unknown }
    return v && typeof v.id === 'string' ? { id: v.id, notes: Array.isArray(v.notes) ? (v.notes as string[]) : [] } : null
  } catch {
    return null
  }
}
async function htmlBuildId(): Promise<string | null> {
  try {
    const r = await fetchFresh(`${window.location.pathname}?t=${Date.now()}`)
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

// 종의 「새로고침」 단추
export async function refreshToLatest(): Promise<void> {
  const next = state.next
  if (!next) return
  if (state.waiting) return openLatest(next.id)
  set({ checking: true })
  const got = await htmlBuildId()
  // id를 못 읽으면(옛 빌드라 meta가 없는 등) 그냥 연다. 그새 더 새 버전이 올라왔으면 그것으로 연다.
  if (got === null || got >= next.id) return openLatest(got ?? next.id)
  set({ checking: false, waiting: true })
}

let started = false
let waitTimer: number | undefined
// 앱 시작 때 한 번 부른다
export function startUpdateWatch(): void {
  if (started) return
  started = true
  dropVersionParam()
  if (import.meta.env.DEV) return
  let last = 0
  const check = async () => {
    if (Date.now() - last < 30 * 1000) return
    last = Date.now()
    const v = await fetchRemote()
    if (v && v.id > __APP_BUILD__ && (!state.next || state.next.id < v.id)) set({ next: v })
  }
  void check()
  window.setInterval(() => void check(), 10 * 60 * 1000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void check())
  window.addEventListener(LOGIN_EVENT, check)
  // 반영 중이면 15초마다 새 index.html을 다시 확인하고, 내려오면 저절로 새로고침(최대 10분)
  let tries = 0
  waitTimer = window.setInterval(async () => {
    if (!state.waiting || !state.next) return
    tries++
    const got = await htmlBuildId()
    if ((got !== null && got >= state.next.id) || tries >= 40) openLatest(got !== null && got > state.next.id ? got : state.next.id)
  }, 15 * 1000)
  void waitTimer
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

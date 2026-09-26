// 영역: 홈(대문) / "과제 입력" / "성과관리". 머리글의 홈 · 영역 전환으로 오간다.
// 새로고침해도 같은 곳에 머물도록 이 탭(sessionStorage)에 기억하고, 새 창(새로 로그인)은 홈부터 연다.
import { createContext, useContext, useState, type ReactNode } from 'react'

export type AppMode = 'home' | 'perf' | 'tasks'
const KEY = 'app-mode'

function readMode(): AppMode {
  try {
    const v = sessionStorage.getItem(KEY)
    return v === 'perf' || v === 'tasks' || v === 'home' ? v : 'home'
  } catch {
    return 'home'
  }
}

const Ctx = createContext<{ mode: AppMode; setMode: (m: AppMode) => void }>({ mode: 'home', setMode: () => {} })

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(readMode)
  function setMode(m: AppMode) {
    try {
      sessionStorage.setItem(KEY, m)
    } catch {
      // 기억 못 해도 지금 화면 전환은 된다.
    }
    setModeState(m)
    window.scrollTo(0, 0)
  }
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>
}

export function useAppMode() {
  return useContext(Ctx)
}

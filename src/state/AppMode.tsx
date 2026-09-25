// 앱 첫 화면(메인)에서 "성과관리" / "과제 입력" 중 하나로 들어간다.
// 새로고침해도 같은 곳에 머물도록 이 탭(sessionStorage)에만 기억하고, 새 창은 메인부터 연다.
import { createContext, useContext, useState, type ReactNode } from 'react'

export type AppMode = 'home' | 'perf' | 'tasks'
const KEY = 'app-mode'

function readMode(): AppMode {
  try {
    const v = sessionStorage.getItem(KEY)
    return v === 'perf' || v === 'tasks' ? v : 'home'
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

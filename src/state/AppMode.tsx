// 영역: "과제 입력" / "성과관리". 머리글의 영역 전환으로 오간다(메인 화면은 없앴다).
// 새로고침해도 같은 곳에 머물도록 이 탭(sessionStorage)에 기억하고, 새 창은 이 브라우저에서
// 마지막에 쓴 영역(localStorage)으로 연다. 처음이면 과제 입력.
import { createContext, useContext, useState, type ReactNode } from 'react'

export type AppMode = 'perf' | 'tasks'
const KEY = 'app-mode'
const LAST_KEY = 'app-mode:last'

function readMode(): AppMode {
  try {
    const v = sessionStorage.getItem(KEY) ?? localStorage.getItem(LAST_KEY)
    return v === 'perf' || v === 'tasks' ? v : 'tasks'
  } catch {
    return 'tasks'
  }
}

const Ctx = createContext<{ mode: AppMode; setMode: (m: AppMode) => void }>({ mode: 'tasks', setMode: () => {} })

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(readMode)
  function setMode(m: AppMode) {
    try {
      sessionStorage.setItem(KEY, m)
      localStorage.setItem(LAST_KEY, m)
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

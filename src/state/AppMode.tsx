// 영역: 홈(대문) / "과제 입력" / "성과관리"와 그 안의 메뉴. 왼쪽 사이드바에서 어디로든 한 번에 간다.
// 새로고침해도 같은 곳에 머물도록 이 탭(sessionStorage)에 기억하고, 새 창(새로 로그인)은 홈부터 연다.
import { createContext, useContext, useState, type ReactNode } from 'react'

export type AppMode = 'home' | 'perf' | 'tasks' | 'admin' // admin = 관리(권한 시트 · 팀원 초대, 관리자만)
// 과제 입력 메뉴
export type TaskMenu = 'progress' | 'rate'
// 성과관리 메뉴(평가하기는 과제별 'tasks' / 팀원별 'evaluate' 두 보기)
export type PerfStage = 'work' | 'tasks' | 'members' | 'evaluate' | 'results' | 'notes'

const KEY = 'app-mode'
const MENU_KEY = 'app-task-menu'
const STAGE_KEY = 'app-perf-stage'

function read<T extends string>(key: string, ok: readonly T[], def: T): T {
  try {
    const v = sessionStorage.getItem(key) as T | null
    return v && ok.includes(v) ? v : def
  } catch {
    return def
  }
}
function write(key: string, v: string) {
  try {
    sessionStorage.setItem(key, v)
  } catch {
    // 기억 못 해도 지금 화면 전환은 된다.
  }
}

interface Ctx {
  mode: AppMode
  setMode: (m: AppMode) => void
  taskMenu: TaskMenu
  setTaskMenu: (m: TaskMenu) => void
  perfStage: PerfStage
  setPerfStage: (s: PerfStage) => void
}

const ModeCtx = createContext<Ctx>({ mode: 'home', setMode: () => {}, taskMenu: 'progress', setTaskMenu: () => {}, perfStage: 'work', setPerfStage: () => {} })

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(() => read(KEY, ['home', 'perf', 'tasks', 'admin'], 'home'))
  const [taskMenu, setTaskMenuState] = useState<TaskMenu>(() => read(MENU_KEY, ['progress', 'rate'], 'progress'))
  const [perfStage, setPerfStageState] = useState<PerfStage>(() => read(STAGE_KEY, ['work', 'tasks', 'members', 'evaluate', 'results', 'notes'], 'work'))
  function setMode(m: AppMode) {
    write(KEY, m)
    setModeState(m)
    window.scrollTo(0, 0)
  }
  function setTaskMenu(m: TaskMenu) {
    write(MENU_KEY, m)
    setTaskMenuState(m)
    window.scrollTo(0, 0)
  }
  function setPerfStage(s: PerfStage) {
    write(STAGE_KEY, s)
    setPerfStageState(s)
    window.scrollTo(0, 0)
  }
  return <ModeCtx.Provider value={{ mode, setMode, taskMenu, setTaskMenu, perfStage, setPerfStage }}>{children}</ModeCtx.Provider>
}

export function useAppMode() {
  return useContext(ModeCtx)
}

// 표(평가과제·팀원)에서 쓰는 되돌리기/다시하기. 바꾸기 직전의 앱 상태 전체를
// 기억해 두었다가 LOAD_STATE로 되돌린다 -- 삭제가 기여도·피어리뷰까지 함께
// 지우므로, 목록 하나만 되돌리면 딸린 데이터가 돌아오지 않기 때문이다.
import { useCallback, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { AppState } from '../types'

const LIMIT = 50

export function useStateHistory() {
  const { state, dispatch } = useAppState()
  const undoStack = useRef<AppState[]>([])
  const redoStack = useRef<AppState[]>([])
  const [, bump] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state

  // 바꾸기 직전에 부른다.
  const record = useCallback(() => {
    undoStack.current = [...undoStack.current, stateRef.current].slice(-LIMIT)
    redoStack.current = []
    bump((n) => n + 1)
  }, [])

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(stateRef.current)
    dispatch({ type: 'LOAD_STATE', payload: prev })
    bump((n) => n + 1)
  }, [dispatch])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(stateRef.current)
    dispatch({ type: 'LOAD_STATE', payload: next })
    bump((n) => n + 1)
  }, [dispatch])

  return { record, undo, redo, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 }
}

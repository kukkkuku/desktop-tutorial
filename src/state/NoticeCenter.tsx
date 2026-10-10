// 종(NoticeBell)에 모이는 알림 목록 -- 성과관리 화면(PerfNoticeSource)이 자기 알림을 여기에 올려 두면, 머리 줄의 종이 어느 화면에서나 같이 보여 준다.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface NoticeRow {
  key: string
  kind: string // 작은 글씨 종류
  text: string // 한 줄 내용
  go?: () => void // 줄을 누르면(해당 화면에서 다시 띄우기)
  onDelete?: () => void // 「영구 삭제」
}

interface Ctx {
  rows: NoticeRow[]
  setRows: (rows: NoticeRow[]) => void
}
const NoticeCtx = createContext<Ctx>({ rows: [], setRows: () => {} })

export function NoticeCenterProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<NoticeRow[]>([])
  const value = useMemo(() => ({ rows, setRows }), [rows])
  return <NoticeCtx.Provider value={value}>{children}</NoticeCtx.Provider>
}
export const useNoticeCenter = () => useContext(NoticeCtx)

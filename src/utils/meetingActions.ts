import type { MeetingActionItem, MeetingNote } from '../types'

export interface IncompleteAction extends MeetingActionItem {
  noteId: string
  noteDate: string
}

// 지난 면담에서 만든 Action 중 완료되지 않은 항목만 최신순으로 모은다 — 다음 면담
// 준비 화면에서 자동으로 다시 보여주기 위함.
export function getIncompleteActions(notes: MeetingNote[], memberId: string): IncompleteAction[] {
  return notes
    .filter((n) => n.memberId === memberId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((n) => (n.actions ?? []).filter((a) => !a.done).map((a) => ({ ...a, noteId: n.id, noteDate: n.date })))
}

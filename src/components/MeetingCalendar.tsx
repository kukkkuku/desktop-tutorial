import { useMemo, useState } from 'react'
import type { MeetingNote, TeamMember } from '../types'
import ExpandCollapseIcon from './ExpandCollapseIcon'

const COLORS = ['bg-orange-500', 'bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500']

export default function MeetingCalendar({ notes, members, open, onToggle }: { notes: MeetingNote[]; members: TeamMember[]; open: boolean; onToggle: () => void }) {
  const today = new Date()
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => today.toISOString().slice(0, 10))
  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])
  const scheduled = useMemo(() => [...notes].sort((a, b) => a.date.localeCompare(b.date)), [notes])
  const upcoming = scheduled.find((note) => note.date >= today.toISOString().slice(0, 10))

  if (!open) return <button type="button" onClick={onToggle} title="면담 일정 펼치기" aria-label="면담 일정 펼치기" className="m-2 flex w-[76px] self-start flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-300"><span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.8"><path d="M6 3v3M18 3v3M4 8h16M5 5h14v15H5z"/></svg>면담</span>{upcoming ? <><span className="text-[11px] font-semibold text-gray-600">{upcoming.date.slice(5).replace('-', '/')}</span><span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" />{memberMap.get(upcoming.memberId)?.name}</span></> : <span className="text-[10px] text-gray-400">일정 없음</span>}</button>

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const previousDays = new Date(year, monthIndex, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayOffset = index - firstDay + 1
    const date = dayOffset < 1 ? new Date(year, monthIndex - 1, previousDays + dayOffset) : dayOffset > daysInMonth ? new Date(year, monthIndex + 1, dayOffset - daysInMonth) : new Date(year, monthIndex, dayOffset)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { date, value, current: date.getMonth() === monthIndex, hasMeeting: notes.some((note) => note.date === value) }
  })
  const selectedNotes = scheduled.filter((note) => note.date === selectedDate)

  return <aside className="m-2 self-start rounded-lg border border-gray-200 bg-white p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-950">면담 일정</h3><button type="button" onClick={onToggle} className="ui-button ui-button-ghost ui-button-sm h-8 w-8 px-0" title="면담 일정 축소" aria-label="면담 일정 축소"><ExpandCollapseIcon expanded /></button></div>
    <div className="mt-3 flex items-center justify-between"><button type="button" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} className="ui-button ui-button-ghost ui-button-sm">‹</button><strong className="text-sm">{year}년 {monthIndex + 1}월</strong><button type="button" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} className="ui-button ui-button-ghost ui-button-sm">›</button></div>
    <div className="mt-2 grid text-center text-[10px] text-gray-400" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>{['일','월','화','수','목','금','토'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="mt-1 grid gap-y-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>{cells.map((cell) => <button key={cell.value} type="button" onClick={() => setSelectedDate(cell.value)} className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-md text-xs ${cell.value === selectedDate ? 'bg-blue-600 text-white' : cell.current ? 'text-gray-900 hover:bg-gray-100' : 'text-gray-300'}`}>{cell.date.getDate()}{cell.hasMeeting && <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${cell.value === selectedDate ? 'bg-white' : 'bg-orange-500'}`} />}</button>)}</div>
    <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-b border-gray-200 pb-3">{members.map((member, index) => <span key={member.id} className="flex items-center gap-1 text-[10px] text-gray-500"><span className={`h-1.5 w-1.5 rounded-full ${COLORS[index % COLORS.length]}`} />{member.name}</span>)}</div>
    <div className="pt-3"><h4 className="text-xs font-semibold text-gray-800">{selectedDate.slice(5).replace('-', '/')} 면담</h4>{selectedNotes.length === 0 ? <p className="mt-2 text-xs text-gray-400">이 날짜에 등록된 면담이 없습니다.</p> : selectedNotes.map((note) => <div key={note.id} className="mt-2 border-t border-gray-100 pt-2"><p className="text-xs font-medium">{memberMap.get(note.memberId)?.name}</p><p className="mt-1 line-clamp-2 text-xs text-gray-500">{note.comment}</p></div>)}</div>
    <div className="mt-4 border-t border-gray-200 pt-3"><h4 className="text-xs font-semibold text-gray-800">이후 예정 ({scheduled.filter((note) => note.date >= today.toISOString().slice(0, 10)).length}건)</h4>{scheduled.filter((note) => note.date >= today.toISOString().slice(0, 10)).slice(0, 3).map((note) => <p key={note.id} className="mt-2 text-xs text-gray-500">{note.date.slice(5).replace('-', '/')} · {memberMap.get(note.memberId)?.name}</p>)}</div>
  </aside>
}

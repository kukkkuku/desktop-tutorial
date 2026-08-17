import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import type { MeetingNote } from '../../types'
import { colorForIndex } from '../../utils/memberColors'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}
function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function fmtShort(date: string): string {
  return date.slice(5).replace('-', '/')
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function Chevron({ dir, className }: { dir: 'left' | 'right'; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

interface MeetingSchedulePanelProps {
  open: boolean
  onToggle: () => void
  onSelectMember: (memberId: string) => void
}

// 우측 면담 일정 -- 상시 고정 패널(접기 가능). 예전 Drawer 대신 첨부 디자인처럼
// 우측에 붙는 컬럼. 접으면 얇은 세로 바만 남는다.
export default function MeetingSchedulePanel({ open, onToggle, onSelectMember }: MeetingSchedulePanelProps) {
  const { state, dispatch } = useAppState()
  const { members, meetingNotes } = state
  const todayStr = todayString()

  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [addMemberId, setAddMemberId] = useState<string | null>(members[0]?.id ?? null)

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border border-gray-200 py-3 text-gray-500 hover:bg-gray-50"
        title="면담 일정 펼치기"
      >
        <CalendarIcon className="h-4 w-4" />
        <span className="text-[11px] font-semibold [writing-mode:vertical-rl]">면담 일정</span>
      </button>
    )
  }

  const notesByDate = new Map<string, number[]>()
  meetingNotes.forEach((n) => {
    const idx = members.findIndex((m) => m.id === n.memberId)
    if (idx === -1) return
    const list = notesByDate.get(n.date) ?? []
    if (!list.includes(idx)) list.push(idx)
    notesByDate.set(n.date, list)
  })

  const upcoming = Array.from(notesByDate.entries())
    .filter(([date]) => date > todayStr)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([date, idxs]) => ({ date, idxs }))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const cells: { date: string; day: number; inMonth: boolean }[] = []
  for (let i = 0; i < startWeekday; i++) {
    const day = daysInPrev - startWeekday + 1 + i
    const y = month === 0 ? year - 1 : year
    const m = month === 0 ? 11 : month - 1
    cells.push({ date: fmtDate(y, m, day), day, inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: fmtDate(year, month, day), day, inMonth: true })
  let nd = 1
  while (cells.length < 42) {
    const y = month === 11 ? year + 1 : year
    const m = month === 11 ? 0 : month + 1
    cells.push({ date: fmtDate(y, m, nd), day: nd, inMonth: false })
    nd += 1
  }

  const dayNotes = members
    .map((member, idx) => ({ member, idx, note: meetingNotes.find((n) => n.memberId === member.id && n.date === selectedDate) }))
    .filter((x): x is { member: (typeof members)[number]; idx: number; note: MeetingNote } => !!x.note)
  const todayMembers = members.map((member, idx) => ({ member, idx })).filter(({ member }) => meetingNotes.some((n) => n.memberId === member.id && n.date === todayStr))

  function addSchedule() {
    const memberId = addMemberId ?? members[0]?.id
    if (!memberId) return
    dispatch({ type: 'ADD_MEETING_NOTE', payload: { id: uuidv4(), memberId, date: selectedDate, comment: '' } })
  }

  return (
    <div className="w-[300px] shrink-0 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-black">면담 일정</h3>
        <button onClick={onToggle} title="접기" className="rounded-md px-1.5 text-gray-400 hover:bg-gray-100">
          »
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="이전 달" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100">
          <Chevron dir="left" className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-black">
          {year}년 {month + 1}월
        </span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="다음 달" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100">
          <Chevron dir="right" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dotIdxs = notesByDate.get(cell.date) ?? []
          const isToday = cell.date === todayStr
          const isSelected = cell.date === selectedDate
          return (
            <button
              key={cell.date}
              onClick={() => setSelectedDate(cell.date)}
              className={`flex h-8 flex-col items-center justify-center gap-0.5 rounded-md text-[12px] transition-colors ${
                !cell.inMonth ? 'text-gray-300 hover:bg-gray-50' : isSelected ? 'bg-accent font-semibold text-white' : isToday ? 'bg-orange-50 font-semibold text-accent' : 'text-black hover:bg-gray-100'
              }`}
            >
              {cell.day}
              {dotIdxs.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {dotIdxs.slice(0, 3).map((idx) => (
                    <span key={idx} className="h-1 w-1 rounded-full" style={{ background: isSelected ? '#fff' : colorForIndex(idx) }} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1">
        {members.map((m, idx) => (
          <span key={m.id} className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
            {m.name}
          </span>
        ))}
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3">
        <p className="text-[13px] font-semibold text-black">{fmtShort(selectedDate)} 면담</p>
        <div className="mt-1.5 space-y-1">
          {dayNotes.length === 0 ? (
            <p className="text-[13px] text-gray-400">이 날짜에 등록된 면담이 없습니다.</p>
          ) : (
            dayNotes.map(({ member, idx, note }) => (
              <button key={note.id} onClick={() => onSelectMember(member.id)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] hover:bg-gray-100">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                <span className="shrink-0 font-medium text-black">{member.name}</span>
                <span className="truncate text-gray-500">{note.comment || '(코멘트 없음)'}</span>
              </button>
            ))
          )}
          <div className="mt-1 flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
            <select value={addMemberId ?? ''} onChange={(e) => setAddMemberId(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-[12px] text-black">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button onClick={addSchedule} className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90">
              추가
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3">
        <p className="text-[13px] font-semibold text-black">오늘 일정</p>
        {todayMembers.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {todayMembers.map(({ member, idx }) => (
              <button key={member.id} onClick={() => onSelectMember(member.id)} className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[12px] font-semibold text-accent hover:bg-orange-100">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                {member.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[13px] text-gray-400">등록된 일정이 없습니다.</p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <p className="text-[13px] font-semibold text-black">이후 예정 ({upcoming.length}건)</p>
          <div className="mt-1.5 space-y-1.5">
            {upcoming.map(({ date, idxs }) => (
              <div key={date} className="flex items-center gap-2 text-[12px]">
                <span className="shrink-0 font-medium text-gray-500">{fmtShort(date)}</span>
                <div className="flex flex-wrap gap-1">
                  {idxs.map((idx) => {
                    const member = members[idx]
                    if (!member) return null
                    return (
                      <button key={idx} onClick={() => onSelectMember(member.id)} className="flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-600 hover:bg-gray-200">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                        {member.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

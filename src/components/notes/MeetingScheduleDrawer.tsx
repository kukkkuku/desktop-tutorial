import { useEffect, useState } from 'react'
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

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

function ChevronIcon({ direction, className }: { direction: 'left' | 'right'; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

interface MeetingScheduleDrawerProps {
  open: boolean
  onClose: () => void
  onSelectMember: (memberId: string) => void
}

// 평소에는 닫혀 있는 면담 일정 Drawer -- 예전에는 캘린더가 항상 화면 오른쪽을
// 차지했는데, 팀장이 실제로 면담 중일 때는 방해만 되므로 상단 버튼으로 열고
// 닫는 패널로 분리했다. 날짜/팀원을 클릭하면 그 팀원의 성장 관리 화면으로 바로
// 이동한다.
export default function MeetingScheduleDrawer({ open, onClose, onSelectMember }: MeetingScheduleDrawerProps) {
  const { state, dispatch } = useAppState()
  const { members, meetingNotes } = state
  const todayStr = todayString()

  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [dayAddMemberId, setDayAddMemberId] = useState<string | null>(members[0]?.id ?? null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const todayMembers = members
    .map((member, idx) => ({ member, idx }))
    .filter(({ member }) => meetingNotes.some((n) => n.memberId === member.id && n.date === todayStr))

  const notesByDate = new Map<string, number[]>()
  meetingNotes.forEach((n) => {
    const idx = members.findIndex((m) => m.id === n.memberId)
    if (idx === -1) return
    const list = notesByDate.get(n.date) ?? []
    if (!list.includes(idx)) list.push(idx)
    notesByDate.set(n.date, list)
  })

  const upcomingDates = Array.from(notesByDate.entries())
    .filter(([date]) => date > todayStr)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([date, idxs]) => ({ date, idxs }))

  function handleDayAdd() {
    const memberId = dayAddMemberId ?? members[0]?.id
    if (!memberId) return
    const note: MeetingNote = { id: uuidv4(), memberId, date: selectedDate, comment: '' }
    dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
  }

  function goToMember(memberId: string) {
    onSelectMember(memberId)
    onClose()
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells: { date: string; day: number; inMonth: boolean }[] = []
  for (let i = 0; i < startWeekday; i++) {
    const day = daysInPrevMonth - startWeekday + 1 + i
    const y = month === 0 ? year - 1 : year
    const m = month === 0 ? 11 : month - 1
    cells.push({ date: fmtDate(y, m, day), day, inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: fmtDate(year, month, day), day, inMonth: true })
  }
  let nextDay = 1
  while (cells.length < 42) {
    const y = month === 11 ? year + 1 : year
    const m = month === 11 ? 0 : month + 1
    cells.push({ date: fmtDate(y, m, nextDay), day: nextDay, inMonth: false })
    nextDay += 1
  }

  const dayNotes = members
    .map((member, idx) => ({ member, idx, note: meetingNotes.find((n) => n.memberId === member.id && n.date === selectedDate) }))
    .filter((x): x is { member: (typeof members)[number]; idx: number; note: MeetingNote } => !!x.note)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-xl sm:w-[380px]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <p className="text-lg font-bold text-black">면담 일정</p>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              aria-label="이전 달"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
            >
              <ChevronIcon direction="left" className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-black">
              {year}년 {month + 1}월
            </span>
            <button
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              aria-label="다음 달"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
            >
              <ChevronIcon direction="right" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[13px] text-gray-400">
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
                  title={cell.date}
                  className={`flex h-9 flex-col items-center justify-center gap-0.5 rounded-md text-[13px] transition-colors ${
                    !cell.inMonth
                      ? 'text-gray-300 hover:bg-gray-50'
                      : isSelected
                        ? 'bg-accent font-semibold text-white'
                        : isToday
                          ? 'bg-orange-50 font-semibold text-accent'
                          : 'text-black hover:bg-gray-100'
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

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {members.map((m, idx) => (
              <span key={m.id} className="flex items-center gap-1 text-[13px] text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                {m.name}
              </span>
            ))}
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3">
            <p className="text-[13px] font-semibold text-black">{fmtShort(selectedDate)} 면담</p>
            <div className="mt-1.5 space-y-1.5">
              {dayNotes.length === 0 ? (
                <p className="text-[13px] text-gray-400">이 날짜에 등록된 면담이 없습니다.</p>
              ) : (
                <div className="space-y-0.5">
                  {dayNotes.map(({ member, idx, note }) => (
                    <button
                      key={note.id}
                      onClick={() => goToMember(member.id)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-gray-100"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                      <span className="shrink-0 font-medium text-black">{member.name}</span>
                      <span className="truncate text-gray-500">{note.comment || '(코멘트 없음)'}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                <select
                  value={dayAddMemberId ?? ''}
                  onChange={(e) => setDayAddMemberId(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-[13px] text-black"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleDayAdd}
                  className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
                >
                  일정 추가
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 px-3 py-3">
            <p className="text-[13px] font-semibold text-black">오늘 {todayStr}</p>
            {todayMembers.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {todayMembers.map(({ member, idx }) => (
                  <button
                    key={member.id}
                    onClick={() => goToMember(member.id)}
                    className="flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-accent hover:bg-orange-100"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                    {member.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[13px] text-gray-400">오늘 예정된 면담이 없습니다.</p>
            )}
          </div>

          {upcomingDates.length > 0 && (
            <div className="mt-3">
              <p className="text-[13px] font-semibold text-gray-500">다가오는 일정</p>
              <div className="mt-1.5 space-y-2">
                {upcomingDates.map(({ date, idxs }) => (
                  <div key={date} className="flex items-center gap-2 text-[13px]">
                    <span className="shrink-0 font-medium text-gray-500">{fmtShort(date)}</span>
                    <div className="flex flex-wrap gap-1">
                      {idxs.map((idx) => {
                        const member = members[idx]
                        if (!member) return null
                        return (
                          <button
                            key={idx}
                            onClick={() => goToMember(member.id)}
                            className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 hover:bg-gray-200"
                          >
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
      </div>
    </div>
  )
}

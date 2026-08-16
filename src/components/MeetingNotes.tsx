import { useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { MeetingNote } from '../types'
import { calcMemberResults, GRADE_COLORS } from '../utils/calculations'
import ConfirmDialog from './ConfirmDialog'

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

// Cycled per member (by list order) so both the calendar dots and the
// legend stay stable and consistent for a given roster.
const MEMBER_DOT_COLORS = ['#EB6100', '#22C55E', '#3B82F6', '#A855F7', '#EAB308', '#EC4899', '#14B8A6', '#F97316']
function colorForIndex(index: number): string {
  return MEMBER_DOT_COLORS[index % MEMBER_DOT_COLORS.length]
}

function ChevronIcon({ direction, className }: { direction: 'left' | 'right'; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

export default function MeetingNotes() {
  const { state, dispatch } = useAppState()
  const { members, meetingNotes, tasks, contributions, criteria, peerReviews } = state
  const todayStr = todayString()

  const memberResults = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const memberResultById = new Map(memberResults.map((r, i) => [r.member.id, { ...r, rank: i + 1 }]))

  const [calendarOpen, setCalendarOpen] = useState(true)
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [newDate, setNewDate] = useState(todayStr)
  const [newComment, setNewComment] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)
  const [dayAddMemberId, setDayAddMemberId] = useState<string | null>(null)

  const activeMemberId = selectedMemberId ?? members[0]?.id ?? null
  const activeMemberIdx = members.findIndex((m) => m.id === activeMemberId)
  const activeMember = activeMemberIdx >= 0 ? members[activeMemberIdx] : null

  function memberSchedule(memberId: string) {
    const notes = meetingNotes.filter((n) => n.memberId === memberId)
    const all = [...notes].sort((a, b) => b.date.localeCompare(a.date))
    return { all }
  }

  // Members with a meeting logged for today -- surfaced in the calendar panel
  // so it's obvious at a glance who's up for a meeting right now.
  const todayMembers = members
    .map((member, idx) => ({ member, idx }))
    .filter(({ member }) => meetingNotes.some((n) => n.memberId === member.id && n.date === todayStr))

  const notesByDate = useMemo(() => {
    const map = new Map<string, number[]>()
    meetingNotes.forEach((n) => {
      const idx = members.findIndex((m) => m.id === n.memberId)
      if (idx === -1) return
      const list = map.get(n.date) ?? []
      if (!list.includes(idx)) list.push(idx)
      map.set(n.date, list)
    })
    return map
  }, [meetingNotes, members])

  const upcomingDates = Array.from(notesByDate.entries())
    .filter(([date]) => date >= todayStr)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, idxs]) => ({ date, idxs }))

  function handleAdd(memberId: string) {
    if (!memberId || !newDate || !newComment.trim()) return
    dispatch({
      type: 'ADD_MEETING_NOTE',
      payload: { id: uuidv4(), memberId, date: newDate, comment: newComment.trim() },
    })
    setNewComment('')
  }

  function selectMember(memberId: string) {
    setSelectedMemberId(memberId)
    setNewDate(todayStr)
    setNewComment('')
  }

  function selectDate(date: string) {
    setSelectedDate(date)
  }

  function handleDayAdd() {
    const memberId = dayAddMemberId ?? activeMemberId
    if (!memberId) return
    dispatch({
      type: 'ADD_MEETING_NOTE',
      payload: { id: uuidv4(), memberId, date: selectedDate, comment: '' },
    })
  }

  function startEdit(note: MeetingNote) {
    setEditingNoteId(note.id)
    setEditDate(note.date)
    setEditComment(note.comment)
  }

  function cancelEdit() {
    setEditingNoteId(null)
  }

  function saveEdit(note: MeetingNote) {
    if (!editDate || !editComment.trim()) return
    dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, date: editDate, comment: editComment.trim() } })
    setEditingNoteId(null)
  }

  function handleDeleteConfirm() {
    if (deletingNote) {
      dispatch({ type: 'DELETE_MEETING_NOTE', payload: { id: deletingNote.id } })
      setDeletingNote(null)
    }
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  // Monday-first grid, matching the reference layout (월 화 수 목 금 토 일).
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

  const activeResult = activeMemberId ? memberResultById.get(activeMemberId) : undefined
  const activeAll = activeMemberId ? memberSchedule(activeMemberId).all : []

  return (
    <div>
      <h2 className="text-xl font-bold text-black">팀원 면담</h2>
      <p className="mt-1 text-sm text-gray-600">
        팀원을 선택하면 성과 요약과 면담 기록을 볼 수 있습니다. 오른쪽 캘린더에서는 팀 전체의 면담 일정을
        한눈에 확인할 수 있습니다.
      </p>

      {members.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          등록된 팀원이 없습니다. 팀원 관리에서 먼저 팀원을 등록하세요.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2 px-1 pb-3">
              {members.map((member, idx) => {
                const isActive = member.id === activeMemberId
                return (
                  <button
                    key={member.id}
                    onClick={() => selectMember(member.id)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      isActive ? 'bg-accent text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: isActive ? '#fff' : colorForIndex(idx) }}
                    />
                    {member.name}
                  </button>
                )
              })}
            </div>

            {activeMember && (
              <div className="space-y-3 rounded-lg border border-gray-200 px-4 py-4">
                <div>
                  <p className="text-lg font-bold text-black">{activeMember.name}</p>
                  {activeMember.role && <p className="text-xs text-gray-400">{activeMember.role}</p>}
                </div>

                {activeResult ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px]">
                    <span className="font-semibold text-black">순위 {activeResult.rank}위</span>
                    <span className="text-gray-600">
                      누적 점수 <span className="font-semibold text-black">{activeResult.cumulativeScore.toFixed(1)}</span>
                    </span>
                    <span className="text-gray-600">
                      종합 점수(가중평균){' '}
                      <span className="font-semibold text-black">{activeResult.weightedAverageScore.toFixed(1)}</span>
                    </span>
                    <span className="text-gray-600">
                      참여 과제 <span className="font-semibold text-black">{activeResult.participatedTaskCount}건</span>
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold ${GRADE_COLORS[activeResult.grade]}`}>
                      평가등급 {activeResult.grade}
                    </span>
                  </div>
                ) : (
                  <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-400">
                    비활성 팀원이거나 아직 평가 데이터가 없어 성과를 표시할 수 없습니다.
                  </p>
                )}

                <div className="flex flex-wrap items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-3">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                  />
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="면담 코멘트를 입력하세요"
                    rows={2}
                    className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                  />
                  <button
                    onClick={() => handleAdd(activeMember.id)}
                    disabled={!newComment.trim()}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    기록 추가
                  </button>
                </div>

                {activeAll.length === 0 && <p className="text-[13px] text-gray-400">아직 면담 기록이 없습니다.</p>}
                {activeAll.map((note) =>
                  editingNoteId === note.id ? (
                    <div key={note.id} className="flex flex-wrap items-start gap-2 rounded-md border border-gray-300 bg-white px-3 py-3">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                      />
                      <textarea
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                        rows={2}
                        className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(note)}
                          disabled={!editComment.trim()}
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          저장
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-100"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={note.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-gray-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-500">
                          {note.date}
                          {note.date >= todayStr && (
                            <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[13px] font-bold text-accent">
                              예정
                            </span>
                          )}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-black">{note.comment}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => startEdit(note)}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-100"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => setDeletingNote(note)}
                          className="rounded-md border border-danger px-3 py-1 text-xs font-medium text-danger hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <div className={`flex w-full shrink-0 flex-col gap-2 self-start ${calendarOpen ? 'lg:w-80' : 'lg:w-44'}`}>
            {calendarOpen ? (
            <div className="rounded-lg border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-black">
                  <CalendarIcon className="h-4 w-4 text-gray-400" /> 면담 일정
                </span>
                <button
                  onClick={() => setCalendarOpen(false)}
                  title="접기"
                  aria-label="캘린더 접기"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4">
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
                        onClick={() => selectDate(cell.date)}
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
                              <span
                                key={idx}
                                className="h-1 w-1 rounded-full"
                                style={{ background: isSelected ? '#fff' : colorForIndex(idx) }}
                              />
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
                  {(() => {
                    const dayNotes = members
                      .map((member, idx) => ({ member, idx, note: meetingNotes.find((n) => n.memberId === member.id && n.date === selectedDate) }))
                      .filter((x): x is { member: (typeof members)[number]; idx: number; note: MeetingNote } => !!x.note)
                    if (dayNotes.length === 0) {
                      return (
                        <div className="mt-1.5 space-y-1.5">
                          <p className="text-[13px] text-gray-400">이 날짜에 등록된 면담이 없습니다.</p>
                          <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                            <select
                              value={dayAddMemberId ?? activeMemberId ?? ''}
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
                              추가
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div className="mt-1.5 space-y-0.5">
                        {dayNotes.map(({ member, idx, note }) => (
                          <button
                            key={note.id}
                            onClick={() => selectMember(member.id)}
                            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-gray-100"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                            <span className="shrink-0 font-medium text-black">{member.name}</span>
                            <span className="truncate text-gray-500">{note.comment}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
            ) : (
              <button
                onClick={() => setCalendarOpen(true)}
                className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
                title="펼치기"
                aria-label="면담 일정 캘린더 펼치기"
              >
                <CalendarIcon className="h-4 w-4" />
                면담 일정
              </button>
            )}

            {!calendarOpen && (
              <>
                <div className="px-1 py-1.5 text-[13px]">
                  <span className="font-medium text-gray-500">오늘</span>
                  <div className="mt-1 flex flex-col items-start gap-1">
                    {todayMembers.length > 0 ? (
                      todayMembers.map(({ member, idx }) => (
                        <button
                          key={member.id}
                          onClick={() => selectMember(member.id)}
                          className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-accent hover:bg-orange-100"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                          {member.name}
                        </button>
                      ))
                    ) : (
                      <span className="text-gray-400">예정 없음</span>
                    )}
                  </div>
                </div>
                {upcomingDates
                  .filter(({ date }) => date !== todayStr)
                  .map(({ date, idxs }) => (
                    <div key={date} className="px-1 py-1.5 text-[13px]">
                      <span className="font-medium text-gray-500">{fmtShort(date)}</span>
                      <div className="mt-1 flex flex-col items-start gap-1">
                        {idxs.map((idx) => {
                          const member = members[idx]
                          if (!member) return null
                          return (
                            <button
                              key={idx}
                              onClick={() => selectMember(member.id)}
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
              </>
            )}

            {calendarOpen && (
              <>
                <div className="rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-black">오늘 {todayStr}</span>
                    {todayMembers.length > 0 && (
                      <span className="text-[13px] text-gray-400">오늘 면담 예정인 팀원 — 바로 진행 가능</span>
                    )}
                  </div>
                  {todayMembers.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {todayMembers.map(({ member, idx }) => (
                        <button
                          key={member.id}
                          onClick={() => selectMember(member.id)}
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

                {upcomingDates
                  .filter(({ date }) => date !== todayStr)
                  .map(({ date, idxs }) => (
                    <div key={date} className="rounded-lg border border-gray-200 px-4 py-3">
                      <span className="text-[13px] font-semibold text-black">{date}</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {idxs.map((idx) => {
                          const member = members[idx]
                          if (!member) return null
                          return (
                            <button
                              key={idx}
                              onClick={() => selectMember(member.id)}
                              className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[13px] font-medium text-gray-600 hover:bg-gray-200"
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                              {member.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingNote !== null}
        title="면담 기록 삭제"
        message={`${deletingNote?.date} 면담 기록을 삭제하시겠습니까?`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingNote(null)}
      />
    </div>
  )
}

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

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
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
  const [quickMemberId, setQuickMemberId] = useState(members[0]?.id ?? '')
  const [quickComment, setQuickComment] = useState('')
  const effectiveQuickMemberId = members.some((m) => m.id === quickMemberId) ? quickMemberId : (members[0]?.id ?? '')

  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)

  function memberSchedule(memberId: string) {
    const notes = meetingNotes.filter((n) => n.memberId === memberId)
    const past = notes.filter((n) => n.date < todayStr).sort((a, b) => b.date.localeCompare(a.date))
    const upcoming = notes.filter((n) => n.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))
    const all = [...notes].sort((a, b) => b.date.localeCompare(a.date))
    return { latest: past[0], upcoming, all }
  }

  // Members with a meeting logged for today -- surfaced right next to the
  // "오늘" header so it's obvious at a glance who's up for a meeting right now.
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

  function handleQuickAdd() {
    if (!effectiveQuickMemberId || !quickComment.trim()) return
    dispatch({
      type: 'ADD_MEETING_NOTE',
      payload: { id: uuidv4(), memberId: effectiveQuickMemberId, date: selectedDate, comment: quickComment.trim() },
    })
    setQuickComment('')
  }

  function toggleExpand(memberId: string) {
    setExpandedMemberId((cur) => (cur === memberId ? null : memberId))
    setQuickMemberId(memberId)
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

  const [, selMonth, selDay] = selectedDate.split('-').map(Number)

  return (
    <div>
      <h2 className="text-xl font-bold text-black">팀원 면담</h2>
      <p className="mt-1 text-sm text-gray-600">
        오른쪽 캘린더에서 날짜를 고르고 팀원 면담 일정을 등록하세요. 왼쪽에서 팀원별로 다음 면담 예정일과 이전
        면담 기록을 한눈에 볼 수 있습니다.
      </p>

      {members.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          등록된 팀원이 없습니다. 팀원 관리에서 먼저 팀원을 등록하세요.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-black">오늘 {todayStr}</span>
                {todayMembers.length > 0 && (
                  <span className="text-[13px] text-gray-400">오늘 면담 예정인 팀원 — 바로 진행 가능</span>
                )}
              </div>
              {todayMembers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {todayMembers.map(({ member, idx }) => (
                    <button
                      key={member.id}
                      onClick={() => toggleExpand(member.id)}
                      className="flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-accent hover:bg-orange-100"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                      {member.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400">팀원 현황</div>
            <div>
              {members.map((member, idx) => {
                const { latest, upcoming, all } = memberSchedule(member.id)
                const expanded = expandedMemberId === member.id
                const result = memberResultById.get(member.id)
                return (
                  <div key={member.id} className="border-t border-gray-100">
                    <button
                      onClick={() => toggleExpand(member.id)}
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: colorForIndex(idx) }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-black">
                          {member.name}
                          {member.role && <span className="ml-2 text-xs font-normal text-gray-400">{member.role}</span>}
                        </p>
                        {latest ? (
                          <p className="mt-0.5 truncate text-[13px] text-gray-500">
                            {latest.date} — {latest.comment}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[13px] text-gray-400">기록 없음</p>
                        )}
                      </div>
                      {upcoming.length > 0 && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                          {upcoming.map((note) => (
                            <span
                              key={note.id}
                              className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-accent"
                            >
                              <CalendarIcon className="h-3 w-3" /> {fmtShort(note.date)}
                            </span>
                          ))}
                        </div>
                      )}
                      <ChevronRightIcon
                        className={`h-4 w-4 shrink-0 text-gray-300 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {expanded && (
                      <div className="space-y-2 bg-gray-50 px-4 py-3">
                        {result ? (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-[13px]">
                            <span className="font-semibold text-black">순위 {result.rank}위</span>
                            <span className="text-gray-600">
                              누적 점수 <span className="font-semibold text-black">{result.cumulativeScore.toFixed(1)}</span>
                            </span>
                            <span className="text-gray-600">
                              종합 점수(가중평균){' '}
                              <span className="font-semibold text-black">{result.weightedAverageScore.toFixed(1)}</span>
                            </span>
                            <span className="text-gray-600">
                              참여 과제 <span className="font-semibold text-black">{result.participatedTaskCount}건</span>
                            </span>
                            <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold ${GRADE_COLORS[result.grade]}`}>
                              평가등급 {result.grade}
                            </span>
                          </div>
                        ) : (
                          <p className="rounded-md border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-400">
                            비활성 팀원이거나 아직 평가 데이터가 없어 성과를 표시할 수 없습니다.
                          </p>
                        )}
                        {all.length === 0 && <p className="text-[13px] text-gray-400">아직 면담 기록이 없습니다.</p>}
                        {all.map((note) =>
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
                )
              })}
            </div>
          </div>

          {calendarOpen ? (
            <div className="w-full shrink-0 self-start rounded-lg border border-gray-200 lg:w-80">
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
                        onClick={() => setSelectedDate(cell.date)}
                        title={cell.date}
                        className={`relative flex h-9 flex-col items-center justify-center gap-0.5 rounded-md text-[13px] transition-colors ${
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

                <div className="mt-4 border-t border-gray-200 pt-3">
                  <p className="text-[13px] font-semibold text-accent">
                    {selMonth}월 {selDay}일 일정 추가
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      value={effectiveQuickMemberId}
                      onChange={(e) => setQuickMemberId(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-2 text-sm text-black"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={quickComment}
                      onChange={(e) => setQuickComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickAdd()
                      }}
                      placeholder="일정 메모 입력 후 Enter..."
                      className="min-w-[140px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                    />
                    <button
                      onClick={handleQuickAdd}
                      disabled={!quickComment.trim()}
                      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      추가
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCalendarOpen(true)}
              className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50 lg:flex-col lg:gap-1"
              title="펼치기"
              aria-label="면담 일정 캘린더 펼치기"
            >
              <CalendarIcon className="h-4 w-4" />
              면담 일정
            </button>
          )}
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

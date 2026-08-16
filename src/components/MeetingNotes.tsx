import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { MeetingActionItem, MeetingNote } from '../types'
import { colorForIndex } from '../utils/memberColors'
import ConfirmDialog from './ConfirmDialog'
import InterviewPrepAccordion from './InterviewPrepAccordion'

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

interface MeetingNotesProps {
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  prepRequest?: { memberId: string; token: number } | null
}

export default function MeetingNotes({ selectedMemberId, onSelectMember, prepRequest }: MeetingNotesProps) {
  const { state, dispatch } = useAppState()
  const { members, meetingNotes } = state
  const todayStr = todayString()

  const [calendarOpen, setCalendarOpen] = useState(true)
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const [newDate, setNewDate] = useState(todayStr)
  const [newComment, setNewComment] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)
  const [dayAddMemberId, setDayAddMemberId] = useState<string | null>(null)
  const [prepOpenMemberId, setPrepOpenMemberId] = useState<string | null>(null)

  const [showDevForm, setShowDevForm] = useState(false)
  const [devStrengths, setDevStrengths] = useState('')
  const [devImprovements, setDevImprovements] = useState('')
  const [devNextExperience, setDevNextExperience] = useState('')
  const [devCareerInterest, setDevCareerInterest] = useState('')
  const [showActionForm, setShowActionForm] = useState(false)
  const [actionDrafts, setActionDrafts] = useState<{ id: string; content: string; dueDate: string }[]>([])
  const [actionContent, setActionContent] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')

  const activeMemberId = selectedMemberId ?? members[0]?.id ?? null
  const activeMemberIdx = members.findIndex((m) => m.id === activeMemberId)
  const activeMember = activeMemberIdx >= 0 ? members[activeMemberIdx] : null

  // 팀원 상세 Drawer의 [면담 준비] 버튼으로 진입한 경우 — 면담 준비 아코디언을
  // 자동으로 펼친다. 팀원 선택 자체는 상위(NotesStage)에서 이미 처리한다.
  useEffect(() => {
    if (!prepRequest) return
    setNewDate(todayStr)
    setNewComment('')
    setPrepOpenMemberId(prepRequest.memberId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepRequest?.token])

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

  function resetDevAndActionForm() {
    setShowDevForm(false)
    setDevStrengths('')
    setDevImprovements('')
    setDevNextExperience('')
    setDevCareerInterest('')
    setShowActionForm(false)
    setActionDrafts([])
    setActionContent('')
    setActionDueDate('')
  }

  function addActionDraft() {
    if (!actionContent.trim()) return
    setActionDrafts((prev) => [...prev, { id: uuidv4(), content: actionContent.trim(), dueDate: actionDueDate }])
    setActionContent('')
    setActionDueDate('')
  }

  function removeActionDraft(id: string) {
    setActionDrafts((prev) => prev.filter((a) => a.id !== id))
  }

  function handleAdd(memberId: string) {
    if (!memberId || !newDate || !newComment.trim()) return
    const note: MeetingNote = { id: uuidv4(), memberId, date: newDate, comment: newComment.trim() }
    if (devStrengths.trim()) note.strengths = devStrengths.trim()
    if (devImprovements.trim()) note.improvements = devImprovements.trim()
    if (devNextExperience.trim()) note.nextExperience = devNextExperience.trim()
    if (devCareerInterest.trim()) note.careerInterest = devCareerInterest.trim()
    if (actionDrafts.length > 0) {
      note.actions = actionDrafts.map((a): MeetingActionItem => ({ id: a.id, content: a.content, dueDate: a.dueDate, done: false }))
    }
    dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
    setNewComment('')
    resetDevAndActionForm()
  }

  function toggleActionDone(note: MeetingNote, actionId: string) {
    if (!note.actions) return
    dispatch({
      type: 'UPDATE_MEETING_NOTE',
      payload: { ...note, actions: note.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a)) },
    })
  }

  function selectMember(memberId: string) {
    onSelectMember(memberId)
    setNewDate(todayStr)
    setNewComment('')
    resetDevAndActionForm()
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

  const activeAll = activeMemberId ? memberSchedule(activeMemberId).all : []

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {activeMember && (
              <div className="space-y-3 rounded-lg border border-gray-200 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-black">면담 준비</p>
                  <button
                    onClick={() => setPrepOpenMemberId((prev) => (prev === activeMember.id ? null : activeMember.id))}
                    className="rounded-md border border-accent px-3 py-1.5 text-xs font-semibold text-accent hover:bg-orange-50"
                  >
                    {prepOpenMemberId === activeMember.id ? '면담 준비 접기' : '면담 준비 보기'}
                  </button>
                </div>

                {prepOpenMemberId === activeMember.id && <InterviewPrepAccordion memberId={activeMember.id} />}

                <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
                  <div className="flex flex-wrap items-start gap-2">
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

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowDevForm((v) => !v)}
                      className="text-xs font-medium text-gray-500 hover:text-accent"
                    >
                      {showDevForm ? '− 육성 포인트' : '+ 육성 포인트'}
                    </button>
                    <button
                      onClick={() => setShowActionForm((v) => !v)}
                      className="text-xs font-medium text-gray-500 hover:text-accent"
                    >
                      {showActionForm ? '− Action' : '+ Action'}
                    </button>
                  </div>

                  {showDevForm && (
                    <div className="mt-2 grid grid-cols-1 gap-2 border-t border-gray-100 pt-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={devStrengths}
                        onChange={(e) => setDevStrengths(e.target.value)}
                        placeholder="강점"
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black"
                      />
                      <input
                        type="text"
                        value={devImprovements}
                        onChange={(e) => setDevImprovements(e.target.value)}
                        placeholder="보완 필요"
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black"
                      />
                      <input
                        type="text"
                        value={devNextExperience}
                        onChange={(e) => setDevNextExperience(e.target.value)}
                        placeholder="다음 경험"
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black"
                      />
                      <input
                        type="text"
                        value={devCareerInterest}
                        onChange={(e) => setDevCareerInterest(e.target.value)}
                        placeholder="Career 관심"
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black"
                      />
                    </div>
                  )}

                  {showActionForm && (
                    <div className="mt-2 border-t border-gray-100 pt-2">
                      {actionDrafts.length > 0 && (
                        <ul className="mb-2 space-y-1">
                          {actionDrafts.map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-[13px] text-black">
                              <span>
                                ○ {a.content}
                                {a.dueDate && <span className="text-gray-400"> ({a.dueDate})</span>}
                              </span>
                              <button onClick={() => removeActionDraft(a.id)} className="text-xs text-gray-400 hover:text-danger">
                                삭제
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={actionContent}
                          onChange={(e) => setActionContent(e.target.value)}
                          placeholder="Action 내용"
                          className="min-w-[160px] flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black"
                        />
                        <input
                          type="date"
                          value={actionDueDate}
                          onChange={(e) => setActionDueDate(e.target.value)}
                          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black"
                        />
                        <button
                          onClick={addActionDraft}
                          disabled={!actionContent.trim()}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Action 추가
                        </button>
                      </div>
                    </div>
                  )}
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
                        {(note.strengths || note.improvements || note.nextExperience || note.careerInterest) && (
                          <div className="mt-1.5 space-y-0.5 text-[13px] text-gray-600">
                            {note.strengths && <p>강점: {note.strengths}</p>}
                            {note.improvements && <p>보완 필요: {note.improvements}</p>}
                            {note.nextExperience && <p>다음 경험: {note.nextExperience}</p>}
                            {note.careerInterest && <p>Career 관심: {note.careerInterest}</p>}
                          </div>
                        )}
                        {note.actions && note.actions.length > 0 && (
                          <ul className="mt-1.5 space-y-1 text-[13px] text-black">
                            {note.actions.map((a) => (
                              <li key={a.id}>
                                <button
                                  onClick={() => toggleActionDone(note, a.id)}
                                  className="hover:underline"
                                  title="완료 여부 전환"
                                >
                                  {a.done ? '✓' : '○'} {a.content}
                                  {a.dueDate && <span className="text-gray-400"> ({a.dueDate})</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
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
                    return (
                      <div className="mt-1.5 space-y-1.5">
                        {dayNotes.length === 0 ? (
                          <p className="text-[13px] text-gray-400">이 날짜에 등록된 면담이 없습니다.</p>
                        ) : (
                          <div className="space-y-0.5">
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
                        )}
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

            {calendarOpen && (
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

          </div>
        </div>

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

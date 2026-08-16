import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { MeetingNote, TeamMember } from '../types'
import { calcMemberResults, GRADE_COLORS } from '../utils/calculations'
import ConfirmDialog from './ConfirmDialog'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function ChevronIcon({ direction, className }: { direction: 'left' | 'right'; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}

// Month-grid calendar for picking/scheduling a meeting date. Days that already
// have a note for the selected member get a small dot marker, so it doubles
// as an at-a-glance view of that member's past and upcoming meetings.
function MeetingCalendar({
  noteDates,
  selectedDate,
  onSelectDate,
}: {
  noteDates: Set<string>
  selectedDate: string
  onSelectDate: (date: string) => void
}) {
  const [viewDate, setViewDate] = useState(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const todayStr = todayString()

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

  return (
    <div className="w-full shrink-0 rounded-lg border border-gray-200 p-3 sm:w-72">
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
          const hasNote = noteDates.has(cell.date)
          const isToday = cell.date === todayStr
          const isSelected = cell.date === selectedDate
          return (
            <button
              key={cell.date}
              onClick={() => onSelectDate(cell.date)}
              title={cell.date}
              className={`relative flex h-8 items-center justify-center rounded-md text-[13px] transition-colors ${
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
              {hasNote && (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-accent'}`}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function MeetingNotes() {
  const { state, dispatch } = useAppState()
  const { members, meetingNotes, tasks, contributions, criteria, peerReviews } = state

  const memberResults = calcMemberResults(members, tasks, contributions, criteria, peerReviews)

  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '')
  const [newDate, setNewDate] = useState(todayString())
  const [newComment, setNewComment] = useState('')

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')

  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)

  const selectedMember: TeamMember | undefined = members.find((m) => m.id === selectedMemberId)
  const selectedMemberRank = memberResults.findIndex((r) => r.member.id === selectedMemberId)
  const selectedMemberResult = selectedMemberRank >= 0 ? memberResults[selectedMemberRank] : undefined
  const notesForMember = meetingNotes
    .filter((n) => n.memberId === selectedMemberId)
    .sort((a, b) => b.date.localeCompare(a.date))

  function handleAdd() {
    if (!selectedMemberId || !newDate || !newComment.trim()) return
    dispatch({
      type: 'ADD_MEETING_NOTE',
      payload: { id: uuidv4(), memberId: selectedMemberId, date: newDate, comment: newComment.trim() },
    })
    setNewComment('')
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

  return (
    <div>
      <h2 className="text-xl font-bold text-black">팀원 면담</h2>
      <p className="mt-1 text-sm text-gray-600">
        팀원을 선택해 캘린더에서 날짜를 고르고 면담 코멘트를 기록·수정·삭제할 수 있습니다. 오늘보다 이후 날짜는
        예정된 면담으로 표시됩니다.
      </p>

      {members.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          등록된 팀원이 없습니다. 팀원 관리에서 먼저 팀원을 등록하세요.
        </p>
      ) : (
        <div className="mt-2 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-black">팀원</span>
            <div className="flex flex-wrap gap-1.5">
              {members.map((member) => (
                <button
                  key={member.id}
                  onClick={() => setSelectedMemberId(member.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    member.id === selectedMemberId
                      ? 'bg-accent text-white'
                      : 'bg-gray-100 text-black hover:bg-gray-200'
                  }`}
                >
                  {member.name}
                </button>
              ))}
            </div>
            {selectedMember && (
              <span className="text-sm text-gray-500">
                {notesForMember.length}건의 면담 기록
              </span>
            )}
          </div>

          {selectedMember && (
            <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
              {selectedMemberResult ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="font-semibold text-black">순위 {selectedMemberRank + 1}위</span>
                  <span className="text-gray-700">
                    누적 점수 <span className="font-semibold text-black">{selectedMemberResult.cumulativeScore.toFixed(1)}</span>
                  </span>
                  <span className="text-gray-700">
                    종합 점수(가중평균){' '}
                    <span className="font-semibold text-black">{selectedMemberResult.weightedAverageScore.toFixed(1)}</span>
                  </span>
                  <span className="text-gray-700">
                    참여 과제 <span className="font-semibold text-black">{selectedMemberResult.participatedTaskCount}건</span>
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${GRADE_COLORS[selectedMemberResult.grade]}`}
                  >
                    평가등급 {selectedMemberResult.grade}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  비활성 팀원이거나 아직 평가 데이터가 없어 성과를 표시할 수 없습니다.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4 border-t border-gray-200 pt-4 sm:flex-row">
            <MeetingCalendar
              key={selectedMemberId}
              noteDates={new Set(notesForMember.map((n) => n.date))}
              selectedDate={newDate}
              onSelectDate={setNewDate}
            />

            <div className="min-w-0 flex-1">
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
                  placeholder="면담 코멘트를 입력하세요 (예정된 면담이면 '면담 예정'처럼 짧게 남겨도 됩니다)"
                  rows={2}
                  className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                />
                <button
                  onClick={handleAdd}
                  disabled={!newComment.trim()}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  기록 추가
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {notesForMember.length === 0 && (
                  <p className="rounded-md bg-gray-50 px-4 py-4 text-center text-sm text-gray-500">
                    아직 면담 기록이 없습니다. 캘린더에서 날짜를 선택하고 기록을 추가해보세요.
                  </p>
                )}
                {notesForMember.map((note) =>
                  editingNoteId === note.id ? (
                    <div key={note.id} className="flex flex-wrap items-start gap-2 rounded-md border border-gray-300 px-3 py-3">
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
                        className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
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
                      className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-gray-200 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-500">
                          {note.date}
                          {note.date > todayString() && (
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
            </div>
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

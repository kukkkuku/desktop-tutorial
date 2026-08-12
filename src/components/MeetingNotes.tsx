import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { MeetingNote, TeamMember } from '../types'
import ConfirmDialog from './ConfirmDialog'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export default function MeetingNotes() {
  const { state, dispatch } = useAppState()
  const { members, meetingNotes } = state

  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '')
  const [newDate, setNewDate] = useState(todayString())
  const [newComment, setNewComment] = useState('')

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')

  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)

  const selectedMember: TeamMember | undefined = members.find((m) => m.id === selectedMemberId)
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
      <h3 className="mt-8 text-lg font-semibold text-black">팀원 면담 기록</h3>
      <p className="mt-1 text-sm text-gray-600">
        팀원을 선택해 날짜별 면담 코멘트를 기록하고 수정/삭제할 수 있습니다.
      </p>

      {members.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          등록된 팀원이 없습니다. 팀원 관리에서 먼저 팀원을 등록하세요.
        </p>
      ) : (
        <div className="mt-2 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-black">팀원</label>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            {selectedMember && (
              <span className="text-sm text-gray-500">
                {notesForMember.length}건의 면담 기록
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-gray-200 pt-4">
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
                아직 면담 기록이 없습니다.
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
                    <p className="text-xs font-semibold text-gray-500">{note.date}</p>
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

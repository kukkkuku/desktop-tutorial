import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { MeetingNote, TeamMember } from '../types'
import { calcMemberResults, GRADE_COLORS } from '../utils/calculations'
import ConfirmDialog from './ConfirmDialog'

function todayString() {
  return new Date().toISOString().slice(0, 10)
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
        팀원을 선택해 날짜별 면담 코멘트를 기록하고 수정/삭제할 수 있습니다.
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

import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import type { MeetingActionItem, MeetingNote, TeamMember } from '../../types'
import { getIncompleteActions } from '../../utils/meetingActions'
import ConfirmDialog from '../ConfirmDialog'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

interface MeetingFormProps {
  member: TeamMember
  focusToken?: number | null
}

// 면담하기 -- 면담 일자/다음 확인일, 면담 코멘트, 육성 포인트(강점·보완·다음
// 경험·Career), Action(담당자·완료기한), 저장. 지난 면담 기록은 기본 접힘.
export default function MeetingForm({ member, focusToken }: MeetingFormProps) {
  const { state, dispatch } = useAppState()
  const memberId = member.id
  const todayStr = todayString()
  const commentRef = useRef<HTMLTextAreaElement>(null)

  const [date, setDate] = useState(todayStr)
  const [nextCheckDate, setNextCheckDate] = useState('')
  const [comment, setComment] = useState('')
  const [strengths, setStrengths] = useState('')
  const [improvements, setImprovements] = useState('')
  const [nextExperience, setNextExperience] = useState('')
  const [careerInterest, setCareerInterest] = useState('')
  const [actionContent, setActionContent] = useState('')
  const [actionAssignee, setActionAssignee] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [actionDrafts, setActionDrafts] = useState<{ id: string; content: string; assignee: string; dueDate: string }[]>([])

  const [pastOpen, setPastOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)

  useEffect(() => {
    setDate(todayStr)
    setNextCheckDate('')
    setComment('')
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerInterest('')
    setActionDrafts([])
    setPastOpen(false)
    setEditingNoteId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  useEffect(() => {
    if (!focusToken) return
    commentRef.current?.focus()
  }, [focusToken])

  const notes = state.meetingNotes.filter((n) => n.memberId === memberId).sort((a, b) => b.date.localeCompare(a.date))
  const incompleteActions = getIncompleteActions(state.meetingNotes, memberId)

  function addActionDraft() {
    if (!actionContent.trim()) return
    setActionDrafts((prev) => [...prev, { id: uuidv4(), content: actionContent.trim(), assignee: actionAssignee.trim(), dueDate: actionDueDate }])
    setActionContent('')
    setActionAssignee('')
    setActionDueDate('')
  }

  function handleSave() {
    if (!comment.trim()) return
    const note: MeetingNote = { id: uuidv4(), memberId, date, comment: comment.trim() }
    if (nextCheckDate) note.nextCheckDate = nextCheckDate
    if (strengths.trim()) note.strengths = strengths.trim()
    if (improvements.trim()) note.improvements = improvements.trim()
    if (nextExperience.trim()) note.nextExperience = nextExperience.trim()
    if (careerInterest.trim()) note.careerInterest = careerInterest.trim()
    if (actionDrafts.length > 0) {
      note.actions = actionDrafts.map(
        (a): MeetingActionItem => ({ id: a.id, content: a.content, dueDate: a.dueDate, done: false, ...(a.assignee ? { assignee: a.assignee } : {}) }),
      )
    }
    dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
    setDate(todayStr)
    setNextCheckDate('')
    setComment('')
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerInterest('')
    setActionDrafts([])
  }

  function toggleActionDone(note: MeetingNote, actionId: string) {
    if (!note.actions) return
    dispatch({
      type: 'UPDATE_MEETING_NOTE',
      payload: { ...note, actions: note.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a)) },
    })
  }

  function saveEdit(note: MeetingNote) {
    if (!editDate || !editComment.trim()) return
    dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, date: editDate, comment: editComment.trim() } })
    setEditingNoteId(null)
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-black">면담하기</h3>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-400">면담 일자</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-400">다음 확인일</label>
          <input type="date" value={nextCheckDate} onChange={(e) => setNextCheckDate(e.target.value)} className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-[11px] font-medium text-gray-400">면담 코멘트</label>
        <textarea
          ref={commentRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="면담 내용을 입력하세요."
          className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
        />
      </div>

      <div className="mt-3">
        <p className="text-xs font-bold text-black">육성 포인트</p>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-400">강점</label>
            <input type="text" value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="강점 입력" className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400">보완 필요</label>
            <input type="text" value={improvements} onChange={(e) => setImprovements(e.target.value)} placeholder="보완이 필요한 영역 입력" className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400">다음 경험</label>
            <input type="text" value={nextExperience} onChange={(e) => setNextExperience(e.target.value)} placeholder="다음에 도전할 경험 입력" className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400">Career 관심</label>
            <input type="text" value={careerInterest} onChange={(e) => setCareerInterest(e.target.value)} placeholder="관심 커리어/역할 입력" className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black" />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-bold text-black">Action</p>
        {actionDrafts.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {actionDrafts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-[13px] text-black">
                <span>
                  ○ {a.content}
                  {a.assignee && <span className="text-gray-400"> · {a.assignee}</span>}
                  {a.dueDate && <span className="text-gray-400"> ({a.dueDate})</span>}
                </span>
                <button onClick={() => setActionDrafts((prev) => prev.filter((x) => x.id !== a.id))} className="text-xs text-gray-400 hover:text-danger">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
        <input type="text" value={actionContent} onChange={(e) => setActionContent(e.target.value)} placeholder="실행할 Action을 입력하세요." className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="block text-[11px] font-medium text-gray-400">담당자</label>
            <input type="text" value={actionAssignee} onChange={(e) => setActionAssignee(e.target.value)} placeholder="선택" className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400">완료 기한</label>
            <input type="date" value={actionDueDate} onChange={(e) => setActionDueDate(e.target.value)} className="mt-0.5 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black" />
          </div>
          <button
            onClick={addActionDraft}
            disabled={!actionContent.trim()}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Action 추가
          </button>
        </div>
      </div>

      {incompleteActions.length > 0 && (
        <div className="mt-3 rounded-md bg-gray-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-gray-400">이전 미완료 Action</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-black">
            {incompleteActions.map((a) => (
              <li key={a.id}>○ {a.content}</li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={handleSave} disabled={!comment.trim()} className="mt-3 w-full rounded-md bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
        저장
      </button>

      {/* 지난 면담 기록 -- 기본 접힘 */}
      <div className="mt-4 border-t border-gray-200 pt-3">
        <button onClick={() => setPastOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
          <span className="text-xs font-bold text-gray-600">지난 면담 기록 {notes.length}건</span>
          <span className="text-gray-400">{pastOpen ? '▴' : '▾'}</span>
        </button>

        {pastOpen && (
          <div className="mt-2 space-y-2">
            {notes.length === 0 && <p className="text-[13px] text-gray-400">아직 면담 기록이 없습니다.</p>}
            {notes.map((note) =>
              editingNoteId === note.id ? (
                <div key={note.id} className="flex flex-wrap items-start gap-2 rounded-md border border-gray-300 bg-white px-3 py-3">
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
                  <textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} rows={2} className="min-w-[180px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(note)} disabled={!editComment.trim()} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                      저장
                    </button>
                    <button onClick={() => setEditingNoteId(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-100">
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div key={note.id} className="rounded-md border border-gray-200 bg-white px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-500">
                      {note.date}
                      {note.date > todayStr && <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-accent">예정</span>}
                    </p>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => {
                          setEditingNoteId(note.id)
                          setEditDate(note.date)
                          setEditComment(note.comment)
                        }}
                        className="rounded-md border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
                      >
                        수정
                      </button>
                      <button onClick={() => setDeletingNote(note)} className="rounded-md border border-danger px-2 py-0.5 text-xs text-danger hover:bg-red-50">
                        삭제
                      </button>
                    </div>
                  </div>
                  {note.comment && <p className="mt-1 whitespace-pre-wrap text-[13px] text-black">{note.comment}</p>}
                  {note.actions && note.actions.length > 0 && (
                    <ul className="mt-1.5 space-y-1 text-[13px] text-black">
                      {note.actions.map((a) => (
                        <li key={a.id}>
                          <button onClick={() => toggleActionDone(note, a.id)} className="hover:underline" title="완료 여부 전환">
                            {a.done ? '✓' : '○'} {a.content}
                            {a.assignee && <span className="text-gray-400"> · {a.assignee}</span>}
                            {a.dueDate && <span className="text-gray-400"> ({a.dueDate})</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deletingNote !== null}
        title="면담 기록 삭제"
        message={`${deletingNote?.date} 면담 기록을 삭제하시겠습니까?`}
        onConfirm={() => {
          if (deletingNote) dispatch({ type: 'DELETE_MEETING_NOTE', payload: { id: deletingNote.id } })
          setDeletingNote(null)
        }}
        onCancel={() => setDeletingNote(null)}
      />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import type { MeetingNote, TeamMember } from '../../types'
import ConfirmDialog from '../ConfirmDialog'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

interface MeetingFormProps {
  member: TeamMember
  focusToken?: number | null
}

// 면담일지 -- Figma 디자인(interview-log-card) 그대로: 사방이 닫힌 박스가
// 아니라 왼쪽 구분선 하나로만 옆 컬럼과 나뉘어서 폭을 최대로 쓴다. 제목
// 옆에 면담 일자 + 작성하기 버튼이 한 줄, 면담 코멘트, 육성 포인트(강점·
// 보완 필요·다음 도전 경험·Career Goal). 다음 확인일과 Action 입력 영역은
// Figma에 없어 제거했다. 최근 면담 기록은 기본 접힘 -- 펼쳤을 때 각 기록은
// 필드별로 줄바꿈해서 보여준다(한 줄로 합쳐 truncate하면 내용이 잘려서
// 확인이 안 되는 문제가 있었다).
export default function MeetingForm({ member, focusToken }: MeetingFormProps) {
  const { state, dispatch } = useAppState()
  const memberId = member.id
  const todayStr = todayString()
  const commentRef = useRef<HTMLTextAreaElement>(null)

  const [date, setDate] = useState(todayStr)
  const [comment, setComment] = useState('')
  const [strengths, setStrengths] = useState('')
  const [improvements, setImprovements] = useState('')
  const [nextExperience, setNextExperience] = useState('')
  const [careerGoal, setCareerGoal] = useState('')

  const [pastOpen, setPastOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)

  useEffect(() => {
    setDate(todayStr)
    setComment('')
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerGoal('')
    setPastOpen(false)
    setEditingNoteId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  useEffect(() => {
    if (!focusToken) return
    commentRef.current?.focus()
  }, [focusToken])

  const notes = state.meetingNotes.filter((n) => n.memberId === memberId).sort((a, b) => b.date.localeCompare(a.date))

  function handleSave() {
    if (!comment.trim()) return
    const note: MeetingNote = { id: uuidv4(), memberId, date, comment: comment.trim() }
    if (strengths.trim()) note.strengths = strengths.trim()
    if (improvements.trim()) note.improvements = improvements.trim()
    if (nextExperience.trim()) note.nextExperience = nextExperience.trim()
    if (careerGoal.trim()) note.careerInterest = careerGoal.trim()
    dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
    setDate(todayStr)
    setComment('')
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerGoal('')
  }

  function saveEdit(note: MeetingNote) {
    if (!editDate || !editComment.trim()) return
    dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, date: editDate, comment: editComment.trim() } })
    setEditingNoteId(null)
  }

  return (
    <div className="border-l border-gray-200 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="shrink-0 text-base font-bold text-black">면담일지</h3>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="면담 일자"
          className="w-40 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
        />
        <button
          onClick={handleSave}
          disabled={!comment.trim()}
          className="shrink-0 rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          작성하기
        </button>
      </div>

      <div className="mt-3">
        <label className="block text-[11px] font-medium text-gray-400">코멘트</label>
        <textarea
          ref={commentRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="면담 내용을 입력하세요."
          className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
        />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-400">강점</label>
          <input type="text" value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="강점 입력" className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-400">보완 필요</label>
          <input type="text" value={improvements} onChange={(e) => setImprovements(e.target.value)} placeholder="보완이 필요한 영역 입력" className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-400">다음 도전 경험</label>
          <input
            type="text"
            value={nextExperience}
            onChange={(e) => setNextExperience(e.target.value)}
            placeholder="도전해 보고 싶은 경험 입력"
            className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-400">Career Goal</label>
          <input type="text" value={careerGoal} onChange={(e) => setCareerGoal(e.target.value)} placeholder="성장 커리어/목표 입력" className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
        </div>
      </div>

      {/* 최근 면담 기록 -- 기본 접힘, 필요할 때만 펼침 */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-[11px]">
        <span className="text-gray-500">최근 면담 기록 {notes.length}건</span>
        <button onClick={() => setPastOpen((v) => !v)} className="font-semibold text-accent underline">
          {pastOpen ? '접기' : '전체 이력 보기'}
        </button>
      </div>

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
              <div key={note.id} className="flex flex-wrap items-start gap-3 border-b border-gray-200 py-3">
                <p className="shrink-0 text-xs font-semibold text-gray-500">
                  {note.date}
                  {note.date > todayStr && <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-accent">예정</span>}
                </p>
                <div className="min-w-[200px] flex-1 space-y-0.5 text-[13px] text-black">
                  <p className="whitespace-pre-wrap break-words">{note.comment}</p>
                  {note.strengths?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">강점 : {note.strengths}</p>}
                  {note.improvements?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">보완 : {note.improvements}</p>}
                  {note.nextExperience?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">다음도전 : {note.nextExperience}</p>}
                  {note.careerInterest?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">Career Goal : {note.careerInterest}</p>}
                </div>
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
            ),
          )}
        </div>
      )}

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

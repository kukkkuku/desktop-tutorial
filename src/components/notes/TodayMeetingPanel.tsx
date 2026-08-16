import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import type { MeetingActionItem, MeetingNote, TeamMember } from '../../types'
import { calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import { getIncompleteActions } from '../../utils/meetingActions'
import ConfirmDialog from '../ConfirmDialog'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

interface ActionDraft {
  id: string
  content: string
  dueDate: string
}

interface TodayMeetingPanelProps {
  member: TeamMember
  // 다른 화면(팀원 상세 Drawer)의 "면담 준비" 버튼으로 들어온 경우 면담 내용
  // 입력창에 바로 포커스를 준다. 매번 다른 값이면 재진입 때도 다시 포커스된다.
  focusToken?: number | null
}

// 팀원 성장 관리 상세 화면 하단에 항상 붙어있는 면담 기록 영역. 시뮬레이션
// 결과(승진 준비도/부족 조건)를 면담 내용·Action에 바로 끌어올 수 있는 퀵버튼을
// 제공해서, 성과·승진 상태를 보면서 그 자리에서 기록까지 끝내도록 한다.
export default function TodayMeetingPanel({ member, focusToken }: TodayMeetingPanelProps) {
  const { state, dispatch } = useAppState()
  const { profile } = useTeamProfile()
  const memberId = member.id
  const todayStr = todayString()
  const commentRef = useRef<HTMLTextAreaElement>(null)

  const [date, setDate] = useState(todayStr)
  const [comment, setComment] = useState('')
  const [keyPoints, setKeyPoints] = useState('')
  const [nextCheckDate, setNextCheckDate] = useState('')
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([])
  const [actionContent, setActionContent] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)

  useEffect(() => {
    setDate(todayStr)
    setComment('')
    setKeyPoints('')
    setNextCheckDate('')
    setActionDrafts([])
    setEditingNoteId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  useEffect(() => {
    if (!focusToken) return
    commentRef.current?.focus()
  }, [focusToken])

  const notes = state.meetingNotes.filter((n) => n.memberId === memberId).sort((a, b) => b.date.localeCompare(a.date))
  const incompleteActions = getIncompleteActions(state.meetingNotes, memberId)

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const readiness = calcPromotionReadiness(
    member.level,
    appraisals,
    profile.promotionCriteria,
    profile.gradeScores,
    0,
    levelTenureYears,
  )
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)

  function addReadinessToComment() {
    if (!readiness || !criteria) return
    const line = `현재 승진 준비도(${criteria.toLevel}) ${readiness.progressPercent}%`
    setComment((c) => (c.trim() ? `${c}\n${line}` : line))
  }

  function addGapActions() {
    if (!readiness || !criteria) return
    const gaps: string[] = []
    if (!readiness.tenureMet) gaps.push(`재직기간 충족 대기 (${criteria.toLevel} 승진까지 ${criteria.tenureYears}년 필요)`)
    if (!readiness.eligible) {
      const gap = Math.max(0, criteria.requiredScore - readiness.rawScore)
      gaps.push(`승진 점수 ${gap.toFixed(0)}점 보완`)
    }
    if (gaps.length === 0) return
    setActionDrafts((prev) => [...prev, ...gaps.map((g) => ({ id: uuidv4(), content: g, dueDate: '' }))])
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

  function handleSave() {
    if (!comment.trim()) return
    const note: MeetingNote = { id: uuidv4(), memberId, date, comment: comment.trim() }
    if (keyPoints.trim()) note.keyPoints = keyPoints.trim()
    if (nextCheckDate) note.nextCheckDate = nextCheckDate
    if (actionDrafts.length > 0) {
      note.actions = actionDrafts.map((a): MeetingActionItem => ({ id: a.id, content: a.content, dueDate: a.dueDate, done: false }))
    }
    dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
    setDate(todayStr)
    setComment('')
    setKeyPoints('')
    setNextCheckDate('')
    setActionDrafts([])
  }

  function toggleActionDone(note: MeetingNote, actionId: string) {
    if (!note.actions) return
    dispatch({
      type: 'UPDATE_MEETING_NOTE',
      payload: { ...note, actions: note.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a)) },
    })
  }

  function startEdit(note: MeetingNote) {
    setEditingNoteId(note.id)
    setEditDate(note.date)
    setEditComment(note.comment)
  }

  function saveEdit(note: MeetingNote) {
    if (!editDate || !editComment.trim()) return
    dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, date: editDate, comment: editComment.trim() } })
    setEditingNoteId(null)
  }

  function handleDeleteConfirm() {
    if (!deletingNote) return
    dispatch({ type: 'DELETE_MEETING_NOTE', payload: { id: deletingNote.id } })
    setDeletingNote(null)
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-black">오늘의 면담</h3>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-400">면담 날짜</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-400">다음 확인일</label>
          <input
            type="date"
            value={nextCheckDate}
            onChange={(e) => setNextCheckDate(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-[11px] font-medium text-gray-400">면담 내용</label>
        <textarea
          ref={commentRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="면담에서 나눈 내용을 기록하세요"
          className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
        />
        {readiness && criteria && (
          <button onClick={addReadinessToComment} className="mt-1 text-xs font-medium text-promo hover:underline">
            + 현재 승진 준비도 추가
          </button>
        )}
      </div>

      <div className="mt-3">
        <label className="block text-[11px] font-medium text-gray-400">핵심 포인트</label>
        <input
          type="text"
          value={keyPoints}
          onChange={(e) => setKeyPoints(e.target.value)}
          placeholder="이번 면담의 핵심을 한 줄로"
          className="mt-0.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
        />
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="block text-[11px] font-medium text-gray-400">Action</label>
          {readiness && criteria && (!readiness.tenureMet || !readiness.eligible) && (
            <button onClick={addGapActions} className="text-xs font-medium text-promo hover:underline">
              + 부족 조건 Action으로 추가
            </button>
          )}
        </div>
        {actionDrafts.length > 0 && (
          <ul className="mt-1.5 space-y-1">
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
        <div className="mt-1.5 flex flex-wrap gap-2">
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

      <button
        onClick={handleSave}
        disabled={!comment.trim()}
        className="mt-3 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        기록 저장
      </button>

      <div className="mt-5 space-y-2 border-t border-gray-200 pt-4">
        <p className="text-xs font-semibold text-gray-500">지난 면담 기록</p>
        {notes.length === 0 && <p className="text-[13px] text-gray-400">아직 면담 기록이 없습니다.</p>}
        {notes.map((note) =>
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
                  onClick={() => setEditingNoteId(null)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-100"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div key={note.id} className="rounded-md border border-gray-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-500">
                    {note.date}
                    {note.date > todayStr && (
                      <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-accent">예정</span>
                    )}
                  </p>
                  {note.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-black">{note.comment}</p>}
                  {note.keyPoints && (
                    <p className="mt-1 text-[13px] text-gray-600">
                      <span className="font-semibold text-gray-500">핵심 포인트</span> {note.keyPoints}
                    </p>
                  )}
                  {note.actions && note.actions.length > 0 && (
                    <ul className="mt-1.5 space-y-1 text-[13px] text-black">
                      {note.actions.map((a) => (
                        <li key={a.id}>
                          <button onClick={() => toggleActionDone(note, a.id)} className="hover:underline" title="완료 여부 전환">
                            {a.done ? '✓' : '○'} {a.content}
                            {a.dueDate && <span className="text-gray-400"> ({a.dueDate})</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {note.nextCheckDate && (
                    <p className="mt-1 text-[13px] text-gray-500">
                      <span className="font-semibold text-gray-400">다음 확인일</span> {note.nextCheckDate}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => startEdit(note)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-100">
                    수정
                  </button>
                  <button onClick={() => setDeletingNote(note)} className="rounded-md border border-danger px-3 py-1 text-xs font-medium text-danger hover:bg-red-50">
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
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

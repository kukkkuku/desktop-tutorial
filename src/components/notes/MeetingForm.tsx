import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { MeetingNote, TeamMember } from '../../types'
import { createCalendarEvent, deleteCalendarEvent, isCalendarConfigured, updateCalendarEvent } from '../../utils/googleCalendar'
import ConfirmDialog from '../ConfirmDialog'
import Badge from '../Badge'
import Button from '../Button'
import CollapseToggleButton from '../CollapseToggleButton'
import IconButton from '../IconButton'
import MoodIcon, { MOOD_OPTIONS } from './MoodIcon'
import MoodPicker from './MoodPicker'

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

// 기분 선택 영역(3x2 아이콘 그리드)이 라벨까지 편하게 펼쳐지려면 대략 이
// 정도 너비가 필요하다 -- 이보다 좁으면 대표 아이콘 하나 + 팝오버로 접는다.
// 한 줄에 6개를 다 펼치던 이전 레이아웃보다 훨씬 좁은 너비로도 충분하다.
const MOOD_INLINE_MIN_WIDTH = 200

interface MeetingFormProps {
  member: TeamMember
  focusToken?: number | null
  insights: string[]
  insightsOpen: boolean
  onToggleInsights: () => void
  // 면담 컬럼 실측 폭이 전체 3등분 영역의 절반 이상이 되면 부모(MemberGrowthDetail)가
  // true로 넘긴다 -- 왼쪽에 인사이트+기록, 오른쪽에 작성 폼을 나란히 놓는다.
  // 좁으면 인사이트 -> 작성 폼 -> 기록 순으로 위아래로 쌓는다(기본값).
  splitLayout?: boolean
}

// 면담일지 -- Figma 디자인(interview-log-card) 그대로: 사방이 닫힌 박스가
// 아니라 3등분 컬럼의 자기 칸을 그대로 채운다(컬럼 사이 여백은 부모 grid의
// gap이 담당하므로 여기서 따로 테두리/여백을 두지 않는다). 제목 옆에 면담
// 일자 + 작성하기 버튼이 한 줄, 면담 코멘트, 육성 포인트(강점·보완 필요·
// 다음 도전 경험·Career Goal). 다음 확인일과 Action 입력 영역은 Figma에
// 없어 제거했다. 최근 면담 기록은 기본 접힘 -- 펼쳤을 때 각 기록은
// 필드별로 줄바꿈해서 보여준다(한 줄로 합쳐 truncate하면 내용이 잘려서
// 확인이 안 되는 문제가 있었다).
export default function MeetingForm({ member, focusToken, insights, insightsOpen, onToggleInsights, splitLayout }: MeetingFormProps) {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const memberId = member.id
  const todayStr = todayString()
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const logRowRef = useRef<HTMLDivElement>(null)
  const [logRowWidth, setLogRowWidth] = useState(0)
  const moodCompact = logRowWidth > 0 && logRowWidth < MOOD_INLINE_MIN_WIDTH

  const [date, setDate] = useState(todayStr)
  const [comment, setComment] = useState('')
  const [mood, setMood] = useState<string | null>(null)
  const [strengths, setStrengths] = useState('')
  const [improvements, setImprovements] = useState('')
  const [nextExperience, setNextExperience] = useState('')
  const [careerGoal, setCareerGoal] = useState('')

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editComment, setEditComment] = useState('')
  const [editMood, setEditMood] = useState<string | null>(null)
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)
  // 캘린더 등록/수정 실패는 면담 기록 저장 자체를 막지는 않지만, 콘솔에만
  // 조용히 남기면 왜 캘린더에 안 뜨는지 알 방법이 없다 -- 화면에도 보여준다.
  const [calendarError, setCalendarError] = useState<string | null>(null)

  useEffect(() => {
    setDate(todayStr)
    setComment('')
    setMood(null)
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerGoal('')
    setDetailsOpen(false)
    setPastOpen(false)
    setEditingNoteId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  useEffect(() => {
    if (!focusToken) return
    commentRef.current?.focus()
  }, [focusToken])

  useLayoutEffect(() => {
    const el = logRowRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setLogRowWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const notes = state.meetingNotes.filter((n) => n.memberId === memberId).sort((a, b) => b.date.localeCompare(a.date))

  function handleSave() {
    if (!comment.trim()) return
    const note: MeetingNote = { id: uuidv4(), memberId, date, comment: comment.trim() }
    if (mood) note.mood = mood
    if (strengths.trim()) note.strengths = strengths.trim()
    if (improvements.trim()) note.improvements = improvements.trim()
    if (nextExperience.trim()) note.nextExperience = nextExperience.trim()
    if (careerGoal.trim()) note.careerInterest = careerGoal.trim()
    dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
    setCalendarError(null)
    // 오늘/이후 일정만 캘린더에 올린다 -- 지난 일에 대한 메모까지 캘린더에
    // 박히면 알림 목적에 안 맞는다.
    if (date >= todayStr && isCalendarConfigured()) {
      createCalendarEvent({ memberName: member.name, date, comment: note.comment, teamName })
        .then((eventId) => dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, calendarEventId: eventId } }))
        .catch((err) => {
          console.warn('캘린더 일정 등록 실패:', err)
          setCalendarError(err instanceof Error ? err.message : '캘린더 일정 등록에 실패했습니다.')
        })
    }
    setDate(todayStr)
    setComment('')
    setMood(null)
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerGoal('')
  }

  function saveEdit(note: MeetingNote) {
    if (!editDate || !editComment.trim()) return
    const updated: MeetingNote = { ...note, date: editDate, comment: editComment.trim(), mood: editMood ?? undefined }
    dispatch({ type: 'UPDATE_MEETING_NOTE', payload: updated })
    setEditingNoteId(null)
    setCalendarError(null)
    if (!isCalendarConfigured()) return
    if (updated.calendarEventId) {
      if (editDate >= todayStr) {
        void updateCalendarEvent(updated.calendarEventId, { memberName: member.name, date: editDate, comment: updated.comment, teamName }).catch((err) => {
          console.warn('캘린더 일정 수정 실패:', err)
          setCalendarError(err instanceof Error ? err.message : '캘린더 일정 수정에 실패했습니다.')
        })
      } else {
        // 과거 날짜로 바뀌면 더 이상 "예정"이 아니니 캘린더 일정은 지운다.
        void deleteCalendarEvent(updated.calendarEventId, teamName)
        dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...updated, calendarEventId: undefined } })
      }
    } else if (editDate >= todayStr) {
      createCalendarEvent({ memberName: member.name, date: editDate, comment: updated.comment, teamName })
        .then((eventId) => dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...updated, calendarEventId: eventId } }))
        .catch((err) => {
          console.warn('캘린더 일정 등록 실패:', err)
          setCalendarError(err instanceof Error ? err.message : '캘린더 일정 등록에 실패했습니다.')
        })
    }
  }

  const insightsBlock = insights.length > 0 && (
    <div className="rounded-lg bg-gray-50">
      <div className="flex items-center gap-1.5 px-4 py-2.5">
        <CollapseToggleButton collapsed={!insightsOpen} onClick={onToggleInsights} label="면담 인사이트" />
        <span className="text-sm font-bold text-accent">면담 인사이트</span>
      </div>
      {insightsOpen && (
        <ul className="space-y-0.5 px-4 pb-3">
          {insights.map((line, i) => (
            <li key={i} className="text-[13px] text-gray-700">
              · {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  const logFormBlock = (
    <div>
      {/* Figma interview-form(36:1477) 그대로: 면담일지 라벨+날짜만 한 줄,
          그 아래 코멘트 textarea 옆에 분위기 선택 + 작성하기 버튼을 세로로
          쌓은 좁은 칸을 나란히 붙인다(따로 "코멘트"/"분위기" 라벨 없이
          placeholder와 아이콘 그 자체로 의미가 드러난다). */}
      <div className="flex items-center gap-2">
        <h3 className="shrink-0 text-sm font-bold text-black">면담일지</h3>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="면담 일자"
          className="w-40 shrink-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black"
        />
      </div>

      {calendarError && (
        <p className="mt-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-danger">
          ⚠️ 면담 기록은 저장됐지만 캘린더 등록에 실패했습니다: {calendarError}
        </p>
      )}

      {/* textarea 옆에 분위기+작성하기를 붙이되(넓을 때), 컬럼이 좁아져서
          textarea가 최소 폭(min-w) 아래로 밀리면 flex-wrap이 자동으로
          이 칸을 textarea 아래 줄로 내려보낸다 -- 별도 실측 없이 순수
          CSS만으로 반응형이 된다. */}
      <div ref={logRowRef} className="mt-3 flex flex-wrap items-stretch gap-4">
        <textarea
          ref={commentRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="면담 내용을 입력하세요."
          className="min-h-[72px] min-w-[240px] flex-1 resize-y rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
        />
        <div className="flex shrink-0 flex-col items-center gap-2">
          <MoodPicker value={mood} onChange={setMood} compact={moodCompact} />
          <Button variant="primary" onClick={handleSave} disabled={!comment.trim()} className="w-full px-2 py-1.5">
            작성하기
          </Button>
        </div>
      </div>

      {/* 강점/보완/다음도전/Career Goal은 매번 다 채우는 칸이 아니라 필요할
          때만 쓰는 육성 포인트라, 기본은 접어두고 코멘트만 가볍게 남길 수
          있게 한다. */}
      <div className="mt-3 flex items-center gap-1.5">
        <CollapseToggleButton collapsed={!detailsOpen} onClick={() => setDetailsOpen((v) => !v)} label="육성 포인트" />
        <button onClick={() => setDetailsOpen((v) => !v)} className="text-xs font-medium text-gray-400 hover:text-accent">
          육성 포인트 (강점·보완·다음 경험·Career Goal)
        </button>
      </div>

      {detailsOpen && (
        <div className="mt-2 flex flex-col gap-3">
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
      )}
    </div>
  )

  const historyBlock = (
    <div>
      {/* 면담 기록 -- Figma의 timeline-list: 세로선 + 분위기 이모지 노드로
          기록을 훑어볼 수 있게 한다. 기본 접힘, 필요할 때만 펼침. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CollapseToggleButton collapsed={!pastOpen} onClick={() => setPastOpen((v) => !v)} label="면담 기록" />
        <h4 className="text-sm font-bold text-black">면담 기록</h4>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">최근 {notes.length}건</span>
      </div>

      {pastOpen && (
        <div className="mt-2">
          {notes.length === 0 && <p className="text-[13px] text-gray-400">아직 면담 기록이 없습니다.</p>}
          {notes.map((note, i) =>
            editingNoteId === note.id ? (
              <div key={note.id} className="flex items-stretch gap-4 pb-4">
                {/* 수정 중에도 타임라인 인디케이터(분위기 아이콘/점 + 세로선)는
                    그대로 둔다 -- 편집 폼으로 바뀌었다고 위치 감각이
                    사라지면 안 된다. */}
                <div className="flex w-8 shrink-0 flex-col items-center">
                  {note.mood ? (
                    <MoodIcon mood={note.mood} className="h-8 w-8 shrink-0" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 ring-1 ring-gray-200">
                      <span className="h-2 w-2 rounded-full bg-gray-300" />
                    </span>
                  )}
                  {i < notes.length - 1 && <span className="mt-1 w-px flex-1 bg-gray-200" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      aria-label="면담 일자"
                      className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm text-black"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton onClick={() => setEditingNoteId(null)} title="취소" aria-label="취소">
                        <XIcon className="h-4 w-4" />
                      </IconButton>
                      <span className="h-4 w-px bg-gray-200" />
                      <IconButton
                        onClick={() => {
                          setEditingNoteId(null)
                          setDeletingNote(note)
                        }}
                        title="삭제"
                        aria-label="삭제"
                        tone="danger"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                  {/* 면담일지(작성 폼)와 똑같은 레이아웃 -- textarea 옆에
                      기분 그리드 + 제출 버튼을 세로로 쌓는다. 버튼 라벨만
                      "수정하기"로 바꾸고, 그 동작이 곧 저장이라 별도
                      체크(저장) 아이콘은 두지 않는다. */}
                  <div className="mt-2 flex flex-wrap items-stretch gap-4">
                    <textarea
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                      rows={3}
                      className="min-h-[72px] min-w-[160px] flex-1 resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-black"
                    />
                    <div className="flex shrink-0 flex-col items-center gap-2">
                      <div className="grid grid-cols-3 gap-0.5">
                        {MOOD_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setEditMood((v) => (v === opt.value ? null : opt.value))}
                            title={opt.label}
                            aria-label={opt.label}
                            className={`flex items-center justify-center rounded-full p-0.5 transition-colors ${
                              editMood === opt.value ? 'bg-accent/5 ring-2 ring-accent' : 'hover:bg-gray-50'
                            }`}
                          >
                            <MoodIcon mood={opt.value} className="h-5 w-5" />
                          </button>
                        ))}
                      </div>
                      <Button variant="primary" onClick={() => saveEdit(note)} disabled={!editComment.trim()} className="w-full px-2 py-1.5">
                        수정하기
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div key={note.id} className="flex items-stretch gap-4">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  {note.mood ? (
                    <MoodIcon mood={note.mood} className="h-8 w-8 shrink-0" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 ring-1 ring-gray-200">
                      <span className="h-2 w-2 rounded-full bg-gray-300" />
                    </span>
                  )}
                  {i < notes.length - 1 && <span className="mt-1 w-px flex-1 bg-gray-200" />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-normal text-black">{note.date}</span>
                      {i === 0 && <span className="text-xs text-gray-400">최근 면담</span>}
                      {note.date > todayStr && <Badge tone="accent">예정</Badge>}
                      {note.calendarEventId && (
                        <span title="Google 캘린더에 등록됨" className="flex h-5 w-5 shrink-0 flex-col overflow-hidden rounded-[3px] border border-[#bcc1cd]">
                          <span className="h-1.5 w-full shrink-0 bg-[#a35c5c]" />
                          <span className="flex flex-1 items-center justify-center bg-[#e5e7eb] text-[9px] font-bold text-[#555]">{note.date.slice(8, 10)}</span>
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        onClick={() => {
                          setEditingNoteId(note.id)
                          setEditDate(note.date)
                          setEditComment(note.comment)
                          setEditMood(note.mood ?? null)
                        }}
                        title="수정"
                        aria-label="수정"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </IconButton>
                      <span className="h-4 w-px bg-gray-200" />
                      <IconButton onClick={() => setDeletingNote(note)} title="삭제" aria-label="삭제" tone="danger">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </IconButton>
                    </div>
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-[13px] text-black">
                    <p className="whitespace-pre-wrap break-words">{note.comment}</p>
                    {note.strengths?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">강점 : {note.strengths}</p>}
                    {note.improvements?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">보완 : {note.improvements}</p>}
                    {note.nextExperience?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">다음도전 : {note.nextExperience}</p>}
                    {note.careerInterest?.trim() && <p className="whitespace-pre-wrap break-words text-gray-500">Career Goal : {note.careerInterest}</p>}
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )

  return (
    <div>
      {splitLayout ? (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            {insightsBlock}
            {historyBlock}
          </div>
          <div>{logFormBlock}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {insightsBlock}
          {logFormBlock}
          {historyBlock}
        </div>
      )}

      <ConfirmDialog
        open={deletingNote !== null}
        title="면담 기록 삭제"
        message={`${deletingNote?.date} 면담 기록을 삭제하시겠습니까?`}
        onConfirm={() => {
          if (deletingNote) {
            if (deletingNote.calendarEventId) void deleteCalendarEvent(deletingNote.calendarEventId, teamName)
            dispatch({ type: 'DELETE_MEETING_NOTE', payload: { id: deletingNote.id } })
          }
          setDeletingNote(null)
        }}
        onCancel={() => setDeletingNote(null)}
      />
    </div>
  )
}

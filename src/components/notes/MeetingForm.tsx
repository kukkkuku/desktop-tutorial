import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { AlertTriangle, CalendarCheck, FileText, Pencil, Trash2, X } from 'lucide-react'
import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { MeetingNote, TeamMember } from '../../types'
import { createCalendarEvent, deleteCalendarEvent, isCalendarConfigured, updateCalendarEvent } from '../../utils/googleCalendar'
import ConfirmDialog from '../ConfirmDialog'
import Badge from '../Badge'
import Button from '../Button'
import CollapseToggleButton from '../CollapseToggleButton'
import DatePicker from '../DatePicker'
import IconButton from '../IconButton'
import MoodIcon, { MOOD_OPTIONS } from './MoodIcon'
import MeetingPaperModal from './MeetingPaperModal'
import type { MeetingInsight } from '../../utils/meetingInsights'
import { ic, icSm } from '../ui/icon'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

interface MeetingFormProps {
  member: TeamMember
  focusToken?: number | null
  insights: MeetingInsight[]
  // 면담용지 출력에 쓰는 머리글·성과 요약
  paper: { basicInfo: string; perfLines: { title: string; tasks: string[] } }
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
export default function MeetingForm({ member, focusToken, insights, paper, insightsOpen, onToggleInsights, splitLayout }: MeetingFormProps) {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const memberId = member.id
  const todayStr = todayString()
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [paperOpen, setPaperOpen] = useState(false)

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

  // 추천 질문을 면담 내용 칸에 끼워 넣는다(이미 적은 내용 뒤에 한 줄로).
  function insertQuestion(q: string) {
    setComment((cur) => (cur.trim() ? `${cur.replace(/\s+$/, '')}\nQ. ${q}\n` : `Q. ${q}\n`))
    commentRef.current?.focus()
  }

  const insightsBlock = insights.length > 0 && (
    <div className="rounded-card border border-separator bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-[14px] font-semibold text-label">
          면담 인사이트 <span className="ml-1 text-[12px] font-normal text-label-3">{insights.length}</span>
        </span>
        <CollapseToggleButton collapsed={!insightsOpen} onClick={onToggleInsights} label="면담 인사이트" />
      </div>
      {insightsOpen && (
        <ul className="divide-y divide-separator border-t border-separator">
          {insights.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-label-3" />
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-label" title={`${s.title}\n근거 · ${s.basis}`}>
                  {s.title}
                </p>
                <button
                  onClick={() => insertQuestion(s.question)}
                  title="추천 질문을 면담 내용에 넣기"
                  aria-label="추천 질문을 면담 내용에 넣기"
                  className="shrink-0 rounded p-0.5 text-warning hover:bg-warning/10"
                >
                  <FileText {...icSm} />
                </button>
              </div>
              <p className="mt-1 pl-3.5 text-[13px] text-label-2">
                <span className="mr-1.5 text-label-3">추천 질문</span>
                {s.question}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  const logFormBlock = (
    // 이 블록이 카드의 남은 세로를 다 차지하고, 그 안에서 입력칸 줄이 flex-1로
    // 늘어난다 -- 2단(splitLayout)이든 위아래로 쌓이는 좁은 레이아웃이든 같다.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 한 줄: 면담일 · 분위기 이모지 · (오른쪽) 면담용지 · 작성하기. 그 아래 입력칸이 남는 높이를 채운다. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="sr-only">면담일지</h3>
        <DatePicker value={date} onChange={setDate} ariaLabel="면담 일자" clearable={false} />
        <div className="flex items-center gap-1" role="radiogroup" aria-label="면담 분위기">
          {MOOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={mood === opt.value}
              onClick={() => setMood((v) => (v === opt.value ? null : opt.value))}
              title={opt.label}
              aria-label={opt.label}
              className={`flex items-center justify-center rounded-full p-0.5 transition ${
                mood === opt.value ? 'bg-accent-soft ring-2 ring-accent' : mood ? 'opacity-40 hover:opacity-100' : 'hover:bg-black/[0.04]'
              }`}
            >
              <MoodIcon mood={opt.value} className="h-6 w-6" />
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={() => setPaperOpen(true)} title="면담 전에 출력해 두고 손으로 적을 수 있는 면담용지">
            면담용지
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!comment.trim()}>
            작성하기
          </Button>
        </div>
      </div>

      {calendarError && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-card bg-danger/[0.06] px-2.5 py-1.5 text-[13px] text-danger">
          <AlertTriangle {...icSm} className="mt-0.5 shrink-0" />
          면담 기록은 저장됐지만 캘린더 등록에 실패했습니다: {calendarError}
        </p>
      )}

      <textarea
        ref={commentRef}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        placeholder="면담 내용을 입력하세요."
        className="mt-3 min-h-[120px] w-full flex-1 resize-y rounded-control border border-hairline px-3 py-2 text-[13px] text-label"
      />

      {/* 강점/보완/다음도전/Career Goal은 매번 다 채우는 칸이 아니라 필요할
          때만 쓰는 육성 포인트라, 기본은 접어두고 코멘트만 가볍게 남길 수
          있게 한다. */}
      <div className="mt-3 flex items-center gap-1.5">
        <CollapseToggleButton collapsed={!detailsOpen} onClick={() => setDetailsOpen((v) => !v)} label="육성 포인트" />
        <button onClick={() => setDetailsOpen((v) => !v)} className="text-[13px] font-medium text-label-2 hover:text-accent">
          육성 포인트 (강점·보완·다음 경험·Career Goal)
        </button>
      </div>

      {detailsOpen && (
        <div className="mt-2 flex flex-col gap-3">
          <div>
            <label className="block text-[13px] font-medium text-label-2">강점</label>
            <input
              type="text"
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              placeholder="강점 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mt-0.5 w-full text-label"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-label-2">보완 필요</label>
            <input
              type="text"
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              placeholder="보완이 필요한 영역 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mt-0.5 w-full text-label"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-label-2">다음 도전 경험</label>
            <input
              type="text"
              value={nextExperience}
              onChange={(e) => setNextExperience(e.target.value)}
              placeholder="도전해 보고 싶은 경험 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mt-0.5 w-full text-label"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-label-2">Career Goal</label>
            <input
              type="text"
              value={careerGoal}
              onChange={(e) => setCareerGoal(e.target.value)}
              placeholder="성장 커리어/목표 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mt-0.5 w-full text-label"
            />
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
        <h4 className="text-[13px] font-semibold text-label">면담 기록</h4>
        <span className="mac-badge bg-black/[0.05] text-label-2">최근 {notes.length}건</span>
      </div>

      {pastOpen && (
        <div className="mt-2">
          {notes.length === 0 && <p className="text-[13px] text-label-3">아직 면담 기록이 없습니다.</p>}
          {notes.map((note, i) =>
            editingNoteId === note.id ? (
              <div key={note.id} className="flex items-stretch gap-4 pb-4">
                {/* 수정 중에도 타임라인 인디케이터(분위기 아이콘/점 + 세로선)는
                    그대로 둔다 -- 편집 폼으로 바뀌었다고 위치 감각이
                    사라지면 안 된다. */}
                <div className="flex w-5 shrink-0 flex-col items-center">
                  {note.mood ? (
                    <MoodIcon mood={note.mood} className="h-5 w-5 shrink-0" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F7F7F9] ring-1 ring-separator">
                      <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
                    </span>
                  )}
                  {i < notes.length - 1 && <span className="mt-1 w-px flex-1 bg-black/[0.08]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <DatePicker value={editDate} onChange={setEditDate} ariaLabel="면담 일자" clearable={false} />
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton onClick={() => setEditingNoteId(null)} title="취소" aria-label="취소">
                        <X {...ic} />
                      </IconButton>
                      <span className="h-4 w-px bg-black/[0.08]" />
                      <IconButton
                        onClick={() => {
                          setEditingNoteId(null)
                          setDeletingNote(note)
                        }}
                        title="삭제"
                        aria-label="삭제"
                        tone="danger"
                      >
                        <Trash2 {...ic} />
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
                      className="py-1.5 rounded-control border border-hairline px-2.5 text-[13px] min-h-[72px] min-w-[160px] flex-1 resize-y text-label"
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
                              editMood === opt.value ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-black/[0.03]'
                            }`}
                          >
                            <MoodIcon mood={opt.value} className="h-5 w-5" />
                          </button>
                        ))}
                      </div>
                      <Button variant="primary" onClick={() => saveEdit(note)} disabled={!editComment.trim()} className="w-full">
                        수정하기
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div key={note.id} className="flex items-stretch gap-4">
                <div className="flex w-5 shrink-0 flex-col items-center">
                  {note.mood ? (
                    <MoodIcon mood={note.mood} className="h-5 w-5 shrink-0" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F7F7F9] ring-1 ring-separator">
                      <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
                    </span>
                  )}
                  {i < notes.length - 1 && <span className="mt-1 w-px flex-1 bg-black/[0.08]" />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] tabular-nums text-label">{note.date}</span>
                      {i === 0 && <span className="text-[13px] text-label-3">최근 면담</span>}
                      {note.date > todayStr && <Badge tone="accent">예정</Badge>}
                      {note.calendarEventId && (
                        <span title="Google 캘린더에 등록됨" className="flex shrink-0 text-accent">
                          <CalendarCheck {...icSm} />
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
                        <Pencil {...ic} />
                      </IconButton>
                      <span className="h-4 w-px bg-black/[0.08]" />
                      <IconButton onClick={() => setDeletingNote(note)} title="삭제" aria-label="삭제" tone="danger">
                        <Trash2 {...ic} />
                      </IconButton>
                    </div>
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-[13px] text-label">
                    <p className="whitespace-pre-wrap break-words">{note.comment}</p>
                    {note.strengths?.trim() && <p className="whitespace-pre-wrap break-words text-label-2">강점 : {note.strengths}</p>}
                    {note.improvements?.trim() && <p className="whitespace-pre-wrap break-words text-label-2">보완 : {note.improvements}</p>}
                    {note.nextExperience?.trim() && <p className="whitespace-pre-wrap break-words text-label-2">다음도전 : {note.nextExperience}</p>}
                    {note.careerInterest?.trim() && <p className="whitespace-pre-wrap break-words text-label-2">Career Goal : {note.careerInterest}</p>}
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
    <div className="flex min-h-0 flex-1 flex-col">
      {splitLayout ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
          {/* 왼쪽(인사이트·면담 기록)은 기본이 접힘이라 짧지만, 펼쳐서 기록이
              많아지면 이 칸 안에서만 스크롤한다 -- 카드 전체가 늘어나 오른쪽
              입력칸까지 같이 길어지지 않도록. */}
          <div className="min-h-0 space-y-4 overflow-y-auto">
            {insightsBlock}
            {historyBlock}
          </div>
          <div className="flex min-h-0 flex-col">{logFormBlock}</div>
        </div>
      ) : (
        // 위아래로 쌓이는 좁은 레이아웃에서도 입력칸이 남는 세로를 가져간다.
        // 인사이트/기록은 접혀 있으면 한 줄짜리 헤더뿐이라 자리를 거의 안 쓰고,
        // 펼치면 그만큼만 가져가고 나머지는 그대로 입력칸 몫이다.
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="shrink-0">{insightsBlock}</div>
          {logFormBlock}
          <div className="shrink-0">{historyBlock}</div>
        </div>
      )}

      {paperOpen && (
        <MeetingPaperModal
          name={member.name}
          basicInfo={paper.basicInfo}
          initialDate={date}
          perfLines={paper.perfLines}
          insights={insights}
          lastMeeting={notes[0] ?? null}
          draft={{ comment, strengths, improvements, nextExperience, careerGoal }}
          onClose={() => setPaperOpen(false)}
        />
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

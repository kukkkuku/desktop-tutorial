import { errText } from '../../utils/googleError'
import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { AlertTriangle, FoldHorizontal, FileText, MessageSquareText } from 'lucide-react'
import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { MeetingNote, TeamMember } from '../../types'
import { createCalendarEvent, deleteCalendarEvent, isCalendarConfigured, updateCalendarEvent } from '../../utils/googleCalendar'
import ConfirmDialog from '../ConfirmDialog'
import CollapseToggleButton from '../CollapseToggleButton'
import DatePicker from '../DatePicker'
import IconButton from '../IconButton'
import MoodIcon, { MOOD_OPTIONS, moodColor } from './MoodIcon'
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
  // 면담 칸 전체를 한 줄(슬림 바)로 접기
  onCollapse?: () => void
}

// 면담일지 -- Figma 디자인(interview-log-card) 그대로: 사방이 닫힌 박스가
// 아니라 3등분 컬럼의 자기 칸을 그대로 채운다(컬럼 사이 여백은 부모 grid의
// gap이 담당하므로 여기서 따로 테두리/여백을 두지 않는다). 제목 옆에 면담
// 일자 + 작성하기 버튼이 한 줄, 면담 코멘트, 육성 포인트(강점·보완 필요·
// 다음 도전 경험·Career Goal). 다음 확인일과 Action 입력 영역은 Figma에
// 없어 제거했다. 최근 면담 기록은 기본 접힘 -- 펼쳤을 때 각 기록은
// 필드별로 줄바꿈해서 보여준다(한 줄로 합쳐 truncate하면 내용이 잘려서
// 확인이 안 되는 문제가 있었다).
export default function MeetingForm({ member, focusToken, insights, paper, insightsOpen, onToggleInsights, splitLayout, onCollapse }: MeetingFormProps) {
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
  // 레일에서 고른 지난 면담(입력 영역에 불러와 수정하기 · 삭제). null이면 새로 쓰는 중
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)
  // 캘린더 등록/수정 실패는 면담 기록 저장 자체를 막지는 않지만, 콘솔에만
  // 조용히 남기면 왜 캘린더에 안 뜨는지 알 방법이 없다 -- 화면에도 보여준다.
  const [calendarError, setCalendarError] = useState<string | null>(null)
  // 일정 등록이 실패한 기록(기록은 저장됨) -- 「일정 다시 등록」으로 일정만 다시 시도한다
  const [retryNote, setRetryNote] = useState<MeetingNote | null>(null)
  const [retrying, setRetrying] = useState(false)
  function retryCalendar() {
    if (!retryNote || retrying) return
    const n = retryNote
    setRetrying(true)
    createCalendarEvent({ memberName: member.name, date: n.date, comment: n.comment, teamName })
      .then((eventId) => {
        dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...n, calendarEventId: eventId } })
        setCalendarError(null)
        setRetryNote(null)
      })
      .catch((err) => setCalendarError(errText(err, '캘린더 일정 등록에 실패했습니다.')))
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    setDate(todayStr)
    setComment('')
    setMood(null)
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerGoal('')
    setDetailsOpen(false)
    setLoadedId(null)
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
          setCalendarError(errText(err, '캘린더 일정 등록에 실패했습니다.'))
          setRetryNote(note)
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

  function clearForm() {
    setLoadedId(null)
    setDate(todayStr)
    setComment('')
    setMood(null)
    setStrengths('')
    setImprovements('')
    setNextExperience('')
    setCareerGoal('')
    setDetailsOpen(false)
  }

  // 레일에서 지난 면담을 누르면 그 내용이 입력 영역에 들어온다(같은 걸 다시 누르면 새로 쓰기로 돌아감)
  function loadNote(n: MeetingNote) {
    if (loadedId === n.id) {
      clearForm()
      return
    }
    setLoadedId(n.id)
    setDate(n.date)
    setComment(n.comment)
    setMood(n.mood ?? null)
    setStrengths(n.strengths ?? '')
    setImprovements(n.improvements ?? '')
    setNextExperience(n.nextExperience ?? '')
    setCareerGoal(n.careerInterest ?? '')
    setDetailsOpen(Boolean(n.strengths || n.improvements || n.nextExperience || n.careerInterest))
    requestAnimationFrame(() => commentRef.current?.focus())
  }

  function saveLoaded() {
    const note = notes.find((n) => n.id === loadedId)
    if (!note || !date || !comment.trim()) return
    const updated: MeetingNote = {
      ...note,
      date,
      comment: comment.trim(),
      mood: mood ?? undefined,
      strengths: strengths.trim() || undefined,
      improvements: improvements.trim() || undefined,
      nextExperience: nextExperience.trim() || undefined,
      careerInterest: careerGoal.trim() || undefined,
    }
    dispatch({ type: 'UPDATE_MEETING_NOTE', payload: updated })
    clearForm()
    setCalendarError(null)
    if (!isCalendarConfigured()) return
    if (updated.calendarEventId) {
      if (date >= todayStr) {
        void updateCalendarEvent(updated.calendarEventId, { memberName: member.name, date, comment: updated.comment, teamName }).catch((err) => {
          console.warn('캘린더 일정 수정 실패:', err)
          setCalendarError(errText(err, '캘린더 일정 수정에 실패했습니다.'))
        })
      } else {
        // 과거 날짜로 바뀌면 더 이상 "예정"이 아니니 캘린더 일정은 지운다.
        void deleteCalendarEvent(updated.calendarEventId, teamName)
        dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...updated, calendarEventId: undefined } })
      }
    } else if (date >= todayStr) {
      createCalendarEvent({ memberName: member.name, date, comment: updated.comment, teamName })
        .then((eventId) => dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...updated, calendarEventId: eventId } }))
        .catch((err) => {
          console.warn('캘린더 일정 등록 실패:', err)
          setCalendarError(errText(err, '캘린더 일정 등록에 실패했습니다.'))
        })
    }
  }

  // 추천 질문을 면담 내용 칸에 끼워 넣는다(이미 적은 내용 뒤에 한 줄로).
  function insertQuestion(q: string) {
    setComment((cur) => (cur.trim() ? `${cur.replace(/\s+$/, '')}\nQ. ${q}\n` : `Q. ${q}\n`))
    commentRef.current?.focus()
  }

  const insightsBlock = insights.length > 0 && (
    <div className="rounded-[8px] border border-[#ececef] bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-[length:calc(13px*var(--ui-fs,1))] font-bold text-label">
          면담 인사이트 <span className="ml-1 text-[length:calc(12px*var(--ui-fs,1))] font-normal text-[#a4a4b2]">{insights.length}</span>
        </span>
        <CollapseToggleButton collapsed={!insightsOpen} onClick={onToggleInsights} label="면담 인사이트" />
      </div>
      {insightsOpen && (
        <ul className="divide-y divide-separator border-t border-separator">
          {insights.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-label-3" />
                <p className="min-w-0 flex-1 truncate text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label" title={`${s.title}\n근거 · ${s.basis}`}>
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
              <p className="mt-1 pl-3.5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
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
      {/* 피그마 시안 순서: ① 면담일 · 분위기 이모지(오른쪽 끝 접기 아이콘) ② 면담용지 · 작성하기(오른쪽 정렬) ③ 인사이트 ④ 입력칸 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-[17px] gap-y-2">
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
        </div>
        {onCollapse && (
          <IconButton onClick={onCollapse} title="면담 칸을 한 줄로 접기" aria-label="면담 칸을 한 줄로 접기">
            <FoldHorizontal {...icSm} />
          </IconButton>
        )}
      </div>
      <div className="mt-[9px] flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setPaperOpen(true)}
          title="면담 전에 출력해 두고 손으로 적을 수 있는 면담용지"
          className="flex h-8 items-center justify-center rounded-[18px] border border-[#ececef] bg-white px-3 text-[length:calc(13px*var(--ui-fs,1))] text-label shadow-[0_3px_7px_rgba(0,0,0,0.05)] hover:text-accent"
        >
          면담용지
        </button>
        {loadedId && (
          <>
            <button
              type="button"
              onClick={clearForm}
              className="flex h-8 items-center justify-center rounded-[18px] border border-[#ececef] bg-white px-3 text-[length:calc(13px*var(--ui-fs,1))] text-label shadow-[0_3px_7px_rgba(0,0,0,0.05)] hover:text-accent"
            >
              새로 쓰기
            </button>
            <button
              type="button"
              onClick={() => setDeletingNote(notes.find((n) => n.id === loadedId) ?? null)}
              className="flex h-8 items-center justify-center rounded-[18px] border border-danger/30 bg-white px-3 text-[length:calc(13px*var(--ui-fs,1))] text-danger shadow-[0_3px_7px_rgba(0,0,0,0.05)] hover:bg-danger/[0.06]"
            >
              삭제
            </button>
          </>
        )}
        <button
          type="button"
          onClick={loadedId ? saveLoaded : handleSave}
          disabled={!comment.trim()}
          className="flex h-8 min-w-[76px] items-center justify-center rounded-[18px] bg-accent px-3 text-[length:calc(13px*var(--ui-fs,1))] text-white shadow-[0_3px_7px_rgba(0,0,0,0.05)] hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-[#adadad]"
        >
          {loadedId ? '수정하기' : '작성하기'}
        </button>
      </div>
      {insightsBlock && <div className="mt-[9px] shrink-0">{insightsBlock}</div>}

      {calendarError && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-card bg-danger/[0.06] px-2.5 py-1.5 text-[length:calc(14px*var(--ui-fs,1))] text-danger">
          <AlertTriangle {...icSm} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">면담 기록은 저장됐지만 캘린더 등록에 실패했습니다: {calendarError}</span>
          {retryNote && (
            <button onClick={retryCalendar} disabled={retrying} className="shrink-0 rounded-control border border-danger/40 px-2 py-0.5 text-xs font-medium hover:bg-danger/10 disabled:opacity-60">
              {retrying ? '등록 중…' : '일정 다시 등록'}
            </button>
          )}
        </p>
      )}

      <textarea
        ref={commentRef}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        placeholder="면담 내용을 입력하세요."
        className="mt-3 min-h-[120px] w-full flex-1 resize-y rounded-[8px] border border-[#e1e1e5] p-3 text-[length:calc(12px*var(--ui-fs,1))] text-label placeholder:text-[#a1a7b7]"
      />

      {/* 강점/보완/다음도전/Career Goal은 매번 다 채우는 칸이 아니라 필요할
          때만 쓰는 육성 포인트라, 기본은 접어두고 코멘트만 가볍게 남길 수
          있게 한다. */}
      <div className="mt-3 flex items-center gap-1.5">
        <CollapseToggleButton collapsed={!detailsOpen} onClick={() => setDetailsOpen((v) => !v)} label="육성 포인트" />
        <button onClick={() => setDetailsOpen((v) => !v)} className="text-[length:calc(12px*var(--ui-fs,1))] text-[#72727e] hover:text-accent">
          육성 포인트 (강점·보완·다음 경험·Career Goal)
        </button>
      </div>

      {detailsOpen && (
        <div className="mt-2 flex flex-col gap-3">
          <div>
            <label className="block text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label-2">강점</label>
            <input
              type="text"
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              placeholder="강점 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] mt-0.5 w-full text-label"
            />
          </div>
          <div>
            <label className="block text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label-2">보완 필요</label>
            <input
              type="text"
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              placeholder="보완이 필요한 영역 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] mt-0.5 w-full text-label"
            />
          </div>
          <div>
            <label className="block text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label-2">다음 도전 경험</label>
            <input
              type="text"
              value={nextExperience}
              onChange={(e) => setNextExperience(e.target.value)}
              placeholder="도전해 보고 싶은 경험 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] mt-0.5 w-full text-label"
            />
          </div>
          <div>
            <label className="block text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label-2">Career Goal</label>
            <input
              type="text"
              value={careerGoal}
              onChange={(e) => setCareerGoal(e.target.value)}
              placeholder="성장 커리어/목표 입력"
              className="h-8 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] mt-0.5 w-full text-label"
            />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <HistoryRail notes={notes} activeId={loadedId} onPick={loadNote} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {splitLayout ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6">
          {/* 왼쪽(인사이트·면담 기록)은 기본이 접힘이라 짧지만, 펼쳐서 기록이
              많아지면 이 칸 안에서만 스크롤한다 -- 카드 전체가 늘어나 오른쪽
              입력칸까지 같이 길어지지 않도록. */}
          <div className="flex min-h-0 flex-col">{logFormBlock}</div>
        </div>
      ) : (
        // 위아래로 쌓이는 좁은 레이아웃에서도 입력칸이 남는 세로를 가져간다.
        // 인사이트/기록은 접혀 있으면 한 줄짜리 헤더뿐이라 자리를 거의 안 쓰고,
        // 펼치면 그만큼만 가져가고 나머지는 그대로 입력칸 몫이다.
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {logFormBlock}
        </div>
      )}

      </div>
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
            if (deletingNote.id === loadedId) clearForm()
          }
          setDeletingNote(null)
        }}
        onCancel={() => setDeletingNote(null)}
      />
    </div>
  )
}

// 면담 기록 레일: 말풍선 + 건수, 그 아래 면담마다 짧은 막대(분위기 색). 막대에 마우스를 올리면 날짜 · 내용 한 줄 · 「클릭하여 상세 보기」,
// 누르면 전체 기록(수정 · 삭제) 창이 열린다.
function HistoryRail({ notes, activeId, onPick }: { notes: MeetingNote[]; activeId: string | null; onPick: (n: MeetingNote) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="relative flex w-[72px] shrink-0 flex-col items-start gap-1.5 pt-[44px]">
      <span title={`면담 기록 ${notes.length}건`} className="mb-1 flex items-center gap-2 px-1.5 py-1 text-label-2">
        <MessageSquareText {...ic} />
        <span className="text-[length:calc(14px*var(--ui-fs,1))] font-bold tabular-nums text-label">{notes.length}</span>
      </span>
      {notes.map((n) => {
        const on = hover === n.id || activeId === n.id
        return (
          <div key={n.id} className="relative" onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}>
            <button
              type="button"
              onClick={() => onPick(n)}
              aria-label={`${n.date} 면담 기록 불러오기`}
              className="flex h-4 w-[76px] items-center justify-start px-1.5"
            >
              <span
                className="block h-[3px] rounded-full transition-all"
                style={{ width: on ? 76 - 12 : 26, background: on ? '#18181B' : moodColor(n.mood) }}
              />
            </button>
            {hover === n.id && (
              <div className="mac-pop pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-40 w-[280px] -translate-y-1/2 px-4 py-3">
                <p className="text-[length:calc(14px*var(--ui-fs,1))] font-bold tabular-nums text-label">{n.date}</p>
                <p className="mt-1 truncate text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">{n.comment.split('\n')[0]}</p>
                <p className="mt-2 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-accent">클릭하여 상세 보기</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

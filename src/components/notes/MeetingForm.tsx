import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { MeetingNote, TeamMember } from '../../types'
import { createCalendarEvent, deleteCalendarEvent, isCalendarConfigured, listTeamCalendarEvents, updateCalendarEvent } from '../../utils/googleCalendar'
import ConfirmDialog from '../ConfirmDialog'
import Badge from '../Badge'
import Button from '../Button'
import CollapseToggleButton from '../CollapseToggleButton'
import IconButton from '../IconButton'
import MoodIcon from './MoodIcon'
import MoodPicker from './MoodPicker'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

// 기분 선택 영역(6단계 아이콘 한 줄)이 라벨까지 편하게 펼쳐지려면 대략 이
// 정도 너비가 필요하다 -- 이보다 좁으면 대표 아이콘 하나 + 팝오버로 접는다.
const MOOD_INLINE_MIN_WIDTH = 460

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
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

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

  // "일정 연동" -- 이 앱은 서버가 없는 정적 사이트라 구글 캘린더 쪽 변경을
  // 실시간으로(웹훅) 받을 수 없다. 대신 버튼을 누른 시점에 "{팀명} 면담"
  // 캘린더의 현재 상태를 통째로 읽어와 세 방향으로 맞춘다.
  //   1) 구글 캘린더에서 지워진 일정 -> 이 앱에 남은 연결(calendarEventId)만
  //      끊는다(면담 기록 자체는 지우지 않는다 -- 캘린더 삭제가 곧 면담
  //      기록 삭제를 뜻하진 않는다).
  //   2) 구글 캘린더에서 날짜/설명을 고친 일정 -> 연결된 면담 기록의
  //      날짜/코멘트를 그 값으로 덮어써서 맞춘다.
  //   3) 이 앱이 모르는, "{이 팀원 이름} 면담" 형식의 일정 -> 새 면담
  //      기록으로 가져온다(다른 이름의 일정은 이 팀원 것이 아니므로 건너뛴다).
  async function handleSyncCalendar() {
    if (!isCalendarConfigured() || syncing) return
    setSyncing(true)
    setSyncMessage(null)
    try {
      const events = await listTeamCalendarEvents(teamName)
      const eventById = new Map(events.map((e) => [e.id, e]))
      let unlinked = 0
      let updated = 0
      for (const note of notes) {
        if (!note.calendarEventId) continue
        const ev = eventById.get(note.calendarEventId)
        if (!ev) {
          dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, calendarEventId: undefined } })
          unlinked++
          continue
        }
        // 설명이 비어 있으면(구글 쪽에서 지운 게 아니라 원래 없던 경우가
        // 대부분) 기존 코멘트를 그대로 둔다 -- 빈 값으로 덮어써서 기록
        // 내용을 날리지 않도록.
        const nextComment = ev.description?.trim() || note.comment
        if (ev.date !== note.date || nextComment !== note.comment) {
          dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, date: ev.date, comment: nextComment } })
          updated++
        }
      }

      const linkedEventIds = new Set(notes.map((n) => n.calendarEventId).filter((id): id is string => Boolean(id)))
      let imported = 0
      for (const ev of events) {
        if (linkedEventIds.has(ev.id)) continue
        if (ev.summary !== `${member.name} 면담`) continue
        const note: MeetingNote = {
          id: uuidv4(),
          memberId,
          date: ev.date,
          comment: ev.description?.trim() || '(Google 캘린더에서 가져온 일정)',
          calendarEventId: ev.id,
        }
        dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
        imported++
      }

      const parts = [
        imported > 0 && `${imported}건 가져옴`,
        updated > 0 && `${updated}건 갱신됨`,
        unlinked > 0 && `${unlinked}건 연동 해제됨`,
      ].filter((v): v is string => Boolean(v))
      setSyncMessage(parts.length > 0 ? parts.join(' · ') : '변경된 내용이 없습니다.')
    } catch (err) {
      console.warn('캘린더 동기화 실패:', err)
      setSyncMessage(err instanceof Error ? err.message : '캘린더 동기화에 실패했습니다.')
    } finally {
      setSyncing(false)
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
      <div ref={logRowRef} className="mt-3 flex flex-wrap items-start gap-4">
        <textarea
          ref={commentRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="면담 내용을 입력하세요."
          className="h-[124px] min-w-[240px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
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
        {isCalendarConfigured() && (
          <button
            type="button"
            onClick={handleSyncCalendar}
            disabled={syncing}
            title={`Google 캘린더의 "${member.name} 면담" 일정을 이 기록과 맞춥니다.`}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`}>
              <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
              <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
              <path d="M3 16v4h4" />
              <path d="M21 8V4h-4" />
            </svg>
            {syncing ? '동기화 중…' : '일정 연동'}
          </button>
        )}
      </div>
      {syncMessage && <p className="mt-1 text-[11px] text-gray-400">{syncMessage}</p>}

      {pastOpen && (
        <div className="mt-2">
          {notes.length === 0 && <p className="text-[13px] text-gray-400">아직 면담 기록이 없습니다.</p>}
          {notes.map((note, i) =>
            editingNoteId === note.id ? (
              <div key={note.id} className="ml-9 mb-3 flex flex-wrap items-start gap-2 rounded-md border border-gray-300 bg-white px-3 py-3">
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
                <textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} rows={2} className="min-w-[180px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black" />
                <div className="flex w-full items-center">
                  <MoodPicker value={editMood} onChange={setEditMood} compact={moodCompact} />
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => saveEdit(note)} disabled={!editComment.trim()} className="px-3 py-1.5 text-xs">
                    저장
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingNoteId(null)} className="px-3 py-1.5 text-xs">
                    취소
                  </Button>
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
                      <span className="text-xl font-bold text-black">{note.date}</span>
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

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { MeetingNote } from '../../types'
import { colorForIndex } from '../../utils/memberColors'
import { createCalendarEvent, deleteCalendarEvent, isCalendarConfigured, listTeamCalendarEvents } from '../../utils/googleCalendar'
import ConfirmDialog from '../ConfirmDialog'
import IconButton from '../IconButton'
import Button from '../Button'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}
function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function fmtShort(date: string): string {
  return date.slice(5).replace('-', '/')
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function Chevron({ dir, className }: { dir: 'left' | 'right'; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className={className}>
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
function SyncIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M3 16v4h4" />
      <path d="M21 8V4h-4" />
    </svg>
  )
}

interface MeetingSchedulePanelProps {
  open: boolean
  onToggle: () => void
  onSelectMember: (memberId: string) => void
}

// 우측 면담 일정 -- 상시 고정 패널(접기 가능). 예전 Drawer 대신 첨부 디자인처럼
// 우측에 붙는 컬럼. 접으면 얇은 세로 바만 남는다.
export default function MeetingSchedulePanel({ open, onToggle, onSelectMember }: MeetingSchedulePanelProps) {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const { members, meetingNotes } = state
  const todayStr = todayString()

  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [addMemberId, setAddMemberId] = useState<string | null>(members[0]?.id ?? null)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [deletingNote, setDeletingNote] = useState<MeetingNote | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // 날짜별로 (팀원 인덱스, 그 면담 기록) 쌍을 모아둔다 -- 칩 자체에서 바로
  // 삭제할 수 있으려면 인덱스뿐 아니라 기록(note)까지 들고 있어야 한다.
  const notesByDate = new Map<string, { idx: number; note: MeetingNote }[]>()
  meetingNotes.forEach((n) => {
    const idx = members.findIndex((m) => m.id === n.memberId)
    if (idx === -1) return
    const list = notesByDate.get(n.date) ?? []
    if (!list.some((e) => e.idx === idx)) list.push({ idx, note: n })
    notesByDate.set(n.date, list)
  })

  const upcoming = Array.from(notesByDate.entries())
    .filter(([date]) => date > todayStr)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([date, entries]) => ({ date, entries }))

  const todayEntries = notesByDate.get(todayStr) ?? []
  // 접힌 상태에서 보여줄 목록 -- 오늘 일정이 있으면 맨 위, 그 다음 다가오는 일정.
  const collapsedEntries = (todayEntries.length > 0 ? [{ date: todayStr, entries: todayEntries }] : []).concat(upcoming).slice(0, 5)

  function requestDeleteNote(note: MeetingNote) {
    setDeletingNote(note)
  }

  function confirmDeleteNote() {
    if (!deletingNote) return
    if (deletingNote.calendarEventId) void deleteCalendarEvent(deletingNote.calendarEventId, teamName)
    dispatch({ type: 'DELETE_MEETING_NOTE', payload: { id: deletingNote.id } })
    setDeletingNote(null)
  }

  // "일정 연동" -- 이 앱은 서버가 없는 정적 사이트라 구글 캘린더 쪽 변경을
  // 실시간으로(웹훅) 받을 수 없다. 대신 버튼을 누른 시점에 "{팀명} 면담"
  // 캘린더의 현재 상태를 통째로 읽어와 세 방향으로 맞춘다. 이 패널은 팀
  // 전체 일정을 다루므로(특정 팀원 화면이 아니다) 모든 팀원의 기록을
  // 대상으로 한다.
  //   1) 구글 캘린더에서 지워진 일정 -> 연결된 면담 기록도 함께 지운다
  //      (연결만 끊고 남겨두면 삭제가 앱에 반영되지 않은 것처럼 보인다).
  //   2) 구글 캘린더에서 날짜/설명을 고친 일정 -> 연결된 면담 기록의
  //      날짜/코멘트를 그 값으로 덮어써서 맞춘다.
  //   3) 이 앱이 모르는, "{팀원 이름} 면담" 형식의 일정 -> 그 팀원의 새
  //      면담 기록으로 가져온다.
  async function handleSyncCalendar() {
    if (!isCalendarConfigured() || syncing) return
    setSyncing(true)
    setSyncMessage(null)
    try {
      const events = await listTeamCalendarEvents(teamName)
      const eventById = new Map(events.map((e) => [e.id, e]))
      let unlinked = 0
      let updated = 0
      for (const note of meetingNotes) {
        if (!note.calendarEventId) continue
        const ev = eventById.get(note.calendarEventId)
        if (!ev) {
          // 구글 캘린더에서 지운 일정은 이 앱의 면담 기록도 함께 지운다 --
          // 연결만 끊고 기록을 남겨두면 "캘린더에서 지웠는데 앱엔 그대로
          // 남아있다"는 것과 같아서 삭제가 반영된 것처럼 보이지 않는다.
          dispatch({ type: 'DELETE_MEETING_NOTE', payload: { id: note.id } })
          unlinked++
          continue
        }
        // 설명이 비어 있으면(구글 쪽에서 지운 게 아니라 원래 없던 경우가
        // 대부분) 기존 코멘트를 그대로 둔다.
        const nextComment = ev.description?.trim() || note.comment
        if (ev.date !== note.date || nextComment !== note.comment) {
          dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, date: ev.date, comment: nextComment } })
          updated++
        }
      }

      const linkedEventIds = new Set(meetingNotes.map((n) => n.calendarEventId).filter((id): id is string => Boolean(id)))
      let imported = 0
      for (const ev of events) {
        if (linkedEventIds.has(ev.id)) continue
        const member = members.find((m) => ev.summary === `${m.name} 면담`)
        if (!member) continue
        const note: MeetingNote = {
          id: uuidv4(),
          memberId: member.id,
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
        unlinked > 0 && `${unlinked}건 삭제됨`,
      ].filter((v): v is string => Boolean(v))
      setSyncMessage(parts.length > 0 ? parts.join(' · ') : '변경된 내용이 없습니다.')
    } catch (err) {
      console.warn('캘린더 동기화 실패:', err)
      setSyncMessage(err instanceof Error ? err.message : '캘린더 동기화에 실패했습니다.')
    } finally {
      setSyncing(false)
    }
  }

  const syncButtonContent = (
    <>
      <SyncIcon className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? '동기화 중…' : '일정 연동'}
    </>
  )

  // 접힌 패널의 칩과 펼친 패널 안의 여러 목록(오늘 일정/이후 예정/선택 날짜)이
  // 모두 이 다이얼로그를 공유한다 -- 어느 쪽에서 삭제를 눌렀는지와 무관하게
  // deletingNote 하나로 확인 후 처리한다.
  const deleteDialog = (
    <ConfirmDialog
      open={deletingNote !== null}
      title="면담 일정 삭제"
      message={`${deletingNote?.date} ${members.find((m) => m.id === deletingNote?.memberId)?.name ?? ''} 면담 일정을 삭제하시겠습니까?`}
      onConfirm={confirmDeleteNote}
      onCancel={() => setDeletingNote(null)}
    />
  )

  if (!open) {
    return (
      <>
      <div className="flex w-fit shrink-0 flex-col items-stretch gap-2">
      {isCalendarConfigured() && (
        <div className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={handleSyncCalendar}
            disabled={syncing}
            title={`Google 캘린더의 "{팀원} 면담" 일정을 이 팀의 면담 기록과 맞춥니다.`}
            className="flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-gray-400 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncButtonContent}
          </button>
        </div>
      )}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <button
          onClick={onToggle}
          title="면담 일정 펼치기"
          className="mb-2 flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-black hover:text-accent"
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          면담
        </button>
        {collapsedEntries.length === 0 ? (
          <p className="whitespace-nowrap text-[12px] text-gray-400">예정 없음</p>
        ) : (
          <div className="space-y-2">
            {collapsedEntries.map(({ date, entries }) => (
              <div key={date}>
                <p className="whitespace-nowrap text-[11px] font-semibold text-gray-500">{date === todayStr ? '오늘' : fmtShort(date)}</p>
                {/* 한 날짜에 여러 명이면 옆으로 나열하지 않고 아래로 쌓아서
                    패널 너비가 늘어나지 않게 한다. */}
                <div className="mt-1 flex flex-col items-start gap-1">
                  {entries.map(({ idx, note }) => {
                    const member = members[idx]
                    if (!member) return null
                    return (
                      <span
                        key={idx}
                        className="flex max-w-[150px] items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-1.5 pr-0.5 text-[11px] text-gray-600 hover:bg-gray-200"
                      >
                        <button onClick={() => onSelectMember(member.id)} className="flex min-w-0 items-center gap-1">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                          <span className="truncate">{member.name}</span>
                        </button>
                        <button
                          onClick={() => requestDeleteNote(note)}
                          title="면담 일정 삭제"
                          aria-label="면담 일정 삭제"
                          className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-white hover:text-danger"
                        >
                          <CloseIcon className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
        {deleteDialog}
      </>
    )
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const cells: { date: string; day: number; inMonth: boolean }[] = []
  for (let i = 0; i < startWeekday; i++) {
    const day = daysInPrev - startWeekday + 1 + i
    const y = month === 0 ? year - 1 : year
    const m = month === 0 ? 11 : month - 1
    cells.push({ date: fmtDate(y, m, day), day, inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: fmtDate(year, month, day), day, inMonth: true })
  let nd = 1
  while (cells.length < 42) {
    const y = month === 11 ? year + 1 : year
    const m = month === 11 ? 0 : month + 1
    cells.push({ date: fmtDate(y, m, nd), day: nd, inMonth: false })
    nd += 1
  }

  const dayNotes = members
    .map((member, idx) => ({ member, idx, note: meetingNotes.find((n) => n.memberId === member.id && n.date === selectedDate) }))
    .filter((x): x is { member: (typeof members)[number]; idx: number; note: MeetingNote } => !!x.note)
  const todayMembers = todayEntries.map(({ idx, note }) => ({ member: members[idx], idx, note })).filter((x): x is { member: (typeof members)[number]; idx: number; note: MeetingNote } => !!x.member)

  function addSchedule() {
    const memberId = addMemberId ?? members[0]?.id
    if (!memberId) return
    const member = members.find((m) => m.id === memberId)
    const note: MeetingNote = { id: uuidv4(), memberId, date: selectedDate, comment: '' }
    dispatch({ type: 'ADD_MEETING_NOTE', payload: note })
    setCalendarError(null)
    // 오늘/이후 일정만 캘린더에 올린다 -- 지난 날짜로 기록을 남기는 경우까지
    // 캘린더에 박히면 알림 목적에 안 맞는다.
    if (member && selectedDate >= todayStr && isCalendarConfigured()) {
      createCalendarEvent({ memberName: member.name, date: selectedDate, teamName })
        .then((eventId) => dispatch({ type: 'UPDATE_MEETING_NOTE', payload: { ...note, calendarEventId: eventId } }))
        .catch((err) => {
          console.warn('캘린더 일정 등록 실패:', err)
          setCalendarError(err instanceof Error ? err.message : '캘린더 일정 등록에 실패했습니다.')
        })
    }
  }

  return (
    <>
    <div className="w-[300px] shrink-0 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="shrink-0 text-base font-bold text-black">면담 일정</h3>
          {isCalendarConfigured() && (
            <button
              type="button"
              onClick={handleSyncCalendar}
              disabled={syncing}
              title={`Google 캘린더의 "{팀원} 면담" 일정을 이 팀의 면담 기록과 맞춥니다.`}
              className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-gray-400 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncButtonContent}
            </button>
          )}
        </div>
        <button onClick={onToggle} title="접기" className="shrink-0 rounded-md px-1.5 text-gray-400 hover:bg-gray-100">
          »
        </button>
      </div>
      {syncMessage && <p className="mt-1 text-[11px] text-gray-400">{syncMessage}</p>}

      <div className="mt-3 flex items-center justify-between">
        <IconButton onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="이전 달" className="h-7 w-7">
          <Chevron dir="left" className="h-4 w-4" />
        </IconButton>
        <span className="text-sm font-semibold text-black">
          {year}년 {month + 1}월
        </span>
        <IconButton onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="다음 달" className="h-7 w-7">
          <Chevron dir="right" className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dotIdxs = (notesByDate.get(cell.date) ?? []).map((e) => e.idx)
          const isToday = cell.date === todayStr
          const isSelected = cell.date === selectedDate
          return (
            <button
              key={cell.date}
              onClick={() => setSelectedDate(cell.date)}
              className={`flex h-8 flex-col items-center justify-center gap-0.5 rounded-md text-[12px] transition-colors ${
                !cell.inMonth ? 'text-gray-300 hover:bg-gray-50' : isSelected ? 'bg-accent font-semibold text-white' : isToday ? 'bg-blue-50 font-semibold text-accent' : 'text-black hover:bg-gray-100'
              }`}
            >
              {cell.day}
              {dotIdxs.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {dotIdxs.slice(0, 3).map((idx) => (
                    <span key={idx} className="h-1 w-1 rounded-full" style={{ background: isSelected ? '#fff' : colorForIndex(idx) }} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1">
        {members.map((m, idx) => (
          <span key={m.id} className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
            {m.name}
          </span>
        ))}
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3">
        <p className="text-[13px] font-semibold text-black">{fmtShort(selectedDate)} 면담</p>
        <div className="mt-1.5 space-y-1">
          {dayNotes.length === 0 ? (
            <p className="text-[13px] text-gray-400">이 날짜에 등록된 면담이 없습니다.</p>
          ) : (
            dayNotes.map(({ member, idx, note }) => (
              <div key={note.id} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 hover:bg-gray-100">
                <button onClick={() => onSelectMember(member.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                  <span className="shrink-0 font-medium text-black">{member.name}</span>
                  <span className="truncate text-gray-500">{note.comment || '(코멘트 없음)'}</span>
                </button>
                <IconButton onClick={() => requestDeleteNote(note)} title="삭제" aria-label="삭제" tone="danger">
                  <TrashIcon className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))
          )}
          <div className="mt-1 flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
            <select value={addMemberId ?? ''} onChange={(e) => setAddMemberId(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-[12px] text-black">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={addSchedule} className="shrink-0 px-2.5 py-1 text-[12px]">
              추가
            </Button>
          </div>
          {calendarError && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-danger">⚠️ 캘린더 등록 실패: {calendarError}</p>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3">
        <p className="text-[13px] font-semibold text-black">오늘 일정</p>
        {todayMembers.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {todayMembers.map(({ member, idx, note }) => (
              <span key={member.id} className="flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2 pr-0.5 text-[12px] font-semibold text-accent">
                <button onClick={() => onSelectMember(member.id)} className="flex items-center gap-1 hover:underline">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                  {member.name}
                </button>
                <button
                  onClick={() => requestDeleteNote(note)}
                  title="면담 일정 삭제"
                  aria-label="면담 일정 삭제"
                  className="rounded-full p-0.5 text-accent/60 hover:bg-white hover:text-danger"
                >
                  <CloseIcon className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[13px] text-gray-400">등록된 일정이 없습니다.</p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <p className="text-[13px] font-semibold text-black">이후 예정 ({upcoming.length}건)</p>
          <div className="mt-1.5 space-y-1.5">
            {upcoming.map(({ date, entries }) => (
              <div key={date} className="flex items-center gap-2 text-[12px]">
                <span className="shrink-0 font-medium text-gray-500">{fmtShort(date)}</span>
                <div className="flex flex-wrap gap-1">
                  {entries.map(({ idx, note }) => {
                    const member = members[idx]
                    if (!member) return null
                    return (
                      <span key={idx} className="flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-1.5 pr-0.5 text-gray-600">
                        <button onClick={() => onSelectMember(member.id)} className="flex items-center gap-1 hover:underline">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForIndex(idx) }} />
                          {member.name}
                        </button>
                        <button
                          onClick={() => requestDeleteNote(note)}
                          title="면담 일정 삭제"
                          aria-label="면담 일정 삭제"
                          className="rounded-full p-0.5 text-gray-400 hover:bg-white hover:text-danger"
                        >
                          <CloseIcon className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
      {deleteDialog}
    </>
  )
}

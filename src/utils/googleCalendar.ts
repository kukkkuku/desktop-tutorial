// 팀원 면담 일정을 등록하면 같은 Google 계정의 캘린더에도 하루짜리(종일)
// 일정으로 함께 등록한다. Drive 연동과 같은 로그인(OAuth) 토큰을 그대로
// 쓴다 -- calendar.events 스코프가 이미 googleDrive.ts의 DRIVE_SCOPE에
// 포함돼 있어서, 앱 진입 시 한 번의 Google 로그인으로 둘 다 해결된다.
import { getAccessToken, isGoogleDriveConfigured } from './googleDrive'

export function isCalendarConfigured(): boolean {
  return isGoogleDriveConfigured()
}

async function calendarFetch(url: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google 캘린더 요청에 실패했습니다 (${res.status}). ${text}`)
  }
  return res
}

// 캘린더 종일 일정은 end.date가 배타적(포함 안 됨)이라, 하루짜리 일정도
// 다음 날로 끝나야 한다.
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export interface CalendarEventInput {
  memberName: string
  date: string
  comment?: string
}

function buildEventBody(input: CalendarEventInput) {
  return {
    summary: `${input.memberName} 면담`,
    description: input.comment?.trim() || undefined,
    start: { date: input.date },
    end: { date: nextDay(input.date) },
  }
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<string> {
  const res = await calendarFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(buildEventBody(input)),
  })
  const data = (await res.json()) as { id: string }
  return data.id
}

export async function updateCalendarEvent(eventId: string, input: CalendarEventInput): Promise<void> {
  await calendarFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(buildEventBody(input)),
  })
}

// 캘린더 쪽에서 이미 지워졌거나(410) 권한이 바뀐 경우에도, 이 앱 안의
// 면담 기록 삭제/수정 자체는 막지 않는다 -- 그래서 실패해도 조용히
// 넘어간다(호출부에서 흐름을 끊지 않도록 여기서 이미 삼킨다).
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  try {
    await calendarFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('캘린더 일정 삭제 실패:', err)
  }
}

// 팀원 면담 일정을 등록하면 같은 Google 계정의 캘린더에도 하루짜리(종일)
// 일정으로 함께 등록한다. Drive 연동과 같은 로그인(OAuth) 토큰을 그대로
// 쓴다 -- calendar 스코프가 이미 googleDrive.ts의 DRIVE_SCOPE에 포함돼
// 있어서, 앱 진입 시 한 번의 Google 로그인으로 둘 다 해결된다.
//
// 모든 이벤트는 사용자의 기본 캘린더가 아니라 "{팀명} 면담"이라는 이름의
// 전용 캘린더에 등록한다(ensureTeamCalendarId) -- 그래야 사용자가 구글
// 캘린더 앱에서 그 캘린더만 따로 보이거나 숨길 수 있고, 이 앱이 다른
// 개인 일정 사이에 섞여 들어가지 않는다.
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

// ---------- 팀 전용 캘린더 ----------
// "{팀명} 면담" 캘린더를 한 번만 만들고 재사용한다. 브라우저를 새로 열어도
// 다시 만들지 않도록 localStorage에 calendarId를 캐시해둔다 -- 다만 그
// 캘린더가 구글 쪽에서 지워졌을 수도 있으니, 캐시된 id로 호출했다가 404가
// 나면 캐시를 지우고 한 번 더 찾아본다(ensureTeamCalendarId의 retry 인자).

function calendarName(teamName: string): string {
  return `${teamName.trim() || '팀'} 면담`
}

function calendarIdCacheKey(teamName: string): string {
  return `gcal-calendar-id-${calendarName(teamName)}`
}

async function findTeamCalendarId(accessToken: string, name: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { items?: { id: string; summary?: string }[] }
  return data.items?.find((c) => c.summary === name)?.id ?? null
}

async function createTeamCalendar(accessToken: string, name: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: name }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google 캘린더 생성에 실패했습니다 (${res.status}). ${text}`)
  }
  const data = (await res.json()) as { id: string }
  return data.id
}

export async function ensureTeamCalendarId(teamName: string, forceRefresh = false): Promise<string> {
  const name = calendarName(teamName)
  const cacheKey = calendarIdCacheKey(teamName)
  if (!forceRefresh) {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return cached
  }
  const accessToken = await getAccessToken()
  const found = await findTeamCalendarId(accessToken, name)
  const id = found ?? (await createTeamCalendar(accessToken, name))
  localStorage.setItem(cacheKey, id)
  return id
}

// ---------- 이벤트 생성/수정/삭제 ----------

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
  teamName: string
}

function buildEventBody(input: CalendarEventInput) {
  return {
    summary: `${input.memberName} 면담`,
    description: input.comment?.trim() || undefined,
    start: { date: input.date },
    end: { date: nextDay(input.date) },
  }
}

// 캐시된 calendarId가 가리키는 캘린더가 구글 쪽에서 지워진 경우(404) 한
// 번만 다시 찾아서/새로 만들어서 재시도한다.
async function withTeamCalendar<T>(teamName: string, fn: (calendarId: string) => Promise<T>): Promise<T> {
  const calendarId = await ensureTeamCalendarId(teamName)
  try {
    return await fn(calendarId)
  } catch (err) {
    if (err instanceof Error && err.message.includes('(404)')) {
      const refreshedId = await ensureTeamCalendarId(teamName, true)
      return fn(refreshedId)
    }
    throw err
  }
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<string> {
  return withTeamCalendar(input.teamName, async (calendarId) => {
    const res = await calendarFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(buildEventBody(input)),
    })
    const data = (await res.json()) as { id: string }
    return data.id
  })
}

export async function updateCalendarEvent(eventId: string, input: CalendarEventInput): Promise<void> {
  await withTeamCalendar(input.teamName, async (calendarId) => {
    await calendarFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(buildEventBody(input)),
    })
  })
}

// 캘린더 쪽에서 이미 지워졌거나(410) 권한이 바뀐 경우에도, 이 앱 안의
// 면담 기록 삭제/수정 자체는 막지 않는다 -- 그래서 실패해도 조용히
// 넘어간다(호출부에서 흐름을 끊지 않도록 여기서 이미 삼킨다).
export async function deleteCalendarEvent(eventId: string, teamName: string): Promise<void> {
  try {
    await withTeamCalendar(teamName, async (calendarId) => {
      await calendarFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { method: 'DELETE' })
    })
  } catch (err) {
    console.warn('캘린더 일정 삭제 실패:', err)
  }
}

// ---------- 캘린더 -> 앱 동기화 ----------
// 실시간 웹훅은 이 앱이 서버 없는 정적 사이트라 받을 수 없다(구글 푸시
// 알림은 공인 HTTPS 엔드포인트가 필요하다) -- 대신 "일정 연동" 버튼을 누르면
// 그 순간의 팀 캘린더 상태를 통째로 읽어와 앱의 면담 기록과 맞춰본다.

export interface RemoteCalendarEvent {
  id: string
  summary: string
  date: string
  description?: string
}

export async function listTeamCalendarEvents(teamName: string): Promise<RemoteCalendarEvent[]> {
  return withTeamCalendar(teamName, async (calendarId) => {
    const res = await calendarFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&maxResults=2500&showDeleted=false`,
    )
    const data = (await res.json()) as {
      items?: { id: string; summary?: string; description?: string; start?: { date?: string; dateTime?: string } }[]
    }
    return (data.items ?? [])
      .map((ev) => ({
        id: ev.id,
        summary: ev.summary ?? '',
        date: (ev.start?.date ?? ev.start?.dateTime?.slice(0, 10)) ?? '',
        description: ev.description,
      }))
      .filter((ev) => ev.date)
  })
}

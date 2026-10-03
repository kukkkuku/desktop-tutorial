// 시트 자동 공유: 관리 › 팀원에서 추가 · 역할 변경 · 빼기를 하면 그 사람 Gmail에 시트 공유를 맞춘다.
// 서버가 없어서 앱은 로그인한 사람 계정으로 시트를 읽는다 -- 그래서 시트가 그 사람에게 공유돼 있어야 한다.
//   팀원: 과제 시트(편집자)만 -- 권한 시트(명단)는 볼 필요 없음, 못 읽으면 앱이 팀원으로 본다
//   팀장 · 관리자: 과제 시트(편집자) + 권한 시트(편집자 -- 팀원을 추가하면 권한 시트에 적으므로)
// 공유는 하는 사람(팀장 · 관리자) 계정으로 한다. 알림 메일은 보내지 않는다(초대 메일이 따로 감).
import type { AccessRole } from './accessSheet'

const API = 'https://www.googleapis.com/drive/v3/files'
type Perm = { id: string; emailAddress?: string; role: string; type: string }
type ShareRole = 'reader' | 'writer'
const RANK: Record<string, number> = { reader: 1, commenter: 2, writer: 3, fileOrganizer: 4, organizer: 5, owner: 6 }

export const sheetIdOfUrl = (url: string | null | undefined) => url?.match(/\/d\/([a-zA-Z0-9_-]{20,})/)?.[1] ?? null

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  if (!res.ok) {
    let msg = `${res.status}`
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg
    } catch {
      // 본문 없음
    }
    throw new Error(/insufficient|permission/i.test(msg) ? '이 시트를 공유할 권한이 없습니다(시트 편집자여야 함)' : msg)
  }
  return res.status === 204 ? null : res.json()
}

async function perms(token: string, fileId: string): Promise<Perm[]> {
  const out = (await call(token, `${API}/${fileId}/permissions?fields=permissions(id,emailAddress,role,type)&supportsAllDrives=true`)) as { permissions?: Perm[] }
  return out.permissions ?? []
}

// 이미 같은 이상 권한이면 그대로, 아니면 공유(낮은 권한으로 내리지 않는다)
async function ensure(token: string, fileId: string, list: Perm[], email: string, role: ShareRole) {
  const cur = list.find((p) => p.type === 'user' && p.emailAddress?.toLowerCase() === email)
  if (cur && (RANK[cur.role] ?? 0) >= RANK[role]) return false
  if (cur) await call(token, `${API}/${fileId}/permissions/${cur.id}?supportsAllDrives=true`, { method: 'PATCH', body: JSON.stringify({ role }) })
  else
    await call(token, `${API}/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
      method: 'POST',
      body: JSON.stringify({ type: 'user', role, emailAddress: email }),
    })
  return true
}
// 공유 해제(소유자는 건드리지 않는다)
async function revoke(token: string, fileId: string, list: Perm[], email: string) {
  const cur = list.find((p) => p.type === 'user' && p.emailAddress?.toLowerCase() === email)
  if (!cur || cur.role === 'owner') return false
  await call(token, `${API}/${fileId}/permissions/${cur.id}?supportsAllDrives=true`, { method: 'DELETE' })
  return true
}

export type ShareTarget = { email: string; role: AccessRole | null } // role null = 목록에서 뺌(둘 다 해제)
export type ShareResult = { changed: number; failed: { email: string; error: string }[] }

// 사람마다 역할에 맞게 두 시트 공유를 맞춘다
export async function syncShares(token: string, sheets: { access: string | null; task: string | null }, targets: ShareTarget[]): Promise<ShareResult> {
  const result: ShareResult = { changed: 0, failed: [] }
  const cache = new Map<string, Perm[]>()
  const list = async (id: string) => {
    if (!cache.has(id)) cache.set(id, await perms(token, id))
    return cache.get(id)!
  }
  for (const t of targets) {
    const email = t.email.toLowerCase()
    try {
      const manager = t.role === 'leader' || t.role === 'admin'
      if (sheets.task) {
        const l = await list(sheets.task)
        if (t.role ? await ensure(token, sheets.task, l, email, 'writer') : await revoke(token, sheets.task, l, email)) result.changed++
      }
      if (sheets.access) {
        const l = await list(sheets.access)
        if (manager ? await ensure(token, sheets.access, l, email, 'writer') : await revoke(token, sheets.access, l, email)) result.changed++
      }
    } catch (e) {
      result.failed.push({ email, error: e instanceof Error ? e.message : '공유하지 못했습니다' })
    }
  }
  return result
}

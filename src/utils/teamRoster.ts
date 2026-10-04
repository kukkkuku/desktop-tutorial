// 팀원 명단(권한 시트 「사용자」 탭)과 평가의 팀원 표를 뒤에서 맞춘다 -- 팀장은 성과관리 › 팀원관리 표 하나만 쓴다.
//   평가 표 → 명단: 이름 · Gmail이 있는 팀원을 명단에 넣거나(Gmail 없으면 이름만 자리표시 계정) Gmail을 이어 준다. 지우지는 않는다.
//   명단 → 평가 표: 우리 팀 명단에 있는데 이 평가에 없는 사람을 넣는다(이 평가에서 뺀 사람은 다시 넣지 않음).
// 같은 사람인지: Gmail이 양쪽에 있으면 Gmail, 아니면 이름.
import type { TeamMember } from '../types'
import { isPendingEmail, newPendingEmail, type AccessData, type AccessUser } from './accessSheet'

const norm = (s: string | undefined | null) => (s ?? '').trim()
const mail = (s: string | undefined | null) => norm(s).toLowerCase()
// 표에서 새로 만든 빈 줄(「새 팀원」)은 아직 사람이 아니다
const isPlaceholderName = (n: string) => /^새 팀원( \d+)?$/.test(n)

// 아이디만 적으면 @gmail.com을 붙인다(초대 메일과 같은 규칙)
export function normalizeGmail(v: string): string {
  const t = v.trim().toLowerCase()
  if (!t) return ''
  return t.includes('@') ? t : `${t}@gmail.com`
}

// 우리 팀 명단: 팀 칸이 우리 팀 · 내 팀이거나, 팀이 비었으면 내가 추가한 팀원
export function teamRosterOf(access: AccessData, teamName: string, me: string): AccessUser[] {
  const myTeam = access.users.find((u) => u.email === me)?.team ?? ''
  const t = norm(teamName)
  return access.users.filter((u) => u.role === 'member' && (u.team ? u.team === t || (!!myTeam && u.team === myTeam) : u.addedBy === me))
}

// 이 평가 팀원에 해당하는 명단 줄
export function rosterUserOf(access: AccessData | null, m: TeamMember, teamName: string, me: string): AccessUser | undefined {
  if (!access) return undefined
  const e = mail(m.email)
  if (e) return access.users.find((u) => u.email === e)
  return teamRosterOf(access, teamName, me).find((u) => norm(u.name) === norm(m.name))
}

// 평가 표 → 명단에 반영할 변경. 바뀐 게 없으면 null
export function rosterChanges(
  access: AccessData,
  members: TeamMember[],
  teamName: string,
  me: string,
): { apply: (users: AccessUser[]) => AccessUser[]; log: string[] } | null {
  const team = norm(teamName)
  const plan: { kind: 'add' | 'link' | 'name'; name: string; email: string; prev?: string }[] = []
  const roster = teamRosterOf(access, team, me)
  members.forEach((m) => {
    const name = norm(m.name)
    if (!name || isPlaceholderName(name)) return
    const e = mail(m.email)
    if (e && e.includes('@')) {
      const hit = access.users.find((u) => u.email === e)
      if (hit) {
        if (!norm(hit.name)) plan.push({ kind: 'name', name, email: e })
        return
      }
      // 이름만 있던 자리표시 줄에 Gmail을 잇는다
      const pend = roster.find((u) => isPendingEmail(u.email) && norm(u.name) === name)
      plan.push(pend ? { kind: 'link', name, email: e, prev: pend.email } : { kind: 'add', name, email: e })
    } else if (!roster.some((u) => norm(u.name) === name) && !access.users.some((u) => norm(u.name) === name && u.role !== 'member')) {
      plan.push({ kind: 'add', name, email: '' })
    }
  })
  if (!plan.length) return null
  return {
    apply: (users) => {
      let next = users.map((u) => ({ ...u }))
      plan.forEach((p, i) => {
        if (p.kind === 'name') next = next.map((u) => (u.email === p.email && !norm(u.name) ? { ...u, name: p.name } : u))
        else if (p.kind === 'link') next = next.map((u) => (u.email === p.prev ? { ...u, email: p.email } : u))
        else if (!next.some((u) => (p.email ? u.email === p.email : u.role === 'member' && norm(u.name) === p.name && (u.team === team || u.addedBy === me))))
          next.push({ email: p.email || newPendingEmail(i), name: p.name, role: 'member', team, memo: '', addedBy: me, sendTo: '' })
      })
      return next
    },
    log: [`팀원관리(${team || '팀'})에서: ${plan.map((p) => (p.kind === 'add' ? `추가 ${p.name}` : p.kind === 'link' ? `Gmail ${p.name} → ${p.email}` : `이름 ${p.email} → ${p.name}`)).join(', ')}`],
  }
}

// 명단 → 평가 표: 이 평가에 없는 우리 팀 명단 사람(skip: 이 평가에서 뺀 사람의 Gmail · 이름)
export function rosterMissing(access: AccessData, members: TeamMember[], teamName: string, me: string, skip: Set<string>): AccessUser[] {
  const emails = new Set(members.map((m) => mail(m.email)).filter(Boolean))
  const names = new Set(members.map((m) => norm(m.name)))
  return teamRosterOf(access, teamName, me).filter((u) => {
    const real = !isPendingEmail(u.email)
    if (skip.has(u.email) || skip.has(norm(u.name))) return false
    if (real && emails.has(u.email)) return false
    // 이름이 같은 팀원이 있으면 같은 사람(Gmail은 위 rosterChanges가 잇는다)
    return !names.has(norm(u.name))
  })
}

// 이 평가에서 뺀 사람(다시 자동으로 넣지 않게) -- 이 브라우저에 평가마다
const skipKey = (wsId: string) => `team-roster-skip:${wsId}`
export function readRosterSkip(wsId: string | null | undefined): Set<string> {
  if (!wsId) return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(skipKey(wsId)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
export function addRosterSkip(wsId: string | null | undefined, keys: string[]) {
  if (!wsId || !keys.length) return
  try {
    const cur = readRosterSkip(wsId)
    keys.forEach((k) => k && cur.add(k))
    localStorage.setItem(skipKey(wsId), JSON.stringify([...cur]))
  } catch {
    // 못 남기면 다음에 다시 들어올 수 있다
  }
}

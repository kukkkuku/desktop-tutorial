// 팀원의 「팀」은 두 군데에 있다: 권한 시트(관리 › 권한 설정, 모두가 보는 값)와 이 평가에 저장된 값(member.team).
// 화면은 늘 이 파일의 effectiveTeam 하나로 읽는다 -- 권한 시트에 있는 사람이면 그 팀, 아니면 평가에 저장된 값.
import type { AccessUser } from './accessSheet'
import type { TeamMember } from '../types'

// 권한 시트에서 이 팀원 찾기: 이메일이 있으면 이메일로, 없으면 이름이 하나뿐일 때만
export function accessUserOf(m: TeamMember, users: AccessUser[] | undefined): AccessUser | undefined {
  if (!users) return undefined
  if (m.email) return users.find((u) => u.email === m.email!.toLowerCase())
  const hit = users.filter((u) => u.name.trim() === m.name.trim())
  return hit.length === 1 ? hit[0] : undefined
}

export function effectiveTeam(m: TeamMember, users: AccessUser[] | undefined): string {
  return (accessUserOf(m, users)?.team || m.team || '').trim()
}

// 「One Platform」 = 「One Platform팀」(끝의 「팀」 · 띄어쓰기는 무시)
const norm = (t: string) => t.replace(/\s+/g, '').replace(/팀$/, '')
export function sameTeam(a: string, b: string): boolean {
  return norm(a) === norm(b)
}

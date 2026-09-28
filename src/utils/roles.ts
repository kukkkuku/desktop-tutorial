// 역할(로그인한 구글 계정 기준). 서버 없는 앱이라 화면에서 나누는 수준이다(진짜 권한은 구글시트 공유 설정).
// 권한 관리 시트(utils/accessSheet)의 「사용자」 탭이 있으면 그 역할을 쓰고, 아래 목록은 처음 관리자(시트를 만들 사람) · 시트가 없을 때의 기본값.
//   관리자: 팀장이 하는 것 + 권한 표(사람 · 역할) 고치기 (ADMIN_EMAILS)
//   팀장: 성과관리(팀 · 평가 · 피어리뷰) + 시트 연결 바꾸기 · 팀원 초대 메일 (LEADER_EMAILS)
//   팀원: 과제 입력만 -- 추진현황 입력 · 진척률 보기 (피어리뷰는 팀장이 엑셀로 나눠 주고 받는다)
// 구글 로그인 없이 쓰는 경우("연동 없이 시작")는 혼자 쓰는 것이라 막지 않는다.
import { accessRoleOf } from './accessSheet'

// 앱에 정해 둔 첫 관리자(권한 시트와 상관없이 늘 관리자)
export const ADMIN_EMAILS = ['jjy.osstem@gmail.com']

export const LEADER_EMAILS = ['jjy.osstem@gmail.com']

export type Role = 'admin' | 'leader' | 'member' | 'guest'

const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.some((a) => norm(a) === norm(email)) || accessRoleOf(email) === 'admin'
}
export function isLeaderEmail(email: string | null | undefined): boolean {
  if (isAdminEmail(email)) return true
  const r = accessRoleOf(email)
  return r ? r === 'leader' : LEADER_EMAILS.some((a) => norm(a) === norm(email))
}
export function roleOf(email: string | null | undefined): Role {
  if (!norm(email)) return 'guest'
  if (isAdminEmail(email)) return 'admin'
  if (isLeaderEmail(email)) return 'leader'
  return 'member'
}
// 시트 연결 바꾸기 · 팀원 초대 · 관리 메뉴(팀장 이상)
export function canManageEmail(email: string | null | undefined): boolean {
  return isLeaderEmail(email)
}
// 성과관리(팀장 영역)를 쓸 수 있나
export function canUsePerf(email: string | null | undefined): boolean {
  return roleOf(email) !== 'member'
}
export const ROLE_LABEL: Record<Role, string> = { admin: '관리자 · 팀장', leader: '팀장', member: '팀원', guest: '로그인 없음' }

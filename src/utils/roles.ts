// 역할(로그인한 구글 계정 기준). 서버 없는 앱이라 화면에서 나누는 수준이다(진짜 권한은 구글시트 공유 설정).
//   관리자: 시트 연결 · 탭 만들기 · 팀원 초대 (ADMIN_EMAILS)
//   팀장: 성과관리(팀 · 평가 · 피어리뷰 요청) (LEADER_EMAILS)
//   팀원: 과제 입력만 -- 추진현황 입력 · 진척률 보기 · 피어리뷰 제출
// 구글 로그인 없이 쓰는 경우("연동 없이 시작")는 혼자 쓰는 것이라 막지 않는다.
import { ADMIN_EMAILS } from './adminInvite'

export const LEADER_EMAILS = ['jjy.osstem@gmail.com']

export type Role = 'admin' | 'leader' | 'member' | 'guest'

const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.some((a) => norm(a) === norm(email))
}
export function isLeaderEmail(email: string | null | undefined): boolean {
  return isAdminEmail(email) || LEADER_EMAILS.some((a) => norm(a) === norm(email))
}
export function roleOf(email: string | null | undefined): Role {
  if (!norm(email)) return 'guest'
  if (isAdminEmail(email)) return 'admin'
  if (isLeaderEmail(email)) return 'leader'
  return 'member'
}
// 성과관리(팀장 영역)를 쓸 수 있나
export function canUsePerf(email: string | null | undefined): boolean {
  return roleOf(email) !== 'member'
}
export const ROLE_LABEL: Record<Role, string> = { admin: '관리자 · 팀장', leader: '팀장', member: '팀원', guest: '로그인 없음' }

// 테스트용: 팀원 정보에 이메일이 없어도 이 이름은 이 계정으로 본다(피어리뷰 명단의 '나' 찾기).
// 실제 운영에서는 성과관리 팀원 표의 "이메일"을 채우고 이 목록은 비운다.
export const TEST_MEMBER_EMAILS: Record<string, string> = { 고범수: 'jjy100426@gmail.com' }
export function memberEmail(m: { name: string; email?: string }): string | undefined {
  return m.email?.trim() || TEST_MEMBER_EMAILS[m.name.trim()] || undefined
}

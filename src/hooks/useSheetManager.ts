import { useGoogleAccount } from './useGoogleAccount'

// 구글시트 연결(링크 바꾸기 · xlsx 올리기 · 시트에서 새로 가져오기)은 관리자만 한다.
// 팀원은 연결된 시트를 새로고침만 한다. 팀장 권한은 권한 관리(권한 시트)를 만들 때 더한다.
// 구글 로그인 없이 쓰는 경우(연동 없는 빌드 · "연동 없이 시작")는 시트를 읽을 수 없으니 xlsx로 보도록 막지 않는다.
export function useCanManageSheets(): boolean {
  const { accountEmail, isAdminUser } = useGoogleAccount()
  return isAdminUser || !accountEmail
}

export const SHEET_ADMIN_ONLY = '시트 연결은 관리자만 바꿀 수 있습니다. 연결된 시트를 새로고침해 최신 내용을 불러오세요.'

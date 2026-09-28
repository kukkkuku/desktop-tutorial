import { useGoogleAccount } from './useGoogleAccount'

// 구글시트 연결(링크 바꾸기 · xlsx 올리기 · 시트에서 새로 가져오기)은 팀장 · 관리자가 한다.
// 팀원은 연결된 시트를 새로고침만 한다.
// 구글 로그인 없이 쓰는 경우(연동 없는 빌드 · "연동 없이 시작")는 시트를 읽을 수 없으니 xlsx로 보도록 막지 않는다.
export function useCanManageSheets(): boolean {
  const { accountEmail, canManage } = useGoogleAccount()
  return canManage || !accountEmail
}

export const SHEET_ADMIN_ONLY = '시트 연결은 팀장 · 관리자만 바꿀 수 있습니다. 연결된 시트를 새로고침해 최신 내용을 불러오세요.'

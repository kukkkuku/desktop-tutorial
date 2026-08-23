import { useState } from 'react'
import { GATE_KEY } from '../components/GoogleSignInGate'
import { ADMIN_EMAILS } from '../utils/adminInvite'
import { disconnectDrive, getConnectedEmail } from '../utils/googleDrive'

// 헤더의 계정 정보(이메일/관리자 여부)와 로그아웃 -- 워크스페이스 화면
// (StageTabs)과 랜딩 화면(WorkspaceLanding) 양쪽에서 똑같이 필요해서
// 공용 훅으로 뺐다.
export function useGoogleAccount() {
  const [accountEmail, setAccountEmail] = useState<string | null>(() => getConnectedEmail())
  const refreshAccount = () => setAccountEmail(getConnectedEmail())
  const isAdminUser = ADMIN_EMAILS.includes(accountEmail ?? '')

  function handleLogout() {
    disconnectDrive()
    try {
      sessionStorage.removeItem(GATE_KEY)
    } catch {
      // 세션 저장소를 못 지워도 아래 새로고침이 로그인 화면으로 되돌린다.
    }
    window.location.reload()
  }

  return { accountEmail, isAdminUser, refreshAccount, handleLogout }
}

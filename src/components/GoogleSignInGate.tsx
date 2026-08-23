import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkspaces } from '../state/WorkspaceContext'
import { connectDrive, isGoogleDriveConfigured } from '../utils/googleDrive'
import Button from './Button'
import Spinner from './Spinner'

// 같은 탭에서 새로고침해도 다시 로그인 화면부터 보이지 않도록, 통과 여부를
// 탭 단위로만 기억한다(브라우저를 새로 열면 다시 로그인 화면이 뜬다).
// 헤더의 "로그아웃"도 이 키를 지우고 새로고침해 이 화면으로 되돌아간다.
export const GATE_KEY = 'google-gate-passed'

interface GoogleSignInGateProps {
  children: ReactNode
}

// 앱을 열자마자 뜨는 입장 화면. Google 계정 연결이 설정돼 있지 않으면(빌드에
// GOOGLE_CLIENT_ID가 없으면) 이 화면 자체를 건너뛰고 바로 기존 화면으로
// 넘어간다 -- 설정이 안 됐다고 앱을 통째로 못 쓰게 막지는 않는다.
export default function GoogleSignInGate({ children }: GoogleSignInGateProps) {
  const configured = isGoogleDriveConfigured()
  const [passed, setPassed] = useState(() => !configured || sessionStorage.getItem(GATE_KEY) === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { exitToLanding, reloadForAccount } = useWorkspaces()

  // 로그인 게이트를 쓰는 동안은 "로그인 → 성장관리 프로젝트 선택/생성 →
  // 입장" 순서를 항상 지킨다. 이전에 열어뒀던 워크스페이스가 남아 있어도
  // 곧장 그 안으로 들어가지 않고, 매번 이 화면(선택 목록)부터 보여준다.
  const forcedLandingRef = useRef(false)
  useEffect(() => {
    if (!configured || forcedLandingRef.current) return
    forcedLandingRef.current = true
    exitToLanding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured])

  if (passed) return <>{children}</>

  async function handleStart() {
    setError(null)
    setBusy(true)
    try {
      await connectDrive()
      // 로그인이 막 확인된 이 계정 기준으로 워크스페이스 데이터를 다시
      // 읽어들인다 -- WorkspaceProvider가 이 게이트보다 먼저 마운트돼서
      // 최초 로드 시점에는 아직 계정을 몰랐을 수 있다(첫 로그인인 경우).
      reloadForAccount()
      try {
        sessionStorage.setItem(GATE_KEY, '1')
      } catch {
        // 세션 저장 실패해도 로그인 자체는 성공했으니 그냥 통과시킨다.
      }
      setPassed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white px-10 py-12 text-center shadow-sm">
        <h1 className="text-3xl font-extrabold text-black">성과·성장관리</h1>
        <p className="mt-3 text-sm text-gray-500">팀과 평가기간별 데이터를 개인 Google Drive에서 안전하게 관리합니다.</p>
        <Button
          variant="primary"
          onClick={handleStart}
          disabled={busy}
          className="mt-8 flex w-full items-center justify-center gap-2 px-6 py-3 text-base"
        >
          {busy && <Spinner className="h-4 w-4 text-white" />}
          {busy ? '연결하는 중...' : 'Google 계정으로 시작'}
        </Button>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}

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

// 앱을 열자마자 뜨는 입장 화면. 빌드에 GOOGLE_CLIENT_ID가 없으면 예전에는
// 이 화면 자체를 건너뛰고 앱 안으로 그냥 들여보냈는데, 그러면 화면에는
// "로그인 화면이 안 뜬다 / 우측 상단 계정 정보가 사라졌다"로만 보이고 진짜
// 원인(빌드에 CLIENT_ID가 안 들어감)이 전혀 드러나지 않는다. 그래서 설정이
// 안 됐을 때도 이 화면은 그대로 띄우되, 버튼을 비활성화하고 이유를 적어준다.
export default function GoogleSignInGate({ children }: GoogleSignInGateProps) {
  const configured = isGoogleDriveConfigured()
  // 페이지를 새로 열면 항상 이 로그인 화면부터 시작한다. 예전에는 세션스토리지
  // (GATE_KEY)에 통과 기록이 남아 있으면 이 화면을 건너뛰었는데, 정작 액세스
  // 토큰은 모듈 메모리에만 있어서 새로고침하면 사라진다 -- 즉 "로그인한 것으로
  // 치고" 들여보내지만 실제로는 Drive를 못 부르는 반쪽 상태였고, 화면상으로는
  // 로그인 화면이 안 뜨고 우측 상단 계정 정보만 비는 것처럼 보였다.
  const [passed, setPassed] = useState(false)
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
          disabled={busy || !configured}
          className="mt-8 flex w-full items-center justify-center gap-2 px-6 py-3 text-base"
        >
          {busy && <Spinner className="h-4 w-4 text-white" />}
          {busy ? '연결하는 중...' : 'Google 계정으로 시작'}
        </Button>
        {/* 설정이 안 된 빌드라고 앱을 통째로 못 쓰게 막지는 않는다 -- 다만
            예전처럼 이 화면을 조용히 건너뛰지는 않고, 이유를 보여준 뒤
            사용자가 직접 넘어가게 한다. */}
        {!configured && (
          <>
            <p className="mt-3 text-xs text-danger">
              이 빌드에 Google Client ID가 없습니다. 프로젝트 루트 .env.local에
              VITE_GOOGLE_CLIENT_ID를 넣고 dev 서버를 다시 시작하세요.
            </p>
            <button
              onClick={() => setPassed(true)}
              className="mt-4 text-sm text-gray-400 underline hover:text-black"
            >
              Google 연동 없이 시작
            </button>
          </>
        )}
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}

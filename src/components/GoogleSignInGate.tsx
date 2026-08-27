import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkspaces } from '../state/WorkspaceContext'
import {
  connectDrive,
  getConnectedEmail,
  isGoogleDriveConfigured,
  isKeepLoginEnabled,
  readRememberedEmail,
  rememberLogin,
} from '../utils/googleDrive'
import Button from './Button'
import Spinner from './Spinner'

// 같은 탭에서 새로고침해도 다시 로그인 화면부터 보이지 않도록, 통과 여부를
// 탭 단위로 기억한다. 헤더의 "로그아웃"도 이 키를 지우고 새로고침해 이
// 화면으로 되돌아간다. 브라우저를 닫았다 열어도 유지할지는 로그인 화면의
// "이 브라우저에서 로그인 유지" 체크(localStorage)가 따로 결정한다.
export const GATE_KEY = 'google-gate-passed'

interface GoogleSignInGateProps {
  children: ReactNode
}

// 앱을 열자마자 뜨는 입장 화면.
//
// 통과 규칙은 세 가지다:
//  1) 이 탭에서 이미 로그인했으면(GATE_KEY) 새로고침해도 그대로 통과.
//  2) "로그인 유지"를 켜둔 브라우저면 새 탭·재시작 후에도 바로 통과.
//  3) 그 외에 마지막 로그인 계정이 기억돼 있으면, 자동으로 넘기지 않고
//     "○○○으로 계속하시겠습니까?"를 먼저 물어본다(다른 계정으로 갈아탈
//     여지를 남긴다).
//
// 빌드에 GOOGLE_CLIENT_ID가 없으면 예전에는 이 화면 자체를 건너뛰고 앱 안으로
// 그냥 들여보냈는데, 그러면 화면에는 "로그인 화면이 안 뜬다 / 우측 상단 계정
// 정보가 사라졌다"로만 보이고 진짜 원인이 전혀 드러나지 않는다. 그래서 설정이
// 안 됐을 때도 이 화면은 띄우되 이유를 적어주고, 앱을 통째로 막지는 않도록
// 연동 없이 넘어가는 길을 남긴다.
export default function GoogleSignInGate({ children }: GoogleSignInGateProps) {
  const configured = isGoogleDriveConfigured()
  const rememberedEmail = readRememberedEmail()

  const [passed, setPassed] = useState(() => {
    if (!configured) return false
    try {
      if (sessionStorage.getItem(GATE_KEY) === '1') return true
    } catch {
      // 세션스토리지를 못 읽으면 아래 "로그인 유지"만 보고 판단한다.
    }
    return isKeepLoginEnabled() && readRememberedEmail() !== null
  })
  const [keepLogin, setKeepLogin] = useState(() => isKeepLoginEnabled())
  const [busy, setBusy] = useState<'same' | 'other' | null>(null)
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

  async function handleStart(selectAccount: boolean) {
    setError(null)
    setBusy(selectAccount ? 'other' : 'same')
    try {
      await connectDrive(selectAccount)
      // 로그인이 막 확인된 이 계정 기준으로 워크스페이스 데이터를 다시
      // 읽어들인다 -- WorkspaceProvider가 이 게이트보다 먼저 마운트돼서
      // 최초 로드 시점에는 아직 계정을 몰랐을 수 있다(첫 로그인인 경우).
      reloadForAccount()
      rememberLogin(getConnectedEmail(), keepLogin)
      try {
        sessionStorage.setItem(GATE_KEY, '1')
      } catch {
        // 세션 저장 실패해도 로그인 자체는 성공했으니 그냥 통과시킨다.
      }
      setPassed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const working = busy !== null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white px-10 py-12 text-center shadow-sm">
        <h1 className="text-3xl font-extrabold text-black">성과·성장관리</h1>
        <p className="mt-3 text-sm text-gray-500">팀과 평가기간별 데이터를 개인 Google Drive에서 안전하게 관리합니다.</p>

        {/* 이 브라우저에 마지막 로그인 계정이 남아 있으면 그 계정으로 바로
            들어갈지 먼저 물어본다 -- 계정을 바꿔야 할 때도 있으니 자동으로
            넘기지 않고, 아래에 다른 계정으로 가는 길을 같이 둔다. */}
        {configured && rememberedEmail ? (
          <>
            <p className="mt-8 truncate rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              최근 로그인 · <span className="font-medium text-black">{rememberedEmail}</span>
            </p>
            <Button
              variant="primary"
              onClick={() => handleStart(false)}
              disabled={working}
              className="mt-3 flex w-full items-center justify-center gap-2 px-6 py-3 text-base"
            >
              {busy === 'same' && <Spinner className="h-4 w-4 text-white" />}
              {busy === 'same' ? '연결하는 중...' : '이 계정으로 계속'}
            </Button>
            <button
              onClick={() => handleStart(true)}
              disabled={working}
              className="mt-3 w-full text-sm text-gray-500 underline hover:text-black disabled:opacity-50"
            >
              {busy === 'other' ? '계정 선택 중...' : '다른 계정으로 로그인'}
            </button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={() => handleStart(false)}
            disabled={working || !configured}
            className="mt-8 flex w-full items-center justify-center gap-2 px-6 py-3 text-base"
          >
            {busy === 'same' && <Spinner className="h-4 w-4 text-white" />}
            {busy === 'same' ? '연결하는 중...' : 'Google 계정으로 시작'}
          </Button>
        )}

        {configured && (
          <label className="mt-5 flex items-center justify-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={keepLogin}
              onChange={(e) => setKeepLogin(e.target.checked)}
              className="h-4 w-4"
            />
            이 브라우저에서 로그인 유지
          </label>
        )}

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

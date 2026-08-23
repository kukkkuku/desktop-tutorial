import { useEffect, useMemo, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import { buildGoogleSheetViewWorkbook, buildResultsReportWorkbook, downloadAllWorkspacesExcelZip } from '../utils/excel'
import { downloadLocalJsonBackup, loadAllWorkspaceEntries, wipeAllAppData } from '../utils/backup'
import { ADMIN_EMAILS } from '../utils/adminInvite'
import { getConnectedEmail } from '../utils/googleDrive'
import {
  clearSaveDirectory,
  getSaveDirectoryName,
  isDirectoryPickerSupported,
  LOCAL_SAVE_SUBFOLDER,
  pickSaveDirectory,
  restoreSaveDirectory,
} from '../utils/localSave'
import AdminInvitePanel from './AdminInvitePanel'
import Button from './Button'
import BulkUploadPanel from './BulkUploadPanel'
import ConfirmDialog from './ConfirmDialog'
import GoogleDrivePanel from './GoogleDrivePanel'
import Spinner from './Spinner'

interface DataManagerDrawerProps {
  open: boolean
  onClose: () => void
  // Drive 연결(재연결 포함)에 성공했을 때 알려준다 -- 상단 헤더(StageTabs)의
  // 계정 이메일/관리자 배지도 같이 새로고침할 수 있도록.
  onAccountChange?: () => void
  // 전체 데이터 저장 진행 상태를 알려준다 -- 헤더의 "저장 중"/"저장 실패" 배지용.
  onSaveStatusChange?: (status: 'saving' | 'saved' | 'error') => void
}

type Tab = 'local' | 'drive' | 'admin' | 'reset'

// 로컬 파일/Google Drive 탭 라벨 앞 아이콘. Figma는 래스터 이미지를 쓰지만,
// 이 프로젝트는 모든 아이콘을 currentColor 획선 SVG로 통일해서 쓰므로(다른
// 탭·버튼과 같은 관례) 같은 방식으로 맞춘다. DriveIcon은 GoogleAccountMenu의
// "구글 드라이브로 이동" 아이콘과 동일한 모양을 재사용.
function LocalFileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function DriveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7.5 3h9L22 12l-4.5 8h-11L2 12z" />
      <path d="M7.5 3 12 12l-4.5 8M16.5 3 12 12l4.5 8M2 12h20" />
    </svg>
  )
}

// "데이터 관리" 진입점 하나로 로컬 엑셀 파일과 Google Drive를 함께 다룬다.
// 이전에는 각 탭 상단 버튼 + 화면 하단 바텀시트(로컬 일괄 업로드) +
// 결과 화면의 Google Drive 버튼, 이렇게 세 군데로 데이터 관리 진입점이
// 흩어져 있었다. 여기 하나로 모으고, 화면 가운데 모달로 연다.
export default function DataManagerDrawer({ open, onClose, onAccountChange, onSaveStatusChange }: DataManagerDrawerProps) {
  const { state, dispatch } = useAppState()
  const { tasks, members, peerReviews, contributions, criteria } = state
  const { currentWorkspace, workspaces } = useWorkspaces()
  const [tab, setTab] = useState<Tab>('local')
  // "팀원 초대" 탭 자체를 관리자 계정으로 이 앱에 로그인했을 때만 보여준다
  // (다른 사람에게는 탭이 아예 보이지 않는다). 이 앱의 전체 진입 게이트가
  // 이미 Google 로그인을 요구하므로, 그때 연결된 이메일을 그대로 쓴다 --
  // AdminInvitePanel 안의 "관리자로 Google 연결"은 메일 발송에 필요한
  // 별도 권한(gmail.send)을 위한 것이라 이 탭 노출 여부와는 별개다.
  // state로 들고 있는 이유: getConnectedEmail()을 렌더 중에 그냥 읽기만
  // 하면, GoogleDrivePanel 안에서 "다시 연결"을 눌러 연결에 성공해도 그건
  // 자식 컴포넌트의 로컬 state 변경일 뿐이라 이 부모(DataManagerDrawer)가
  // 다시 렌더링되지 않고, 탭 목록이 연결 이전 값으로 멈춰버린다. 그래서
  // 모달이 열릴 때와 연결 성공 콜백 양쪽에서 명시적으로 다시 확인한다.
  const [isAdminUser, setIsAdminUser] = useState(() => ADMIN_EMAILS.includes(getConnectedEmail() ?? ''))
  const refreshAdminStatus = () => {
    setIsAdminUser(ADMIN_EMAILS.includes(getConnectedEmail() ?? ''))
  }
  useEffect(() => {
    if (open) refreshAdminStatus()
  }, [open])
  // onAccountChange는 "실제로 계정이 바뀌었다"는 신호라 워크스페이스
  // 재로드 + 프로젝트 선택 화면 이동까지 트리거한다(App.tsx 참고) --
  // 모달이 열릴 때마다 도는 refreshAdminStatus와 섞어 부르면 안 되고,
  // Google Drive 탭 안에서 실제로 "다른 계정 연결"이 성공했을 때만 불러야
  // 한다.
  const handleDriveAccountSwitch = () => {
    refreshAdminStatus()
    onAccountChange?.()
  }

  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const isBusy = loadingLabel !== null

  // 로컬 저장 위치 -- 지정해두면 "전체 양식 ZIP/JSON 백업/엑셀 백업"이 브라우저
  // 기본 다운로드 폴더 대신 이 폴더(정확히는 그 안의 전용 하위 폴더) 밑에 바로
  // 쌓인다. 예전에 지정해둔 폴더가 있으면 모달이 열릴 때 조용히 재확인한다.
  const [saveDirName, setSaveDirName] = useState<string | null>(() => getSaveDirectoryName())
  const [saveDirError, setSaveDirError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    void restoreSaveDirectory().then((name) => setSaveDirName(name))
  }, [open])

  async function handlePickSaveDirectory() {
    setSaveDirError(null)
    try {
      const name = await pickSaveDirectory()
      setSaveDirName(name)
    } catch (err) {
      // 사용자가 폴더 선택창을 취소한 경우도 여기로 온다 -- 에러로
      // 보여줄 필요 없이 조용히 넘어간다.
      if (err instanceof Error && err.name === 'AbortError') return
      setSaveDirError(err instanceof Error ? err.message : '폴더를 지정하지 못했습니다.')
    }
  }

  function handleClearSaveDirectory() {
    clearSaveDirectory()
    setSaveDirName(null)
  }
  // 초기화 버튼 자체는 "이 브라우저에 저장된 프로젝트가 하나라도 있는가"로
  // 활성화한다 -- 지금 프로젝트는 비어 있어도 다른 프로젝트에 데이터가
  // 남아있을 수 있고, 초기화는 그것까지 전부 지우기 때문이다.
  const hasAnyWorkspaceData = workspaces.length > 0

  const periodsForTeam = useMemo(
    () => workspaces.filter((w) => w.teamName === currentWorkspace?.teamName),
    [workspaces, currentWorkspace],
  )

  // 전체 데이터 초기화는 지금 열린 프로젝트 하나가 아니라, 지금 로그인된
  // 이 계정에 저장된 모든 팀·평가 데이터를 지운다(계정별로 저장 키가
  // 분리돼 있어 다른 Google 계정이나 다른 기기·브라우저의 데이터는 애초에
  // 영향받지 않는다). 되돌릴 수 없으므로 로컬 JSON/엑셀 백업을 먼저 권한다.
  async function handleLocalJsonBackup() {
    setLoadingLabel('로컬 백업 파일 생성 중...')
    downloadLocalJsonBackup()
    setLoadingLabel(null)
  }

  async function handleExcelBackup() {
    setLoadingLabel('엑셀 백업 파일 생성 중...')
    await downloadAllWorkspacesExcelZip(loadAllWorkspaceEntries())
    setLoadingLabel(null)
  }

  function handleResetConfirm() {
    setResetDialogOpen(false)
    wipeAllAppData()
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`relative flex h-[640px] max-h-[85vh] w-full max-w-3xl transform flex-col overflow-hidden rounded-xl bg-white shadow-xl transition-all duration-200 ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-bold text-black">데이터 관리</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black" aria-label="닫기">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-stretch justify-between border-b border-gray-200 px-5">
          <div className="flex items-center">
            {(
              [
                { key: 'local' as const, label: '로컬 파일', Icon: LocalFileIcon },
                { key: 'drive' as const, label: 'Google Drive', Icon: DriveIcon },
                ...(isAdminUser ? [{ key: 'admin' as const, label: '팀원 초대', Icon: undefined }] : []),
              ]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.key ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-black'
                }`}
              >
                {t.Icon && <t.Icon className="h-4 w-4 shrink-0" />}
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setTab('reset')}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'reset' ? 'border-danger text-danger' : 'border-transparent text-gray-400 hover:text-black'
            }`}
          >
            데이터 초기화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'local' && (
            <div className="mx-auto max-w-lg space-y-4">
              {isDirectoryPickerSupported() && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-black">저장 위치</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {saveDirName ? (
                        <>
                          <span className="font-medium text-black">{saveDirName}</span> 폴더 안의{' '}
                          <span className="font-medium text-black">{LOCAL_SAVE_SUBFOLDER}</span>에 저장됩니다.
                        </>
                      ) : (
                        '지정하지 않으면 브라우저 기본 다운로드 폴더에 저장됩니다.'
                      )}
                    </p>
                    {saveDirError && <p className="mt-0.5 text-xs text-danger">{saveDirError}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" onClick={handlePickSaveDirectory} className="px-3 py-1.5 text-xs">
                      {saveDirName ? '위치 변경' : '위치 지정'}
                    </Button>
                    {saveDirName && (
                      <Button variant="secondary" onClick={handleClearSaveDirectory} className="px-3 py-1.5 text-xs">
                        해제
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <BulkUploadPanel />

              <div className="rounded-md bg-gray-50 px-4 py-3 text-xs text-gray-500">
                지금 데이터: 과제 {tasks.length}건 · 팀원 {members.length}명 · 피어리뷰 {peerReviews.length}건
              </div>
            </div>
          )}

          {tab === 'drive' && (
            <div className="mx-auto max-w-lg">
              {currentWorkspace ? (
                <GoogleDrivePanel
                  workspace={currentWorkspace}
                  state={state}
                  dispatch={dispatch}
                  buildReportWorkbook={() => buildResultsReportWorkbook(members, tasks, contributions, criteria, peerReviews, periodsForTeam).workbook}
                  buildSheetWorkbook={() => buildGoogleSheetViewWorkbook(members, tasks, contributions, criteria, peerReviews, periodsForTeam)}
                  onConnected={handleDriveAccountSwitch}
                  onSaveStatusChange={onSaveStatusChange}
                />
              ) : (
                <p className="px-1 py-6 text-center text-sm text-gray-400">평가를 먼저 선택해주세요.</p>
              )}
            </div>
          )}

          {tab === 'admin' && isAdminUser && <AdminInvitePanel />}

          {tab === 'reset' && (
            <div className="mx-auto flex max-w-lg flex-col items-end gap-4">
              <div className="w-full space-y-5 rounded-xl border border-danger/30 bg-red-50 p-6">
                <div>
                  <p className="text-base font-bold text-danger">전체 데이터 초기화</p>
                  <p className="mt-3 text-sm leading-relaxed text-danger">
                    <span className="font-bold">
                      {getConnectedEmail() ? `${getConnectedEmail()} 계정의 모든 팀·프로젝트 데이터` : '이 계정의 모든 팀·프로젝트 데이터'}
                    </span>
                    가 삭제됩니다(지금 열려 있는 프로젝트 하나가 아닙니다).
                    <br />
                    계정별로 저장이 분리돼 있어 다른 Google 계정이나 다른 기기·브라우저의 데이터에는 영향이 없지만, 이 계정에서는 되돌릴 수 없습니다.
                    <br />
                    아래에서 먼저 백업하세요.
                  </p>
                </div>

                <div className="h-px w-full bg-danger/20" />

                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={handleLocalJsonBackup} disabled={isBusy || !hasAnyWorkspaceData} className="px-5 py-3">
                    로컬 파일로 백업 (JSON)
                  </Button>
                  <Button variant="secondary" onClick={handleExcelBackup} disabled={isBusy || !hasAnyWorkspaceData} className="px-5 py-3">
                    엑셀로 백업
                  </Button>
                  {isBusy && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Spinner className="h-3.5 w-3.5 text-accent" />
                      {loadingLabel}
                    </span>
                  )}
                </div>

                <p className="text-xs leading-relaxed text-gray-600">
                  JSON 백업은 필요하면 그대로 복원할 수 있는 원본이고, 엑셀 백업은 사람이 보기 좋은 사본입니다(복원용 아님). 프로젝트가 여러 개면 프로젝트별로 각각 담깁니다.
                </p>
              </div>

              <Button variant="danger" onClick={() => setResetDialogOpen(true)} disabled={!hasAnyWorkspaceData} className="px-6 py-3">
                전체 데이터 초기화
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        title="전체 데이터 초기화"
        message={`이 계정에 저장된 팀 ${new Set(workspaces.map((w) => w.teamName)).size}개, 프로젝트 ${workspaces.length}개의 데이터가 모두 삭제되고 처음 화면으로 돌아갑니다. 백업하지 않았다면 취소하고 먼저 백업하세요. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`}
        onConfirm={handleResetConfirm}
        onCancel={() => setResetDialogOpen(false)}
      />
    </div>
  )
}

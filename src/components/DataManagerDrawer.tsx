import { useEffect, useMemo, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import { buildGoogleSheetViewWorkbook, buildResultsReportWorkbook, downloadAllWorkspacesExcelZip } from '../utils/excel'
import { downloadLocalJsonBackup, loadAllWorkspaceEntries, wipeAllAppData } from '../utils/backup'
import { getConnectedEmail, trashAllAppDriveData } from '../utils/googleDrive'
import {
  clearSaveDirectory,
  getSaveDirectoryName,
  isDirectoryPickerSupported,
  LOCAL_SAVE_SUBFOLDER,
  pickSaveDirectory,
  restoreSaveDirectory,
} from '../utils/localSave'
import { HardDrive, Monitor, X } from 'lucide-react'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import GoogleDrivePanel from './GoogleDrivePanel'
import IconButton from './IconButton'
import Spinner from './Spinner'
import SheetImportPanel from './work/SheetImportPanel'
import Segmented from './ui/Segmented'
import { ic, icSm } from './ui/icon'
import { peerInputsOf } from '../utils/peerScores'

interface DataManagerDrawerProps {
  open: boolean
  onClose: () => void
  // Drive 연결(재연결 포함)에 성공했을 때 알려준다 -- 상단 헤더(StageTabs)의
  // 계정 이메일/관리자 배지도 같이 새로고침할 수 있도록.
  onAccountChange?: () => void
  // 전체 데이터 저장 진행 상태를 알려준다 -- 헤더의 "저장 중"/"저장 실패" 배지용.
  onSaveStatusChange?: (status: 'saving' | 'saved' | 'error') => void
  // 과제관리의 "구글시트에서 가져오기"처럼 특정 탭을 열어 달라는 요청.
  // token이 바뀔 때마다 그 탭으로 간다.
  tabRequest?: { tab: DataManagerTab; token: number } | null
  // 구글시트 가져오기를 마치고 "과제관리에서 보기"를 누르면.
  onGoToWork?: () => void
}

export type DataManagerTab = 'sheet' | 'local' | 'drive' | 'admin' | 'reset'
type Tab = DataManagerTab

// "데이터 관리" 진입점 하나로 로컬 엑셀 파일과 Google Drive를 함께 다룬다.
// 이전에는 각 탭 상단 버튼 + 화면 하단 바텀시트(로컬 일괄 업로드) +
// 결과 화면의 Google Drive 버튼, 이렇게 세 군데로 데이터 관리 진입점이
// 흩어져 있었다. 여기 하나로 모으고, 화면 가운데 모달로 연다.
export default function DataManagerDrawer({ open, onClose, onAccountChange, onSaveStatusChange, tabRequest, onGoToWork }: DataManagerDrawerProps) {
  const { state, dispatch } = useAppState()
  const { tasks, members, peerReviews, contributions, criteria } = state
  const { currentWorkspace, workspaces } = useWorkspaces()
  const [tab, setTab] = useState<Tab>('local')
  useEffect(() => {
    if (tabRequest) setTab(tabRequest.tab)
  }, [tabRequest])
  // onAccountChange는 "실제로 계정이 바뀌었다"는 신호라 워크스페이스
  // 재로드 + 프로젝트 선택 화면 이동까지 트리거한다(App.tsx 참고) --
  // Google Drive 탭 안에서 실제로 "다른 계정 연결"이 성공했을 때만 불러야
  // 한다.
  const handleDriveAccountSwitch = () => {
    onAccountChange?.()
  }

  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [resetMode, setResetMode] = useState<'local' | 'drive' | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [backupJson, setBackupJson] = useState(true)
  const [backupExcel, setBackupExcel] = useState(true)
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

  async function handleSelectedBackup() {
    if (backupJson) await handleLocalJsonBackup()
    if (backupExcel) await handleExcelBackup()
  }

  async function handleResetConfirm() {
    const mode = resetMode
    setResetMode(null)
    setResetError(null)
    if (mode === 'drive') {
      setLoadingLabel('Google Drive 데이터를 휴지통으로 옮기는 중...')
      try {
        await trashAllAppDriveData()
      } catch (err) {
        setLoadingLabel(null)
        setResetError(err instanceof Error ? err.message : 'Google Drive 데이터를 지우지 못했습니다. 이 브라우저 데이터는 그대로입니다.')
        return
      }
    }
    wipeAllAppData()
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/25 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`relative flex ${tab === 'sheet' ? 'max-h-[92vh]' : 'max-h-[85vh]'} w-full ${tab === 'sheet' ? 'h-[92vh] max-w-[1600px]' : 'h-[640px] max-w-3xl'} transform flex-col overflow-hidden rounded-[12px] bg-white shadow-dialog transition-all duration-200 ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[15px] font-semibold text-label">데이터 백업</h2>
          <IconButton onClick={onClose} aria-label="닫기" title="닫기">
            <X {...ic} />
          </IconButton>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-separator px-5 pb-3">
          <Segmented<Tab>
            value={tab === 'reset' ? ('' as Tab) : tab}
            onChange={setTab}
            items={[
              { key: 'local', label: <span className="flex items-center gap-1.5"><Monitor {...icSm} />로컬 파일</span> },
              { key: 'drive', label: <span className="flex items-center gap-1.5"><HardDrive {...icSm} />Google Drive</span> },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTab('reset')}
            className={tab === 'reset' ? 'bg-danger/10 text-danger hover:bg-danger/15 hover:text-danger' : ''}
          >
            데이터 초기화
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'sheet' && (
            <div className="flex min-h-full flex-col">
              <SheetImportPanel
                onCancel={onClose}
                onDone={
                  onGoToWork
                    ? () => {
                        onGoToWork()
                        onClose()
                      }
                    : undefined
                }
              />
            </div>
          )}

          {tab === 'local' && (
            <div className="mx-auto max-w-lg space-y-4">
              {isDirectoryPickerSupported() && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-separator bg-[#F7F7F9] px-4 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-label">저장 위치</p>
                    <p className="mt-0.5 text-[13px] text-label-2">
                      {saveDirName ? (
                        <>
                          <span className="font-medium text-label">{saveDirName}</span> 폴더 안의{' '}
                          <span className="font-medium text-label">{LOCAL_SAVE_SUBFOLDER}</span>에 저장됩니다.
                        </>
                      ) : (
                        '지정하지 않으면 브라우저 기본 다운로드 폴더에 저장됩니다.'
                      )}
                    </p>
                    {saveDirError && <p className="mt-0.5 text-[13px] text-danger">{saveDirError}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" onClick={handlePickSaveDirectory} size="sm">
                      {saveDirName ? '위치 변경' : '위치 지정'}
                    </Button>
                    {saveDirName && (
                      <Button variant="secondary" onClick={handleClearSaveDirectory} size="sm">
                        해제
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* "로컬 파일" 탭은 이름대로 이 기기에 지금 데이터를 백업하는
                  용도다 -- 새 데이터를 올리는 "전체 일괄 업로드"는 온보딩
                  성격이라 빠른 시작(Excel로 시작 탭)에만 두고 여기서는
                  뺐다. */}
              <div className="rounded-card border border-separator p-4">
                <p className="text-[13px] font-semibold text-label">지금 데이터 백업</p>
                <p className="mt-0.5 text-[13px] text-label-2">
                  현재 계정에 저장된 모든 팀·프로젝트 데이터를 이 기기에 파일로 내려받습니다.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={handleLocalJsonBackup} disabled={isBusy || !hasAnyWorkspaceData}>
                    로컬 파일로 백업 (JSON)
                  </Button>
                  <Button variant="secondary" onClick={handleExcelBackup} disabled={isBusy || !hasAnyWorkspaceData}>
                    엑셀로 백업
                  </Button>
                  {isBusy && (
                    <span className="flex items-center gap-1.5 text-[13px] text-label-2">
                      <Spinner className="h-3.5 w-3.5 text-accent" />
                      {loadingLabel}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-label-2">
                  JSON 백업은 필요하면 그대로 복원할 수 있는 원본이고, 엑셀 백업은 사람이 보기 좋은 사본입니다(복원용 아님).
                </p>
              </div>

              <div className="rounded-card bg-[#F7F7F9] px-4 py-3 text-[13px] text-label-2">
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
                  buildReportWorkbook={() => buildResultsReportWorkbook(members, tasks, contributions, criteria, peerInputsOf(state), periodsForTeam).workbook}
                  buildSheetWorkbook={() => buildGoogleSheetViewWorkbook(members, tasks, contributions, criteria, peerInputsOf(state), periodsForTeam)}
                  onConnected={handleDriveAccountSwitch}
                  onSaveStatusChange={onSaveStatusChange}
                />
              ) : (
                <p className="px-1 py-6 text-center text-[13px] text-label-3">평가를 먼저 선택해주세요.</p>
              )}
            </div>
          )}


          {tab === 'reset' && (
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded-card border border-danger/25 bg-danger/[0.04] p-5">
                <p className="text-[15px] font-semibold text-danger">전체 데이터 초기화</p>
                <p className="mt-2 text-[13px] leading-relaxed text-label">
                  초기화 범위를 선택하세요. 두 기능 모두 지금 열려 있는 프로젝트 하나가 아니라 <span className="font-semibold">모든 팀·프로젝트 데이터</span>를 대상으로 합니다.
                </p>
                <p className="text-[13px] text-danger">아래에서 먼저 백업하세요.</p>

                <div className="my-4 h-px w-full bg-danger/15" />

                <p className="text-[13px] font-semibold text-label">삭제 전 브라우저 전체 데이터 백업</p>
                <p className="mt-0.5 text-xs text-label-2">모든 팀, 평가 프로젝트, 과제, 팀원, 평가, 성장 및 면담 데이터가 포함됩니다.</p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 text-[13px] font-medium text-label">
                    <input type="checkbox" checked={backupJson} onChange={(e) => setBackupJson(e.target.checked)} />
                    JSON 전체 데이터 원본
                  </label>
                  <label className="flex items-center gap-1.5 text-[13px] font-medium text-label">
                    <input type="checkbox" checked={backupExcel} onChange={(e) => setBackupExcel(e.target.checked)} />
                    Excel 전체 확인·보관용
                  </label>
                  <Button variant="secondary" onClick={handleSelectedBackup} disabled={isBusy || !hasAnyWorkspaceData || (!backupJson && !backupExcel)}>
                    선택 항목 전체 백업
                  </Button>
                  {isBusy && (
                    <span className="flex items-center gap-1.5 text-[13px] text-label-2">
                      <Spinner className="h-3.5 w-3.5 text-accent" />
                      {loadingLabel}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-card border border-separator bg-white p-5">
                  <p className="text-[15px] font-semibold text-label">이 브라우저 데이터만 초기화</p>
                  <p className="mt-2 text-xs leading-relaxed text-label-2">
                    이 브라우저에 저장된 데이터를 비웁니다. Google Drive에 저장한 데이터는 그대로 남아, 다시 연결하면 복원할 수 있습니다.
                  </p>
                  <Button variant="secondary" onClick={() => setResetMode('local')} disabled={!hasAnyWorkspaceData} className="mt-4">
                    이 브라우저만 초기화
                  </Button>
                </div>
                <div className="rounded-card border border-danger/30 bg-white p-5">
                  <p className="text-[15px] font-semibold text-danger">Google Drive 포함 전체 데이터 초기화</p>
                  <p className="mt-2 text-xs leading-relaxed text-label-2">
                    이 브라우저와 연결된 Google Drive의 앱 전용 성장관리 데이터를 함께 비웁니다. Drive 데이터는 휴지통으로 이동합니다.
                  </p>
                  <Button variant="secondary" onClick={() => setResetMode('drive')} disabled={!getConnectedEmail()} className="mt-4 !text-danger">
                    Drive 포함 전체 초기화
                  </Button>
                  {!getConnectedEmail() && <p className="mt-2 text-xs text-label-3">Google 계정이 연결돼 있어야 합니다.</p>}
                  {resetError && <p className="mt-2 text-xs text-danger">{resetError}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={resetMode !== null}
        title={resetMode === 'drive' ? 'Google Drive 포함 전체 초기화' : '이 브라우저 데이터만 초기화'}
        message={
          resetMode === 'drive'
            ? `이 브라우저의 팀 ${new Set(workspaces.map((w) => w.teamName)).size}개, 프로젝트 ${workspaces.length}개 데이터를 지우고,\n${getConnectedEmail() ?? ''} 드라이브의 성장관리 폴더를 휴지통으로 옮깁니다.\n휴지통은 드라이브에서 30일 안에 되살릴 수 있습니다. 계속하시겠습니까?`
            : `이 브라우저의 팀 ${new Set(workspaces.map((w) => w.teamName)).size}개, 프로젝트 ${workspaces.length}개 데이터를 지우고 처음 화면으로 돌아갑니다.\nGoogle Drive에 저장한 데이터는 남아 있어 다시 연결하면 복원할 수 있습니다. 계속하시겠습니까?`
        }
        onConfirm={handleResetConfirm}
        onCancel={() => setResetMode(null)}
      />
    </div>
  )
}

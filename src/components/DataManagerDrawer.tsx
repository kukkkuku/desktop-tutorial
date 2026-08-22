import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import { buildGoogleSheetViewWorkbook, buildResultsReportWorkbook, downloadAllTemplatesZip, downloadAllWorkspacesExcelZip, detectWorkbookKind, parseMemberWorkbook, parsePeerReviewWorkbook, parseTaskWorkbook } from '../utils/excel'
import { downloadLocalJsonBackup, loadAllWorkspaceEntries, wipeAllAppData } from '../utils/backup'
import { ADMIN_EMAILS } from '../utils/adminInvite'
import { getConnectedEmail } from '../utils/googleDrive'
import AdminInvitePanel from './AdminInvitePanel'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import GoogleDrivePanel from './GoogleDrivePanel'
import Spinner from './Spinner'

interface DataManagerDrawerProps {
  open: boolean
  onClose: () => void
  // Drive 연결(재연결 포함)에 성공했을 때 알려준다 -- 상단 헤더(StageTabs)의
  // 계정 이메일/관리자 배지도 같이 새로고침할 수 있도록.
  onAccountChange?: () => void
}

type Tab = 'local' | 'drive' | 'admin'

interface BulkSummary {
  addedCount: number
  updatedCount: number
  errors: string[]
}

const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i

// "데이터 관리" 진입점 하나로 로컬 엑셀 파일과 Google Drive를 함께 다룬다.
// 이전에는 각 탭 상단 버튼 + 화면 하단 바텀시트(로컬 일괄 업로드) +
// 결과 화면의 Google Drive 버튼, 이렇게 세 군데로 데이터 관리 진입점이
// 흩어져 있었다. 여기 하나로 모으고, 화면 가운데 모달로 연다.
export default function DataManagerDrawer({ open, onClose, onAccountChange }: DataManagerDrawerProps) {
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
  // 모달이 열릴 때와 연결 성공 콜백(refreshAdminStatus) 양쪽에서 명시적으로
  // 다시 확인한다.
  const [isAdminUser, setIsAdminUser] = useState(() => ADMIN_EMAILS.includes(getConnectedEmail() ?? ''))
  const refreshAdminStatus = () => {
    setIsAdminUser(ADMIN_EMAILS.includes(getConnectedEmail() ?? ''))
    onAccountChange?.()
  }
  useEffect(() => {
    if (open) refreshAdminStatus()
  }, [open])

  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const isBusy = loadingLabel !== null
  // 초기화 버튼 자체는 "이 브라우저에 저장된 프로젝트가 하나라도 있는가"로
  // 활성화한다 -- 지금 프로젝트는 비어 있어도 다른 프로젝트에 데이터가
  // 남아있을 수 있고, 초기화는 그것까지 전부 지우기 때문이다.
  const hasAnyWorkspaceData = workspaces.length > 0

  const periodsForTeam = useMemo(
    () => workspaces.filter((w) => w.teamName === currentWorkspace?.teamName),
    [workspaces, currentWorkspace],
  )

  async function handleBulkFiles(files: File[]) {
    if (files.length === 0) return
    setBulkSummary(null)
    setLoadingLabel(`파일 ${files.length}개 확인 중...`)

    // 종류별로 먼저 나누고 항상 과제 -> 팀원 -> 피어리뷰 순서로 처리한다 --
    // 피어리뷰는 이름으로 팀원을 찾으므로, 같이 올린 팀원 파일보다 먼저
    // 처리되면 조회가 실패한다.
    const taskFiles: File[] = []
    const memberFiles: File[] = []
    const peerFiles: File[] = []
    const errors: string[] = []

    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const kind = detectWorkbookKind(buffer)
      if (kind === 'task') taskFiles.push(file)
      else if (kind === 'member') memberFiles.push(file)
      else if (kind === 'peer') peerFiles.push(file)
      else errors.push(`[${file.name}] 과제·팀원·피어리뷰 양식 중 어떤 것인지 인식하지 못했습니다.`)
    }

    let addedCount = 0
    let updatedCount = 0

    let taskList = tasks
    for (const file of taskFiles) {
      const result = parseTaskWorkbook(await file.arrayBuffer(), taskList)
      taskList = result.tasks
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
    }
    if (taskFiles.length > 0) dispatch({ type: 'IMPORT_TASKS', payload: taskList })

    let memberList = members
    for (const file of memberFiles) {
      const result = parseMemberWorkbook(await file.arrayBuffer(), memberList)
      memberList = result.members
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
    }
    if (memberFiles.length > 0) dispatch({ type: 'IMPORT_MEMBERS', payload: memberList })

    let peerList = peerReviews
    for (const file of peerFiles) {
      const result = parsePeerReviewWorkbook(await file.arrayBuffer(), tasks, memberList, peerList)
      peerList = result.peerReviews
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
    }
    if (peerFiles.length > 0) dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: peerList })

    setBulkSummary({ addedCount, updatedCount, errors })
    setLoadingLabel(null)
  }

  async function handleZipDownload() {
    setLoadingLabel('양식 압축 중...')
    await downloadAllTemplatesZip(tasks, members)
    setLoadingLabel(null)
  }

  function onBulkInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void handleBulkFiles(files)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (isBusy) return
    const files = Array.from(e.dataTransfer.files).filter((f) => FILE_NAME_PATTERN.test(f.name))
    void handleBulkFiles(files)
  }

  // 전체 데이터 초기화는 지금 열린 프로젝트 하나가 아니라, 이 브라우저에
  // 저장된 모든 팀·평가 데이터를 지운다(브라우저 기반 저장이라 다른
  // 기기·브라우저의 데이터는 애초에 영향받지 않는다). 되돌릴 수 없으므로
  // 로컬 JSON/엑셀 백업을 먼저 권한다.
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
        className={`relative flex max-h-[85vh] w-full transform flex-col overflow-hidden rounded-xl bg-white shadow-xl transition-all duration-200 ${
          tab === 'admin' ? 'max-w-3xl' : 'max-w-lg'
        } ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
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

        <div className="flex border-b border-gray-200 px-5">
          {(
            [
              { key: 'local' as const, label: '로컬 파일' },
              { key: 'drive' as const, label: 'Google Drive' },
              ...(isAdminUser ? [{ key: 'admin' as const, label: '팀원 초대' }] : []),
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-black'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'local' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-black">전체 일괄 업로드</p>
                <p className="mt-0.5 text-xs text-gray-500">과제·팀원·피어리뷰가 섞인 파일을 한 번에 올립니다. 내용을 보고 종류를 자동으로 구분합니다.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={handleZipDownload} disabled={isBusy} className="px-3 py-1.5 text-sm">
                  전체 양식 ZIP 다운로드
                </Button>
                <Button variant="primary" onClick={() => bulkInputRef.current?.click()} disabled={isBusy} className="px-3 py-1.5 text-sm">
                  전체 일괄 업로드
                </Button>
                <input ref={bulkInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onBulkInputChange} />
                {isBusy && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Spinner className="h-3.5 w-3.5 text-accent" />
                    {loadingLabel}
                  </span>
                )}
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!isBusy) setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                onClick={() => !isBusy && bulkInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  isDragOver ? 'border-accent bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'
                } ${isBusy ? 'pointer-events-none opacity-60' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-gray-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <p className="text-sm text-gray-600">파일을 여기에 드래그</p>
                <p className="text-xs text-gray-400">여러 파일 동시 업로드 가능 (.xlsx)</p>
              </div>

              {bulkSummary && (
                <div className={`rounded-md border px-4 py-3 ${bulkSummary.errors.length > 0 ? 'border-danger/30 bg-red-50' : 'border-success/30 bg-green-50'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-sm font-semibold ${bulkSummary.errors.length > 0 ? 'text-danger' : 'text-success'}`}>
                        {bulkSummary.addedCount > 0 || bulkSummary.updatedCount > 0
                          ? `신규 ${bulkSummary.addedCount}건 추가, 기존 ${bulkSummary.updatedCount}건 업데이트되었습니다.`
                          : '변경된 건이 없습니다.'}
                        {bulkSummary.errors.length > 0 && ` (${bulkSummary.errors.length}건 오류)`}
                      </p>
                      {bulkSummary.errors.length > 0 && (
                        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-danger">
                          {bulkSummary.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button onClick={() => setBulkSummary(null)} className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-black hover:bg-gray-100">
                      닫기
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-md bg-gray-50 px-4 py-3 text-xs text-gray-500">
                지금 데이터: 과제 {tasks.length}건 · 팀원 {members.length}명 · 피어리뷰 {peerReviews.length}건
              </div>

              <div className="space-y-3 rounded-md border border-danger/30 bg-red-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-danger">전체 데이터 초기화</p>
                  <p className="mt-0.5 text-xs text-danger">
                    이 <span className="font-semibold">브라우저에 저장된 모든 팀·프로젝트 데이터</span>가 삭제됩니다(지금 열려 있는 프로젝트 하나가 아닙니다). 브라우저 저장소만
                    지우므로 다른 기기나 브라우저의 데이터에는 영향이 없지만, 이 브라우저에서는 되돌릴 수 없습니다. 아래에서 먼저 백업하세요.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={handleLocalJsonBackup} disabled={isBusy || !hasAnyWorkspaceData} className="px-3 py-1.5 text-sm">
                    로컬 파일로 백업 (JSON)
                  </Button>
                  <Button variant="secondary" onClick={handleExcelBackup} disabled={isBusy || !hasAnyWorkspaceData} className="px-3 py-1.5 text-sm">
                    엑셀로 백업
                  </Button>
                  {isBusy && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Spinner className="h-3.5 w-3.5 text-accent" />
                      {loadingLabel}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  JSON 백업은 필요하면 그대로 복원할 수 있는 원본이고, 엑셀 백업은 사람이 보기 좋은 사본입니다(복원용 아님). 프로젝트가 여러 개면 프로젝트별로 각각 담깁니다.
                </p>

                <Button
                  variant="danger"
                  onClick={() => setResetDialogOpen(true)}
                  disabled={!hasAnyWorkspaceData}
                  className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm"
                >
                  전체 데이터 초기화
                </Button>
              </div>
            </div>
          )}

          {tab === 'drive' &&
            (currentWorkspace ? (
              <GoogleDrivePanel
                workspace={currentWorkspace}
                state={state}
                dispatch={dispatch}
                buildReportWorkbook={() => buildResultsReportWorkbook(members, tasks, contributions, criteria, peerReviews, periodsForTeam).workbook}
                buildSheetWorkbook={() => buildGoogleSheetViewWorkbook(members, tasks, contributions, criteria, peerReviews, periodsForTeam)}
                onConnected={refreshAdminStatus}
              />
            ) : (
              <p className="px-1 py-6 text-center text-sm text-gray-400">평가를 먼저 선택해주세요.</p>
            ))}

          {tab === 'admin' && isAdminUser && <AdminInvitePanel />}
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        title="전체 데이터 초기화"
        message={`이 브라우저에 저장된 팀 ${new Set(workspaces.map((w) => w.teamName)).size}개, 프로젝트 ${workspaces.length}개의 데이터가 모두 삭제되고 처음 화면으로 돌아갑니다. 백업하지 않았다면 취소하고 먼저 백업하세요. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`}
        onConfirm={handleResetConfirm}
        onCancel={() => setResetDialogOpen(false)}
      />
    </div>
  )
}

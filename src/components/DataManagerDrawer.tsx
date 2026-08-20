import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import { buildGoogleSheetViewWorkbook, buildResultsReportWorkbook, downloadAllTemplatesZip, detectWorkbookKind, parseMemberWorkbook, parsePeerReviewWorkbook, parseTaskWorkbook } from '../utils/excel'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import GoogleDrivePanel from './GoogleDrivePanel'
import Spinner from './Spinner'

interface DataManagerDrawerProps {
  open: boolean
  onClose: () => void
}

type Tab = 'local' | 'drive'

interface BulkSummary {
  addedCount: number
  updatedCount: number
  errors: string[]
}

const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i

// "데이터 관리" 진입점 하나로 로컬 엑셀 파일과 Google Drive를 함께 다룬다.
// 이전에는 각 탭 상단 버튼 + 화면 하단 바텀시트(로컬 일괄 업로드) +
// 결과 화면의 Google Drive 버튼, 이렇게 세 군데로 데이터 관리 진입점이
// 흩어져 있었다. 여기 하나로 모으고, 화면 오른쪽에서 드로어로 연다.
export default function DataManagerDrawer({ open, onClose }: DataManagerDrawerProps) {
  const { state, dispatch } = useAppState()
  const { tasks, members, peerReviews, contributions, criteria } = state
  const { currentWorkspace, workspaces } = useWorkspaces()
  const [tab, setTab] = useState<Tab>('local')

  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const isBusy = loadingLabel !== null
  const hasData = tasks.length > 0 || members.length > 0 || peerReviews.length > 0

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

  function handleResetConfirm() {
    dispatch({ type: 'RESET_ALL' })
    setResetDialogOpen(false)
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-md transform flex-col bg-white shadow-xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
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

        <div className="flex border-b border-gray-200 px-5">
          {(
            [
              { key: 'local' as const, label: '로컬 파일' },
              { key: 'drive' as const, label: 'Google Drive' },
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
                  isDragOver ? 'border-accent bg-gray-100' : 'border-gray-300 bg-white hover:bg-gray-50'
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

              <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-red-50 px-4 py-3">
                <Button
                  variant="danger"
                  onClick={() => setResetDialogOpen(true)}
                  disabled={!hasData}
                  className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm"
                >
                  데이터 초기화
                </Button>
                <p className="text-xs text-danger">
                  전체 초기화가 필요하면 사용하세요. 과제·팀원·피어리뷰 및 평가 <span className="font-semibold">데이터를 모두 삭제</span>하고 빈 상태로 되돌립니다.
                </p>
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
              />
            ) : (
              <p className="px-1 py-6 text-center text-sm text-gray-400">평가를 먼저 선택해주세요.</p>
            ))}
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        title="전체 데이터 초기화"
        message="과제, 팀원, 평가 매트릭스 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?"
        onConfirm={handleResetConfirm}
        onCancel={() => setResetDialogOpen(false)}
      />
    </div>
  )
}

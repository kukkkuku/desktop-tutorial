import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppState } from '../state/AppContext'
import Spinner from './Spinner'
import ConfirmDialog from './ConfirmDialog'
import { downloadAllTemplatesZip, parseTaskWorkbook, parseMemberWorkbook, parsePeerReviewWorkbook, detectWorkbookKind } from '../utils/excel'
import type { UploadsLog } from '../utils/uploadLog'

interface BulkSummary {
  addedCount: number
  updatedCount: number
  errors: string[]
}

interface DataUploadPanelProps {
  uploadsLog: UploadsLog
  recordUpload: (kind: keyof UploadsLog, files: File[]) => void
}

const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i

// Bottom Sheet 방식의 단일 컴포넌트. 접힌 한 줄 바가 화면 최하단에
// sticky로 고정돼 있고, 펼치면 그 바로 위에서 내용이 위로 자라난다 --
// 별도 모달이나 배경 딤 처리 없이, 필요하면 그냥 과제 목록 위를 덮는다.
// 바(요약 chips)와 펼침 영역(업로드/초기화)을 서로 다른 컴포넌트로
// 쪼개지 않고 이 한 파일 안에서 함께 관리한다. uploadsLog는 각 탭
// 타이틀의 개별 업로드와도 공유해야 하므로 DataStage에서 props로 받는다.
export default function DataUploadPanel({ uploadsLog, recordUpload }: DataUploadPanelProps) {
  const { state, dispatch } = useAppState()
  const { tasks, members, peerReviews } = state

  const hasData = tasks.length > 0 || members.length > 0 || peerReviews.length > 0
  const [expanded, setExpanded] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const isBusy = loadingLabel !== null

  async function handleBulkFiles(files: File[]) {
    if (files.length === 0) return
    setBulkSummary(null)
    setLoadingLabel(`파일 ${files.length}개 확인 중...`)

    // Sort into buckets by kind first, then always parse task -> member -> peer
    // regardless of drop/selection order -- peer review rows look up members
    // by name, so if a peer file happened to be processed before the member
    // file it was uploaded alongside, every lookup would fail against the
    // not-yet-updated member list.
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
    if (taskFiles.length > 0) {
      dispatch({ type: 'IMPORT_TASKS', payload: taskList })
      recordUpload('task', taskFiles)
    }

    let memberList = members
    for (const file of memberFiles) {
      const result = parseMemberWorkbook(await file.arrayBuffer(), memberList)
      memberList = result.members
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
    }
    if (memberFiles.length > 0) {
      dispatch({ type: 'IMPORT_MEMBERS', payload: memberList })
      recordUpload('member', memberFiles)
    }

    let peerList = peerReviews
    for (const file of peerFiles) {
      const result = parsePeerReviewWorkbook(await file.arrayBuffer(), memberList, peerList)
      peerList = result.peerReviews
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
    }
    if (peerFiles.length > 0) {
      dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: peerList })
      recordUpload('peer', peerFiles)
    }

    setBulkSummary({ addedCount, updatedCount, errors })
    setLoadingLabel(null)
  }

  async function handleZipDownload() {
    setLoadingLabel('양식 압축 중...')
    await downloadAllTemplatesZip(members)
    setLoadingLabel(null)
  }

  function onBulkInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    handleBulkFiles(files)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (isBusy) return
    const files = Array.from(e.dataTransfer.files).filter((f) => FILE_NAME_PATTERN.test(f.name))
    handleBulkFiles(files)
  }

  function handleResetConfirm() {
    dispatch({ type: 'RESET_ALL' })
    setResetDialogOpen(false)
    setExpanded(false)
  }

  return (
    <div className="sticky bottom-0 z-10 mt-5 bg-white">
      {/* 펼침 영역 -- 바로 아래의 바를 기준으로 위로 자라난다. */}
      <div
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${
          expanded ? 'max-h-[70vh]' : 'max-h-0'
        }`}
      >
        <div className="mb-3 space-y-3 rounded-md border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-black">통합 업로드</p>
              <p className="text-xs text-gray-400">과제·팀원·피어리뷰가 섞인 파일을 한 번에 올리거나 전체 데이터를 초기화합니다.</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {isBusy && (
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Spinner className="h-3.5 w-3.5 text-accent" />
                  {loadingLabel}
                </span>
              )}
              <button
                onClick={handleZipDownload}
                disabled={isBusy}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                전체 양식 ZIP 다운로드
              </button>
              <button
                onClick={() => bulkInputRef.current?.click()}
                disabled={isBusy}
                className="rounded-md border-2 border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                전체 일괄 업로드
              </button>
              <input
                ref={bulkInputRef}
                id="data-mgmt-bulk-input"
                type="file"
                accept=".xlsx,.xls"
                multiple
                className="hidden"
                onChange={onBulkInputChange}
              />
            </div>
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
              isDragOver ? 'border-accent bg-orange-50' : 'border-gray-300 bg-white hover:bg-gray-50'
            } ${isBusy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-gray-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <p className="text-sm text-gray-600">파일을 여기에 드래그 (과제·팀원·피어리뷰 모두 가능)</p>
            <p className="text-xs text-gray-400">여러 파일 동시 업로드 가능 (.xlsx) · 내용을 보고 자동으로 종류를 구분합니다</p>
          </div>

          {bulkSummary && (
            <div
              className={`rounded-md border px-4 py-3 ${
                bulkSummary.errors.length > 0 ? 'border-danger/30 bg-red-50' : 'border-success/30 bg-green-50'
              }`}
            >
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
                <button
                  onClick={() => setBulkSummary(null)}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-black hover:bg-gray-100"
                >
                  닫기
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-red-50 px-4 py-3">
            <button
              onClick={() => setResetDialogOpen(true)}
              disabled={!hasData}
              className="flex shrink-0 items-center gap-1.5 rounded-md border-2 border-danger bg-white px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              데이터 초기화
            </button>
            <p className="text-xs text-danger">
              전체 초기화가 필요하면 사용하세요. 과제·팀원·피어리뷰 및 평가 <span className="font-semibold">데이터를 모두 삭제</span>하고 빈 상태로 되돌립니다.
            </p>
          </div>
        </div>
      </div>

      {/* 접힌 한 줄 바 -- 항상 화면 최하단에 고정. */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 overflow-hidden rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100"
      >
        {hasData ? (
          <>
            <span className="shrink-0 text-xs font-medium text-gray-500">데이터 :</span>
            {(
              [
                { key: 'task' as const, count: tasks.length, fallback: `과제 ${tasks.length}건` },
                { key: 'member' as const, count: members.length, fallback: `팀원 ${members.length}명` },
                { key: 'peer' as const, count: peerReviews.length, fallback: `피어리뷰 ${peerReviews.length}건` },
              ] as { key: keyof UploadsLog; count: number; fallback: string }[]
            )
              .filter((item) => item.count > 0)
              .map((item) => {
                const record = uploadsLog[item.key]
                return (
                  <span
                    key={item.key}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-black"
                  >
                    {record ? (
                      <>
                        <span>{record.name}</span>
                        <span className="text-gray-400">{record.date}</span>
                      </>
                    ) : (
                      <span>{item.fallback}</span>
                    )}
                  </span>
                )
              })}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-gray-500">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m17 8-5-5-5 5" />
              <path d="M12 3v12" />
            </svg>
            <span className="shrink-0 text-sm font-medium text-gray-600">통합 업로드</span>
            <span className="truncate text-xs text-gray-400">— 과제·팀원·피어리뷰 데이터를 한 번에 업로드하거나 초기화</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        )}
      </button>

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

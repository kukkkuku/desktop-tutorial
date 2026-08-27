import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppState } from '../state/AppContext'
import { detectWorkbookKind, downloadAllTemplatesZip, parseMemberWorkbook, parsePeerReviewWorkbook, parseTaskWorkbook } from '../utils/excel'
import PromotionHistoryImportModal from './promotion/PromotionHistoryImportModal'
import Button from './Button'
import Spinner from './Spinner'

const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i

interface BulkSummary {
  addedCount: number
  updatedCount: number
  errors: string[]
}

// 과제·팀원·피어리뷰가 섞인 파일을 한 번에 올리는 블록 -- 데이터 관리 드로어의
// "로컬 파일" 탭과 빠른 시작 팝업의 "Excel로 시작" 탭 양쪽에서 그대로 쓴다.
//
// onDone -- 빠른 시작 팝업에서만 넘어온다("직접 입력"/"이전 평가 가져오기"
// 탭처럼 업로드가 끝났을 때 과제관리 탭으로 이동시키는 콜백). 데이터 관리
// 드로어에서 쓸 때는 넘기지 않아, 그 화면에서는 지금처럼 배너만 뜨고 그
// 자리에 머무른다.
export default function BulkUploadPanel({ onDone }: { onDone?: () => void } = {}) {
  const { state, dispatch } = useAppState()
  const { tasks, members, peerReviews } = state
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const isBusy = loadingLabel !== null
  // "이전 성과" 파일은 이름으로 팀원을 찾아 연결해야 하고 동명이인이면
  // 골라야 해서, 다른 종류처럼 바로 반영하지 않고 확인 팝업(같은 로직을
  // 쓰는 인사평가 이력 가져오기)으로 넘긴다.
  const [historyFile, setHistoryFile] = useState<File | null>(null)

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
    const historyFiles: File[] = []
    const errors: string[] = []

    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const kind = detectWorkbookKind(buffer)
      if (kind === 'task') taskFiles.push(file)
      else if (kind === 'member') memberFiles.push(file)
      else if (kind === 'peer') peerFiles.push(file)
      else if (kind === 'history') historyFiles.push(file)
      else errors.push(`[${file.name}] 과제·팀원·피어리뷰·이전 성과 양식 중 어떤 것인지 인식하지 못했습니다.`)
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
      const result = parsePeerReviewWorkbook(await file.arrayBuffer(), taskList, memberList, peerList)
      peerList = result.peerReviews
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
    }
    if (peerFiles.length > 0) dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: peerList })

    if (historyFiles.length > 1) {
      errors.push('이전 성과 파일은 한 번에 하나씩만 확인 팝업에서 처리할 수 있습니다. 첫 번째 파일만 열었습니다.')
    }

    setBulkSummary({ addedCount, updatedCount, errors })
    setLoadingLabel(null)
    if (historyFiles.length > 0) setHistoryFile(historyFiles[0])
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

  return (
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
            <div className="flex shrink-0 gap-2">
              {onDone && (bulkSummary.addedCount > 0 || bulkSummary.updatedCount > 0) && (
                <button
                  onClick={onDone}
                  className="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  완료 · 과제관리에서 확인
                </button>
              )}
              <button onClick={() => setBulkSummary(null)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-black hover:bg-gray-100">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {historyFile && (
        <PromotionHistoryImportModal
          initialFile={historyFile}
          onClose={() => {
            setHistoryFile(null)
            onDone?.()
          }}
        />
      )}
    </div>
  )
}

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppState } from '../state/AppContext'
import Spinner from './Spinner'
import {
  downloadTaskTemplate,
  downloadMemberTemplate,
  downloadPeerReviewTemplate,
  downloadAllTemplatesZip,
  parseTaskWorkbook,
  parseMemberWorkbook,
  parsePeerReviewWorkbook,
  detectWorkbookKind,
} from '../utils/excel'

interface DataManagementPanelProps {
  onClose: () => void
}

interface BulkSummary {
  addedCount: number
  updatedCount: number
  errors: string[]
}

const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i

export default function DataManagementPanel({ onClose }: DataManagementPanelProps) {
  const { state, dispatch } = useAppState()
  const { tasks, members, peerReviews } = state

  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const taskInputRef = useRef<HTMLInputElement>(null)
  const memberInputRef = useRef<HTMLInputElement>(null)
  const peerInputRef = useRef<HTMLInputElement>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const isBusy = loadingLabel !== null

  async function handleTaskFiles(files: File[]) {
    if (files.length === 0) return
    setBulkSummary(null)
    setLoadingLabel('과제 업로드 중...')
    let list = tasks
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const result = parseTaskWorkbook(buffer, list)
      list = result.tasks
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => (files.length > 1 ? `[${file.name}] ${m}` : m)))
    }
    dispatch({ type: 'IMPORT_TASKS', payload: list })
    setBulkSummary({ addedCount, updatedCount, errors })
    setLoadingLabel(null)
  }

  async function handleMemberFiles(files: File[]) {
    if (files.length === 0) return
    setBulkSummary(null)
    setLoadingLabel('팀원 업로드 중...')
    let list = members
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const result = parseMemberWorkbook(buffer, list)
      list = result.members
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => (files.length > 1 ? `[${file.name}] ${m}` : m)))
    }
    dispatch({ type: 'IMPORT_MEMBERS', payload: list })
    setBulkSummary({ addedCount, updatedCount, errors })
    setLoadingLabel(null)
  }

  async function handlePeerFiles(files: File[]) {
    if (files.length === 0) return
    setBulkSummary(null)
    setLoadingLabel('피어리뷰 업로드 중...')
    let list = peerReviews
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const result = parsePeerReviewWorkbook(buffer, members, list)
      list = result.peerReviews
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => (files.length > 1 ? `[${file.name}] ${m}` : m)))
    }
    dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: list })
    setBulkSummary({ addedCount, updatedCount, errors })
    setLoadingLabel(null)
  }

  async function handleBulkFiles(files: File[]) {
    if (files.length === 0) return
    setBulkSummary(null)
    setLoadingLabel(`파일 ${files.length}개 확인 중...`)

    let taskList = tasks
    let memberList = members
    let peerList = peerReviews
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    let touchedTask = false
    let touchedMember = false
    let touchedPeer = false

    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const kind = detectWorkbookKind(buffer)
      if (kind === 'task') {
        const result = parseTaskWorkbook(buffer, taskList)
        taskList = result.tasks
        addedCount += result.addedCount
        updatedCount += result.updatedCount
        errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
        touchedTask = true
      } else if (kind === 'member') {
        const result = parseMemberWorkbook(buffer, memberList)
        memberList = result.members
        addedCount += result.addedCount
        updatedCount += result.updatedCount
        errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
        touchedMember = true
      } else if (kind === 'peer') {
        const result = parsePeerReviewWorkbook(buffer, memberList, peerList)
        peerList = result.peerReviews
        addedCount += result.addedCount
        updatedCount += result.updatedCount
        errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
        touchedPeer = true
      } else {
        errors.push(`[${file.name}] 과제·팀원·피어리뷰 양식 중 어떤 것인지 인식하지 못했습니다.`)
      }
    }

    if (touchedTask) dispatch({ type: 'IMPORT_TASKS', payload: taskList })
    if (touchedMember) dispatch({ type: 'IMPORT_MEMBERS', payload: memberList })
    if (touchedPeer) dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: peerList })

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

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-black">통합 데이터 관리</h2>
            <p className="mt-0.5 text-xs text-gray-500">과제·팀원·피어리뷰를 한 번에 처리합니다.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="데이터 관리 닫기"
            className="flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { label: '과제', onDownload: downloadTaskTemplate, ref: taskInputRef, onFiles: handleTaskFiles },
            { label: '팀원', onDownload: downloadMemberTemplate, ref: memberInputRef, onFiles: handleMemberFiles },
            {
              label: '피어리뷰',
              onDownload: () => downloadPeerReviewTemplate(members),
              ref: peerInputRef,
              onFiles: handlePeerFiles,
            },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
              <span className="flex-1 text-sm font-medium text-black">{item.label}</span>
              <button
                onClick={item.onDownload}
                disabled={isBusy}
                title={`${item.label} 양식 다운로드`}
                aria-label={`${item.label} 양식 다운로드`}
                className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
              </button>
              <button
                onClick={() => item.ref.current?.click()}
                disabled={isBusy}
                title={`${item.label} 업로드`}
                aria-label={`${item.label} 업로드`}
                className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 21V9" />
                  <path d="m7 14 5-5 5 5" />
                  <path d="M5 3h14" />
                </svg>
              </button>
              <input
                ref={item.ref}
                type="file"
                accept=".xlsx,.xls"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  item.onFiles(files)
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={handleZipDownload}
            disabled={isBusy}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            전체 양식 ZIP 다운로드
          </button>
          <button
            onClick={() => bulkInputRef.current?.click()}
            disabled={isBusy}
            className="rounded-md border-2 border-accent bg-white px-3 py-2 text-sm font-semibold text-accent hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
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
          {isBusy && (
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner className="h-4 w-4 text-accent" />
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
          className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
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
            className={`mt-3 rounded-md border px-4 py-3 ${
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
      </div>
    </div>
  )
}

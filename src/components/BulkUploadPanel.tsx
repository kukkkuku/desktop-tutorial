import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useAppState } from '../state/AppContext'
import {
  detectWorkbookKind,
  downloadAllTemplatesZip,
  downloadTemplates,
  parseMemberWorkbook,
  parsePeerReviewWorkbook,
  parseTaskWorkbook,
  type WorkbookKind,
} from '../utils/excel'
import { PromotionHistoryImportPanel } from './promotion/PromotionHistoryImportModal'
import Button from './Button'
import Spinner from './Spinner'

const FILE_NAME_PATTERN = /\.(xlsx|xls)$/i

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

const TEMPLATE_INFO: { kind: WorkbookKind; name: string; description: string }[] = [
  { kind: 'task', name: '과제 입력 양식', description: '과제명·과제등급·업무량·목표·성과' },
  { kind: 'member', name: '팀원 입력 양식', description: '이름·직급·연차·역할' },
  { kind: 'history', name: '이전 성과 입력 양식', description: '팀원별 최근 5년 업적·역량 이력' },
  { kind: 'peer', name: '피어리뷰 입력 양식', description: '과제별 리뷰어·대상팀원·기여도·근거' },
]

interface KindSummary {
  label: string
  addedCount: number
  updatedCount: number
  errorCount: number
}

interface BulkSummary {
  // 종류별(과제/팀원/피어리뷰)로 나눠서 칩으로 보여준다 -- 하나로 합친
  // "신규 N건 추가"만 보여주면 피어리뷰처럼 특정 종류만 올렸을 때 뭐가
  // 반영됐는지 이름이 전혀 안 보여서 "인사평가 얘기만 하네" 식으로 헷갈릴
  // 수 있다. 이번 배치에 실제로 올라온 종류만 담는다(안 올린 종류는 표시
  // 안 함) -- 종류가 최대 3개(과제/팀원/피어리뷰)뿐이라 칩으로 늘어놔도
  // 스크롤 없이 한눈에 들어온다.
  kinds: KindSummary[]
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
  const [selectedKinds, setSelectedKinds] = useState<Set<WorkbookKind>>(new Set())
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

    const kinds: KindSummary[] = []

    let taskList = tasks
    if (taskFiles.length > 0) {
      let addedCount = 0
      let updatedCount = 0
      let errorCount = 0
      for (const file of taskFiles) {
        const result = parseTaskWorkbook(await file.arrayBuffer(), taskList)
        taskList = result.tasks
        addedCount += result.addedCount
        updatedCount += result.updatedCount
        errorCount += result.errors.length
        errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
      }
      dispatch({ type: 'IMPORT_TASKS', payload: taskList })
      kinds.push({ label: '과제', addedCount, updatedCount, errorCount })
    }

    let memberList = members
    if (memberFiles.length > 0) {
      let addedCount = 0
      let updatedCount = 0
      let errorCount = 0
      for (const file of memberFiles) {
        const result = parseMemberWorkbook(await file.arrayBuffer(), memberList)
        memberList = result.members
        addedCount += result.addedCount
        updatedCount += result.updatedCount
        errorCount += result.errors.length
        errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
      }
      dispatch({ type: 'IMPORT_MEMBERS', payload: memberList })
      kinds.push({ label: '팀원', addedCount, updatedCount, errorCount })
    }

    if (peerFiles.length > 0) {
      let addedCount = 0
      let updatedCount = 0
      let errorCount = 0
      let peerList = peerReviews
      for (const file of peerFiles) {
        const result = parsePeerReviewWorkbook(await file.arrayBuffer(), taskList, memberList, peerList)
        peerList = result.peerReviews
        addedCount += result.addedCount
        updatedCount += result.updatedCount
        errorCount += result.errors.length
        errors.push(...result.errors.map((m) => `[${file.name}] ${m}`))
      }
      dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: peerList })
      kinds.push({ label: '피어리뷰', addedCount, updatedCount, errorCount })
    }

    if (historyFiles.length > 1) {
      errors.push('이전 성과 파일은 한 번에 하나씩만 확인 팝업에서 처리할 수 있습니다. 첫 번째 파일만 열었습니다.')
    }

    setBulkSummary({ kinds, errors })
    setLoadingLabel(null)
    if (historyFiles.length > 0) setHistoryFile(historyFiles[0])
  }

  async function handleZipDownload() {
    setLoadingLabel('양식 압축 중...')
    await downloadAllTemplatesZip(tasks, members)
    setLoadingLabel(null)
  }

  async function handleDownloadOne(kind: WorkbookKind) {
    setLoadingLabel('양식 다운로드 중...')
    await downloadTemplates([kind], tasks, members)
    setLoadingLabel(null)
  }

  async function handleDownloadSelected() {
    if (selectedKinds.size === 0) return
    setLoadingLabel('양식 다운로드 중...')
    await downloadTemplates(Array.from(selectedKinds), tasks, members)
    setLoadingLabel(null)
  }

  function toggleKind(kind: WorkbookKind) {
    setSelectedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
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
        <p className="mt-0.5 text-xs text-gray-500">과제·팀원·이전 성과·피어리뷰 파일을 함께 올리면 데이터 종류를 자동으로 구분합니다.</p>
      </div>

      {/* 왼쪽(양식)보다 오른쪽(업로드)이 실제로 더 많이 쓰는 영역이라 조금
          더 넓게 배정하지만(5:7), 문구가 잘리지 않도록 왼쪽도 충분히
          넓힌다. 각 양식은 카드 전체를 눌러 선택되는 큰 히트 영역 +
          우측의 큼직한 체크 아이콘으로, 작은 네이티브 체크박스보다 훨씬
          누르기 쉽게 만들었다. */}
      <div className="grid gap-4 md:grid-cols-12">
        <div className="md:col-span-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-black">양식 다운로드</p>
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={handleDownloadSelected}
                disabled={isBusy || selectedKinds.size === 0}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 다운로드{selectedKinds.size > 0 && ` (${selectedKinds.size})`}
              </button>
              <Button variant="secondary" onClick={handleZipDownload} disabled={isBusy} className="px-2 py-1 text-xs">
                전체 ZIP
              </Button>
            </div>
          </div>

          <ul className="space-y-2">
            {TEMPLATE_INFO.map((t) => {
              const checked = selectedKinds.has(t.kind)
              return (
                <li key={t.kind}>
                  <div
                    role="checkbox"
                    aria-checked={checked}
                    tabIndex={0}
                    onClick={() => toggleKind(t.kind)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleKind(t.kind)
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors ${
                      checked ? 'border-accent bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${checked ? 'bg-accent text-white' : 'bg-gray-100 text-gray-400'}`}>
                      <DocumentIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-black">{t.name}</p>
                      <p className="text-xs leading-snug text-gray-500">{t.description}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownloadOne(t.kind)
                      }}
                      disabled={isBusy}
                      className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      다운로드
                    </button>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        checked ? 'border-accent bg-accent text-white' : 'border-gray-300 bg-white text-transparent'
                      }`}
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="md:col-span-7 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-black">작성한 양식 업로드</p>
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
            <p className="text-sm text-gray-600">작성한 양식 파일을 여기에 드래그</p>
            <p className="text-xs text-gray-400">여러 Excel 파일 동시 업로드 가능 (.xlsx)</p>
          </div>
          <input ref={bulkInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onBulkInputChange} />

          {/* 종류가 많아야 3개(과제/팀원/피어리뷰)뿐이라 칩으로 늘어놔도
              스크롤 없이 한 줄 안에 다 들어온다 -- 파일별 목록 대신 종류별로
              모아서 보여주는 이유는 위 BulkSummary 주석 참고. */}
          {bulkSummary && (
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {bulkSummary.kinds.length === 0 ? (
                  <span className="text-sm text-gray-400">변경된 건이 없습니다.</span>
                ) : (
                  bulkSummary.kinds.map((k) => (
                    <span
                      key={k.label}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        k.errorCount > 0 ? 'bg-red-50 text-danger' : 'bg-success/10 text-success'
                      }`}
                    >
                      {k.label} {k.addedCount + k.updatedCount}건
                      {k.errorCount > 0 && ` · 오류 ${k.errorCount}`}
                    </span>
                  ))
                )}
                <div className="ml-auto flex shrink-0 gap-2">
                  {onDone && bulkSummary.kinds.some((k) => k.addedCount > 0 || k.updatedCount > 0) && (
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
                  <button
                    onClick={() => setBulkSummary(null)}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-black hover:bg-gray-100"
                  >
                    닫기
                  </button>
                </div>
              </div>
              {bulkSummary.errors.length > 0 && (
                <>
                  <p className="mt-2 text-xs font-semibold text-danger">{bulkSummary.errors.length}건 오류</p>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-danger">
                    {bulkSummary.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 이전 성과 파일은 별도 팝업으로 또 띄우지 않고 이 화면 안에 그대로
          이어 붙인다 -- 위 드롭존이 계속 보이므로 파일을 더 추가하고
          싶으면 팝업을 닫을 필요 없이 바로 더 올릴 수 있다. */}
      {historyFile && (
        <div className="rounded-lg border border-gray-200 p-4">
          <PromotionHistoryImportPanel
            initialFile={historyFile}
            onApplied={() => {
              setHistoryFile(null)
              onDone?.()
            }}
            onDismiss={() => setHistoryFile(null)}
          />
        </div>
      )}
    </div>
  )
}

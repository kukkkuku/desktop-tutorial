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
import { matchToMembers, parsePromotionHistoryWorkbook, type PromotionImportMatch } from '../utils/promotionImport'
import { useApplyPromotionHistory, type PromotionManualPicks } from '../hooks/useApplyPromotionHistory'
import DuplicateNameDialog from './promotion/DuplicateNameDialog'
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
  // 과제·팀원·피어리뷰는 "건"으로 세지만 인사평가 이력은 팀원 단위라
  // "명"으로 보여준다.
  unit?: string
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
// wide -- 좌우 2단(양식 목록/업로드) 레이아웃을 쓸지 여부. 빠른 시작
// 팝업(max-w-5xl, 1024px)은 충분히 넓어서 켜지만, 데이터 관리 드로어의
// "로컬 파일" 탭(max-w-lg, 512px)은 같은 md: 브레이크포인트에서 2단을
// 강제로 욱여넣으면 왼쪽 칼럼이 너무 좁아져 텍스트가 한 글자씩 세로로
// 줄바꿈됐다 -- Tailwind의 md:는 뷰포트 기준이라 이 컴포넌트를 감싸는
// 컨테이너가 좁은지 넓은지는 구분 못 하므로, 호출하는 쪽이 직접 알려준다.
export default function BulkUploadPanel({ onDone, wide = false }: { onDone?: () => void; wide?: boolean } = {}) {
  const { state, dispatch } = useAppState()
  const { tasks, members, peerReviews } = state
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedKinds, setSelectedKinds] = useState<Set<WorkbookKind>>(new Set())
  const bulkInputRef = useRef<HTMLInputElement>(null)
  const isBusy = loadingLabel !== null
  const applyPromotionHistory = useApplyPromotionHistory()
  // "이전 성과"(인사평가 이력) 파일은 이름만 맞으면 다른 종류와 똑같이 화면
  // 없이 바로 반영한다. 예전에는 매칭 미리보기 패널을 이 화면에 이어 붙여
  // 사용자가 한 번 더 "적용"을 눌러야 했는데, 자동으로 이름을 맞추는 일이라
  // 사실상 확인할 게 없었다. 다만 같은 이름의 팀원이 둘 이상이면 앱이 정할
  // 수 없으므로, 그 이름들에 대해서만 아래 확인 창을 띄운다.
  // 동명이인 행만 따로 담는다(이미 반영된 행은 빼고) -- 확인 창에서 고른 뒤
  // 이 배열에만 다시 적용해야 자동 반영분이 중복으로 세어지지 않는다.
  const [duplicateNames, setDuplicateNames] = useState<PromotionImportMatch[] | null>(null)

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

    // 인사평가 이력은 이름 기준 자동 매칭이라 확인 화면 없이 바로 반영한다.
    // 팀원 파일이 같은 배치에 있었다면 위에서 이미 반영됐으므로, 방금 추가된
    // 팀원한테도 이력이 붙는다(memberList로 매칭).
    let pendingDuplicates: PromotionImportMatch[] | null = null
    if (historyFiles.length > 1) {
      errors.push('인사평가 이력 파일은 한 번에 하나씩만 처리할 수 있습니다. 첫 번째 파일만 반영했습니다.')
    }
    if (historyFiles.length > 0) {
      const file = historyFiles[0]
      try {
        const sheets = parsePromotionHistoryWorkbook(await file.arrayBuffer())
        if (sheets.length === 0) {
          errors.push(`[${file.name}] 팀원별 인사평가 데이터를 찾지 못했습니다.`)
        } else {
          const matches = matchToMembers(sheets, memberList)
          // picks를 비워 부르면 자동 연결된 행(동명이인이 아닌 행)만 반영된다.
          const result = applyPromotionHistory(matches, {}, true)
          const unmatched = matches.filter((m) => !m.member && m.candidates.length === 0).length
          if (unmatched > 0) {
            errors.push(`[${file.name}] 이름이 일치하는 팀원이 없어 ${unmatched}명은 건너뛰었습니다.`)
          }
          if (result.memberCount > 0) {
            kinds.push({ label: '인사평가', addedCount: result.memberCount, updatedCount: 0, errorCount: 0, unit: '명' })
          }
          // 동명이인은 위 자동 적용에서 빠져 있다 -- 사용자가 고른 뒤에 따로 반영한다.
          const ambiguous = matches.filter((m) => !m.member && m.candidates.length > 1)
          if (ambiguous.length > 0) pendingDuplicates = ambiguous
        }
      } catch {
        errors.push(`[${file.name}] 파일을 읽는 중 문제가 발생했습니다.`)
      }
    }

    setBulkSummary({ kinds, errors })
    setLoadingLabel(null)
    if (pendingDuplicates) setDuplicateNames(pendingDuplicates)
  }

  // 동명이인 확인 창에서 고른 팀원에게만 추가로 이력을 반영하고, 하단 요약의
  // "인사평가 N명"을 그만큼 올려준다.
  function handleDuplicatesConfirmed(picks: PromotionManualPicks) {
    if (!duplicateNames) return
    const result = applyPromotionHistory(duplicateNames, picks, true)
    setDuplicateNames(null)
    if (result.memberCount === 0) return
    setBulkSummary((prev) => {
      if (!prev) return prev
      const existing = prev.kinds.find((k) => k.label === '인사평가')
      if (existing) {
        return {
          ...prev,
          kinds: prev.kinds.map((k) =>
            k.label === '인사평가' ? { ...k, addedCount: k.addedCount + result.memberCount } : k,
          ),
        }
      }
      return {
        ...prev,
        kinds: [...prev.kinds, { label: '인사평가', addedCount: result.memberCount, updatedCount: 0, errorCount: 0, unit: '명' }],
      }
    })
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

      {/* wide일 때만 좌우 2단(5:7, 왼쪽도 문구가 안 잘릴 만큼 넉넉히).
          좁은 컨테이너(데이터 관리 드로어 등)에서는 세로로 쌓는다. 각
          양식은 카드 전체를 눌러 선택되는 큰 히트 영역 + 우측의 큼직한
          체크 아이콘으로, 작은 네이티브 체크박스보다 훨씬 누르기 쉽게
          만들었다. */}
      <div className={wide ? 'grid gap-4 md:grid-cols-12' : 'space-y-4'}>
        <div className={wide ? 'md:col-span-5 space-y-2' : 'space-y-2'}>
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

        <div className={wide ? 'md:col-span-7 space-y-2' : 'space-y-2'}>
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
        </div>
      </div>

      {/* 업로드 결과는 양식 목록·드롭존 아래, 이 화면 제일 하단에 둔다 --
          예전에는 오른쪽 업로드 칼럼 안에 있어서 왼쪽 양식 목록 높이에 따라
          중간에 끼어 보였다. 종류가 많아야 4개(과제/팀원/피어리뷰/인사평가)뿐이라
          칩으로 늘어놔도 스크롤 없이 한 줄 안에 다 들어온다. */}
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
                  {k.label} {k.addedCount + k.updatedCount}
                  {k.unit ?? '건'}
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
                  적용 완료 · 시작하기
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

      {/* 인사평가 이력은 화면 없이 자동 반영되고, 같은 이름의 팀원이 둘 이상일
          때만 이 확인 창이 뜬다. */}
      {duplicateNames && (
        <DuplicateNameDialog
          matches={duplicateNames}
          onConfirm={handleDuplicatesConfirmed}
          onSkip={() => setDuplicateNames(null)}
        />
      )}
    </div>
  )
}

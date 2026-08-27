import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import ConfirmDialog from './ConfirmDialog'
import { parseTaskWorkbook } from '../utils/excel'

interface HistoryImportProps {
  onComplete?: () => void
}

export default function HistoryImport({ onComplete }: HistoryImportProps) {
  const { state, dispatch } = useAppState()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [duplicateNameWarning, setDuplicateNameWarning] = useState<string | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const buffer = await file.arrayBuffer()
    const result = parseTaskWorkbook(buffer, state.tasks)

    dispatch({ type: 'IMPORT_TASKS', payload: result.tasks })

    // Check for duplicate names (동명이인) in imported members
    if (result.tasks.length > 0) {
      const importedNames = new Set(result.tasks.map(t => t.name))
      const existingNames = new Set(state.members.map(m => m.name))
      const duplicates = Array.from(importedNames).filter(name => existingNames.has(name))

      if (duplicates.length > 0) {
        setDuplicateNameWarning(
          duplicates.length === 1
            ? `'${duplicates[0]}' 이름이 이미 존재합니다. 확인하시겠습니까?`
            : `${duplicates.length}명의 동명이인이 발견되었습니다. 확인하시겠습니까?`
        )
      }
    }
  }

  const taskCount = state.tasks.length
  const memberCount = state.members.length
  const reviewCount = Object.values(state.peerReviews).flat().length

  return (
    <div className="bg-white flex flex-col w-full">
      {/* Header Tabs */}
      <div className="border-b border-gray-200 flex gap-6 px-6 py-3">
        <button className="flex flex-col gap-1 pb-3 border-b-2 border-gray-400 text-gray-500">
          <p className="text-base font-bold">직접 입력</p>
          <p className="text-xs">선택한 영역에 이름을 빠르게 등록</p>
        </button>
        <button className="flex flex-col gap-1 pb-3 border-b-2 border-blue-600 text-blue-600">
          <p className="text-base font-bold">Excel로 시작</p>
          <p className="text-xs">통합 양식으로 내려받고 일괄 등록</p>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex gap-6 px-6 py-4">
        {/* Left Column - Upload (Wider) */}
        <div className="flex-1 flex flex-col gap-4">
          <p className="text-base font-bold text-gray-900">작성한 양식 업로드</p>

          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50"
          >
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-center text-xs font-bold text-gray-900">작성한 양식 파일을 여기에 드래그</p>
            <div className="text-center text-xs text-gray-600">
              <p>과제·팀원·이전 성과·피어리뷰 파일을 함께 올리면 데이터 종류를 자동으로 구분합니다.</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelected}
          />

        </div>

        {/* Right Column - Download Templates (Narrow Sidebar) */}
        <div className="w-72 flex flex-col gap-3 bg-gray-50 px-5 py-4 rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">양식 다운로드</p>
            <div className="flex gap-1.5">
              <button className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-white">
                선택 다운로드
              </button>
              <button className="rounded-lg border-2 border-black bg-white px-2 py-1 text-xs font-bold text-black hover:bg-gray-50">
                전체 ZIP
              </button>
            </div>
          </div>

          {/* Template Cards */}
          <div className="flex flex-col gap-2">
            {/* Task */}
            <div className="flex gap-2 rounded-lg border border-gray-200 bg-white p-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 flex-shrink-0">
                <svg className="h-4 w-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">과제 입력 양식</p>
                <p className="text-xs text-gray-600">과제명·과제등급·업무량·목표·성과</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50 flex-shrink-0">
                다운로드
              </button>
            </div>

            {/* Member */}
            <div className="flex gap-2 rounded-lg border border-gray-200 bg-white p-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 flex-shrink-0">
                <svg className="h-4 w-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">팀원 입력 양식</p>
                <p className="text-xs text-gray-600">이름·직급·연차·역할</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50 flex-shrink-0">
                다운로드
              </button>
            </div>

            {/* History - Highlighted */}
            <div className="flex gap-2 rounded-lg border-2 border-blue-600 bg-white p-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 flex-shrink-0">
                <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">이전 성과 입력 양식</p>
                <p className="text-xs text-gray-600">팀원별 최근 5년 업적·역량 이력</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50 flex-shrink-0">
                다운로드
              </button>
            </div>

            {/* Review */}
            <div className="flex gap-2 rounded-lg border border-gray-200 bg-white p-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 flex-shrink-0">
                <svg className="h-4 w-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">피어리뷰 입력 양식</p>
                <p className="text-xs text-gray-600">과제별 리뷰어·대상팀원·기여도·근거</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50 flex-shrink-0">
                다운로드
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Footer */}
      <div className="flex items-center justify-between px-8 py-3">
        <div className="flex gap-2">
          {taskCount > 0 && (
            <div className="rounded-lg bg-green-50 px-2.5 py-1.5">
              <p className="text-xs font-semibold text-green-700">과제 {taskCount}건</p>
            </div>
          )}
          {memberCount > 0 && (
            <div className="rounded-lg bg-green-50 px-2.5 py-1.5">
              <p className="text-xs font-semibold text-green-700">팀원 {memberCount}건</p>
            </div>
          )}
          {reviewCount > 0 && (
            <div className="rounded-lg bg-green-50 px-2.5 py-1.5">
              <p className="text-xs font-semibold text-green-700">피어리뷰 {reviewCount}건</p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onComplete}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            적용완료 / 시작
          </button>
          <button className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-900 hover:bg-gray-50">
            닫기
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={duplicateNameWarning !== null}
        title="동명이인 경고"
        message={duplicateNameWarning || ''}
        onConfirm={() => setDuplicateNameWarning(null)}
        onCancel={() => setDuplicateNameWarning(null)}
        isDangerous={false}
      />
    </div>
  )
}

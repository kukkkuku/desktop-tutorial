import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { parseTaskWorkbook } from '../utils/excel'

interface HistoryImportProps {
  onComplete?: () => void
  onClose?: () => void
}

export default function HistoryImport({ onComplete, onClose }: HistoryImportProps) {
  const { state, dispatch } = useAppState()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [connectedMembers, setConnectedMembers] = useState<Array<{ name: string; yearCount: number }>>([])
  const [applyMetadata, setApplyMetadata] = useState(true)
  const [connectedCount, setConnectedCount] = useState(0)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadedFile(file.name)
    const buffer = await file.arrayBuffer()
    const result = parseTaskWorkbook(buffer, state.tasks)

    dispatch({ type: 'IMPORT_TASKS', payload: result.tasks })

    // Simulate connected members for demo
    const members = [
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
    ]
    setConnectedMembers(members)
    setConnectedCount(members.length)
  }

  const taskCount = state.tasks.length
  const memberCount = state.members.length
  const reviewCount = Object.values(state.peerReviews).flat().length

  return (
    <div className="flex flex-col bg-white h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">빠른 시작</h1>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-6 px-8 py-6 overflow-hidden">
        {/* Left Column - Upload */}
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
          <p className="text-base font-bold text-gray-900">작성한 양식 업로드</p>

          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50"
          >
            <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-center text-sm font-bold text-gray-900">작성한 양식 파일을 여기에 드래그</p>
            <div className="text-center text-xs text-gray-600">
              <p>과제·팀원·이전 성과·피어리뷰 파일을 함께 올리면 데이터 종류를 자동으로 구분합니다.</p>
              <p>여러 Excel 파일 동시 업로드 가능 (.xlsx)</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelected}
          />

          {/* Import Modal Section */}
          {uploadedFile && (
            <div className="rounded-2xl border border-gray-200 bg-white p-8">
              <div className="mb-4">
                <p className="text-base font-bold text-gray-900">인사평가 이력 엑셀로 가져오기</p>
                <p className="mt-2 text-xs text-gray-600">
                  승진 시뮬레이션 Excel의 팀원별 연도별 평가등급(업적 상/하, 역량)과 승급심사일, 보조지표를 읽어, 이름이 일치하는 현재 팀원에게 바로 적용합니다.
                </p>
              </div>

              {/* File Info Row */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-2">
                  <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-900">{uploadedFile}</p>
                </div>
                <button className="text-xs font-semibold text-blue-600 hover:underline">다른 파일 선택</button>
              </div>

              {/* Matching Table */}
              <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-gray-50 p-3">
                {connectedMembers.map((member, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-green-600">연결됨</p>
                      <p className="text-xs text-gray-500">{member.yearCount}개 연도</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Checkbox and Apply Button */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={applyMetadata}
                    onChange={(e) => setApplyMetadata(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-blue-600 bg-blue-600 text-blue-600"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-700">
                      입사일 · 승급일 · 보조지표도 함께 적용
                    </p>
                    <p className="text-xs text-gray-500">
                      (팀원 상세정보에 해당 값이 비어있는 경우만)
                    </p>
                  </div>
                </div>
                <button className="rounded-lg bg-blue-600 px-8 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  {connectedCount}명에게 적용
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Download Templates */}
        <div className="w-80 flex flex-col gap-4 bg-gray-50 px-6 py-6 rounded-lg overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-gray-900">양식 다운로드</p>
            <div className="flex gap-2">
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-white">
                선택 다운로드
              </button>
              <button className="rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-gray-50">
                전체 ZIP
              </button>
            </div>
          </div>

          {/* Template Cards */}
          <div className="flex flex-col gap-3">
            {/* Task Template */}
            <div className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">과제 입력 양식</p>
                <p className="text-xs text-gray-600">과제명·과제등급·업무량·목표·성과</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50">
                다운로드
              </button>
            </div>

            {/* Member Template */}
            <div className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">팀원 입력 양식</p>
                <p className="text-xs text-gray-600">이름·직급·연차·역할</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50">
                다운로드
              </button>
            </div>

            {/* History Template - Highlighted */}
            <div className="flex gap-4 rounded-xl border-2 border-blue-600 bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">이전 성과 입력 양식</p>
                <p className="text-xs text-gray-600">팀원별 최근 5년 업적·역량 이력</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50">
                다운로드
              </button>
            </div>

            {/* Review Template */}
            <div className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">피어리뷰 입력 양식</p>
                <p className="text-xs text-gray-600">과제별 리뷰어·대상팀원·기여도·근거</p>
              </div>
              <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50">
                다운로드
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Footer Actions */}
      <div className="flex items-center justify-between px-8 py-4">
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
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-900 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

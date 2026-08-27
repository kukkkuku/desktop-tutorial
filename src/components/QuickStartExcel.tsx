import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import ImportFeedback from './ImportFeedback'
import {
  downloadTaskTemplate,
  downloadMemberTemplate,
  downloadPeerReviewTemplate,
  parseTaskWorkbook,
  type TaskImportResult,
} from '../utils/excel'

interface QuickStartExcelProps {
  onComplete?: () => void
}

export default function QuickStartExcel({ onComplete }: QuickStartExcelProps) {
  const { state, dispatch } = useAppState()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedTab, setSelectedTab] = useState<'direct' | 'excel'>('excel')
  const [importResult, setImportResult] = useState<TaskImportResult | null>(null)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [connectedMembers, setConnectedMembers] = useState<Array<{ name: string; yearCount: number }>>([])

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadedFile(file.name)
    const buffer = await file.arrayBuffer()
    const result = parseTaskWorkbook(buffer, state.tasks)

    dispatch({ type: 'IMPORT_TASKS', payload: result.tasks })
    setImportResult(result)

    // Simulate connected members for demo
    setConnectedMembers([
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
      { name: '정하늘', yearCount: 5 },
    ])
  }

  async function handleDownloadTemplate(type: 'task' | 'member' | 'review') {
    if (type === 'task') await downloadTaskTemplate()
    else if (type === 'member') await downloadMemberTemplate()
    else if (type === 'review') await downloadPeerReviewTemplate(state.members)
  }

  const taskCount = state.tasks.length
  const memberCount = state.members.length
  const reviewCount = Object.values(state.peerReviews).flat().length
  const historyCount = state.members.length

  return (
    <div className="flex flex-col bg-white">
      {/* Main Content */}
      <div className="flex gap-6 px-6 py-6">
        {/* Left Column - Upload */}
        <div className="flex flex-1 flex-col gap-6">
          {/* Tabs */}
          <div className="flex gap-12 border-b border-gray-200 pb-3">
            <button
              onClick={() => setSelectedTab('direct')}
              className={`flex flex-col gap-1 pb-3 ${
                selectedTab === 'direct'
                  ? 'border-b-2 border-black text-black'
                  : 'text-gray-500'
              }`}
            >
              <p className="text-base font-bold">직접 입력</p>
              <p className="text-xs">선택한 영역에 이름을 빠르게 등록</p>
            </button>
            <button
              onClick={() => setSelectedTab('excel')}
              className={`flex flex-col gap-1 pb-3 ${
                selectedTab === 'excel'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500'
              }`}
            >
              <p className="text-base font-bold">Excel로 시작</p>
              <p className="text-xs">통합 양식으로 내려받고 일괄 등록</p>
            </button>
          </div>

          {selectedTab === 'excel' && (
            <>
              {/* Upload Section */}
              <div>
                <p className="mb-3 text-base font-bold text-gray-900">작성한 양식 업로드</p>
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
              </div>

              {/* Import Modal Section */}
              {uploadedFile && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="mb-4">
                    <p className="text-base font-bold text-gray-900">인사평가 이력</p>
                    <p className="mt-1 text-xs text-gray-600">
                      승진 시뮬레이션 Excel의 팀원별 연도별 평가등급(업적 상/하, 역량)과 승급심사일, 보조지표를 읽어, 이름이 일치하는 현재 팀원에게 바로 적용합니다.
                    </p>
                  </div>

                  {/* File Info Row */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-2">
                      <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <p className="text-sm font-medium text-gray-900">{uploadedFile}</p>
                    </div>
                    <button className="text-xs font-semibold text-blue-600 hover:underline">다른 파일 선택</button>
                  </div>

                  {/* Matching Table */}
                  <div className="flex flex-wrap gap-2 rounded-lg bg-gray-50 p-3">
                    {connectedMembers.map((member, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-green-600">연결됨</p>
                          <p className="text-xs text-gray-500">{member.yearCount}개 연도</p>
                          <button className="text-xs text-gray-500">X</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult && (
                <ImportFeedback
                  addedCount={importResult.addedCount}
                  updatedCount={importResult.updatedCount}
                  errors={importResult.errors}
                  onDismiss={() => setImportResult(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Right Column - Download Templates */}
        <div className="flex w-80 flex-col gap-4 bg-gray-50 px-6 py-6 rounded-lg">
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
              <button
                onClick={() => handleDownloadTemplate('task')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
              >
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
              <button
                onClick={() => handleDownloadTemplate('member')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
              >
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
              <button
                onClick={() => handleDownloadTemplate('review')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
              >
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
              <button
                onClick={() => handleDownloadTemplate('review')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
              >
                다운로드
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-gray-200 px-8 py-3">
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
          {historyCount > 0 && (
            <div className="rounded-lg bg-green-50 px-2.5 py-1.5">
              <p className="text-xs font-semibold text-green-700">인사평가 이력 {historyCount}명</p>
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
    </div>
  )
}

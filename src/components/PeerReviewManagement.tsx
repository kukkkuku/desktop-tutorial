import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { PeerReview, PerformanceGrade } from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'
import { GRADE_COLORS } from '../utils/calculations'
import { useResizableColumns } from '../hooks/useResizableColumns'
import ConfirmDialog from './ConfirmDialog'
import ResizableTh from './table/ResizableTh'

const PEER_REVIEW_COLUMNS = {
  reviewer: 160,
  target: 160,
  grade: 100,
  manage: 100,
}

export default function PeerReviewManagement() {
  const { state, dispatch } = useAppState()
  const cols = useResizableColumns(PEER_REVIEW_COLUMNS)
  const [deletingReview, setDeletingReview] = useState<PeerReview | null>(null)

  const [newReviewerName, setNewReviewerName] = useState('')
  const [newTargetMemberId, setNewTargetMemberId] = useState('')
  const [newGrade, setNewGrade] = useState<PerformanceGrade>('B')
  const [newFormError, setNewFormError] = useState('')

  const memberNameById = new Map(state.members.map((m) => [m.id, m.name]))

  function handleQuickAdd() {
    const trimmedName = newReviewerName.trim()
    if (!trimmedName) {
      setNewFormError('작성자명을 입력하세요.')
      return
    }
    if (!newTargetMemberId) {
      setNewFormError('대상 팀원을 선택하세요.')
      return
    }
    const review: PeerReview = {
      id: uuidv4(),
      reviewerName: trimmedName,
      targetMemberId: newTargetMemberId,
      grade: newGrade,
    }
    dispatch({ type: 'ADD_PEER_REVIEW', payload: review })
    setNewReviewerName('')
    setNewTargetMemberId('')
    setNewGrade('B')
    setNewFormError('')
  }

  function handleDeleteConfirm() {
    if (deletingReview) {
      dispatch({ type: 'DELETE_PEER_REVIEW', payload: { id: deletingReview.id } })
      setDeletingReview(null)
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-black">피어리뷰 관리</h3>
      <p className="mt-1 text-sm text-gray-600">
        팀원이 서로에게 남긴 피어리뷰 등급입니다. 평가 기준의 피어리뷰 가중치가 0보다 클 때 평가 점수에 반영됩니다.
      </p>

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
          <div>
            <label className="block text-sm font-medium text-black">
              작성자 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={newReviewerName}
              onChange={(e) => setNewReviewerName(e.target.value)}
              placeholder="예: 김OO"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                newFormError ? 'border-danger' : 'border-gray-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">
              대상 팀원 <span className="text-danger">*</span>
            </label>
            <select
              value={newTargetMemberId}
              onChange={(e) => setNewTargetMemberId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            >
              <option value="">선택</option>
              {state.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black">등급</label>
            <select
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value as PerformanceGrade)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            >
              {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleQuickAdd}
              className="w-full whitespace-nowrap rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
            >
              + 피어리뷰 추가
            </button>
          </div>
        </div>
        {newFormError && <p className="mt-2 text-xs text-danger">{newFormError}</p>}
      </div>

      {state.peerReviews.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm leading-relaxed text-gray-500">
          등록된 피어리뷰가 없습니다.
          <br />
          위의 '+ 피어리뷰 추가'로 직접 등록하거나,
          <br />
          위쪽 통합 데이터 관리에서 엑셀로 여러 건을 한 번에 등록할 수 있습니다.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="table-fixed text-left text-sm" style={{ width: '100%', minWidth: cols.totalWidth - cols.widths.target }}>
            <thead className="bg-[#F3F4F6] text-black">
              <tr>
                {(
                  [
                    ['reviewer', '작성자'],
                    ['target', '대상 팀원'],
                    ['grade', '등급'],
                    ['manage', '관리'],
                  ] as const
                ).map(([key, label]) => (
                  <ResizableTh
                    key={key}
                    width={key === 'target' ? undefined : cols.widths[key]}
                    resizable={key !== 'manage'}
                    onResizeStart={cols.startResize(key)}
                    onResizeMove={cols.onResizeMove}
                    onResizeEnd={cols.onResizeEnd}
                  >
                    {label}
                  </ResizableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.peerReviews.map((review) => (
                <tr key={review.id} className="border-t border-gray-200 text-black">
                  <td className="px-4 py-3 font-medium">{review.reviewerName}</td>
                  <td className="px-4 py-3">{memberNameById.get(review.targetMemberId) ?? '(삭제된 팀원)'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${GRADE_COLORS[review.grade]}`}>
                      {review.grade}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeletingReview(review)}
                      title="삭제"
                      aria-label="삭제"
                      className="rounded-md border border-gray-300 p-1.5 text-danger hover:bg-red-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deletingReview !== null}
        title="피어리뷰 삭제"
        message={`${deletingReview?.reviewerName}님이 남긴 피어리뷰를 삭제하시겠습니까?`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingReview(null)}
      />
    </div>
  )
}

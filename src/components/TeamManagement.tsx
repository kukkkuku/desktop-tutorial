import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { PeerReview, TeamMember } from '../types'
import { calcMemberParticipation, GRADE_COLORS } from '../utils/calculations'
import MemberModal from './MemberModal'
import ConfirmDialog from './ConfirmDialog'

export default function TeamManagement() {
  const { state, dispatch } = useAppState()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null)
  const [viewingPeerReviewsFor, setViewingPeerReviewsFor] = useState<TeamMember | null>(null)
  const [deletingPeerReview, setDeletingPeerReview] = useState<PeerReview | null>(null)

  function openAddModal() {
    setEditingMember(null)
    setModalOpen(true)
  }

  function openEditModal(member: TeamMember) {
    setEditingMember(member)
    setModalOpen(true)
  }

  function handleSave(member: TeamMember) {
    if (editingMember) {
      dispatch({ type: 'UPDATE_MEMBER', payload: member })
    } else {
      dispatch({ type: 'ADD_MEMBER', payload: member })
    }
    setModalOpen(false)
    setEditingMember(null)
  }

  function handleDeleteConfirm() {
    if (deletingMember) {
      dispatch({ type: 'DELETE_MEMBER', payload: { id: deletingMember.id } })
      setDeletingMember(null)
    }
  }

  function handleDeletePeerReviewConfirm() {
    if (deletingPeerReview) {
      dispatch({ type: 'DELETE_PEER_REVIEW', payload: { id: deletingPeerReview.id } })
      setDeletingPeerReview(null)
    }
  }

  const peerReviewsForViewing = viewingPeerReviewsFor
    ? state.peerReviews.filter((r) => r.targetMemberId === viewingPeerReviewsFor.id)
    : []

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">팀원 관리</h3>
        <button
          onClick={openAddModal}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + 팀원 추가
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        팀원을 추가/삭제하면 평가 매트릭스의 열(컬럼)이 자동으로 반영됩니다. 삭제 시 해당 팀원의 모든 평가 데이터도 함께 제거됩니다.
      </p>

      {state.members.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm leading-relaxed text-gray-500">
          등록된 팀원이 없습니다.
          <br />
          위의 '+ 팀원 추가' 버튼으로 직접 등록하거나,
          <br />
          위쪽 통합 데이터 관리에서 엑셀로 여러 팀원을 한 번에 등록할 수 있습니다.
        </p>
      ) : (
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">직급</th>
              <th className="px-4 py-3 font-semibold">연차</th>
              <th className="px-4 py-3 font-semibold">역할</th>
              <th className="px-4 py-3 font-semibold">참여 과제 수</th>
              <th className="px-4 py-3 font-semibold">받은 피어리뷰</th>
              <th className="px-4 py-3 font-semibold">활성여부</th>
              <th className="px-4 py-3 font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {state.members.map((member) => {
              const { count } = calcMemberParticipation(member, state.tasks, state.contributions)
              const peerReviewCount = state.peerReviews.filter((r) => r.targetMemberId === member.id).length
              return (
                <tr key={member.id} className="border-t border-gray-200 text-black">
                  <td className="px-4 py-3 font-medium">{member.name}</td>
                  <td className="px-4 py-3">{member.level || '-'}</td>
                  <td className="px-4 py-3">{member.yearsOfService ?? '-'}</td>
                  <td className="px-4 py-3">{member.role || '-'}</td>
                  <td className="px-4 py-3">{count}건</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewingPeerReviewsFor(member)}
                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      {peerReviewCount}건 확인
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        member.active ? 'bg-green-50 text-success' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {member.active ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(member)}
                        title="수정"
                        aria-label="수정"
                        className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeletingMember(member)}
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
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {modalOpen && (
        <MemberModal
          initialMember={editingMember}
          existingNames={state.members.map((m) => m.name)}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false)
            setEditingMember(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deletingMember !== null}
        title="팀원 삭제"
        message={`'${deletingMember?.name}' 팀원을 삭제하시겠습니까? 관련된 기여도 데이터도 함께 삭제됩니다.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingMember(null)}
      />

      {viewingPeerReviewsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-black">{viewingPeerReviewsFor.name}님이 받은 피어리뷰</h3>
              <button
                onClick={() => setViewingPeerReviewsFor(null)}
                aria-label="닫기"
                className="flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
              {peerReviewsForViewing.length === 0 ? (
                <p className="rounded-md bg-gray-50 px-4 py-4 text-center text-sm text-gray-500">
                  아직 받은 피어리뷰가 없습니다.
                </p>
              ) : (
                peerReviewsForViewing.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-2"
                  >
                    <span className="text-sm font-medium text-black">{review.reviewerName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_COLORS[review.grade]}`}>
                        {review.grade}
                      </span>
                      <button
                        onClick={() => setDeletingPeerReview(review)}
                        className="rounded-md border border-danger px-2.5 py-1 text-xs font-medium text-danger hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingPeerReview !== null}
        title="피어리뷰 삭제"
        message={`${deletingPeerReview?.reviewerName}님이 남긴 피어리뷰를 삭제하시겠습니까?`}
        onConfirm={handleDeletePeerReviewConfirm}
        onCancel={() => setDeletingPeerReview(null)}
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { PeerReview, PerformanceGrade } from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'
import { GRADE_COLORS, PERFORMANCE_SCORE } from '../utils/calculations'
import ConfirmDialog from './ConfirmDialog'
import TitleUploadControls from './TitleUploadControls'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import { downloadCurrentPeerReviewsExcel, downloadPeerReviewTemplate, parsePeerReviewWorkbook } from '../utils/excel'
import { downloadPeerReviewsPdf } from '../utils/pdfReports'
import Button from './Button'
import IconButton from './IconButton'

interface DraftRow {
  contributionPercent: string
  grade: PerformanceGrade
  comment: string
}

export default function PeerReviewManagement() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const { tasks, members, peerReviews } = state
  const activeMembers = useMemo(() => members.filter((m) => m.active), [members])
  const memberNameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])
  const taskNameById = useMemo(() => new Map(tasks.map((t) => [t.id, t.name])), [tasks])

  const [deletingReview, setDeletingReview] = useState<PeerReview | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id ?? '')
  const [reviewerId, setReviewerId] = useState(activeMembers[0]?.id ?? '')
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})

  // 과제나 리뷰어를 바꾸면, 그 리뷰어가 이 과제에 이미 남긴 리뷰가 있으면
  // 그 값을 불러와 보여준다(새로 입력이 아니라 수정이 되도록). 없으면
  // 빈 입력으로 시작한다.
  useEffect(() => {
    const next: Record<string, DraftRow> = {}
    for (const m of activeMembers) {
      const existing = peerReviews.find(
        (r) => r.taskId === selectedTaskId && r.reviewerMemberId === reviewerId && r.targetMemberId === m.id,
      )
      next[m.id] = existing
        ? { contributionPercent: String(existing.contributionPercent ?? ''), grade: existing.grade, comment: existing.comment ?? '' }
        : { contributionPercent: '', grade: 'B', comment: '' }
    }
    setDrafts(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId, reviewerId, activeMembers.length])

  function updateDraft(memberId: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({ ...prev, [memberId]: { ...prev[memberId], ...patch } }))
  }

  function handleSaveDrafts() {
    if (!selectedTaskId || !reviewerId) return
    const reviewerName = memberNameById.get(reviewerId) ?? ''
    for (const m of activeMembers) {
      const draft = drafts[m.id]
      const pct = draft ? Number(draft.contributionPercent) : NaN
      const existing = peerReviews.find(
        (r) => r.taskId === selectedTaskId && r.reviewerMemberId === reviewerId && r.targetMemberId === m.id,
      )
      // 기여도를 비워두면 "이 사람과는 같이 일 안 했다"는 뜻으로 보고
      // 건너뛴다(리뷰를 만들지 않음). 이미 있던 리뷰는 지운다.
      if (!draft || draft.contributionPercent.trim() === '' || Number.isNaN(pct) || pct <= 0) {
        if (existing) dispatch({ type: 'DELETE_PEER_REVIEW', payload: { id: existing.id } })
        continue
      }
      const review: PeerReview = {
        id: existing?.id ?? uuidv4(),
        taskId: selectedTaskId,
        reviewerMemberId: reviewerId,
        reviewerName,
        targetMemberId: m.id,
        contributionPercent: Math.max(0, Math.min(100, pct)),
        grade: draft.grade,
        comment: draft.comment.trim() || undefined,
      }
      dispatch({ type: existing ? 'UPDATE_PEER_REVIEW' : 'ADD_PEER_REVIEW', payload: review })
    }
  }

  function handleDeleteConfirm() {
    if (deletingReview) {
      dispatch({ type: 'DELETE_PEER_REVIEW', payload: { id: deletingReview.id } })
      setDeletingReview(null)
    }
  }

  async function handleUploadFiles(files: File[]) {
    let list = peerReviews
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const result = parsePeerReviewWorkbook(buffer, tasks, members, list)
      list = result.peerReviews
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => (files.length > 1 ? `[${file.name}] ${m}` : m)))
    }
    dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: list })
    return { addedCount, updatedCount, errors }
  }

  // 팀원별로 "받은" 리뷰를 모아, 과제·리뷰어·기여도·등급이 한눈에 보이게
  // 정리한다 -- "누구를 기준으로 뭘 받았는지 확인이 안 된다"는 문제를
  // 여기서 해결한다.
  const receivedByMember = useMemo(() => {
    const map = new Map<string, PeerReview[]>()
    for (const m of members) map.set(m.id, [])
    for (const r of peerReviews) {
      if (!map.has(r.targetMemberId)) map.set(r.targetMemberId, [])
      map.get(r.targetMemberId)!.push(r)
    }
    return map
  }, [members, peerReviews])

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-black">피어리뷰 관리</h3>
        <div className="flex flex-wrap items-center gap-2">
          <CurrentDataDownloadControls
            onExcelDownload={() => downloadCurrentPeerReviewsExcel(peerReviews, members, tasks)}
            onPdfDownload={() => downloadPeerReviewsPdf(teamName, periodName, peerReviews, members)}
          />
          <TitleUploadControls busyLabel="피어리뷰 업로드 중..." onDownload={() => downloadPeerReviewTemplate(tasks, members)} onFiles={handleUploadFiles} />
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        팀장이 여기서 직접 채우는 화면이 아니라, <span className="font-medium text-black">'빈양식 다운로드'</span>로 과제·팀원별 빈
        칸이 다 채워진 엑셀을 받아 팀원들에게 나눠주고, 각자 자기 이름이 '리뷰어'인 행에 기여도·등급·근거를 채워
        돌려받으면 <span className="font-medium text-black">'엑셀데이터 업로드'</span>로 반영하는 화면입니다. 등급은 평가
        기준의 피어리뷰 가중치가 0보다 클 때 평가 점수에, 기여도는 그 과제 기여도 배분의 기본값으로 쓰입니다.
      </p>

      {tasks.length === 0 || activeMembers.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          과제와 활성 팀원이 있어야 피어리뷰 양식을 만들 수 있습니다.
        </p>
      ) : (
        <div className="mt-4 max-w-2xl rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-semibold text-black">받아온 내용 확인·조정</p>
          <p className="mt-0.5 text-xs text-gray-500">
            팀원에게 받은 엑셀을 업로드한 뒤, 또는 직접 몇 건만 빠르게 넣거나 고칠 때 여기서 과제·리뷰어를 골라 확인·수정합니다.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-black">과제</label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-black">리뷰어 (본인)</label>
              <select
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
              >
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            '{memberNameById.get(reviewerId)}'님이 '{selectedTask?.name}' 과제에서 함께한 팀원(본인 포함)에게 매긴 기여도·등급·근거입니다. 같이 일하지 않은 사람은 기여도를 비워두면 됩니다.
          </p>

          <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200">
            {activeMembers.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="w-24 shrink-0 truncate text-sm font-medium text-black">
                  {m.name}
                  {m.id === reviewerId && <span className="ml-1 text-xs font-normal text-gray-400">(본인)</span>}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={drafts[m.id]?.contributionPercent ?? ''}
                  onChange={(e) => updateDraft(m.id, { contributionPercent: e.target.value })}
                  placeholder="기여도 %"
                  className="w-24 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                />
                <select
                  value={drafts[m.id]?.grade ?? 'B'}
                  onChange={(e) => updateDraft(m.id, { grade: e.target.value as PerformanceGrade })}
                  className="w-20 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                >
                  {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={drafts[m.id]?.comment ?? ''}
                  onChange={(e) => updateDraft(m.id, { comment: e.target.value })}
                  placeholder="근거(선택)"
                  className="min-w-[10rem] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                />
              </div>
            ))}
          </div>

          <Button variant="primary" onClick={handleSaveDrafts} className="mt-3">
            저장
          </Button>
        </div>
      )}

      <h4 className="mt-8 text-sm font-semibold text-black">팀원별 받은 리뷰</h4>
      <p className="mt-1 text-xs text-gray-500">과제별로 누가 어떤 근거(기여도·등급·코멘트)로 남겼는지 확인할 수 있습니다.</p>

      <div className="mt-3 max-w-2xl space-y-3">
        {activeMembers.length === 0 && <p className="text-sm text-gray-400">활성 팀원이 없습니다.</p>}
        {activeMembers.map((m) => {
          const received = receivedByMember.get(m.id) ?? []
          const avgScore = received.length > 0 ? received.reduce((sum, r) => sum + PERFORMANCE_SCORE[r.grade], 0) / received.length : null
          return (
            <div key={m.id} className="rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <span className="text-sm font-semibold text-black">{m.name}</span>
                <span className="text-xs text-gray-500">
                  받은 리뷰 {received.length}건
                  {avgScore !== null && <span className="ml-2 font-medium text-accent">평균 {avgScore.toFixed(0)}점</span>}
                </span>
              </div>
              {received.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-400">아직 받은 리뷰가 없습니다.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {received.map((r) => (
                    <li key={r.id} className="px-4 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-gray-700">
                          <span className="font-medium text-black">{r.reviewerName || '(작성자 미상)'}</span>
                          {' · '}
                          {r.taskId ? taskNameById.get(r.taskId) ?? '(삭제된 과제)' : '과제 미상(예전 데이터)'}
                          {typeof r.contributionPercent === 'number' && <span className="ml-1.5 text-gray-400">기여도 {r.contributionPercent}%</span>}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[r.grade]}`}>{r.grade}</span>
                        <IconButton onClick={() => setDeletingReview(r)} title="삭제" aria-label="삭제" tone="danger" className="shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </IconButton>
                      </div>
                      {r.comment && <p className="mt-1 text-xs text-gray-500">"{r.comment}"</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

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

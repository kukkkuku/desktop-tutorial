import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { PeerReview, PerformanceGrade } from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'
import { calcPeerFeedback, calcPeerReviewImpact } from '../utils/calculations'
import PeerReviewImpactSummary from './PeerReviewImpactSummary'
import PeerFeedbackCards from './PeerFeedbackCards'
import ConfirmDialog from './ConfirmDialog'
import TitleUploadControls from './TitleUploadControls'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import { detectWorkbookKind, downloadCurrentPeerReviewsExcel, downloadPeerReviewTemplate, parsePeerReviewWorkbook, type WorkbookKind } from '../utils/excel'
import { downloadPeerReviewsPdf } from '../utils/pdfReports'
import Button from './Button'

interface DraftRow {
  contributionPercent: string
  grade: PerformanceGrade
  comment: string
}

const WORKBOOK_KIND_LABEL: Record<Exclude<WorkbookKind, 'peer'>, string> = {
  task: '과제',
  member: '팀원',
  history: '이전 성과',
}
const WORKBOOK_KIND_UPLOAD_HINT: Record<Exclude<WorkbookKind, 'peer'>, string> = {
  task: '과제관리 탭',
  member: '팀원관리 탭',
  history: '팀원 면담 탭의 "지난 성과 엑셀파일 불러오기"',
}

export default function PeerReviewManagement() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const { tasks, members, peerReviews } = state
  const activeMembers = useMemo(() => members.filter((m) => m.active), [members])
  const memberNameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])

  // 같은 평가 계산을 피어리뷰 있이/없이 두 번 돌려 비교하므로 memo로 묶는다.
  const peerReviewImpact = useMemo(
    () => calcPeerReviewImpact(members, tasks, state.contributions, state.criteria, peerReviews),
    [members, tasks, state.contributions, state.criteria, peerReviews],
  )

  const [deletingReview, setDeletingReview] = useState<PeerReview | null>(null)
  const [howToOpen, setHowToOpen] = useState(false)
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
      // 이 화면은 피어리뷰 전용이라, 과제·팀원·이전 성과 양식이 섞여
      // 들어오면 parsePeerReviewWorkbook이 "채워진 등급이 없습니다"처럼
      // 원인을 알기 힘든 메시지를 낸다. 종류를 먼저 확인해서 왜 반려됐는지,
      // 어디서 올려야 하는지 바로 알려준다.
      const kind = detectWorkbookKind(buffer)
      if (kind && kind !== 'peer') {
        errors.push(`[${file.name}] ${WORKBOOK_KIND_LABEL[kind]} 양식입니다. 여기서는 피어리뷰 파일만 올릴 수 있어요 -- ${WORKBOOK_KIND_UPLOAD_HINT[kind]}에서 올려주세요.`)
        continue
      }
      const result = parsePeerReviewWorkbook(buffer, tasks, members, list)
      list = result.peerReviews
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => (files.length > 1 ? `[${file.name}] ${m}` : m)))
    }
    dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: list })
    return { addedCount, updatedCount, errors }
  }

  // 팀원별로 "동료들이 이 사람을 어떻게 봤나"를 정리한다. 원본 리뷰 나열은
  // 카드의 "근거 보기" 팝업으로 옮겼다.
  const peerFeedback = useMemo(
    () => calcPeerFeedback(members, tasks, state.contributions, peerReviews),
    [members, tasks, state.contributions, peerReviews],
  )

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
      {/* 사용법 안내는 처음 한 번만 필요한 내용이라 접어둔다 -- 매번 결과보다
          위에 4줄로 깔려 있으면 화면에서 시선이 제일 먼저 가는 곳이
          인사이트가 아니라 매뉴얼이 된다. */}
      <div className="mt-1">
        <button
          onClick={() => setHowToOpen((v) => !v)}
          className="text-xs font-medium text-gray-400 hover:text-accent"
        >
          {howToOpen ? '사용법 접기' : '이 화면 사용법'}
        </button>
        {howToOpen && (
          <p className="mt-1.5 text-sm text-gray-600">
            팀장이 여기서 직접 채우는 화면이 아니라, <span className="font-medium text-black">'빈양식 다운로드'</span>로 과제·팀원별
            빈 칸이 다 채워진 엑셀을 받아 팀원들에게 나눠주고, 각자 자기 이름이 '리뷰어'인 행에 기여도·등급·근거를 채워
            돌려받으면 <span className="font-medium text-black">'엑셀데이터 업로드'</span>로 반영하는 화면입니다. 등급은 평가
            기준의 피어리뷰 가중치가 0보다 클 때 평가 점수에, 기여도는 그 과제 기여도 배분의 기본값으로 쓰입니다.
          </p>
        )}
      </div>

      {/* 이 화면의 본론 -- 동료들이 각 팀원을 어떻게 봤는지. 팀장이 스스로
          판단할 근거를 주는 것이 목적이라, 팀장에게 무엇을 입력하라고
          요구하지 않는다. 원본 리뷰는 각 카드의 "근거 보기" 팝업에 있다. */}
      {peerReviews.length > 0 && (
        <div className="mt-5">
          <PeerFeedbackCards rows={peerFeedback} peerReviews={peerReviews} onDeleteReview={setDeletingReview} />
        </div>
      )}

      {/* 계산기가 한 일 -- 위 대조가 팀장의 판단을 돕는다면, 이건 그 판단과
          무관하게 점수에 이미 반영된 결과다. 보조 정보라 아래에 둔다. */}
      <div className="mt-5">
        <PeerReviewImpactSummary impact={peerReviewImpact} />
      </div>

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

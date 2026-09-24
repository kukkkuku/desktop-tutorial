// 피어리뷰 › 과제별. 평가자마다 참여한 평가과제별로, 참여자 전원(본인 포함)의
// 기여도(%)·수행등급·근거를 적는다. 과제마다 기여도 합계 100%, 근거 필수.
// 저장은 기존 PeerReview 구조 그대로(과제 + 리뷰어 고정 → 대상자 합계 100%).

import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { PerformanceGrade, TeamMember } from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'
import { PERFORMANCE_SCORE } from '../utils/calculations'
import {
  downloadTaskPeerForms,
  draftFor,
  parseTaskPeerWorkbook,
  taskPeerGroupsFor,
  toPeerReviews,
  validateTaskPeer,
  type ParsedTaskPeerFile,
  type TaskPeerEntry,
} from '../utils/taskPeerForm'
import Button from './Button'
import Spinner from './Spinner'

const SCORE_TO_GRADE: [number, PerformanceGrade][] = [
  [95, 'S'],
  [85, 'A'],
  [75, 'B'],
  [65, 'C'],
  [0, 'D'],
]

export default function TaskPeerPanel() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const periodLabel = currentWorkspace ? `${currentWorkspace.evaluationYear} ${currentWorkspace.periodName}` : ''
  const activeMembers = state.members.filter((m) => m.active)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploads, setUploads] = useState<(ParsedTaskPeerFile & { saved: boolean })[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleDownload() {
    setBusy('양식을 만드는 중')
    setNotice(null)
    try {
      const { files, skipped } = await downloadTaskPeerForms(activeMembers, state, periodLabel)
      setNotice(
        files === 0
          ? '만들 양식이 없습니다. 평가과제에 참여자(기여도가 있는 팀원)가 2명 이상인 과제가 있어야 합니다.'
          : `${files}명용 과제별 피어리뷰 양식을 내려받았습니다.${skipped.length ? ` (참여한 과제가 없어 제외: ${skipped.join(', ')})` : ''}`,
      )
    } finally {
      setBusy(null)
    }
  }

  function save(reviewer: TeamMember, groups: ReturnType<typeof taskPeerGroupsFor>, entries: TaskPeerEntry[]) {
    dispatch({
      type: 'SET_PEER_REVIEWS_FOR',
      payload: { reviewerMemberId: reviewer.id, reviewerName: reviewer.name, taskIds: groups.map((g) => g.taskId), reviews: toPeerReviews(reviewer, groups, entries) },
    })
  }

  async function handleFiles(files: FileList) {
    setBusy('파일을 읽는 중')
    const results: (ParsedTaskPeerFile & { saved: boolean })[] = []
    for (const f of Array.from(files)) {
      const parsed = parseTaskPeerWorkbook(await f.arrayBuffer(), f.name, state)
      // 오류가 하나라도 있으면 그 파일은 반영하지 않는다(합계가 어긋난 채 일부만 들어가지 않게).
      const ok = parsed.reviewer !== null && parsed.errors.length === 0
      if (ok) save(parsed.reviewer!, parsed.groups, parsed.entries)
      results.push({ ...parsed, saved: ok })
    }
    setUploads(results)
    setBusy(null)
  }

  // ---------- 앱에서 입력 ----------
  const [reviewerId, setReviewerId] = useState('')
  const reviewer = activeMembers.find((m) => m.id === reviewerId) ?? null
  const groups = useMemo(() => (reviewer ? taskPeerGroupsFor(reviewer, state) : []), [reviewer, state])
  const [draft, setDraft] = useState<TaskPeerEntry[]>([])
  const [formErrors, setFormErrors] = useState<string[]>([])

  function openReviewer(m: TeamMember) {
    setReviewerId(m.id)
    setFormErrors([])
    setDraft(draftFor(m, taskPeerGroupsFor(m, state), state.peerReviews))
  }

  function patch(taskId: string, targetId: string, p: Partial<TaskPeerEntry>) {
    setDraft((cur) => cur.map((e) => (e.taskId === taskId && e.targetMemberId === targetId ? { ...e, ...p } : e)))
  }

  function saveForm() {
    if (!reviewer) return
    const errors = groups.flatMap((g) => validateTaskPeer(g, draft, reviewer.id))
    setFormErrors(errors)
    if (errors.length) return
    save(reviewer, groups, draft)
    setNotice(`${reviewer.name}의 과제별 피어리뷰를 저장했습니다.`)
    setReviewerId('')
  }

  // ---------- 현황·결과 ----------
  const expected = activeMembers.filter((m) => taskPeerGroupsFor(m, state).length > 0)
  const submitted = new Set(state.peerReviews.filter((r) => r.taskId && r.comment).map((r) => r.reviewerMemberId))
  const resultTasks = state.tasks.filter((t) => state.peerReviews.some((r) => r.taskId === t.id))

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm font-semibold text-black">엑셀로 나눠 받기</p>
        <p className="mt-0.5 text-xs text-gray-500">
          평가자마다 참여한 과제별 시트가 든 파일을 ZIP으로 받습니다. 과제마다 참여자 전원(본인 포함)의 기여도·수행등급·근거를 적고, 기여도 합계가 100%인지 시트 아래 "검증"
          칸에서 확인합니다. 합계가 100%가 아니거나 등급·근거가 빈 파일은 반영하지 않고 이유를 보여 줍니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handleDownload} disabled={busy !== null}>
            팀원별 Excel 양식 다운로드 (과제별)
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            작성한 Excel 올리기
          </Button>
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Spinner className="h-3.5 w-3.5 text-accent" />
              {busy}
            </span>
          )}
        </div>
        {notice && <p className="mt-2 text-sm text-green-700">{notice}</p>}
        {uploads.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {uploads.map((u) => (
              <li key={u.fileName} className={`rounded-md px-3 py-2 ${u.saved ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className={`font-medium ${u.saved ? 'text-green-800' : 'text-danger'}`}>
                  {u.saved ? '반영' : '반영 안 함'} · {u.fileName}
                  {u.reviewer && ` · 평가자 ${u.reviewer.name}`}
                  {u.saved && ` · 과제 ${u.groups.length}개`}
                </p>
                {u.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-danger">
                    {u.errors.slice(0, 8).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {u.errors.length > 8 && <li>외 {u.errors.length - 8}건</li>}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-black">
            응답 현황 {expected.filter((m) => submitted.has(m.id)).length}/{expected.length}명
          </p>
          <span className="text-xs text-gray-500">이름을 누르면 그 팀원의 과제별 리뷰를 여기서 바로 입력·수정합니다.</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {expected.map((m) => {
            const done = submitted.has(m.id)
            return (
              <button
                key={m.id}
                onClick={() => openReviewer(m)}
                className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${reviewerId === m.id ? 'ring-2 ring-accent' : ''} ${
                  done ? 'bg-emerald-100 text-emerald-800' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-400'
                }`}
              >
                {m.name}
                <span className="ml-1 opacity-60">{done ? '제출' : '미제출'}</span>
              </button>
            )
          })}
          {expected.length === 0 && <p className="text-xs text-gray-400">참여자가 2명 이상인 평가과제가 없습니다. 평가과제·평가하기에서 참여자(기여도)를 먼저 정해 주세요.</p>}
        </div>

        {reviewer && (
          <div className="mt-4 rounded-lg bg-[#F7F8FA] p-4">
            <p className="text-sm font-bold text-black">평가자: {reviewer.name}</p>
            <div className="mt-3 space-y-4">
              {groups.map((g) => {
                const sum = draft.filter((e) => e.taskId === g.taskId).reduce((s, e) => s + (e.contribution ?? 0), 0)
                return (
                  <div key={g.taskId}>
                    <p className="mb-1.5 text-sm font-semibold text-gray-800">과제: {g.taskName}</p>
                    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-[#3A4150] text-left text-white">
                          <tr>
                            <th className="w-36 px-3 py-2 font-semibold">평가 대상</th>
                            <th className="w-28 px-3 py-2 font-semibold">기여도(%)</th>
                            <th className="w-28 px-3 py-2 font-semibold">수행등급</th>
                            <th className="px-3 py-2 font-semibold">근거</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.people.map((p) => {
                            const e = draft.find((x) => x.taskId === g.taskId && x.targetMemberId === p.id)
                            return (
                              <tr key={p.id} className="border-t border-gray-100 align-top">
                                <td className="px-3 py-2 font-medium">
                                  {p.name}
                                  {p.id === reviewer.id && <span className="ml-1 text-xs text-gray-400">(본인)</span>}
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={e?.contribution ?? ''}
                                    onChange={(ev) => patch(g.taskId, p.id, { contribution: ev.target.value === '' ? null : Number(ev.target.value) })}
                                    className="w-full rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5 tabular-nums"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    value={e?.grade ?? ''}
                                    onChange={(ev) => patch(g.taskId, p.id, { grade: (ev.target.value || null) as PerformanceGrade | null })}
                                    className="w-full rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5"
                                  >
                                    <option value="">-</option>
                                    {PERFORMANCE_GRADE_OPTIONS.map((o) => (
                                      <option key={o} value={o}>
                                        {o}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <textarea
                                    rows={2}
                                    value={e?.reason ?? ''}
                                    onChange={(ev) => patch(g.taskId, p.id, { reason: ev.target.value })}
                                    placeholder="이 기여도·등급을 준 근거"
                                    className="w-full resize-y rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5"
                                  />
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="border-t border-gray-200 bg-[#F3F4F6] font-semibold">
                            <td className="px-3 py-2">기여도 합계</td>
                            <td className="px-3 py-2 tabular-nums">{sum}%</td>
                            <td className="px-3 py-2">검증</td>
                            <td className={`px-3 py-2 ${Math.abs(sum - 100) < 0.01 ? 'text-emerald-700' : 'text-danger'}`}>{Math.abs(sum - 100) < 0.01 ? '정상' : '100% 확인'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
            {formErrors.length > 0 && (
              <ul className="mt-3 list-disc rounded-md bg-red-50 py-2 pl-8 pr-3 text-xs text-danger">
                {formErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReviewerId('')}>
                취소
              </Button>
              <Button variant="primary" onClick={saveForm}>
                저장
              </Button>
            </div>
          </div>
        )}
      </section>

      <section>
        <p className="text-sm font-semibold text-black">피어리뷰 결과 · 과제별</p>
        <p className="mt-0.5 text-xs text-gray-500">
          과제마다 대상자가 받은 기여도의 평균과 수행등급 평균입니다. 기여도 평균은 과제의 기여도 자동 배분 기본값으로도 쓰입니다(평가하기에서 조정).
        </p>
        {resultTasks.length === 0 && <p className="mt-3 text-sm text-gray-400">아직 받은 리뷰가 없습니다.</p>}
        {resultTasks.map((t) => {
          const reviews = state.peerReviews.filter((r) => r.taskId === t.id)
          const targets = Array.from(new Set(reviews.map((r) => r.targetMemberId)))
          return (
            <div key={t.id} className="mt-4">
              <p className="text-sm font-semibold text-black">{t.name}</p>
              <div className="mt-1.5 overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-[#F3F4F6] text-left">
                    <tr>
                      <th className="w-32 px-4 py-2.5 font-semibold">대상</th>
                      <th className="w-28 px-4 py-2.5 font-semibold">평균 기여도</th>
                      <th className="w-28 px-4 py-2.5 font-semibold">평균 등급</th>
                      <th className="w-20 px-4 py-2.5 font-semibold">응답 수</th>
                      <th className="px-4 py-2.5 font-semibold">근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((tid) => {
                      const mine = reviews.filter((r) => r.targetMemberId === tid)
                      const withC = mine.filter((r) => typeof r.contributionPercent === 'number')
                      const avgC = withC.length ? withC.reduce((s, r) => s + (r.contributionPercent ?? 0), 0) / withC.length : null
                      const avgScore = mine.reduce((s, r) => s + PERFORMANCE_SCORE[r.grade], 0) / mine.length
                      const avgGrade = SCORE_TO_GRADE.find(([min]) => avgScore >= min)![1]
                      const name = state.members.find((m) => m.id === tid)?.name ?? '(삭제된 팀원)'
                      return (
                        <tr key={tid} className="border-t border-gray-100 align-top">
                          <td className="px-4 py-2.5 font-medium">{name}</td>
                          <td className="px-4 py-2.5 tabular-nums">{avgC !== null ? `${avgC.toFixed(1)}%` : '-'}</td>
                          <td className="px-4 py-2.5 tabular-nums">
                            {avgGrade} <span className="text-xs text-gray-400">({avgScore.toFixed(0)}점)</span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">{mine.length}명</td>
                          <td className="space-y-1 px-4 py-2.5">
                            {mine.map((r) => (
                              <p key={r.id} className="text-[13px] leading-snug text-gray-800">
                                <span className="font-semibold">
                                  {r.reviewerName}
                                  {r.reviewerMemberId === tid ? '(본인)' : ''} · {r.contributionPercent ?? '-'}% · {r.grade}
                                </span>{' '}
                                {r.comment || <span className="text-gray-400">근거 없음</span>}
                              </p>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

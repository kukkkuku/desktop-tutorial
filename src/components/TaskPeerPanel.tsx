// 피어리뷰 › 과제별. 평가과제마다 참여자 전원(본인 포함)을 순위 또는 기여도(합계 100%)로
// 평가하고 근거를 적는다. 과제마다 어느 쪽으로 받을지는 팀장이 여기서 고른다(Task.peerMethod).
// 저장은 TaskPeerReview(점수 계산과는 아직 연결하지 않음).

import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { TaskPeerMethod, TeamMember } from '../types'
import {
  TASK_PEER_METHOD_LABEL,
  downloadTaskPeerForms,
  draftFor,
  parseTaskPeerWorkbook,
  peerMethodOf,
  summarizeTaskPeer,
  taskPeerGroupsFor,
  toTaskPeerReviews,
  validateTaskPeer,
  type ParsedTaskPeerFile,
  type TaskPeerEntry,
} from '../utils/taskPeerForm'
import { taskParticipants } from '../utils/rankReview'
import Button from './Button'
import Spinner from './Spinner'

const METHODS: TaskPeerMethod[] = ['rank', 'contribution']

function MethodToggle({ value, onChange }: { value: TaskPeerMethod; onChange: (m: TaskPeerMethod) => void }) {
  return (
    <div className="inline-flex rounded-md bg-gray-100 p-0.5">
      {METHODS.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded px-3 py-1 text-xs font-medium ${value === m ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
        >
          {m === 'rank' ? '순위' : '기여도(합계 100%)'}
        </button>
      ))}
    </div>
  )
}

export default function TaskPeerPanel() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const periodLabel = currentWorkspace ? `${currentWorkspace.evaluationYear} ${currentWorkspace.periodName}` : ''
  const activeMembers = state.members.filter((m) => m.active)
  const [busy, setBusy] = useState<string | null>(null)
  const [methodOpen, setMethodOpen] = useState(false)
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

  function save(reviewer: TeamMember, groups: ReturnType<typeof taskPeerGroupsFor>, entries: TaskPeerEntry[], source: 'excel' | 'app') {
    dispatch({
      type: 'SET_TASK_PEER_REVIEWS',
      payload: { reviewerMemberId: reviewer.id, taskIds: groups.map((g) => g.taskId), reviews: toTaskPeerReviews(reviewer, groups, entries, source) },
    })
  }

  // ---------- 과제별 방식 ----------
  const peerTasks = state.tasks.filter((t) => taskParticipants(t, state).length >= 2)
  function setMethod(taskIds: string[], method: TaskPeerMethod) {
    const stale = state.taskPeerReviews.filter((r) => taskIds.includes(r.taskId) && r.method !== method)
    if (stale.length > 0) {
      const ok = window.confirm(
        `이미 받은 ${TASK_PEER_METHOD_LABEL[method === 'rank' ? 'contribution' : 'rank']} 리뷰 ${stale.length}건은 결과에서 빠집니다(지우지는 않음). 방식을 바꾸면 해당 팀원은 다시 입력해야 합니다. 바꿀까요?`,
      )
      if (!ok) return
    }
    dispatch({ type: 'SET_TASK_PEER_METHOD', payload: { taskIds, method } })
    setReviewerId('')
  }

  async function handleFiles(files: FileList) {
    setBusy('파일을 읽는 중')
    const results: (ParsedTaskPeerFile & { saved: boolean })[] = []
    for (const f of Array.from(files)) {
      const parsed = parseTaskPeerWorkbook(await f.arrayBuffer(), f.name, state)
      // 오류가 하나라도 있으면 그 파일은 반영하지 않는다(합계가 어긋난 채 일부만 들어가지 않게).
      const ok = parsed.reviewer !== null && parsed.errors.length === 0
      if (ok) save(parsed.reviewer!, parsed.groups, parsed.entries, 'excel')
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
    setDraft(draftFor(m, taskPeerGroupsFor(m, state), state.taskPeerReviews))
  }

  function patch(taskId: string, targetId: string, p: Partial<TaskPeerEntry>) {
    setDraft((cur) => cur.map((e) => (e.taskId === taskId && e.targetMemberId === targetId ? { ...e, ...p } : e)))
  }

  function saveForm() {
    if (!reviewer) return
    const errors = groups.flatMap((g) => validateTaskPeer(g, draft, reviewer.id))
    setFormErrors(errors)
    if (errors.length) return
    save(reviewer, groups, draft, 'app')
    setNotice(`${reviewer.name}의 과제별 피어리뷰를 저장했습니다.`)
    setReviewerId('')
  }

  // ---------- 현황·결과 ----------
  const expected = activeMembers.filter((m) => taskPeerGroupsFor(m, state).length > 0)
  // 제출 = 자기가 참여한 과제를 지금 방식으로 전부 냈음.
  const submittedAll = (m: TeamMember) =>
    taskPeerGroupsFor(m, state).every((g) => state.taskPeerReviews.some((r) => r.reviewerMemberId === m.id && r.taskId === g.taskId && r.method === g.method))
  const submitted = new Set(expected.filter(submittedAll).map((m) => m.id))
  const resultTasks = state.tasks.filter((t) => state.taskPeerReviews.some((r) => r.taskId === t.id && r.method === peerMethodOf(t)))

  return (
    <div className="space-y-6">
      {/* 과제별 평가 방식: 평소엔 한 줄 요약, 눌러야 과제 목록이 펼쳐진다 */}
      {peerTasks.length === 0 ? (
        <p className="text-sm text-gray-400">참여자가 2명 이상인 평가과제가 없습니다. 과제관리에서 평가과제를 먼저 만들어 주세요.</p>
      ) : (
        <div className="rounded-lg border border-gray-200">
          <button onClick={() => setMethodOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm">
            <span className="font-semibold text-black">평가 방식</span>
            <span className="text-gray-500">
              {(['rank', 'contribution'] as const)
                .map((m) => [m, peerTasks.filter((t) => peerMethodOf(t) === m).length] as const)
                .filter(([, n]) => n > 0)
                .map(([m, n]) => `${m === 'rank' ? '순위' : '기여도'} ${n}개 과제`)
                .join(' · ')}
            </span>
            <span className="ml-auto text-xs text-accent">{methodOpen ? '접기' : '과제별로 바꾸기'}</span>
          </button>
          {methodOpen && (
            <div className="border-t border-gray-100 px-4 pb-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>순위 = 1위부터 겹치지 않게 · 기여도 = 합계 100%. 양식을 나눠 주기 전에 정해 주세요.</span>
                {peerTasks.length > 1 && (
                  <span className="flex items-center gap-1.5">
                    전체를
                    <button onClick={() => setMethod(peerTasks.map((t) => t.id), 'rank')} className="rounded border border-gray-200 px-2 py-0.5 hover:border-gray-400">
                      순위로
                    </button>
                    <button onClick={() => setMethod(peerTasks.map((t) => t.id), 'contribution')} className="rounded border border-gray-200 px-2 py-0.5 hover:border-gray-400">
                      기여도로
                    </button>
                  </span>
                )}
              </div>
              <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                {peerTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">{t.name}</span>
                    <span className="text-xs text-gray-400">참여 {taskParticipants(t, state).length}명</span>
                    <MethodToggle value={peerMethodOf(t)} onChange={(m) => m !== peerMethodOf(t) && setMethod([t.id], m)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}


      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-black">
            응답 현황 {expected.filter((m) => submitted.has(m.id)).length}/{expected.length}명
          </p>
          <span className="flex items-center gap-1.5">
            {busy && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Spinner className="h-3.5 w-3.5 text-accent" />
                {busy}
              </span>
            )}
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
            <Button variant="secondary" onClick={handleDownload} disabled={busy !== null} className="h-8 px-3 text-xs" title="팀원별 엑셀 양식을 ZIP으로 받아 나눠 줍니다">
              엑셀 양식 받기
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy !== null} className="h-8 px-3 text-xs" title="작성해 돌려받은 파일을 한꺼번에 올립니다(여러 개 선택 가능)">
              엑셀 올리기
            </Button>
          </span>
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
        </div>

        {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
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
        {reviewer && (
          <div className="mt-4 rounded-lg bg-[#F7F8FA] p-4">
            <p className="text-sm font-bold text-black">평가자: {reviewer.name}</p>
            <div className="mt-3 space-y-4">
              {groups.map((g) => {
                const isRank = g.method === 'rank'
                const n = g.people.length
                const vals = draft.filter((e) => e.taskId === g.taskId).map((e) => e.value)
                const sum = vals.reduce<number>((acc, v) => acc + (v ?? 0), 0)
                const filled = vals.filter((v) => v !== null) as number[]
                const dup = new Set(filled).size !== filled.length
                const check = isRank
                  ? filled.length < n
                    ? { ok: false, text: '빈칸 확인' }
                    : dup
                      ? { ok: false, text: '순위 중복 확인' }
                      : { ok: true, text: '정상' }
                  : Math.abs(sum - 100) < 0.01
                    ? { ok: true, text: '정상' }
                    : { ok: false, text: '100% 확인' }
                return (
                  <div key={g.taskId}>
                    <p className="mb-1.5 text-sm font-semibold text-gray-800">
                      과제: {g.taskName}
                      <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                        {isRank ? `순위 · 1~${n} 중복 없이` : '기여도 · 합계 100%'}
                      </span>
                    </p>
                    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-[#3A4150] text-left text-white">
                          <tr>
                            <th className="w-36 px-3 py-2 font-semibold">평가 대상</th>
                            <th className="w-32 px-3 py-2 font-semibold">{isRank ? '순위' : '기여도(%)'}</th>
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
                                  {isRank ? (
                                    <select
                                      value={e?.value ?? ''}
                                      onChange={(ev) => patch(g.taskId, p.id, { value: ev.target.value === '' ? null : Number(ev.target.value) })}
                                      className="w-full rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5"
                                    >
                                      <option value="">-</option>
                                      {Array.from({ length: n }, (_, i) => i + 1).map((r) => (
                                        <option key={r} value={r}>
                                          {r}위
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={e?.value ?? ''}
                                      onChange={(ev) => patch(g.taskId, p.id, { value: ev.target.value === '' ? null : Number(ev.target.value) })}
                                      className="w-full rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5 tabular-nums"
                                    />
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <textarea
                                    rows={2}
                                    value={e?.reason ?? ''}
                                    onChange={(ev) => patch(g.taskId, p.id, { reason: ev.target.value })}
                                    placeholder={isRank ? '이 순위를 준 근거' : '이 기여도를 준 근거'}
                                    className="w-full resize-y rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5"
                                  />
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="border-t border-gray-200 bg-[#F3F4F6] font-semibold">
                            <td className="px-3 py-2">{isRank ? '순위 검증' : '기여도 합계'}</td>
                            <td className="px-3 py-2 tabular-nums">{isRank ? `${filled.length}/${n}명` : `${sum}%`}</td>
                            <td className={`px-3 py-2 ${check.ok ? 'text-emerald-700' : 'text-danger'}`}>{check.text}</td>
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
          과제마다 대상자가 받은 평균(본인이 매긴 값 포함).
        </p>
        {resultTasks.length === 0 && <p className="mt-3 text-sm text-gray-400">아직 받은 리뷰가 없습니다.</p>}
        {resultTasks.map((t) => {
          const isRank = peerMethodOf(t) === 'rank'
          const rows = summarizeTaskPeer(t, state)
          return (
            <div key={t.id} className="mt-4">
              <p className="text-sm font-semibold text-black">
                {t.name}
                <span className="ml-2 text-xs font-normal text-gray-500">{isRank ? '순위' : '기여도'}</span>
              </p>
              <div className="mt-1.5 overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-[#F3F4F6] text-left">
                    <tr>
                      <th className="w-32 px-4 py-2.5 font-semibold">대상</th>
                      <th className="w-28 px-4 py-2.5 font-semibold">{isRank ? '평균 순위' : '평균 기여도'}</th>
                      <th className="w-20 px-4 py-2.5 font-semibold">응답 수</th>
                      <th className="px-4 py-2.5 font-semibold">근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.memberId} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-2.5 font-medium">{row.member?.name ?? '(삭제된 팀원)'}</td>
                        <td className="px-4 py-2.5 tabular-nums">
                          {isRank ? (
                            <>
                              {row.avg.toFixed(1)}위 <span className="text-xs text-gray-400">/ {row.reviews[0]?.groupSize}명</span>
                            </>
                          ) : (
                            `${row.avg.toFixed(1)}%`
                          )}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{row.count}명</td>
                        <td className="space-y-1 px-4 py-2.5">
                          {row.reviews.map((r) => (
                            <p key={r.id} className="text-[13px] leading-snug text-gray-800">
                              <span className="font-semibold">
                                {state.members.find((m) => m.id === r.reviewerMemberId)?.name ?? '(삭제된 팀원)'}
                                {r.reviewerMemberId === row.memberId ? '(본인)' : ''} · {isRank ? `${r.value}위` : `${r.value}%`}
                              </span>{' '}
                              {r.reason}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
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

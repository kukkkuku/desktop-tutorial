// 피어리뷰 › 단순 순위. 과제와 상관없이 팀원 전체(본인 제외)에 순위와 근거를 매긴다.
//   1) 팀원별 엑셀 양식을 ZIP으로 내려받아 나눠 주고, 작성한 파일을 올리거나
//   2) 앱에서 평가자를 골라 바로 입력한다.
// 모든 순위에는 근거가 필요하다(없으면 저장하지 않음). 결과는 대상자별 평균.

import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { RankReviewMode, TeamMember } from '../types'
import {
  RANK_MODE_LABEL,
  downloadRankForms,
  parseRankWorkbook,
  rankGroupsFor,
  summarizeRanks,
  toReviews,
  validateGroup,
  type ParsedRankFile,
  type RankEntry,
  type RankSummaryRow,
} from '../utils/rankReview'
import Button from './Button'
import Spinner from './Spinner'

export default function RankPeerReview() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const periodLabel = currentWorkspace ? `${currentWorkspace.evaluationYear} ${currentWorkspace.periodName}` : ''
  const mode: RankReviewMode = 'simple'
  const activeMembers = state.members.filter((m) => m.active)
  const reviews = state.rankReviews.filter((r) => r.mode === mode)

  // ---------- 내보내기·올리기 ----------
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploads, setUploads] = useState<(ParsedRankFile & { saved: boolean })[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleDownload() {
    setBusy('양식을 만드는 중')
    setNotice(null)
    try {
      const { files, skipped } = await downloadRankForms(activeMembers, mode, state, periodLabel)
      setNotice(
        files === 0
          ? '만들 양식이 없습니다. 활성 팀원이 2명 이상이어야 합니다.'
          : `${files}명용 ${RANK_MODE_LABEL[mode]} 양식을 내려받았습니다.${skipped.length ? ` (함께한 팀원이 없어 제외: ${skipped.join(', ')})` : ''}`,
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleFiles(files: FileList) {
    setBusy('파일을 읽는 중')
    const results: (ParsedRankFile & { saved: boolean })[] = []
    for (const f of Array.from(files)) {
      const parsed = parseRankWorkbook(await f.arrayBuffer(), f.name, state)
      let saved = false
      // 오류가 하나도 없는 파일만 반영한다(일부만 들어가면 순위가 어긋난다).
      if (parsed.reviewer && parsed.mode && parsed.errors.length === 0) {
        dispatch({
          type: 'SET_RANK_REVIEWS',
          payload: {
            reviewerMemberId: parsed.reviewer.id,
            mode: parsed.mode,
            reviews: toReviews(parsed.reviewer.id, parsed.mode, parsed.groups, parsed.entries, 'excel'),
          },
        })
        saved = true
      }
      results.push({ ...parsed, saved })
    }
    setUploads(results)
    setBusy(null)
  }

  // ---------- 앱에서 입력 ----------
  const [reviewerId, setReviewerId] = useState<string>('')
  const reviewer = activeMembers.find((m) => m.id === reviewerId) ?? null
  const groups = useMemo(() => (reviewer ? rankGroupsFor(reviewer, mode, state) : []), [reviewer, mode, state])
  const [draft, setDraft] = useState<RankEntry[]>([])
  const [formErrors, setFormErrors] = useState<string[]>([])

  function openReviewer(id: string) {
    setReviewerId(id)
    setFormErrors([])
    const existing = state.rankReviews.filter((r) => r.mode === mode && r.reviewerMemberId === id)
    setDraft(existing.map((r) => ({ taskId: r.taskId, targetMemberId: r.targetMemberId, rank: r.rank, reason: r.reason })))
  }

  function setEntry(taskId: string | undefined, targetId: string, patch: Partial<RankEntry>) {
    setDraft((cur) => {
      const i = cur.findIndex((e) => e.targetMemberId === targetId && (e.taskId ?? '') === (taskId ?? ''))
      if (i < 0) return [...cur, { taskId, targetMemberId: targetId, rank: null, reason: '', ...patch }]
      const next = [...cur]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  function saveForm() {
    if (!reviewer) return
    const errors = groups.flatMap((g) => validateGroup(g, draft, g.taskName))
    setFormErrors(errors)
    if (errors.length) return
    dispatch({ type: 'SET_RANK_REVIEWS', payload: { reviewerMemberId: reviewer.id, mode, reviews: toReviews(reviewer.id, mode, groups, draft, 'app') } })
    setNotice(`${reviewer.name}의 ${RANK_MODE_LABEL[mode]}을(를) 저장했습니다.`)
    setReviewerId('')
  }

  // ---------- 현황·결과 ----------
  const submitted = new Set(reviews.map((r) => r.reviewerMemberId))
  const expected = activeMembers.filter((m) => rankGroupsFor(m, mode, state).length > 0)
  const summary = useMemo(() => summarizeRanks(state.rankReviews, mode, state), [state, mode])


  return (
    <div className="space-y-6">
      {/* 엑셀 */}
      <section className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm font-semibold text-black">엑셀로 나눠 받기</p>
        <p className="mt-0.5 text-xs text-gray-500">
          팀원별 파일을 ZIP으로 내려받아 각자에게 보내고, 작성해 돌려받은 파일을 한꺼번에 올리세요. 같은 평가자가 다시 올리면 덮어씁니다. 순위가 겹치거나 근거가 빈 파일은
          반영하지 않고 이유를 보여 줍니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handleDownload} disabled={busy !== null}>
            팀원별 Excel 양식 다운로드 ({RANK_MODE_LABEL[mode]})
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
                  {u.mode && ` · ${RANK_MODE_LABEL[u.mode]}`}
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

      {/* 응답 현황 + 직접 입력 */}
      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-black">
            응답 현황 {submitted.size}/{expected.length}명
          </p>
          <span className="text-xs text-gray-500">이름을 누르면 그 팀원의 순위를 여기서 바로 입력·수정합니다.</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {expected.map((m) => {
            const done = submitted.has(m.id)
            return (
              <button
                key={m.id}
                onClick={() => openReviewer(m.id)}
                className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  reviewerId === m.id ? 'ring-2 ring-accent' : ''
                } ${done ? 'bg-emerald-100 text-emerald-800' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-400'}`}
              >
                {m.name}
                <span className="ml-1 opacity-60">{done ? '제출' : '미제출'}</span>
              </button>
            )
          })}
          {expected.length === 0 && <p className="text-xs text-gray-400">활성 팀원이 2명 이상 필요합니다.</p>}
        </div>

        {reviewer && (
          <RankForm
            reviewer={reviewer}
            groups={groups}
            draft={draft}
            errors={formErrors}
            onChange={setEntry}
            onCancel={() => setReviewerId('')}
            onSave={saveForm}
          />
        )}
      </section>

      {/* 결과 */}
      <section>
        <p className="text-sm font-semibold text-black">피어리뷰 결과 · {RANK_MODE_LABEL[mode]}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          대상자가 받은 순위의 평균입니다. 낮을수록 동료들이 높게 봤습니다.
        </p>
        <SummaryTable rows={summary} mode={mode} />
      </section>
    </div>
  )
}

function RankForm({
  reviewer,
  groups,
  draft,
  errors,
  onChange,
  onCancel,
  onSave,
}: {
  reviewer: TeamMember
  groups: ReturnType<typeof rankGroupsFor>
  draft: RankEntry[]
  errors: string[]
  onChange: (taskId: string | undefined, targetId: string, patch: Partial<RankEntry>) => void
  onCancel: () => void
  onSave: () => void
}) {
  const get = (taskId: string | undefined, targetId: string) => draft.find((e) => e.targetMemberId === targetId && (e.taskId ?? '') === (taskId ?? ''))
  return (
    <div className="mt-4 rounded-lg bg-[#F7F8FA] p-4">
      <p className="text-sm font-bold text-black">평가자: {reviewer.name}</p>
      <p className="mt-0.5 text-xs text-gray-500">1위부터 중복 없이 매기고, 모든 순위에 근거를 적어 주세요.</p>
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <div key={g.taskId ?? 'simple'}>
            {g.taskName && <p className="mb-1.5 text-sm font-semibold text-gray-800">{g.taskName}</p>}
            <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-[#3A4150] text-left text-white">
                  <tr>
                    <th className="w-32 px-3 py-2 font-semibold">대상팀원</th>
                    <th className="w-24 px-3 py-2 font-semibold">순위</th>
                    <th className="px-3 py-2 font-semibold">순위 근거</th>
                  </tr>
                </thead>
                <tbody>
                  {g.targets.map((t) => {
                    const e = get(g.taskId, t.id)
                    return (
                      <tr key={t.id} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2 font-medium">{t.name}</td>
                        <td className="px-3 py-2">
                          <select
                            value={e?.rank ?? ''}
                            onChange={(ev) => onChange(g.taskId, t.id, { rank: ev.target.value ? Number(ev.target.value) : null })}
                            className="w-full rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5"
                          >
                            <option value="">-</option>
                            {g.targets.map((_, i) => (
                              <option key={i + 1} value={i + 1}>
                                {i + 1}위
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            value={e?.reason ?? ''}
                            onChange={(ev) => onChange(g.taskId, t.id, { reason: ev.target.value })}
                            rows={2}
                            placeholder="이 순위를 준 근거"
                            className="w-full resize-y rounded-md border border-gray-300 bg-[#FFF7ED] px-2 py-1.5"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <ul className="mt-3 list-disc rounded-md bg-red-50 py-2 pl-8 pr-3 text-xs text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button variant="primary" onClick={onSave}>
          저장
        </Button>
      </div>
    </div>
  )
}

function SummaryTable({ rows, mode, compact }: { rows: RankSummaryRow[]; mode: RankReviewMode; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  let place = 0
  return (
    <div className={`${compact ? 'mt-1.5' : 'mt-3'} overflow-x-auto rounded-lg border border-gray-200`}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-[#F3F4F6] text-left">
          <tr>
            <th className="w-24 whitespace-nowrap px-4 py-2.5 font-semibold">종합순위</th>
            <th className="w-32 px-4 py-2.5 font-semibold">팀원</th>
            <th className="w-28 px-4 py-2.5 font-semibold">{mode === 'simple' ? '평균순위' : '평균 상대위치'}</th>
            <th className="w-20 px-4 py-2.5 font-semibold">응답 수</th>
            <th className="px-4 py-2.5 font-semibold">근거</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const has = r.count > 0
            if (has) place += 1
            const expanded = open === r.member.id
            const shown = expanded ? r.reasons : r.reasons.slice(0, 2)
            return (
              <tr key={r.member.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-2.5 tabular-nums">{has ? place : '-'}</td>
                <td className="px-4 py-2.5 font-medium">{r.member.name}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {mode === 'simple' ? (r.avgRank !== null ? `${r.avgRank.toFixed(1)}위` : '-') : r.avgPercentile !== null ? `${Math.round(r.avgPercentile)}%` : '-'}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{r.count}명</td>
                <td className="px-4 py-2.5">
                  {!has ? (
                    <span className="text-gray-400">아직 받은 리뷰가 없습니다.</span>
                  ) : (
                    <div className="space-y-1">
                      {shown.map((x, i) => (
                        <p key={i} className="text-[13px] leading-snug text-gray-800">
                          <span className="font-semibold">
                            {x.reviewer} · {x.rank}위{x.groupSize ? `/${x.groupSize}` : ''}
                            {x.taskName ? ` · ${x.taskName}` : ''}
                          </span>{' '}
                          {x.reason}
                        </p>
                      ))}
                      {r.reasons.length > 2 && (
                        <button onClick={() => setOpen(expanded ? null : r.member.id)} className="text-xs font-medium text-accent hover:underline">
                          {expanded ? '접기' : `근거 ${r.reasons.length - 2}개 더 보기`}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

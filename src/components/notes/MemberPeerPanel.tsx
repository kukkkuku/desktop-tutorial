// 면담 화면의 피어리뷰 영역 -- 이 팀원이 동료에게 받은 리뷰(단순 순위 · 과제별 순위/기여도 ·
// 예전 등급 리뷰)를 근거와 함께 모아 본다. 본인이 본인에게 준 값은 "본인"으로 따로 표시하고
// 평균에서는 뺀다(점수 반영 규칙과 같음: utils/peerScores.ts).
import type { AppState } from '../../types'
import { PERFORMANCE_SCORE } from '../../utils/calculations'
import { derivedPeerScores } from '../../utils/peerScores'

export interface PeerSummary {
  count: number // 동료(본인 제외) 리뷰 수
  firstPlace: number // 동료에게 1위로 받은 횟수
  average: number | null // 점수 환산 평균(S100~D60)
  reasons: string[] // 동료가 남긴 근거(최근 입력 순 아님, 입력 순)
}

type PeerState = Pick<AppState, 'members' | 'tasks' | 'peerReviews' | 'rankReviews' | 'taskPeerReviews'>

export function memberPeerSummary(state: PeerState, memberId: string): PeerSummary {
  const legacy = state.peerReviews.filter((r) => r.targetMemberId === memberId && r.reviewerMemberId !== memberId)
  const ranks = state.rankReviews.filter((r) => r.targetMemberId === memberId && r.reviewerMemberId !== memberId)
  const tasks = state.taskPeerReviews.filter((r) => r.targetMemberId === memberId && r.reviewerMemberId !== memberId)
  const scores = [
    ...legacy.map((r) => PERFORMANCE_SCORE[r.grade]),
    ...derivedPeerScores(state)
      .filter((p) => p.targetMemberId === memberId)
      .map((p) => p.score),
  ]
  return {
    count: legacy.length + ranks.length + tasks.length,
    firstPlace: ranks.filter((r) => r.rank === 1).length + tasks.filter((r) => r.method === 'rank' && r.value === 1).length,
    average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    reasons: [...ranks.map((r) => r.reason), ...tasks.map((r) => r.reason), ...legacy.map((r) => r.comment ?? '')].filter((x) => x.trim()),
  }
}

interface Entry {
  key: string
  reviewer: string
  self: boolean
  value: string
  reason: string
}

export default function MemberPeerPanel({ state, memberId }: { state: PeerState; memberId: string }) {
  const nameOf = (id?: string, fallback = '') => state.members.find((m) => m.id === id)?.name ?? fallback
  const summary = memberPeerSummary(state, memberId)

  const simple: Entry[] = state.rankReviews
    .filter((r) => r.targetMemberId === memberId && r.mode === 'simple')
    .map((r) => ({
      key: r.id,
      reviewer: nameOf(r.reviewerMemberId, '알 수 없음'),
      self: r.reviewerMemberId === memberId,
      value: `${r.rank}위 / ${r.groupSize}명`,
      reason: r.reason,
    }))

  const byTask = new Map<string, Entry[]>()
  for (const r of state.taskPeerReviews.filter((x) => x.targetMemberId === memberId)) {
    const e: Entry = {
      key: r.id,
      reviewer: nameOf(r.reviewerMemberId, '알 수 없음'),
      self: r.reviewerMemberId === memberId,
      value: r.method === 'rank' ? `${r.value}위 / ${r.groupSize}명` : `기여도 ${r.value}%`,
      reason: r.reason,
    }
    byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), e])
  }
  for (const r of state.peerReviews.filter((x) => x.targetMemberId === memberId)) {
    const k = r.taskId ?? ''
    const e: Entry = {
      key: r.id,
      reviewer: r.reviewerName || nameOf(r.reviewerMemberId, '알 수 없음'),
      self: r.reviewerMemberId === memberId,
      value: `등급 ${r.grade}${r.contributionPercent != null ? ` · ${r.contributionPercent}%` : ''}`,
      reason: r.comment ?? '',
    }
    byTask.set(k, [...(byTask.get(k) ?? []), e])
  }
  const taskGroups = [...byTask.entries()].map(([taskId, list]) => ({
    taskId,
    title: taskId ? (state.tasks.find((t) => t.id === taskId)?.name ?? '지난 과제') : '과제 연결 없음(예전 리뷰)',
    list,
  }))

  const total = simple.length + taskGroups.reduce((n, g) => n + g.list.length, 0)
  if (total === 0) return <p className="py-6 text-center text-[13px] text-label-3">아직 받은 피어리뷰가 없습니다.</p>

  const EntryRow = ({ e }: { e: Entry }) => (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className={e.self ? 'text-label-3' : 'font-medium text-label'}>
          {e.reviewer}
          {e.self && ' (본인)'}
        </span>
        <span className="shrink-0 tabular-nums text-label-2">{e.value}</span>
      </div>
      {e.reason.trim() && <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-label-2">{e.reason}</p>}
    </li>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-label-2">
        <span>
          동료 리뷰 <b className="font-semibold text-label">{summary.count}</b>건
        </span>
        {summary.average !== null && (
          <span title="순위·등급을 S100~D60 점수로 바꾼 평균(본인 평가 제외)">
            환산 평균 <b className="font-semibold text-label">{summary.average.toFixed(0)}</b>점
          </span>
        )}
        {summary.firstPlace > 0 && (
          <span>
            1위 <b className="font-semibold text-label">{summary.firstPlace}</b>회
          </span>
        )}
      </div>
      {simple.length > 0 && (
        <div className="rounded-card border border-separator bg-white px-4 py-3">
          <p className="text-[13px] font-semibold text-label">팀원 전체 순위</p>
          <ul className="mt-1 divide-y divide-dashed divide-separator">
            {simple.map((e) => (
              <EntryRow key={e.key} e={e} />
            ))}
          </ul>
        </div>
      )}
      {taskGroups.map((g) => (
        <div key={g.taskId || 'none'} className="rounded-card border border-separator bg-white px-4 py-3">
          <p className="truncate text-[13px] font-semibold text-label" title={g.title}>
            {g.title}
          </p>
          <ul className="mt-1 divide-y divide-dashed divide-separator">
            {g.list.map((e) => (
              <EntryRow key={e.key} e={e} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

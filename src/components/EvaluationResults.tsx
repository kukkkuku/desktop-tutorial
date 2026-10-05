// 평가결과 -- 다 정한 뒤 확인하고 보고하는 화면.
//   맨 위: 인사이트 한 줄(전체 = 팀 기준, 팀원을 고르면 그 사람 기준) · 「확인 필요 N건」 · 고과 분포 · 확정
//   「전체 / 팀원」 칩 → 과제별 성과 표 하나. 팀원을 고르면 표는 그대로 두고 그 사람 몫을 파랗게,
//   맨 오른쪽에 「반영점수」 열과 합계(= 성과점수)를 붙인다. 참여하지 않은 과제는 흐리게.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { EvaluationGrade, EvaluationStatus, Workload } from '../types'
import {
  calcAllTaskScores,
  calcMemberResults,
  calcPeerReviewFactor,
  calcPersonalGradeFactor,
  getContribution,
  getContributionPercent,
  getEffectiveContributionPercent,
  gradeText,
  UNGRADED_HINT,
} from '../utils/calculations'
import { getMemberPerformanceHistory } from '../utils/memberHistory'
import { downloadCurrentTasksExcel, downloadIndividualResultReports, downloadResultsReport } from '../utils/excel'
import {
  downloadIndividualResultsPdf,
  downloadMemberResultPdf,
  downloadResultsPdf,
  downloadTasksPdf,
  previewMemberResultPdf,
  previewResultsPdf,
} from '../utils/pdfReports'
import { colorForIndex, pastelForIndex, pastelTextForIndex } from '../utils/memberColors'
import { IMPORTANCE_COLORS } from '../utils/badgeColors'
import Badge, { type BadgeTone } from './Badge'
import ConfirmDialog from './ConfirmDialog'
import Button from './Button'
import ScrollX from './ui/ScrollX'
import Spinner from './Spinner'
import { AlertCircle, ChevronDown, Download, Eye, Sparkles, UserRound, X } from 'lucide-react'
import { ic, icSm } from './ui/icon'
import { peerInputsOf } from '../utils/peerScores'

const STATUS_LABEL: Record<EvaluationStatus, string> = {
  evaluating: '평가중',
  reviewed: '검토완료',
  confirmed: '확정',
}
const STATUS_TONE: Record<EvaluationStatus, BadgeTone> = {
  evaluating: 'neutral',
  reviewed: 'accent',
  confirmed: 'success',
}
const STATUS_ORDER: EvaluationStatus[] = ['evaluating', 'reviewed', 'confirmed']

// 등급을 색상 있는 글자로만 표시(배지 아님)
function gradeTextColor(grade: EvaluationGrade): string {
  if (grade === 'S') return 'text-accent'
  if (grade === 'A') return 'text-success'
  if (grade === 'B') return 'text-label-2'
  return 'text-danger'
}

// 업무량 등급을 과부하 확인용 대략적인 수치로 환산.
const WORKLOAD_NUM: Record<Workload, number> = { 대: 90, 중: 60, 소: 40 }
const GRADE_RANK: Record<EvaluationGrade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }
const KEY_IMPORTANCE = new Set(['과제', '중점', '핵심'])

const quoted = (name: string) => `「${name.length > 22 ? `${name.slice(0, 22)}…` : name}」`

// 리포트 세 가지를 한 단추에서 고른다(미리보기 · PDF · 엑셀).
function ReportMenu({
  items,
}: {
  items: { key: string; label: string; desc: string; disabled?: boolean; preview?: () => void | Promise<void>; pdf: () => void | Promise<void>; excel: () => void | Promise<void> }[]
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  async function run(id: string, fn: () => void | Promise<void>) {
    setBusy(id)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }
  const small = 'inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2 hover:bg-black/[0.05] hover:text-label disabled:opacity-40'
  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button variant="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Download {...ic} /> 리포트 다운로드 <ChevronDown size={14} />
      </Button>
      {open && (
        <div className="mac-pop absolute right-0 top-full z-30 mt-1.5 w-[330px] p-1.5">
          {items.map((it) => (
            <div key={it.key} className={`rounded-[8px] px-2.5 py-2 ${it.disabled ? 'opacity-40' : ''}`}>
              <p className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">{it.label}</p>
              <p className="text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">{it.desc}</p>
              <div className="mt-1 flex items-center gap-0.5">
                {busy?.startsWith(it.key) ? (
                  <span className="flex h-7 items-center gap-1.5 px-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
                    <Spinner /> 만드는 중…
                  </span>
                ) : (
                  <>
                    {it.preview && (
                      <button className={small} disabled={it.disabled} onClick={() => run(`${it.key}-v`, it.preview!)}>
                        <Eye {...icSm} /> 미리보기
                      </button>
                    )}
                    <button className={small} disabled={it.disabled} onClick={() => run(`${it.key}-p`, it.pdf)}>
                      <Download {...icSm} /> PDF
                    </button>
                    <button className={small} disabled={it.disabled} onClick={() => run(`${it.key}-x`, it.excel)}>
                      <Download {...icSm} /> 엑셀
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EvaluationResults() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace, workspaces } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const { openMemberDetail } = useMemberDetail()
  const { tasks, members, contributions, criteria, meetingNotes, evaluationStatus } = state
  const periodsForTeam = useMemo(() => workspaces.filter((w) => w.teamName === teamName), [workspaces, teamName])

  const taskScores = calcAllTaskScores(tasks, criteria)
  // 점수 계산용 피어리뷰: 예전 등급 리뷰 + 새 순위·과제별 리뷰 변환값
  const peerInputs = peerInputsOf(state)
  const results = calcMemberResults(members, tasks, contributions, criteria, peerInputs)
  const activeMembers = members.filter((m) => m.active)

  // 지난 평가(직전 평가기간) 고과 -- 다른 기간 스냅샷에 같은 계산을 다시 돌린 값
  const prevGradeByMember = useMemo(() => {
    const map = new Map<string, EvaluationGrade | null>()
    if (periodsForTeam.length === 0) return map
    for (const row of results) {
      const history = getMemberPerformanceHistory(row.member.id, periodsForTeam)
      map.set(row.member.id, history[1]?.grade ?? null)
    }
    return map
  }, [results, periodsForTeam])

  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [confirmAllOpen, setConfirmAllOpen] = useState(false)
  const [checksOpen, setChecksOpen] = useState(false)
  const checksRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!checksOpen) return
    const onDown = (e: MouseEvent) => {
      if (checksRef.current && !checksRef.current.contains(e.target as Node)) setChecksOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [checksOpen])
  // 고른 팀원이 빠지면(비활성 등) 「전체」로
  useEffect(() => {
    if (highlightId && !results.some((r) => r.member.id === highlightId)) setHighlightId(null)
  }, [highlightId, results])

  function statusOf(memberId: string): EvaluationStatus {
    return evaluationStatus[memberId] ?? 'evaluating'
  }
  function cycleStatus(memberId: string) {
    const current = statusOf(memberId)
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length]
    dispatch({ type: 'SET_EVALUATION_STATUS', payload: { memberId, status: next } })
  }
  function confirmAll() {
    dispatch({
      type: 'SET_ALL_EVALUATION_STATUS',
      payload: { memberIds: activeMembers.map((m) => m.id), status: 'confirmed' },
    })
    setConfirmAllOpen(false)
  }

  // 팀원 색상 인덱스는 성과 순위 기준(표 · 칩 · 막대 색을 순위와 맞춘다)
  const memberIndex = useMemo(() => {
    const map = new Map<string, number>()
    results.forEach((r, i) => map.set(r.member.id, i))
    return map
  }, [results])
  const idxOf = (memberId: string) => memberIndex.get(memberId) ?? 0

  const avg = results.length > 0 ? results.reduce((s, r) => s + r.cumulativeScore, 0) / results.length : 0
  const confirmedCount = results.filter((r) => statusOf(r.member.id) === 'confirmed').length
  const gradeCounts = (['S', 'A', 'B', 'C', 'D'] as const).map((g) => ({ g, n: results.filter((r) => r.grade === g).length }))

  // 과제에서 가져간 점수(반영점수) = 과제점수 × 반영 기여도 × 개인 수행 배수. 피어 배수는 합계에 곱한다.
  const reflected = (taskId: string, score: number, memberId: string) => {
    const pct = getEffectiveContributionPercent(contributions, taskId, memberId, criteria.contributionWeight)
    if (pct <= 0) return 0
    return score * (pct / 100) * calcPersonalGradeFactor(getContribution(contributions, taskId, memberId), criteria)
  }

  const selected = highlightId ? results.find((r) => r.member.id === highlightId) ?? null : null
  const selRank = selected ? results.indexOf(selected) + 1 : 0
  const selRows = useMemo(() => {
    if (!selected) return []
    return taskScores
      .map(({ task, score }) => ({ task, pts: reflected(task.id, score, selected.member.id) }))
      .filter((x) => getContributionPercent(contributions, x.task.id, selected.member.id) > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, taskScores, contributions, criteria])
  const selSum = selRows.reduce((s, x) => s + x.pts, 0)
  const selMaxTaskId = selRows.length > 0 ? [...selRows].sort((a, b) => b.pts - a.pts)[0].task.id : null
  // 고른 팀원의 색(칩 · 막대 · 반영점수 열을 같은 색으로)
  const selIdx = selected ? idxOf(selected.member.id) : 0
  const selInk = pastelTextForIndex(selIdx)
  const selSoft = pastelForIndex(selIdx)
  const selPeer = selected ? calcPeerReviewFactor(peerInputs, selected.member.id, criteria) : 1

  // 확인 필요: 보고 전에 따져 볼 것만(없으면 단추를 숨긴다)
  const checks = useMemo(() => {
    const list: { title: string; desc: string }[] = []
    const unrated = tasks.filter((t) => t.performanceGrade === null)
    if (unrated.length > 0)
      list.push({ title: '성과등급 미입력', desc: `${unrated.length}건(${unrated.slice(0, 2).map((t) => quoted(t.name)).join(' · ')}${unrated.length > 2 ? ' 외' : ''})은 점수에 들어가지 않았습니다 -- 과제관리 성과등급 칸에서 매겨 주세요` })
    if (activeMembers.length > 0)
      tasks.forEach((t) => {
        if (activeMembers.every((m) => getContributionPercent(contributions, t.id, m.id) === 0))
          list.push({ title: '기여자 없음', desc: `${quoted(t.name)} -- 기여도를 넣은 팀원이 없어 이 과제 점수가 아무에게도 반영되지 않습니다` })
      })
    results.forEach((r) => {
      const prev = prevGradeByMember.get(r.member.id) ?? null
      if (prev && r.grade && Math.abs(GRADE_RANK[r.grade] - GRADE_RANK[prev]) >= 2)
        list.push({ title: '고과 큰 변화', desc: `${r.member.name} 지난 평가 ${prev} → 이번 ${r.grade}` })
    })
    tasks
      .filter((t) => KEY_IMPORTANCE.has(t.importance) && (t.performanceGrade === 'C' || t.performanceGrade === 'D'))
      .forEach((t) => list.push({ title: `${t.importance} 성과 미달`, desc: `${quoted(t.name)} ${t.performanceGrade}` }))
    tasks
      .filter((t) => KEY_IMPORTANCE.has(t.importance))
      .forEach((t) => {
        activeMembers.forEach((m) => {
          const pct = getContributionPercent(contributions, t.id, m.id)
          if (pct >= 70) list.push({ title: '한 사람에게 몰림', desc: `${quoted(t.name)} ${pct}%를 ${m.name}님이 담당 -- 백업 역할 검토` })
        })
      })
    results.forEach((r) => {
      const participated = tasks.filter((t) => getContributionPercent(contributions, t.id, r.member.id) > 0)
      if (participated.length < 3) return
      const avgWl = participated.reduce((s, t) => s + WORKLOAD_NUM[t.workload], 0) / participated.length
      if (avgWl >= 72) list.push({ title: '과부하 위험', desc: `${r.member.name} -- 업무량 ${Math.round(avgWl)}/100, ${participated.length}개 과제 병행` })
    })
    return list
  }, [tasks, activeMembers, contributions, results, prevGradeByMember])

  // 인사이트 한 줄: 전체 = 팀 기준, 팀원을 고르면 그 사람 기준
  const insight = useMemo((): { main: string; sub?: string } | null => {
    if (selected) {
      const name = selected.member.name
      if (selRows.length === 0 || selSum <= 0) return { main: `${name}님은 이번 평가에서 점수가 들어간 과제가 없습니다.`, sub: '과제관리에서 기여도를 넣었는지 확인해 주세요.' }
      const sorted = [...selRows].sort((a, b) => b.pts - a.pts)
      // 점수의 절반 이상을 만드는 상위 과제(최대 2개)
      const top: typeof sorted = []
      let acc = 0
      for (const r of sorted) {
        top.push(r)
        acc += r.pts
        if (acc / selSum >= 0.5 || top.length === 2) break
      }
      const share = Math.round((acc / selSum) * 100)
      const keyCount = selRows.filter((r) => KEY_IMPORTANCE.has(r.task.importance)).length
      const prev = prevGradeByMember.get(selected.member.id) ?? null
      const pcts = top.map((r) => getContributionPercent(contributions, r.task.id, selected.member.id))
      const subParts = [
        top.length === 1 ? `기여도 ${pcts[0]}%` : pcts.every((p) => p === pcts[0]) ? `두 과제 모두 기여도 ${pcts[0]}%` : `기여도 ${pcts.join('% · ')}%`,
        `참여 ${selRows.length}건 중 과제 · 중점 ${keyCount}건`,
      ]
      if (prev && selected.grade) subParts.push(`지난 평가 ${prev} → 이번 ${selected.grade}`)
      return {
        main: `${name}님 점수의 ${share}%는 ${top.map((r) => quoted(r.task.name)).join(' · ')}에서 나왔습니다.`,
        sub: subParts.join(' · '),
      }
    }
    const scored = taskScores.filter((x) => x.score > 0)
    if (scored.length === 0 || results.length === 0) return null
    const topTask = [...scored].sort((a, b) => b.score - a.score)[0]
    const lead = activeMembers
      .map((m) => ({ m, pct: getContributionPercent(contributions, topTask.task.id, m.id) }))
      .filter((x) => x.pct > 0)
      .sort((a, b) => b.pct - a.pct)
    const keyTasks = tasks.filter((t) => KEY_IMPORTANCE.has(t.importance))
    const subParts = [`1위 ${results[0].member.name} ${results[0].cumulativeScore.toFixed(1)}점 · 팀 평균 ${avg.toFixed(1)}점`]
    if (keyTasks.length > 0) subParts.push(`과제 · 중점 ${keyTasks.length}건 / 전체 ${tasks.length}건`)
    return {
      main: `가장 높은 과제는 ${quoted(topTask.task.name)} ${topTask.task.performanceGrade ?? ''} · ${topTask.score.toFixed(0)}점입니다${lead.length > 0 ? ` -- ${lead.slice(0, 3).map((x) => `${x.m.name} ${x.pct}%`).join(' · ')}` : ''}.`,
      sub: subParts.join(' · '),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selRows, selSum, taskScores, results, activeMembers, contributions, tasks, avg, prevGradeByMember])

  const noData = results.length === 0
  const memberIds = highlightId ? [highlightId] : undefined

  const reportItems = [
    {
      key: 'all',
      label: '통합 결과 리포트',
      desc: '팀 전체 고과 · 점수 · 과제',
      preview: () => previewResultsPdf(teamName, periodName, members, tasks, contributions, criteria, peerInputs),
      pdf: () => downloadResultsPdf(teamName, periodName, members, tasks, contributions, criteria, peerInputs),
      excel: () => downloadResultsReport(members, tasks, contributions, criteria, peerInputs, periodsForTeam),
    },
    {
      key: 'member',
      label: selected ? `${selected.member.name} 리포트` : '전체 팀원별 리포트',
      desc: selected ? '고른 팀원 한 명' : '팀원마다 한 장 -- 칩에서 팀원을 고르면 그 사람만',
      preview: selected
        ? () => previewMemberResultPdf(teamName, periodName, selected.member, members, tasks, contributions, criteria, meetingNotes, peerInputs)
        : undefined,
      pdf: () =>
        selected
          ? downloadMemberResultPdf(teamName, periodName, selected.member, members, tasks, contributions, criteria, meetingNotes, peerInputs)
          : downloadIndividualResultsPdf(teamName, periodName, members, tasks, contributions, criteria, meetingNotes, peerInputs, memberIds),
      excel: () => downloadIndividualResultReports(members, tasks, contributions, criteria, meetingNotes, peerInputs, memberIds),
    },
    {
      key: 'tasks',
      label: '과제 리포트',
      desc: '과제 · 성과등급 · 목표 · 성과',
      disabled: tasks.length === 0,
      pdf: () => downloadTasksPdf(teamName, periodName, tasks, criteria),
      excel: () => downloadCurrentTasksExcel(tasks, criteria),
    },
  ]

  const fs = (px: number) => ({ fontSize: `calc(${px}px * var(--ui-fs, 1))` })

  return (
    <div className="space-y-4">
      {/* 머리: 제목 · 고과 분포 · 확정 · 리포트 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[length:calc(17px*var(--ui-fs,1))] font-semibold text-label">평가결과</h2>
          {!noData && (
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
              <span className="inline-flex items-center gap-1.5">
                고과
                {gradeCounts
                  .filter((x) => x.n > 0 || x.g !== 'D')
                  .map((x) => (
                    <span key={x.g} className={x.n === 0 ? 'text-label-3' : ''}>
                      <b className={x.n === 0 ? '' : gradeTextColor(x.g)}>{x.g}</b> {x.n}
                    </span>
                  ))}
              </span>
              <span>
                확정 <b className="text-label">{confirmedCount}</b>/{results.length}명
                {confirmedCount < results.length && (
                  <button onClick={() => setConfirmAllOpen(true)} className="ml-2 font-medium text-accent hover:underline" title="팀원 모두 「확정」으로 표시합니다. 점수 · 고과는 바뀌지 않습니다.">
                    모두 확정
                  </button>
                )}
              </span>
            </p>
          )}
        </div>
        <div className={noData ? 'pointer-events-none opacity-40' : ''}>
          <ReportMenu items={reportItems} />
        </div>
      </div>

      {noData ? (
        <p className="rounded-control bg-black/[0.03] px-4 py-8 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
          활성화된 팀원이 없습니다. 과제관리·팀원관리에서 팀원과 과제를 등록하고 평가를 입력하세요.
        </p>
      ) : (
        <>
          {/* 인사이트 한 줄 + 확인 필요 */}
          {(insight || checks.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-accent/20 bg-accent-soft px-5 py-3.5">
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[length:calc(14px*var(--ui-fs,1))] font-bold text-accent">
                <Sparkles size={16} strokeWidth={2} /> 인사이트
              </span>
              <div className="min-w-0 flex-1">
                {insight && (
                  <>
                    <p className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold leading-snug text-label">{insight.main}</p>
                    {insight.sub && <p className="mt-0.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">{insight.sub}</p>}
                  </>
                )}
              </div>
              {checks.length > 0 && (
                <div ref={checksRef} className="relative shrink-0">
                  <Button variant="secondary" onClick={() => setChecksOpen((v) => !v)} aria-expanded={checksOpen}>
                    <AlertCircle {...ic} className="text-warning" /> 확인 필요 {checks.length}건
                  </Button>
                  {checksOpen && (
                    <div className="mac-pop absolute right-0 top-full z-30 mt-1.5 w-[380px] max-w-[calc(100vw-32px)] p-3">
                      <p className="mb-2 text-[length:calc(13px*var(--ui-fs,1))] font-semibold text-label-2">보고 전에 확인할 것</p>
                      <ul className="space-y-1.5">
                        {checks.map((c, i) => (
                          <li key={i} className="text-[length:calc(13.5px*var(--ui-fs,1))] leading-snug text-label">
                            <b className="mr-1.5 text-warning">{c.title}</b>
                            {c.desc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 전체 / 팀원 고르기 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">개인 점수 확인</span>
            <button
              onClick={() => setHighlightId(null)}
              aria-pressed={!highlightId}
              className={`inline-flex h-9 items-center rounded-full border px-4 text-[length:calc(14px*var(--ui-fs,1))] font-semibold transition-colors ${!highlightId ? 'border-ink bg-ink text-white' : 'border-separator bg-white text-label-2 hover:text-label'}`}
            >
              전체
            </button>
            {results.map((r) => {
              const on = highlightId === r.member.id
              return (
                <button
                  key={r.member.id}
                  onClick={() => setHighlightId(on ? null : r.member.id)}
                  aria-pressed={on}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[length:calc(14px*var(--ui-fs,1))] transition-colors ${on ? '' : 'border-separator bg-white text-label hover:bg-black/[0.03]'}`}
                  style={on ? { background: pastelForIndex(idxOf(r.member.id)), color: pastelTextForIndex(idxOf(r.member.id)), borderColor: pastelTextForIndex(idxOf(r.member.id)), boxShadow: `inset 0 0 0 1px ${pastelTextForIndex(idxOf(r.member.id))}` } : undefined}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorForIndex(idxOf(r.member.id)) }} />
                  <span className="font-semibold">{r.member.name}</span>
                  <span className={`font-bold ${on ? '' : r.grade ? gradeTextColor(r.grade) : 'text-label-3'}`} title={r.grade ? undefined : UNGRADED_HINT}>
                    {gradeText(r.grade)}
                  </span>
                  <span className={`tabular-nums ${on ? '' : 'text-label-3'}`} style={fs(13)}>
                    {r.cumulativeScore.toFixed(1)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 고른 팀원: 순위 · 지난 평가 · 상태 · 리포트 */}
          {selected && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-separator bg-white px-4 py-2.5 text-[length:calc(14px*var(--ui-fs,1))]">
              <span className={`text-[length:calc(22px*var(--ui-fs,1))] font-extrabold leading-none ${selected.grade ? gradeTextColor(selected.grade) : 'text-label-3'}`}>{gradeText(selected.grade)}</span>
              <span>
                <b className="text-label">{selected.member.name}</b>
                <span className="ml-2 text-label-2">
                  {selRank}위 · 성과점수 {selected.cumulativeScore.toFixed(1)} · 지난 평가 {prevGradeByMember.get(selected.member.id) ?? '없음'}
                </span>
              </span>
              <button onClick={() => cycleStatus(selected.member.id)} title="눌러서 상태 바꾸기(평가중 → 검토완료 → 확정)">
                <Badge tone={STATUS_TONE[statusOf(selected.member.id)]}>{STATUS_LABEL[statusOf(selected.member.id)]}</Badge>
              </button>
              <span className="ml-auto flex items-center gap-0.5">
                <Button variant="ghost" size="sm" onClick={() => openMemberDetail(selected.member.id)}>
                  <UserRound {...icSm} /> 팀원 상세
                </Button>
                <Button variant="ghost" size="sm" onClick={() => previewMemberResultPdf(teamName, periodName, selected.member, members, tasks, contributions, criteria, meetingNotes, peerInputs)}>
                  <Eye {...icSm} /> 리포트 미리보기
                </Button>
                <Button variant="ghost" size="sm" onClick={() => downloadMemberResultPdf(teamName, periodName, selected.member, members, tasks, contributions, criteria, meetingNotes, peerInputs)}>
                  <Download {...icSm} /> PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setHighlightId(null)} title="전체로" aria-label="선택 해제">
                  <X {...icSm} />
                </Button>
              </span>
            </div>
          )}

          {/* 과제별 성과 -- 표 하나 */}
          <div className="overflow-hidden rounded-card border border-separator bg-white">
            <div className="flex items-baseline gap-2 px-5 py-3.5">
              <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">과제별 성과</h3>
              <span className="text-[length:calc(14px*var(--ui-fs,1))] text-label-3">
                {tasks.length}건{selected ? ` · ${selected.member.name} 참여 ${selRows.length}건` : ''}
              </span>
            </div>
            {taskScores.length === 0 ? (
              <p className="border-t border-separator px-4 py-6 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-2">등록된 과제가 없습니다.</p>
            ) : (
              <ScrollX>
                <table className="w-full min-w-[640px] text-[length:calc(14px*var(--ui-fs,1))]">
                  <thead>
                    <tr className="border-y border-separator bg-[#F7F7F9] text-left text-xs font-semibold text-label-2">
                      <th className="px-5 py-2.5">과제</th>
                      <th className="w-[112px] whitespace-nowrap px-3 py-2.5">과제 성과</th>
                      <th className="hidden w-[30%] px-3 py-2.5 xl:table-cell">목표 · 성과</th>
                      <th className="w-[30%] min-w-[200px] px-3 py-2.5 xl:w-[26%]">참여자별 기여도</th>
                      {selected && (
                        <th className="w-[128px] whitespace-nowrap px-4 py-2.5 text-right" style={{ background: selSoft, color: selInk }}>
                          {selected.member.name} 반영점수
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {taskScores.map(({ task, score }) => {
                      const participants = activeMembers
                        .map((m) => ({ m, pct: getContributionPercent(contributions, task.id, m.id) }))
                        .filter((x) => x.pct > 0)
                      const mine = selected ? participants.some((x) => x.m.id === selected.member.id) : true
                      const pts = selected && mine ? reflected(task.id, score, selected.member.id) : 0
                      const note = selected && mine ? getContribution(contributions, task.id, selected.member.id)?.personalGradeNote?.trim() : undefined
                      const dim = selected && !mine ? 'opacity-45' : ''
                      return (
                        <tr key={task.id} className="border-b border-separator last:border-0">
                          <td className={`px-5 py-3 ${dim}`}>
                            <span className="font-semibold leading-snug text-label">{task.name}</span>
                            <span className={`ml-2 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 align-[1px] text-[length:calc(12px*var(--ui-fs,1))] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>
                              {task.importance}
                            </span>
                            {criteria.workloadWeight > 0 && <span className="ml-1.5 text-xs text-label-3">{task.workload}</span>}
                            <div className="mt-1.5 xl:hidden">
                              <p className="flex gap-2 text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label-2">
                              <span className="shrink-0 font-semibold text-label-3">목표</span>
                              <span className="min-w-0">{task.objective || '-'}</span>
                            </p>
                            <p className="mt-0.5 flex gap-2 text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label">
                              <span className="shrink-0 font-semibold text-label-3">성과</span>
                              <span className="min-w-0">{task.achievement || <span className="text-label-3">미입력</span>}</span>
                            </p>
                            </div>
                          </td>
                          <td className={`whitespace-nowrap px-3 py-3 ${dim}`}>
                            <span className={`font-bold ${task.performanceGrade ? gradeTextColor(task.performanceGrade as EvaluationGrade) : 'text-label-3'}`}>{task.performanceGrade ?? '미입력'}</span>
                            <span className="text-label-2"> · {score.toFixed(0)}점</span>
                          </td>
                          {/* 넓은 화면: 따로 칸 · 좁은 화면(1280 미만): 과제 이름 아래 */}
                          <td className={`hidden px-3 py-3 xl:table-cell ${dim}`}>
                            <p className="flex gap-2 text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label-2">
                              <span className="shrink-0 font-semibold text-label-3">목표</span>
                              <span className="min-w-0">{task.objective || '-'}</span>
                            </p>
                            <p className="mt-0.5 flex gap-2 text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label">
                              <span className="shrink-0 font-semibold text-label-3">성과</span>
                              <span className="min-w-0">{task.achievement || <span className="text-label-3">미입력</span>}</span>
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            {participants.length > 0 ? (
                              <div className={`flex h-6 overflow-hidden rounded-[6px] ${dim}`}>
                                {participants.map(({ m, pct }) => {
                                  const idx = idxOf(m.id)
                                  const isSel = selected?.member.id === m.id
                                  const bg = !selected ? pastelForIndex(idx) : isSel ? pastelTextForIndex(idx) : 'rgba(0,0,0,0.06)'
                                  const fg = !selected ? pastelTextForIndex(idx) : isSel ? '#fff' : 'rgba(0,0,0,0.45)'
                                  return (
                                    <div
                                      key={m.id}
                                      className="flex min-w-0 items-center justify-center overflow-hidden border-r border-white/70 px-1 last:border-0"
                                      style={{ width: `${pct}%`, background: bg }}
                                      title={`${m.name} ${pct}%`}
                                    >
                                      {/* 좁으면 이름이 먼저 줄고 %는 늘 보이게 */}
                                      <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap text-[length:calc(12px*var(--ui-fs,1))] tabular-nums" style={{ color: fg, fontWeight: isSel ? 700 : 500 }}>
                                        {pct >= 22 && <span className="min-w-0 truncate">{m.name}</span>}
                                        <span className="shrink-0">{pct}%</span>
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className={`flex h-6 items-center justify-center rounded-[6px] bg-orange-50 text-[length:calc(12.5px*var(--ui-fs,1))] font-semibold text-warning ${dim}`}>기여자 미등록</div>
                            )}
                            {note && <p className="mt-1 truncate text-xs text-label-2" title={note}>{note}</p>}
                          </td>
                          {selected && (
                            <td className="whitespace-nowrap px-4 py-3 text-right" style={{ background: `${selSoft}99` }}>
                              {mine ? (
                                <span className="inline-flex flex-col items-end">
                                  <span className="tabular-nums text-[length:calc(16px*var(--ui-fs,1))] font-bold" style={{ color: selInk }}>{pts.toFixed(1)}점</span>
                                  {task.id === selMaxTaskId && selRows.length > 1 && <span className="mt-0.5 rounded bg-white/70 px-1.5 text-[length:calc(11.5px*var(--ui-fs,1))] font-semibold" style={{ color: selInk }}>최대</span>}
                                </span>
                              ) : (
                                <span className="text-label-3">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                  {selected && (
                    <tfoot className="border-t border-separator bg-[#F7F7F9]">
                      {Math.abs(selPeer - 1) > 0.0001 && (
                        <>
                          <tr>
                            <td colSpan={3} className="px-5 py-2 text-label-2">반영점수 합계</td>
                            <td className="hidden xl:table-cell" />
                            <td className="px-4 py-2 text-right tabular-nums text-label-2" style={{ background: `${selSoft}99` }}>{selSum.toFixed(1)}점</td>
                          </tr>
                          <tr>
                            <td colSpan={3} className="px-5 py-2 text-label-2">피어리뷰 반영</td>
                            <td className="hidden xl:table-cell" />
                            <td className="px-4 py-2 text-right tabular-nums text-label-2" style={{ background: `${selSoft}99` }}>× {selPeer.toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td colSpan={3} className="px-5 py-3 font-semibold text-label">
                          {Math.abs(selPeer - 1) > 0.0001 ? `${selected.member.name} 성과점수` : `${selected.member.name} 반영점수 합계`}
                        </td>
                        <td className="hidden xl:table-cell" />
                        <td className="px-4 py-3 text-right tabular-nums text-[length:calc(17px*var(--ui-fs,1))] font-bold" style={{ background: selSoft, color: selInk }}>
                          {selected.cumulativeScore.toFixed(1)}점
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </ScrollX>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmAllOpen}
        title="모두 확정으로 표시"
        message={'활성 팀원 모두 "확정"으로 표시합니다.\n팀원별 평가를 다 마쳤다는 표시일 뿐, 점수·고과는 바뀌지 않고 잠기지도 않습니다.'}
        confirmLabel="확정"
        tone="accent"
        onConfirm={confirmAll}
        onCancel={() => setConfirmAllOpen(false)}
      />
    </div>
  )
}

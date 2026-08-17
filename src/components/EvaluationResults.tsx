import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import type { EvaluationGrade, Task, Workload } from '../types'
import {
  calcAllTaskScores,
  calcMemberResults,
  getContributionPercent,
} from '../utils/calculations'
import { downloadIndividualResultReports, downloadResultsReport } from '../utils/excel'
import { colorForIndex, pastelForIndex, pastelTextForIndex } from '../utils/memberColors'
import { IMPORTANCE_COLORS } from '../utils/badgeColors'

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// 등급을 색상 있는 글자로만 표시(배지 아님) -- 참고 디자인의 순위/과제 등급 표기.
function gradeTextColor(grade: EvaluationGrade): string {
  if (grade === 'S') return 'text-accent'
  if (grade === 'A') return 'text-emerald-600'
  if (grade === 'B') return 'text-gray-500'
  return 'text-red-500'
}

// 업무량 등급을 과부하 인사이트 계산용 대략적인 수치로 환산.
const WORKLOAD_NUM: Record<Workload, number> = { 대: 90, 중: 60, 소: 40 }

export default function EvaluationResults() {
  const { state } = useAppState()
  const { openMemberDetail } = useMemberDetail()
  const { tasks, members, contributions, criteria, meetingNotes, peerReviews } = state

  const taskScores = calcAllTaskScores(tasks, criteria)
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const activeMembers = members.filter((m) => m.active)

  const [highlightId, setHighlightId] = useState<string | null>(null)

  // 팀원 색상 인덱스는 members 배열 순서 기준(대시보드/면담과 동일).
  const memberIndex = useMemo(() => {
    const map = new Map<string, number>()
    members.forEach((m, i) => map.set(m.id, i))
    return map
  }, [members])
  const idxOf = (memberId: string) => memberIndex.get(memberId) ?? 0

  const avg = results.length > 0 ? results.reduce((s, r) => s + r.cumulativeScore, 0) / results.length : 0
  const maxScore = Math.max(1, ...results.map((r) => r.cumulativeScore))
  const topResult = results[0]
  const attentionMembers = results.filter((r) => r.grade === 'C' || r.grade === 'D')

  // 팀원별 주력 과제(기여점수 최고)
  const topTaskByMember = useMemo(() => {
    const map: Record<string, Task | null> = {}
    activeMembers.forEach((m) => {
      let best: Task | null = null
      let bestScore = -1
      taskScores.forEach(({ task, score }) => {
        const pct = getContributionPercent(contributions, task.id, m.id)
        if (pct <= 0) return
        const s = score * (pct / 100)
        if (s > bestScore) {
          bestScore = s
          best = task
        }
      })
      map[m.id] = best
    })
    return map
  }, [activeMembers, taskScores, contributions])

  // 인사이트 자동 계산(중요도 순 정렬, 최대 5개)
  const insights = useMemo(() => {
    const list: { priority: 1 | 2 | 3 | 4; label: string; title: string; desc: string }[] = []

    // P1 즉시 조치: 중점·핵심 과제인데 성과등급이 C 이하
    tasks
      .filter((t) => (t.importance === '중점' || t.importance === '핵심') && (t.performanceGrade === 'C' || t.performanceGrade === 'D'))
      .forEach((t) => {
        list.push({ priority: 1, label: '즉시 조치', title: '핵심 과제 성과 미달', desc: `${t.importance} "${t.name}" ${t.performanceGrade} — 원인 파악 및 재발 방지 필요` })
      })

    // P2 단기 대응: 과부하 위험(참여 과제 3개 이상 + 평균 업무량 높음)
    results.forEach((r) => {
      const participated = tasks.filter((t) => getContributionPercent(contributions, t.id, r.member.id) > 0)
      if (participated.length < 3) return
      const avgWl = participated.reduce((s, t) => s + WORKLOAD_NUM[t.workload], 0) / participated.length
      if (avgWl >= 72) {
        list.push({ priority: 2, label: '단기 대응', title: '과부하 위험', desc: `${r.member.name} — 업무량 ${Math.round(avgWl)}/100, ${participated.length}개 과제 병행 중` })
      }
    })

    // P2 단기 대응: 단일 의존(한 명이 70% 이상 담당)
    tasks.forEach((t) => {
      activeMembers.forEach((m) => {
        const pct = getContributionPercent(contributions, t.id, m.id)
        if (pct >= 70) {
          list.push({ priority: 2, label: '단기 대응', title: '단일 의존', desc: `"${t.name}" ${pct}%를 ${m.name}이 담당 — 백업 역할 지정 검토` })
        }
      })
    })

    // P3 모니터링: 기여 공백(60% 이상 미참여)
    if (activeMembers.length > 0) {
      tasks.forEach((t) => {
        const noContrib = activeMembers.filter((m) => getContributionPercent(contributions, t.id, m.id) === 0).length
        if (noContrib >= Math.ceil(activeMembers.length * 0.6)) {
          list.push({ priority: 3, label: '모니터링', title: '기여 공백', desc: `"${t.name}" — ${noContrib}명 미참여, 역할 분담 확인 권장` })
        }
      })
    }

    // P4 기회: 고효율 팀원(업무량 대비 최고 성과)
    const effList = results
      .map((r) => {
        const participated = tasks.filter((t) => getContributionPercent(contributions, t.id, r.member.id) > 0)
        const avgWl = participated.length ? participated.reduce((s, t) => s + WORKLOAD_NUM[t.workload], 0) / participated.length : 0
        return { r, eff: avgWl > 0 ? r.cumulativeScore / avgWl : 0 }
      })
      .sort((a, b) => b.eff - a.eff)
    if (effList.length > 0 && effList[0].eff > 0) {
      list.push({ priority: 4, label: '기회', title: '고효율 팀원', desc: `${effList[0].r.member.name} — 업무량 대비 최고 성과, 핵심 과제 추가 배분 검토` })
    }

    return list.sort((a, b) => a.priority - b.priority).slice(0, 5)
  }, [tasks, activeMembers, contributions, results])

  // 과제별 성과 3열 폭(과제/성과 · 목표·성과 · 기여도) — 드래그로 조절
  const [colWidths, setColWidths] = useState([24, 46, 30])
  const taskTableRef = useRef<HTMLDivElement>(null)

  function startResize(handleIdx: 0 | 1, e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = [...colWidths]
    const containerW = taskTableRef.current?.clientWidth ?? 800
    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientX - startX) / containerW) * 100
      const next = [...startW]
      if (handleIdx === 0) {
        next[0] = Math.max(14, Math.min(48, startW[0] + pct))
        next[1] = Math.max(22, startW[1] - pct)
      } else {
        next[1] = Math.max(22, Math.min(60, startW[1] + pct))
        next[2] = Math.max(18, startW[2] - pct)
      }
      setColWidths(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const noData = results.length === 0

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-black">평가결과</h2>
          <p className="mt-1 text-sm text-gray-600">기준설정 가중치가 실시간으로 반영됩니다.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadResultsReport(members, tasks, contributions, criteria, meetingNotes, peerReviews)}
            disabled={noData}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <DownloadIcon className="h-4 w-4" /> 결과 리포트
          </button>
          <button
            onClick={() => downloadIndividualResultReports(members, tasks, contributions, criteria, meetingNotes, peerReviews)}
            disabled={noData}
            className="flex items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <DownloadIcon className="h-4 w-4" /> 팀원별 개별
          </button>
        </div>
      </div>

      {noData ? (
        <p className="rounded-md bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          활성화된 팀원이 없습니다. 데이터 탭에서 팀원과 과제를 등록하고 평가를 입력하세요.
        </p>
      ) : (
        <>
          {/* KPI 카드 + 인사이트 */}
          <div className="flex flex-wrap items-stretch gap-3">
            <div className="flex min-w-[130px] shrink-0 flex-col justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3.5">
              <p className="text-[10px] text-gray-400">팀 평균</p>
              <p className="font-mono text-2xl font-black leading-none text-gray-900">
                {avg.toFixed(1)}
                <span className="ml-0.5 text-xs font-normal text-gray-400">점</span>
              </p>
              <p className="text-xs text-gray-400">활성 팀원 {activeMembers.length}명</p>
            </div>

            {topResult && (
              <div className="flex min-w-[150px] shrink-0 flex-col justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3.5">
                <p className="text-[10px] text-gray-400">최고 성과</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorForIndex(idxOf(topResult.member.id)) }} />
                  <span className="text-sm font-bold text-gray-900">{topResult.member.name}</span>
                  <span className={`text-sm font-black ${gradeTextColor(topResult.grade)}`}>{topResult.grade}</span>
                </div>
                <p className="font-mono text-xs text-gray-400">
                  {topResult.cumulativeScore.toFixed(1)}점{topResult.member.role ? ` · ${topResult.member.role}` : ''}
                </p>
              </div>
            )}

            <div className="flex min-w-[150px] shrink-0 flex-col justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3.5">
              <p className="text-[10px] text-gray-400">면담 필요</p>
              <div>
                {attentionMembers.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {attentionMembers.map((r) => (
                      <div key={r.member.id} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorForIndex(idxOf(r.member.id)) }} />
                        <span className="text-xs font-semibold text-gray-700">{r.member.name}</span>
                        <span className={`text-xs font-bold ${gradeTextColor(r.grade)}`}>{r.grade}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-300">해당 없음</p>
                )}
              </div>
              {attentionMembers.length > 0 && (
                <button
                  onClick={() => openMemberDetail(attentionMembers[0].member.id)}
                  className="text-left text-[11px] font-semibold text-accent hover:underline"
                >
                  면담하기 →
                </button>
              )}
            </div>

            {insights.length > 0 && (
              <div className="flex min-w-0 flex-1 gap-5 rounded-lg border border-gray-200 px-5 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {insights
                    .filter((i) => i.priority <= 3)
                    .map((ins, idx) => {
                      const lc = ins.priority === 1 ? 'text-red-500' : ins.priority === 2 ? 'text-accent' : 'text-gray-400'
                      return (
                        <div key={idx} className="flex items-baseline gap-2">
                          <span className={`w-12 shrink-0 text-[10px] font-bold ${lc}`}>{ins.label}</span>
                          <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                            <span className="mr-1 font-semibold text-gray-800">{ins.title}</span>
                            {ins.desc}
                          </p>
                        </div>
                      )
                    })}
                </div>
                {insights.some((i) => i.priority === 4) && (
                  <>
                    <div className="w-px shrink-0 bg-gray-100" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {insights
                        .filter((i) => i.priority === 4)
                        .map((ins, idx) => (
                          <div key={idx} className="flex items-baseline gap-2">
                            <span className="w-12 shrink-0 text-[10px] font-bold text-emerald-600">{ins.label}</span>
                            <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                              <span className="mr-1 font-semibold text-gray-800">{ins.title}</span>
                              {ins.desc}
                            </p>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 순위 테이블 */}
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-[#F9FAFB]">
                  <th className="w-8 px-4 py-2.5 text-center text-xs font-semibold text-gray-400">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">팀원</th>
                  <th className="w-16 px-4 py-2.5 text-center text-xs font-semibold text-gray-500">등급</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    <span>점수</span>
                    <span className="ml-2 font-normal text-gray-300">평균 {avg.toFixed(1)}점</span>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">주력 과제</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const idx = idxOf(r.member.id)
                  const isHL = highlightId === r.member.id
                  const topTask = topTaskByMember[r.member.id]
                  return (
                    <tr
                      key={r.member.id}
                      onClick={() => setHighlightId(isHL ? null : r.member.id)}
                      className="cursor-pointer border-b border-gray-200 transition-colors last:border-0 hover:bg-gray-50"
                      style={isHL ? { outline: '1px solid #EB6100', outlineOffset: '-1px' } : undefined}
                    >
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-xs text-gray-400">{i + 1}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openMemberDetail(r.member.id)
                          }}
                          className="flex items-center gap-2 text-left"
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                          <span className="font-semibold text-gray-900 hover:text-accent hover:underline">{r.member.name}</span>
                          <span className="text-xs text-gray-400">
                            {r.member.role || '-'} · {r.participatedTaskCount}건
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <span className={`text-sm font-black ${gradeTextColor(r.grade)}`}>{r.grade}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-5 min-w-[80px] flex-1 overflow-hidden rounded bg-gray-200">
                            <div
                              className="h-full rounded transition-all duration-500"
                              style={{ width: `${(r.cumulativeScore / maxScore) * 100}%`, background: pastelForIndex(idx) }}
                            />
                            <div className="absolute bottom-0 top-0 z-10 w-px bg-gray-400" style={{ left: `${(avg / maxScore) * 100}%` }} />
                          </div>
                          <span className="shrink-0 font-mono text-sm font-bold" style={{ color: pastelTextForIndex(idx) }}>
                            {r.cumulativeScore.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {topTask ? (
                          <div>
                            <p className="max-w-[200px] truncate text-xs font-medium text-gray-700">{topTask.name}</p>
                            <p className="mt-0.5 text-[11px] text-gray-400">
                              {topTask.importance} · <span className={gradeTextColor(topTask.performanceGrade as EvaluationGrade)}>{topTask.performanceGrade}</span>
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 과제별 성과 & 기여도 */}
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">과제별 성과</h3>
                <p className="mt-0.5 text-xs text-gray-500">목표·성과 및 팀원 기여도를 함께 확인합니다.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {activeMembers.map((m) => {
                  const idx = idxOf(m.id)
                  const isHL = highlightId === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => setHighlightId(isHL ? null : m.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all"
                      style={
                        isHL
                          ? { background: pastelForIndex(idx), color: pastelTextForIndex(idx), borderColor: pastelForIndex(idx) }
                          : { background: 'white', color: '#9CA3AF', borderColor: '#E5E7EB' }
                      }
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {taskScores.length === 0 ? (
              <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">등록된 과제가 없습니다.</p>
            ) : (
              <div ref={taskTableRef} className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                {/* 컬럼 헤더 */}
                <div className="flex select-none items-stretch border-b border-gray-200 bg-[#F9FAFB]">
                  <div style={{ width: `${colWidths[0]}%` }} className="min-w-0 px-4 py-2 text-xs font-semibold text-gray-500">
                    과제 / 성과
                  </div>
                  <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(0, e)}>
                    <div className="h-full w-px bg-gray-200 transition-colors group-hover:bg-accent/40" />
                  </div>
                  <div style={{ width: `${colWidths[1]}%` }} className="min-w-0 px-4 py-2 text-xs font-semibold text-gray-500">
                    목표 · 성과
                  </div>
                  <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(1, e)}>
                    <div className="h-full w-px bg-gray-200 transition-colors group-hover:bg-accent/40" />
                  </div>
                  <div style={{ width: `${colWidths[2]}%` }} className="min-w-0 px-4 py-2 text-xs font-semibold text-gray-500">
                    기여도
                  </div>
                </div>

                {taskScores.map(({ task, score }) => {
                  const participants = activeMembers
                    .map((m) => ({ m, pct: getContributionPercent(contributions, task.id, m.id) }))
                    .filter((x) => x.pct > 0)
                  const hlPct = highlightId ? getContributionPercent(contributions, task.id, highlightId) : 0
                  return (
                    <div key={task.id} className="flex items-stretch transition-colors hover:bg-gray-50/70">
                      {/* 1열: 과제 정보 + 성과등급/점수 */}
                      <div style={{ width: `${colWidths[0]}%` }} className="flex min-w-0 flex-col justify-center gap-1.5 px-4 py-3.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-bold leading-snug text-gray-900">{task.name}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>
                            {task.importance}
                          </span>
                          <span className="shrink-0 text-xs text-gray-400">{task.workload}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-black ${gradeTextColor(task.performanceGrade as EvaluationGrade)}`}>{task.performanceGrade}</span>
                          <span className="text-xs text-gray-300">/</span>
                          <span className="font-mono text-xs font-bold text-gray-500">{score.toFixed(0)}점</span>
                        </div>
                      </div>

                      <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(0, e)}>
                        <div className="h-full w-px bg-gray-100 transition-colors group-hover:bg-accent/30" />
                      </div>

                      {/* 2열: 목표 & 성과 */}
                      <div style={{ width: `${colWidths[1]}%` }} className="flex min-w-0 flex-col justify-center gap-1 px-4 py-3.5">
                        <p className="truncate text-xs text-gray-600">
                          <span className="mr-1 font-semibold text-gray-400">목표 :</span>
                          {task.objective || '-'}
                        </p>
                        <p className="truncate text-xs text-gray-700">
                          <span className="mr-1 font-semibold text-emerald-600">성과 :</span>
                          {task.achievement || '-'}
                        </p>
                      </div>

                      <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(1, e)}>
                        <div className="h-full w-px bg-gray-100 transition-colors group-hover:bg-accent/30" />
                      </div>

                      {/* 3열: 기여도 stacked bar -- 컬럼 헤더에 이미 "기여도"가 있으므로
                          막대 위 라벨은 두지 않는다. 대신 팀원을 선택했을 때만 그 자리에
                          "{팀원} {%}"를 표시한다(높이는 항상 예약해 행이 늘어나지 않게). */}
                      <div style={{ width: `${colWidths[2]}%` }} className="flex min-w-0 flex-col justify-center gap-1.5 px-4 py-3.5">
                        <p className="h-4 text-xs font-bold leading-4">
                          {highlightId !== null &&
                            (hlPct > 0 ? (
                              <span style={{ color: pastelTextForIndex(idxOf(highlightId)) }}>
                                {members.find((m) => m.id === highlightId)?.name} {hlPct}%
                              </span>
                            ) : (
                              <span className="font-normal text-gray-300">미참여</span>
                            ))}
                        </p>
                        {participants.length > 0 ? (
                          <div className="flex h-5 overflow-hidden rounded">
                            {participants.map(({ m, pct }) => {
                              const idx = idxOf(m.id)
                              const isHL = highlightId === null || highlightId === m.id
                              const bg = isHL ? pastelForIndex(idx) : '#EEEEEE'
                              const fg = isHL ? pastelTextForIndex(idx) : '#CCCCCC'
                              return (
                                <div
                                  key={m.id}
                                  className="flex items-center justify-center overflow-hidden transition-all duration-300"
                                  style={{ width: `${pct}%`, background: bg }}
                                  title={`${m.name} ${pct}%`}
                                >
                                  {pct >= 16 && (
                                    <span className="select-none font-mono text-[10px]" style={{ color: fg, fontWeight: isHL && highlightId !== null ? 700 : 400 }}>
                                      {pct}%
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="flex h-5 items-center rounded bg-gray-100 px-2">
                            <span className="text-xs text-gray-300">미입력</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

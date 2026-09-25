import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { EvaluationGrade, EvaluationStatus, Workload } from '../types'
import {
  calcAllTaskScores,
  calcMemberResults,
  getContribution,
  getContributionPercent,
} from '../utils/calculations'
import { getMemberPerformanceHistory } from '../utils/memberHistory'
import { downloadIndividualResultReports, downloadResultsReport } from '../utils/excel'
import {
  downloadIndividualResultsPdf,
  downloadResultsPdf,
  downloadMemberResultPdf,
  previewMemberResultPdf,
} from '../utils/pdfReports'
import { colorForIndex, pastelForIndex, pastelTextForIndex } from '../utils/memberColors'
import { IMPORTANCE_COLORS } from '../utils/badgeColors'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import Badge, { type BadgeTone } from './Badge'
import ConfirmDialog from './ConfirmDialog'
import Button from './Button'
import Segmented from './ui/Segmented'
import IconButton from './IconButton'
import { ArrowDown, ArrowUp, Download, Eye, Minus } from 'lucide-react'
import { ic, icSm } from './ui/icon'
import { peerInputsOf } from '../utils/peerScores'
import { peerSummaryOf } from '../utils/calculations'
import PeerLine from './PeerLine'

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

// 등급을 색상 있는 글자로만 표시(배지 아님) -- 참고 디자인의 순위/과제 등급 표기.
function gradeTextColor(grade: EvaluationGrade): string {
  if (grade === 'S') return 'text-accent'
  if (grade === 'A') return 'text-success'
  if (grade === 'B') return 'text-label-2'
  return 'text-danger'
}

// 업무량 등급을 과부하 인사이트 계산용 대략적인 수치로 환산.
const WORKLOAD_NUM: Record<Workload, number> = { 대: 90, 중: 60, 소: 40 }
const GRADE_RANK: Record<EvaluationGrade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }

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

  // 전년도(직전 평가기간) 고과 — 같은 계산 로직을 다른 기간 스냅샷에 재실행해서
  // 얻는 값이라 별도 입력이 필요 없다(팀원 관리 최근 5년 고과와 같은 소스).
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmAllOpen, setConfirmAllOpen] = useState(false)

  function statusOf(memberId: string): EvaluationStatus {
    return evaluationStatus[memberId] ?? 'evaluating'
  }
  function cycleStatus(memberId: string) {
    const current = statusOf(memberId)
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length]
    dispatch({ type: 'SET_EVALUATION_STATUS', payload: { memberId, status: next } })
  }
  function toggleSelect(memberId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }
  function confirmAll() {
    dispatch({
      type: 'SET_ALL_EVALUATION_STATUS',
      payload: { memberIds: activeMembers.map((m) => m.id), status: 'confirmed' },
    })
    setConfirmAllOpen(false)
  }

  // 팀원 색상 인덱스는 성과 순위(results 정렬 순서) 기준 -- 등록 순서로
  // 고정해두면 표/범례/기여도 막대의 색이 순위와 안 맞아 보인다.
  const memberIndex = useMemo(() => {
    const map = new Map<string, number>()
    results.forEach((r, i) => map.set(r.member.id, i))
    return map
  }, [results])
  const idxOf = (memberId: string) => memberIndex.get(memberId) ?? 0

  const avg = results.length > 0 ? results.reduce((s, r) => s + r.cumulativeScore, 0) / results.length : 0
  const maxScore = Math.max(1, ...results.map((r) => r.cumulativeScore))

  // 인사이트 자동 계산(중요도 순 정렬, 최대 5개)
  const insights = useMemo(() => {
    const list: { priority: 1 | 2 | 3; label: string; title: string; desc: string }[] = []

    // P1 즉시 조치: 과제(이전 기준 중점·핵심) 등급인데 성과등급이 C 이하
    tasks
      .filter((t) => (t.importance === '과제' || t.importance === '중점' || t.importance === '핵심') && (t.performanceGrade === 'C' || t.performanceGrade === 'D'))
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

  // 보기 방식: 상하(기본) / 좌우 / 탭. 브라우저에 기억한다.
  type ResultView = 'stack' | 'side' | 'tabs'
  const [view, setView] = useState<ResultView>(() => {
    try {
      const v = localStorage.getItem('results.view')
      return v === 'side' || v === 'tabs' ? v : 'stack'
    } catch {
      return 'stack'
    }
  })
  const [tab, setTab] = useState<'members' | 'tasks'>('members')
  function changeView(v: ResultView) {
    setView(v)
    try {
      localStorage.setItem('results.view', v)
    } catch {
      // 기억 못 해도 화면에는 반영
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-label">평가결과</h2>
          <p className="mt-1 text-[13px] text-label-2">기준설정 가중치가 실시간으로 반영됩니다.</p>
          {tasks.some((t) => t.performanceGrade === null) && (
            <p className="mt-1 text-[13px] font-medium text-warning">
              성과등급을 아직 매기지 않은 과제 {tasks.filter((t) => t.performanceGrade === null).length}건은 점수에 들어가지 않았습니다. 평가과제에서 매겨 주세요.
            </p>
          )}
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${noData ? 'pointer-events-none opacity-40' : ''}`}>
          <Segmented
            items={[
              { key: 'stack', label: '상하', title: '팀원별 성과 위, 과제별 성과 아래' },
              { key: 'side', label: '좌우', title: '팀원별 성과 왼쪽, 과제별 성과 오른쪽 (넓은 화면에서만, 좁으면 상하로)' },
              { key: 'tabs', label: '탭', title: '팀원별 성과 / 과제별 성과를 탭으로 전환' },
            ]}
            value={view}
            onChange={changeView}
          />
          <Button variant="primary" onClick={() => setConfirmAllOpen(true)}>
            전체 확정
          </Button>
          <CurrentDataDownloadControls
            label="통합 결과 리포트"
            onExcelDownload={() => downloadResultsReport(members, tasks, contributions, criteria, peerInputs, periodsForTeam)}
            onPdfDownload={() => downloadResultsPdf(teamName, periodName, members, tasks, contributions, criteria, peerInputs)}
          />
          <CurrentDataDownloadControls
            label={selectedIds.size > 0 ? `선택 팀원 리포트 (${selectedIds.size})` : '전체 팀원별 리포트'}
            onExcelDownload={() =>
              downloadIndividualResultReports(
                members,
                tasks,
                contributions,
                criteria,
                meetingNotes,
                peerInputs,
                selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
              )
            }
            onPdfDownload={() =>
              downloadIndividualResultsPdf(
                teamName,
                periodName,
                members,
                tasks,
                contributions,
                criteria,
                meetingNotes,
                peerInputs,
                selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
              )
            }
          />
        </div>
      </div>

      {noData ? (
        <p className="rounded-control bg-black/[0.03] px-4 py-8 text-center text-[13px] text-label-2">
          활성화된 팀원이 없습니다. 과제관리·팀원관리에서 팀원과 과제를 등록하고 평가를 입력하세요.
        </p>
      ) : (
        <>
          {view === 'tabs' && (
            <Segmented
              items={[
                { key: 'members', label: '팀원별 성과' },
                { key: 'tasks', label: '과제별 성과' },
              ]}
              value={tab}
              onChange={setTab}
            />
          )}
          <div className={view === 'side' ? 'grid items-start gap-6 xl:grid-cols-2' : 'space-y-6'}>
            {(view !== 'tabs' || tab === 'members') && (
              <div className="min-w-0 space-y-6">
          {/* 팀원 결과 테이블 — 이 화면의 중심. */}
          <div className="overflow-x-auto rounded-card border border-separator bg-white">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-separator bg-[#F7F7F9]">
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      checked={selectedIds.size > 0 && selectedIds.size === results.length}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? new Set(results.map((r) => r.member.id)) : new Set())
                      }
                    />
                  </th>
                  <th className="w-8 px-2 py-2.5 text-center text-xs font-semibold text-label-3">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-label-2">팀원</th>
                  <th className="w-16 px-4 py-2.5 text-left text-xs font-semibold text-label-2">직급</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-label-2">
                    <span>성과점수</span>
                    <span className="ml-2 font-normal text-label-3">평균 {avg.toFixed(1)}점</span>
                  </th>
                  <th className="w-28 px-4 py-2.5 text-center text-xs font-semibold text-label-2" title="받은 피어리뷰 평균 점수와 성과점수에 곱해진 배수">
                    피어리뷰
                  </th>
                  <th className="w-16 px-4 py-2.5 text-center text-xs font-semibold text-label-2">최종 고과</th>
                  <th className="w-16 px-4 py-2.5 text-center text-xs font-semibold text-label-2">전년도</th>
                  <th className="w-14 px-4 py-2.5 text-center text-xs font-semibold text-label-2">변화</th>
                  <th className="w-20 px-4 py-2.5 text-center text-xs font-semibold text-label-2">상태</th>
                  <th className="w-20 px-4 py-2.5 text-center text-xs font-semibold text-label-2">리포트</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const idx = idxOf(r.member.id)
                  const isHL = highlightId === r.member.id
                  const prevGrade = prevGradeByMember.get(r.member.id) ?? null
                  const delta = prevGrade ? GRADE_RANK[r.grade] - GRADE_RANK[prevGrade] : null
                  const status = statusOf(r.member.id)
                  return (
                    <tr
                      key={r.member.id}
                      onClick={() => setHighlightId(isHL ? null : r.member.id)}
                      className="cursor-pointer border-b border-separator transition-colors last:border-0 hover:bg-black/[0.03]"
                      style={isHL ? { outline: '1px solid var(--accent)', outlineOffset: '-1px' } : undefined}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.member.id)}
                          onChange={() => toggleSelect(r.member.id)}
                        />
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className="tabular-nums text-xs text-label-3">{i + 1}</span>
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
                          <span className="font-semibold text-label hover:text-accent hover:underline">{r.member.name}</span>
                          <span className="text-xs text-label-3">
                            {r.member.role || '-'} · {r.participatedTaskCount}건
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-label">{r.member.level || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-5 min-w-[80px] flex-1 overflow-hidden rounded bg-black/[0.08]">
                            <div
                              className="h-full rounded transition-all duration-500"
                              style={{ width: `${(r.cumulativeScore / maxScore) * 100}%`, background: pastelForIndex(idx) }}
                            />
                            <div className="absolute bottom-0 top-0 z-10 w-px bg-label-3" style={{ left: `${(avg / maxScore) * 100}%` }} />
                          </div>
                          <span className="shrink-0 tabular-nums text-[13px] font-semibold" style={{ color: pastelTextForIndex(idx) }}>
                            {r.cumulativeScore.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <PeerLine summary={peerSummaryOf(peerInputs, r.member.id, criteria)} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <span className={`text-[13px] font-bold ${gradeTextColor(r.grade)}`}>{r.grade}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-[13px] text-label-3">{prevGrade ?? '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-[13px] font-semibold">
                        {delta === null ? (
                          <span className="text-label-3">-</span>
                        ) : delta > 0 ? (
                          <ArrowUp {...icSm} className="inline text-accent" aria-label="상승" />
                        ) : delta < 0 ? (
                          <ArrowDown {...icSm} className="inline text-danger" aria-label="하락" />
                        ) : (
                          <Minus {...icSm} className="inline text-label-3" aria-label="유지" />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => cycleStatus(r.member.id)} title="클릭해서 상태 변경">
                          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <IconButton
                            onClick={() => previewMemberResultPdf(teamName, periodName, r.member, members, tasks, contributions, criteria, meetingNotes, peerInputs)}
                            title="미리보기"
                            aria-label="미리보기"
                          >
                            <Eye {...ic} />
                          </IconButton>
                          <IconButton
                            onClick={() => downloadMemberResultPdf(teamName, periodName, r.member, members, tasks, contributions, criteria, meetingNotes, peerInputs)}
                            title="PDF 다운로드"
                            aria-label="PDF 다운로드"
                          >
                            <Download {...ic} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {insights.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-card border border-separator bg-white px-5 py-3.5">
              {insights.map((ins, idx) => {
                const lc = ins.priority === 1 ? 'text-danger' : ins.priority === 2 ? 'text-accent' : 'text-label-3'
                return (
                  <div key={idx} className="flex items-baseline gap-2">
                    <span className={`w-12 shrink-0 text-[11px] font-semibold ${lc}`}>{ins.label}</span>
                    <p className="min-w-0 text-xs leading-relaxed text-label-2">
                      <span className="mr-1 font-semibold text-label">{ins.title}</span>
                      {ins.desc}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

              </div>
            )}
            {(view !== 'tabs' || tab === 'tasks') && (
              <div className="min-w-0">
          {/* 과제별 성과 & 기여도 */}
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-label">과제별 성과</h3>
                <p className="mt-0.5 text-[13px] text-label-2">목표·성과 및 팀원 기여도를 함께 확인합니다.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {results.map(({ member: m }) => {
                  const idx = idxOf(m.id)
                  const isHL = highlightId === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => setHighlightId(isHL ? null : m.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${isHL ? '' : 'border-separator bg-white text-label-2 hover:text-label'}`}
                      style={isHL ? { background: pastelForIndex(idx), color: pastelTextForIndex(idx), borderColor: pastelForIndex(idx) } : undefined}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorForIndex(idx) }} />
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {taskScores.length === 0 ? (
              <p className="rounded-control bg-black/[0.03] px-4 py-6 text-center text-[13px] text-label-2">등록된 과제가 없습니다.</p>
            ) : (
              <div ref={taskTableRef} className="divide-y divide-separator overflow-hidden rounded-card border border-separator bg-white">
                {/* 컬럼 헤더 */}
                <div className="flex select-none items-stretch border-b border-separator bg-[#F7F7F9]">
                  <div style={{ width: `${colWidths[0]}%` }} className="min-w-0 px-4 py-2 text-xs font-semibold text-label-2">
                    과제 / 성과
                  </div>
                  <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(0, e)}>
                    <div className="h-full w-px bg-black/[0.08] transition-colors group-hover:bg-accent/40" />
                  </div>
                  <div style={{ width: `${colWidths[1]}%` }} className="min-w-0 px-4 py-2 text-xs font-semibold text-label-2">
                    목표 · 성과
                  </div>
                  <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(1, e)}>
                    <div className="h-full w-px bg-black/[0.08] transition-colors group-hover:bg-accent/40" />
                  </div>
                  <div style={{ width: `${colWidths[2]}%` }} className="min-w-0 px-4 py-2 text-xs font-semibold text-label-2">
                    기여도
                  </div>
                </div>

                {taskScores.map(({ task, score }) => {
                  const participants = activeMembers
                    .map((m) => ({ m, pct: getContributionPercent(contributions, task.id, m.id) }))
                    .filter((x) => x.pct > 0)
                  const hlPct = highlightId ? getContributionPercent(contributions, task.id, highlightId) : 0
                  const hlNote = highlightId ? getContribution(contributions, task.id, highlightId)?.personalGradeNote : undefined
                  return (
                    <div key={task.id} className="flex items-stretch transition-colors hover:bg-black/[0.03]">
                      {/* 1열: 과제 정보 + 성과등급/점수 */}
                      <div style={{ width: `${colWidths[0]}%` }} className="flex min-w-0 flex-col justify-center gap-1.5 px-4 py-3.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug text-label">{task.name}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>
                            {task.importance}
                          </span>
                          {criteria.workloadWeight > 0 && <span className="shrink-0 text-xs text-label-3">{task.workload}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[13px] font-bold ${task.performanceGrade ? gradeTextColor(task.performanceGrade as EvaluationGrade) : 'text-label-3'}`}>{task.performanceGrade ?? '미입력'}</span>
                          <span className="text-xs text-label-3">/</span>
                          <span className="tabular-nums text-xs font-semibold text-label-2">{score.toFixed(0)}점</span>
                        </div>
                      </div>

                      <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(0, e)}>
                        <div className="h-full w-px bg-black/[0.05] transition-colors group-hover:bg-accent/30" />
                      </div>

                      {/* 2열: 목표 & 성과 */}
                      <div style={{ width: `${colWidths[1]}%` }} className="flex min-w-0 flex-col justify-center gap-1 px-4 py-3.5">
                        <p className="truncate text-xs text-label-2">
                          <span className="mr-1 font-semibold text-label-3">목표 :</span>
                          {task.objective || '-'}
                        </p>
                        <p className="truncate text-xs text-label">
                          <span className="mr-1 font-semibold text-success">성과 :</span>
                          {task.achievement || '-'}
                        </p>
                      </div>

                      <div className="flex w-2 shrink-0 cursor-col-resize items-center justify-center group" onMouseDown={(e) => startResize(1, e)}>
                        <div className="h-full w-px bg-black/[0.05] transition-colors group-hover:bg-accent/30" />
                      </div>

                      {/* 3열: 기여도 stacked bar -- 컬럼 헤더에 이미 "기여도"가 있으므로
                          막대 위 라벨은 두지 않는다. 대신 팀원을 선택했을 때만 그 자리에
                          "{팀원} {%}"를 표시한다(높이는 항상 예약해 행이 늘어나지 않게). */}
                      <div style={{ width: `${colWidths[2]}%` }} className="flex min-w-0 flex-col justify-center gap-1.5 px-4 py-3.5">
                        <p className="flex h-4 items-baseline whitespace-nowrap text-xs font-semibold leading-4" style={{ gap: '20px' }}>
                          {highlightId !== null &&
                            (hlPct > 0 ? (
                              <>
                                <span className="shrink-0" style={{ color: pastelTextForIndex(idxOf(highlightId)) }}>
                                  {members.find((m) => m.id === highlightId)?.name} {hlPct}%
                                </span>
                                {hlNote?.trim() && <span className="min-w-0 truncate font-normal text-label">{hlNote.trim()}</span>}
                              </>
                            ) : (
                              <span className="font-normal text-label-3">미참여</span>
                            ))}
                        </p>
                        {participants.length > 0 ? (
                          <div className="flex h-5 overflow-hidden rounded">
                            {participants.map(({ m, pct }) => {
                              const idx = idxOf(m.id)
                              const isHL = highlightId === null || highlightId === m.id
                              const bg = isHL ? pastelForIndex(idx) : 'rgba(0, 0, 0, 0.06)'
                              const fg = isHL ? pastelTextForIndex(idx) : 'rgba(0, 0, 0, 0.3)'
                              return (
                                <div
                                  key={m.id}
                                  className="flex items-center justify-center overflow-hidden transition-all duration-300"
                                  style={{ width: `${pct}%`, background: bg }}
                                  title={`${m.name} ${pct}%`}
                                >
                                  {pct >= 16 && (
                                    <span className="select-none tabular-nums text-[11px]" style={{ color: fg, fontWeight: isHL && highlightId !== null ? 700 : 400 }}>
                                      {pct}%
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="flex h-5 items-center rounded bg-black/[0.05] px-2">
                            <span className="text-xs text-label-3">미입력</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmAllOpen}
        title="전체 확정"
        message="활성 팀원 전원의 평가 상태를 '확정'으로 변경합니다. 확정 후에도 값은 계속 수정할 수 있고, 이 기간의 결과는 그대로 이력에 남습니다."
        confirmLabel="확정"
        tone="accent"
        onConfirm={confirmAll}
        onCancel={() => setConfirmAllOpen(false)}
      />
    </div>
  )
}

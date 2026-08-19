import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { EvaluationGrade, EvaluationStatus, Workload } from '../types'
import {
  calcAllTaskScores,
  calcMemberResults,
  getContributionPercent,
} from '../utils/calculations'
import { getMemberPerformanceHistory } from '../utils/memberHistory'
import { buildGoogleSheetViewWorkbook, buildResultsReportWorkbook, downloadIndividualResultReports, downloadResultsReport } from '../utils/excel'
import {
  downloadIndividualResultsPdf,
  downloadResultsPdf,
  downloadMemberResultPdf,
  previewMemberResultPdf,
} from '../utils/pdfReports'
import { colorForIndex, pastelForIndex, pastelTextForIndex } from '../utils/memberColors'
import { IMPORTANCE_COLORS } from '../utils/badgeColors'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import GoogleDriveDialog from './GoogleDriveDialog'
import Badge, { type BadgeTone } from './Badge'
import ConfirmDialog from './ConfirmDialog'
import Button from './Button'
import IconButton from './IconButton'

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
  if (grade === 'A') return 'text-emerald-600'
  if (grade === 'B') return 'text-gray-500'
  return 'text-red-500'
}

// 업무량 등급을 과부하 인사이트 계산용 대략적인 수치로 환산.
const WORKLOAD_NUM: Record<Workload, number> = { 대: 90, 중: 60, 소: 40 }
const GRADE_RANK: Record<EvaluationGrade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function PreviewIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function EvaluationResults() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace, workspaces } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const { openMemberDetail } = useMemberDetail()
  const { tasks, members, contributions, criteria, meetingNotes, peerReviews, evaluationStatus } = state
  const periodsForTeam = useMemo(() => workspaces.filter((w) => w.teamName === teamName), [workspaces, teamName])

  const taskScores = calcAllTaskScores(tasks, criteria)
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
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

  // 팀원 색상 인덱스는 members 배열 순서 기준(대시보드/면담과 동일).
  const memberIndex = useMemo(() => {
    const map = new Map<string, number>()
    members.forEach((m, i) => map.set(m.id, i))
    return map
  }, [members])
  const idxOf = (memberId: string) => memberIndex.get(memberId) ?? 0

  const avg = results.length > 0 ? results.reduce((s, r) => s + r.cumulativeScore, 0) / results.length : 0
  const maxScore = Math.max(1, ...results.map((r) => r.cumulativeScore))

  // 인사이트 자동 계산(중요도 순 정렬, 최대 5개)
  const insights = useMemo(() => {
    const list: { priority: 1 | 2 | 3; label: string; title: string; desc: string }[] = []

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
        <div className={`flex flex-wrap items-center gap-2 ${noData ? 'pointer-events-none opacity-40' : ''}`}>
          <Button variant="primary" onClick={() => setConfirmAllOpen(true)} className="px-3 py-1.5">
            전체 확정
          </Button>
          <CurrentDataDownloadControls
            label="통합 결과 리포트"
            onExcelDownload={() => downloadResultsReport(members, tasks, contributions, criteria, peerReviews, periodsForTeam)}
            onPdfDownload={() => downloadResultsPdf(teamName, periodName, members, tasks, contributions, criteria, peerReviews)}
          />
          {currentWorkspace && (
            <GoogleDriveDialog
              workspace={currentWorkspace}
              state={state}
              dispatch={dispatch}
              buildReportWorkbook={() => buildResultsReportWorkbook(members, tasks, contributions, criteria, peerReviews, periodsForTeam).workbook}
              buildSheetWorkbook={() => buildGoogleSheetViewWorkbook(members, tasks, contributions, criteria, peerReviews, periodsForTeam)}
            />
          )}
          <CurrentDataDownloadControls
            label={selectedIds.size > 0 ? `선택 팀원 리포트 (${selectedIds.size})` : '전체 팀원별 리포트'}
            onExcelDownload={() =>
              downloadIndividualResultReports(
                members,
                tasks,
                contributions,
                criteria,
                meetingNotes,
                peerReviews,
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
                peerReviews,
                selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
              )
            }
          />
        </div>
      </div>

      {noData ? (
        <p className="rounded-md bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          활성화된 팀원이 없습니다. 데이터 탭에서 팀원과 과제를 등록하고 평가를 입력하세요.
        </p>
      ) : (
        <>
          {/* 팀원 결과 테이블 — 이 화면의 중심. */}
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-[#F9FAFB]">
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      checked={selectedIds.size > 0 && selectedIds.size === results.length}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? new Set(results.map((r) => r.member.id)) : new Set())
                      }
                      className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                    />
                  </th>
                  <th className="w-8 px-2 py-2.5 text-center text-xs font-semibold text-gray-400">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">팀원</th>
                  <th className="w-16 px-4 py-2.5 text-left text-xs font-semibold text-gray-500">직급</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    <span>성과점수</span>
                    <span className="ml-2 font-normal text-gray-300">평균 {avg.toFixed(1)}점</span>
                  </th>
                  <th className="w-16 px-4 py-2.5 text-center text-xs font-semibold text-gray-500">최종 고과</th>
                  <th className="w-16 px-4 py-2.5 text-center text-xs font-semibold text-gray-500">전년도</th>
                  <th className="w-14 px-4 py-2.5 text-center text-xs font-semibold text-gray-500">변화</th>
                  <th className="w-20 px-4 py-2.5 text-center text-xs font-semibold text-gray-500">상태</th>
                  <th className="w-20 px-4 py-2.5 text-center text-xs font-semibold text-gray-500">리포트</th>
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
                      className="cursor-pointer border-b border-gray-200 transition-colors last:border-0 hover:bg-gray-50"
                      style={isHL ? { outline: '1px solid #EB6100', outlineOffset: '-1px' } : undefined}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.member.id)}
                          onChange={() => toggleSelect(r.member.id)}
                          className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                        />
                      </td>
                      <td className="px-2 py-3 text-center">
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
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{r.member.level || '-'}</td>
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
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <span className={`text-sm font-black ${gradeTextColor(r.grade)}`}>{r.grade}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-400">{prevGrade ?? '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm font-bold">
                        {delta === null ? (
                          <span className="text-gray-300">-</span>
                        ) : delta > 0 ? (
                          <span className="text-accent">▲</span>
                        ) : delta < 0 ? (
                          <span className="text-red-500">▼</span>
                        ) : (
                          <span className="text-gray-400">–</span>
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
                            onClick={() => previewMemberResultPdf(teamName, periodName, r.member, members, tasks, contributions, criteria, meetingNotes, peerReviews)}
                            title="미리보기"
                          >
                            <PreviewIcon className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            onClick={() => downloadMemberResultPdf(teamName, periodName, r.member, members, tasks, contributions, criteria, meetingNotes, peerReviews)}
                            title="PDF 다운로드"
                          >
                            <DownloadIcon className="h-4 w-4" />
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
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-gray-200 px-5 py-3.5">
              {insights.map((ins, idx) => {
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
          )}

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

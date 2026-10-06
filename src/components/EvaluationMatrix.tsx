import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Importance, PerformanceGrade } from '../types'
import { IMPORTANCE_OPTIONS, PERFORMANCE_GRADE_OPTIONS } from '../types'
import {
  calcMemberResults,
  calcTaskScore,
  getContribution,
  getContributionPercent,
  getPersonalPerformanceGrade,
  getTaskContributionSum,
  isContributionSumValid,
  gradeColor,
  gradeText,
  UNGRADED_HINT,
} from '../utils/calculations'
import GradeNoteButton from './GradeNoteButton'
import LiveRankingPopover from './LiveRankingPopover'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import { downloadCurrentMatrixExcel } from '../utils/excel'
import { downloadMatrixPdf } from '../utils/pdfReports'
import { peerInputsOf } from '../utils/peerScores'
import { explainMemberScore, peerSummaryOf } from '../utils/calculations'
import PeerLine from './PeerLine'
import Button from './Button'
import { Trophy } from 'lucide-react'
import { icSm } from './ui/icon'
import { tasksOutOfSync } from '../utils/assigneeSync'
import Select from './ui/Select'
import ScrollX from './ui/ScrollX'

const MIN_COL_WIDTH = 56

// "글로벌 사용자 설정 UX 신규 설계 2차" 같은 과제명이 줄바꿈 없이 한 줄로 보이는 폭.
// 과제명 컬럼만 사용자가 드래그로 늘였다 줄였다 할 수 있다.
const DEFAULT_TASK_COL_WIDTH = 320
// "기여도" 타이틀 한 줄에 딱 맞는 고정 폭 -- 조절 불가.
const SUM_COL_WIDTH = 72
const PCT_COL_WIDTH = 120
const GRADE_COL_WIDTH = 120

function ResizeHandle({
  onStart,
  onMove,
  onEnd,
}: {
  onStart: (e: React.PointerEvent<HTMLDivElement>) => void
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onEnd: () => void
}) {
  return (
    <div
      onPointerDown={onStart}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      style={{ touchAction: 'none' }}
      title="드래그해서 열 너비 조절"
      aria-hidden="true"
      className="group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize select-none items-center justify-end"
    >
      <span className="h-4 w-px bg-black/15 transition-colors group-hover:bg-accent group-active:bg-accent" />
    </div>
  )
}

// 과제리스트 담당자와 참여자(기여도 > 0)가 다른 평가과제 알림 -- 과제별 · 팀원별 보기 둘 다 위에 띄운다
export function OutOfSyncBanner() {
  const { state, dispatch } = useAppState()
  const outOfSync = useMemo(() => tasksOutOfSync(state), [state])
  if (outOfSync.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[10px] bg-orange-50 px-4 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-orange-800">
      <span>
        과제리스트의 담당자와 기여도(참여자)가 다른 평가과제가 <b>{outOfSync.length}개</b> 있습니다
        <span className="text-orange-700/80">
          {' '}
          ·{' '}
          {outOfSync
            .slice(0, 3)
            .map((t) => t.name)
            .join(', ')}
          {outOfSync.length > 3 ? ` 외 ${outOfSync.length - 3}개` : ''}
        </span>
      </span>
      <Button type="button" size="sm" variant="secondary" className="ml-auto" onClick={() => dispatch({ type: 'SYNC_CONTRIBUTIONS_TO_ASSIGNEES' })}>
        담당자대로 맞추기
      </Button>
    </div>
  )
}

export default function EvaluationMatrix() {
  const { state, dispatch } = useAppState()
  const { tasks, members, contributions, criteria } = state
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const peerInputs = peerInputsOf(state)
  const memberResults = calcMemberResults(members, tasks, contributions, criteria, peerInputs)
  // 과제별 피어리뷰(순위)의 평균 -- 기여도 칸 아래 참고로 보여 준다. 본인 평가 제외.
  const peerRankOf = useMemo(() => {
    const acc = new Map<string, { sum: number; count: number }>()
    for (const r of state.taskPeerReviews) {
      if (r.method !== 'rank' || r.reviewerMemberId === r.targetMemberId) continue
      const k = `${r.taskId}|${r.targetMemberId}`
      const cur = acc.get(k) ?? { sum: 0, count: 0 }
      acc.set(k, { sum: cur.sum + r.value, count: cur.count + 1 })
    }
    return new Map(Array.from(acc, ([k, v]) => [k, { avg: v.sum / v.count, count: v.count }]))
  }, [state.taskPeerReviews])
  const activeMembers = members.filter((m) => m.active)
  // 개인수행등급은 기준설정에서 켰을 때만 칸을 보여 준다(입력값은 보존).
  const showGrade = criteria.personalGradeWeight > 0
  // 성과등급이 하나도 없으면 점수가 전부 0이라 순위·등급이 의미 없다 -- 그때는 숨긴다.
  const hasScores = tasks.some((t) => t.performanceGrade !== null)
  const activeMemberIds = new Set(activeMembers.map((m) => m.id))

  // 과제명 컬럼 하나만 너비 조절이 가능하다 -- 나머지(기여도 합계, 팀원별
  // 기여도·개인수행등급)는 타이틀에 맞춘 고정 폭을 쓴다.
  const [taskWidth, setTaskWidth] = useState(DEFAULT_TASK_COL_WIDTH)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // 기여도·개인수행등급을 조정할 때마다 팀원 순위·등급이 바로 바뀌는 걸
  // 표 밖에서도 볼 수 있는 우측 팝오버 -- 표를 가리지 않게 기본은 닫혀 있고,
  // 버튼으로 다시 띄운다.
  const [rankingOpen, setRankingOpen] = useState(false)

  const startTaskResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startWidth: taskWidth }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [taskWidth],
  )

  const onTaskResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setTaskWidth(Math.max(MIN_COL_WIDTH, drag.startWidth + (e.clientX - drag.startX)))
  }, [])

  const onTaskResizeEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  function handlePercentChange(taskId: string, memberId: string, value: string) {
    const parsed = value === '' ? 0 : parseFloat(value)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(100, Math.max(0, parsed))
    dispatch({ type: 'SET_CONTRIBUTION_PERCENT', payload: { taskId, memberId, contributionPercent: clamped } })
  }

  function handleGradeChange(taskId: string, memberId: string, grade: PerformanceGrade) {
    dispatch({ type: 'SET_CONTRIBUTION_GRADE', payload: { taskId, memberId, personalPerformanceGrade: grade } })
  }

  function handleGradeNoteSave(taskId: string, memberId: string, note: string) {
    dispatch({ type: 'SET_CONTRIBUTION_NOTE', payload: { taskId, memberId, personalGradeNote: note } })
  }

  const invalidTasks = tasks
    .map((task) => ({ task, sum: getTaskContributionSum(contributions, task.id, activeMemberIds) }))
    .filter(({ sum }) => sum > 0 && !isContributionSumValid(sum))

  const memberCount = activeMembers.length
  const gradeW = showGrade ? GRADE_COL_WIDTH : 0
  const tableWidth = taskWidth + SUM_COL_WIDTH + memberCount * (PCT_COL_WIDTH + gradeW)
  // 과제명·기여도를 제외한 나머지 폭을 팀원 수만큼 균등하게 나누고, 그 안에서
  // 기여도(%)와 개인수행등급 폭 비율은 기본값 비율(PCT_COL_WIDTH:GRADE_COL_WIDTH)을 유지한다.
  const memberBlockShare = memberCount > 0 ? `((100% - ${taskWidth}px - ${SUM_COL_WIDTH}px) / ${memberCount})` : '0px'
  const pctColWidth = `calc(${memberBlockShare} * ${PCT_COL_WIDTH / (PCT_COL_WIDTH + gradeW)})`
  const gradeColWidth = `calc(${memberBlockShare} * ${gradeW / (PCT_COL_WIDTH + gradeW)})`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span />
        <div className="flex flex-wrap items-center gap-2">
          {hasScores && !rankingOpen && (
            <Button type="button" variant="secondary" onClick={() => setRankingOpen(true)}>
              <Trophy {...icSm} />
              실시간 순위 보기
            </Button>
          )}
          <CurrentDataDownloadControls
            onExcelDownload={() => downloadCurrentMatrixExcel(tasks, members, contributions, criteria)}
            onPdfDownload={() => downloadMatrixPdf(teamName, periodName, tasks, members, contributions, criteria)}
          />
        </div>
      </div>

      <LiveRankingPopover results={memberResults} open={hasScores && rankingOpen} onClose={() => setRankingOpen(false)} />
      <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
        팀원마다 합계 · 순위를 보며 기여도와 개인수행등급을 고칩니다. 기여도는 과제리스트 담당자끼리 똑같이 나눠 미리 채워 둡니다. 목표 · 성과는 과제관리 표에서, 분류 · 성과등급은 과제 이름 아래에서 바로 고칠 수 있습니다.
      </p>
      <OutOfSyncBanner />

      {tasks.length === 0 || activeMembers.length === 0 ? (
        <p className="mt-4 rounded-control bg-black/[0.03] px-4 py-6 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
          {tasks.length === 0 ? '평가 매트릭스를 입력하려면 먼저 과제를 등록하세요.' : '활성화된 팀원이 없습니다. 팀원 관리에서 팀원을 활성화하세요.'}
        </p>
      ) : (
        <>
          <ScrollX className="mt-4 rounded-card border border-separator bg-white">
            <table className="table-fixed border-collapse text-left text-[length:calc(14px*var(--ui-fs,1))]" style={{ width: '100%', minWidth: tableWidth }}>
              <colgroup>
                <col style={{ width: taskWidth }} />
                <col style={{ width: SUM_COL_WIDTH }} />
                {activeMembers.map((member) => (
                  <Fragment key={member.id}>
                    <col style={{ width: pctColWidth }} />
                    {showGrade && <col style={{ width: gradeColWidth }} />}
                  </Fragment>
                ))}
              </colgroup>
              <thead className="bg-[#F7F7F9] text-label">
                <tr>
                  <th
                    rowSpan={showGrade ? 2 : 1}
                    className="sticky left-0 z-20 border-b border-separator bg-[#F7F7F9] px-4 py-3 align-bottom font-semibold"
                    style={{ position: 'sticky', left: 0 }}
                  >
                    과제명
                    <ResizeHandle onStart={startTaskResize} onMove={onTaskResizeMove} onEnd={onTaskResizeEnd} />
                  </th>
                  <th
                    rowSpan={showGrade ? 2 : 1}
                    className="sticky z-20 border-b border-l border-separator bg-[#F7F7F9] px-3 py-3 align-bottom font-semibold"
                    style={{ left: taskWidth }}
                  >
                    기여도
                  </th>
                  {activeMembers.map((member) => {
                    const resultIdx = memberResults.findIndex((r) => r.member.id === member.id)
                    const result = resultIdx >= 0 ? memberResults[resultIdx] : undefined
                    return (
                      <th key={member.id} colSpan={showGrade ? 2 : 1} className="whitespace-nowrap border-b border-l border-separator px-2 py-2 text-center font-semibold">
                        {/* 이름 · 등급 / 순위 · 점수 / 피어 -- 칸이 좁아도 글자가 꺾이지 않게 줄을 나눈다(넘치면 표를 옆으로 민다) */}
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="truncate text-label" title={member.name}>
                            {member.name}
                          </span>
                          {result && hasScores && (
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[length:calc(12px*var(--ui-fs,1))] font-semibold ${gradeColor(result.grade)}`}
                              title={result.grade ? undefined : UNGRADED_HINT}
                            >
                              {gradeText(result.grade)}
                            </span>
                          )}
                        </div>
                        {result && hasScores && (
                          <div className="mt-0.5 text-xs font-normal text-label-2">
                            {resultIdx + 1}위 ·{' '}
                            <span
                              className="cursor-help tabular-nums underline decoration-dotted underline-offset-2"
                              title={explainMemberScore(member, tasks, contributions, criteria, peerInputs)}
                            >
                              {result.cumulativeScore.toFixed(1)}점
                            </span>
                          </div>
                        )}
                        <PeerLine summary={peerSummaryOf(peerInputs, member.id, criteria)} />
                      </th>
                    )
                  })}
                </tr>
                {showGrade && (
                  <tr>
                    {activeMembers.map((member) => (
                      <Fragment key={member.id}>
                        <th className="border-l border-separator px-3 py-2 text-center text-xs font-medium">기여도(%)</th>
                        <th className="px-3 py-2 text-center text-xs font-medium">개인수행등급</th>
                      </Fragment>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const sum = getTaskContributionSum(contributions, task.id, activeMemberIds)
                  const valid = sum === 0 || isContributionSumValid(sum)
                  const delta = sum - 100
                  const sumLabel = sum === 0 ? '0%' : valid ? '100%' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`
                  const taskScore = calcTaskScore(task, criteria)
                  return (
                    <tr key={task.id} className="border-t border-separator text-label">
                      <td className="sticky left-0 z-10 truncate bg-white px-4 py-3">
                        <div className="truncate font-medium">{task.name}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-label-2">
                          {/* 분류 · 성과등급: 과제관리에서 못 넣었으면 여기서 바로 고친다 */}
                          <Select
                            value={task.importance}
                            title="분류(과제 · 일반 · 일상) -- 여기서 바꿀 수 있습니다"
                            onChange={(e) => dispatch({ type: 'UPDATE_TASK', payload: { ...task, importance: e.target.value as Importance } })}
                            className="h-6 rounded-full border border-hairline px-2 text-xs font-medium text-label"
                          >
                            {Array.from(new Set<string>([...IMPORTANCE_OPTIONS, task.importance])).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </Select>
                          {criteria.workloadWeight > 0 && <span>· 업무량 {task.workload}</span>}
                          <span>·</span>
                          <Select
                            value={task.performanceGrade ?? ''}
                            title={`성과등급 -- 여기서 입력 · 수정할 수 있습니다 · 과제 점수 ${taskScore.toFixed(1)}`}
                            onChange={(e) => dispatch({ type: 'UPDATE_TASK', payload: { ...task, performanceGrade: (e.target.value || null) as PerformanceGrade | null } })}
                            className={`h-6 rounded-full border px-2 text-xs font-medium ${
                              task.performanceGrade ? 'border-hairline text-label' : 'border-warning/50 bg-warning/10 text-warning'
                            }`}
                          >
                            <option value="">성과등급 미입력</option>
                            {PERFORMANCE_GRADE_OPTIONS.map((o) => (
                              <option key={o} value={o}>
                                성과 {o}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </td>
                      <td
                        className={`sticky z-10 border-l border-separator bg-white px-3 py-3 font-semibold ${valid ? 'text-success' : 'text-danger'}`}
                        style={{ left: taskWidth }}
                        title={valid ? '기여도 합계 100%' : `100% 기준 ${sumLabel} (${delta > 0 ? '초과' : '부족'})`}
                      >
                        {sumLabel}
                      </td>
                      {activeMembers.map((member) => {
                        const percent = getContributionPercent(contributions, task.id, member.id)
                        const grade = getPersonalPerformanceGrade(contributions, task.id, member.id)
                        const gradeEnabled = criteria.personalGradeWeight > 0 && percent > 0
                        const note = getContribution(contributions, task.id, member.id)?.personalGradeNote
                        return (
                          <Fragment key={member.id}>
                            <td className="border-l border-separator px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={percent || ''}
                                onChange={(e) => handlePercentChange(task.id, member.id, e.target.value)}
                                className={`h-8 w-full rounded-control border border-hairline px-2 text-[length:calc(14px*var(--ui-fs,1))] text-label ${percent ? '' : 'bg-black/[0.03]'}`}
                              />
                              {(() => {
                                const pr = peerRankOf.get(`${task.id}|${member.id}`)
                                if (!pr) return null
                                return (
                                  <p
                                    className="mt-0.5 whitespace-nowrap text-[length:calc(12px*var(--ui-fs,1))] text-label-3"
                                    title={`동료 ${pr.count}명이 매긴 이 과제 안 순위의 평균(본인 평가 제외) · 기여도를 정할 때 참고`}
                                  >
                                    동료 {pr.avg.toFixed(1)}위
                                  </p>
                                )
                              })()}
                            </td>
                            {showGrade && (
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  {/* 아직 안 매긴 칸은 빈 값으로 둔다 -- 예전처럼
                                    'B'가 미리 선택돼 있으면 팀장이 고른 것인지
                                    앱이 채운 것인지 구분할 수 없다. */}
                                  <Select
                                    value={grade ?? ''}
                                    disabled={!gradeEnabled}
                                    title={percent === 0 ? '기여도가 0이면 개인수행등급을 설정할 수 없습니다' : undefined}
                                    onChange={(e) => handleGradeChange(task.id, member.id, e.target.value as PerformanceGrade)}
                                    className={`h-8 w-full min-w-0 rounded-control border border-hairline px-2 text-[length:calc(14px*var(--ui-fs,1))] ${
                                      gradeEnabled ? 'text-label' : 'bg-black/[0.05] text-label-3'
                                    }`}
                                  >
                                    <option value="" disabled>
                                      미입력
                                    </option>
                                    {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </Select>
                                  {gradeEnabled && (
                                    <GradeNoteButton
                                      note={note}
                                      label={`${task.name} · ${member.name}`}
                                      onSave={(next) => handleGradeNoteSave(task.id, member.id, next)}
                                    />
                                  )}
                                </div>
                              </td>
                            )}
                          </Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollX>

          {invalidTasks.length > 0 && (
            <div className="mt-3 space-y-1 rounded-control border border-danger/30 bg-danger/10 px-4 py-3">
              {invalidTasks.map(({ task, sum }) => {
                const diff = 100 - sum
                const action = diff > 0 ? `${diff.toFixed(0)}%를 추가하세요` : `${Math.abs(diff).toFixed(0)}%를 줄이세요`
                return (
                  <p key={task.id} className="text-[length:calc(14px*var(--ui-fs,1))] text-danger">
                    '{task.name}' 과제의 기여도 합계가 {sum.toFixed(0)}%입니다. {action}.
                  </p>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

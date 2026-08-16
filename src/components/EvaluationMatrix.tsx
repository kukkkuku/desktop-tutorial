import { Fragment, useCallback, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { PerformanceGrade } from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'
import {
  calcMemberResults,
  calcTaskScore,
  getContributionPercent,
  getPersonalPerformanceGrade,
  getTaskContributionSum,
  isContributionSumValid,
  GRADE_COLORS,
} from '../utils/calculations'

const MEDALS = ['🥇', '🥈', '🥉']
const MIN_COL_WIDTH = 56

// "글로벌 사용자 설정 UX 신규 설계 2차" 같은 과제명이 줄바꿈 없이 한 줄로 보이는 폭.
const DEFAULT_TASK_COL_WIDTH = 320
// 헤더 "기여도 / 합계" 두 줄 중 더 긴 글자에 딱 맞는 폭.
const DEFAULT_SUM_COL_WIDTH = 84
const DEFAULT_PCT_COL_WIDTH = 104
const DEFAULT_GRADE_COL_WIDTH = 120

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
      <span className="h-4 w-px bg-gray-300 transition-colors group-hover:bg-accent group-active:bg-accent" />
    </div>
  )
}

export default function EvaluationMatrix() {
  const { state, dispatch } = useAppState()
  const { tasks, members, contributions, criteria, peerReviews } = state
  const memberResults = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const activeMembers = members.filter((m) => m.active)
  const activeMemberIds = new Set(activeMembers.map((m) => m.id))

  // 과제명/기여도합계/팀원별 기여도·개인수행등급 컬럼 너비 -- 팀원 목록에 따라
  // 컬럼 키가 동적으로 생기므로 useResizableColumns(고정 키 전용)를 쓰지 않고
  // 여기서 직접 문자열 키 기반으로 관리한다.
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null)

  const getWidth = useCallback((key: string, fallback: number) => colWidths[key] ?? fallback, [colWidths])

  const startResize = useCallback(
    (key: string, fallback: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragRef.current = { key, startX: e.clientX, startWidth: colWidths[key] ?? fallback }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [colWidths],
  )

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const next = Math.max(MIN_COL_WIDTH, drag.startWidth + (e.clientX - drag.startX))
    setColWidths((prev) => ({ ...prev, [drag.key]: next }))
  }, [])

  const onResizeEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  function handlePercentChange(taskId: string, memberId: string, value: string) {
    const parsed = value === '' ? 0 : parseFloat(value)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(100, Math.max(0, parsed))
    dispatch({ type: 'SET_CONTRIBUTION_PERCENT', payload: { taskId, memberId, contributionPercent: clamped } })
  }

  function handleGradeChange(taskId: string, memberId: string, grade: PerformanceGrade) {
    dispatch({
      type: 'SET_CONTRIBUTION_GRADE',
      payload: { taskId, memberId, personalPerformanceGrade: grade },
    })
  }

  const invalidTasks = tasks
    .map((task) => ({ task, sum: getTaskContributionSum(contributions, task.id, activeMemberIds) }))
    .filter(({ sum }) => sum > 0 && !isContributionSumValid(sum))

  const taskWidth = getWidth('task', DEFAULT_TASK_COL_WIDTH)
  const sumWidth = getWidth('sum', DEFAULT_SUM_COL_WIDTH)
  const memberColTotal = activeMembers.reduce(
    (total, m) => total + getWidth(`${m.id}_pct`, DEFAULT_PCT_COL_WIDTH) + getWidth(`${m.id}_grade`, DEFAULT_GRADE_COL_WIDTH),
    0,
  )
  const tableWidth = taskWidth + sumWidth + memberColTotal

  return (
    <div>
      <h3 className="text-lg font-semibold text-black">평가 매트릭스</h3>
      <p className="mt-1 text-sm text-gray-600">
        과제(행) × 팀원(열)로 기여도와 개인수행등급을 입력하세요. 참여하지 않은 칸은 비워두면 됩니다.{' '}
        <strong className="text-black">기여도</strong>와 <strong className="text-black">개인수행등급</strong> 컬럼은
        항상 표시되며, 개인수행등급을 사용하지 않도록 설정했거나 해당 칸의 기여도가 0이면 회색으로
        비활성화됩니다(입력값은 보존).{' '}
        각 과제의 기여도 합계는 반드시 100이 되어야 합니다. 기여도 합계 열은 좌측에 고정되어 스크롤해도 항상 보입니다.{' '}
        비활성 팀원은 매트릭스에서 제외되며 기여도 합계에도 포함되지 않습니다. 컬럼 경계를 드래그하면 너비를 조절할 수 있습니다.
      </p>

      {tasks.length === 0 || activeMembers.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          {tasks.length === 0
            ? '평가 매트릭스를 입력하려면 먼저 과제를 등록하세요.'
            : '활성화된 팀원이 없습니다. 팀원 관리에서 팀원을 활성화하세요.'}
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
            <table className="table-fixed border-collapse text-left text-sm" style={{ width: tableWidth }}>
              <colgroup>
                <col style={{ width: taskWidth }} />
                <col style={{ width: sumWidth }} />
                {activeMembers.map((member) => (
                  <Fragment key={member.id}>
                    <col style={{ width: getWidth(`${member.id}_pct`, DEFAULT_PCT_COL_WIDTH) }} />
                    <col style={{ width: getWidth(`${member.id}_grade`, DEFAULT_GRADE_COL_WIDTH) }} />
                  </Fragment>
                ))}
              </colgroup>
              <thead className="bg-[#F3F4F6] text-black">
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-20 border-b border-gray-200 bg-[#F3F4F6] px-4 py-3 align-bottom font-semibold"
                    style={{ position: 'sticky', left: 0 }}
                  >
                    <div className="relative pr-2">
                      과제명
                      <ResizeHandle onStart={startResize('task', DEFAULT_TASK_COL_WIDTH)} onMove={onResizeMove} onEnd={onResizeEnd} />
                    </div>
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky z-20 border-b border-l border-gray-200 bg-[#F3F4F6] px-3 py-3 align-bottom font-semibold leading-tight"
                    style={{ left: taskWidth }}
                  >
                    <div className="relative whitespace-nowrap pr-2">
                      기여도
                      <br />
                      합계
                      <ResizeHandle onStart={startResize('sum', DEFAULT_SUM_COL_WIDTH)} onMove={onResizeMove} onEnd={onResizeEnd} />
                    </div>
                  </th>
                  {activeMembers.map((member) => {
                    const resultIdx = memberResults.findIndex((r) => r.member.id === member.id)
                    const result = resultIdx >= 0 ? memberResults[resultIdx] : undefined
                    return (
                      <th
                        key={member.id}
                        colSpan={2}
                        className="border-b border-l border-gray-200 px-3 py-2 text-center font-semibold"
                      >
                        <div className="text-black">{member.name}</div>
                        {result ? (
                          <div className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-normal text-gray-500">
                            <span>{resultIdx < 3 ? MEDALS[resultIdx] : `${resultIdx + 1}위`}</span>
                            <span>{result.cumulativeScore.toFixed(1)}점</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${GRADE_COLORS[result.grade]}`}>
                              {result.grade}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-gray-300">-</div>
                        )}
                      </th>
                    )
                  })}
                </tr>
                <tr>
                  {activeMembers.map((member) => (
                    <Fragment key={member.id}>
                      <th className="relative border-l border-gray-200 px-3 py-2 text-center text-xs font-medium">
                        기여도(%)
                        <ResizeHandle
                          onStart={startResize(`${member.id}_pct`, DEFAULT_PCT_COL_WIDTH)}
                          onMove={onResizeMove}
                          onEnd={onResizeEnd}
                        />
                      </th>
                      <th className="relative px-3 py-2 text-center text-xs font-medium">
                        개인수행등급
                        <ResizeHandle
                          onStart={startResize(`${member.id}_grade`, DEFAULT_GRADE_COL_WIDTH)}
                          onMove={onResizeMove}
                          onEnd={onResizeEnd}
                        />
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const sum = getTaskContributionSum(contributions, task.id, activeMemberIds)
                  const valid = sum === 0 || isContributionSumValid(sum)
                  const delta = sum - 100
                  const sumLabel = sum === 0 ? '0%' : valid ? '100%' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`
                  const taskScore = calcTaskScore(task, criteria)
                  return (
                    <tr key={task.id} className="border-t border-gray-200 text-black">
                      <td className="sticky left-0 z-10 truncate bg-white px-4 py-3">
                        <div className="truncate font-medium">{task.name}</div>
                        <div className="mt-0.5 truncate text-xs text-gray-500">
                          {task.importance} · 업무량 {task.workload} · 점수 {taskScore.toFixed(1)}
                        </div>
                      </td>
                      <td
                        className={`sticky z-10 border-l border-gray-200 bg-white px-3 py-3 font-semibold ${
                          valid ? 'text-success' : 'text-danger'
                        }`}
                        style={{ left: taskWidth }}
                        title={valid ? '기여도 합계 100%' : `100% 기준 ${sumLabel} (${delta > 0 ? '초과' : '부족'})`}
                      >
                        {sumLabel}
                      </td>
                      {activeMembers.map((member) => {
                        const percent = getContributionPercent(contributions, task.id, member.id)
                        const grade = getPersonalPerformanceGrade(contributions, task.id, member.id)
                        const gradeEnabled = criteria.personalGradeWeight > 0 && percent > 0
                        return (
                          <Fragment key={member.id}>
                            <td className="border-l border-gray-200 px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={percent || ''}
                                onChange={(e) => handlePercentChange(task.id, member.id, e.target.value)}
                                placeholder="0"
                                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={grade}
                                disabled={!gradeEnabled}
                                title={percent === 0 ? '기여도가 0이면 개인수행등급을 설정할 수 없습니다' : undefined}
                                onChange={(e) => handleGradeChange(task.id, member.id, e.target.value as PerformanceGrade)}
                                className={`w-full rounded-md border px-2 py-1 text-sm ${
                                  gradeEnabled ? 'border-gray-300 text-black' : 'border-gray-200 bg-gray-100 text-gray-400'
                                }`}
                              >
                                {PERFORMANCE_GRADE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-success">
              <span className="h-2.5 w-2.5 rounded-full bg-success" /> 기여도 합계 100% (정상)
            </span>
            <span className="flex items-center gap-1.5 text-danger">
              <span className="h-2.5 w-2.5 rounded-full bg-danger" /> 기여도 합계 100% 아님 (저장 불가 — 합계를 맞춰주세요)
            </span>
          </div>

          {invalidTasks.length > 0 && (
            <div className="mt-3 space-y-1 rounded-md border border-danger/30 bg-red-50 px-4 py-3">
              {invalidTasks.map(({ task, sum }) => {
                const diff = 100 - sum
                const action = diff > 0 ? `${diff.toFixed(0)}%를 추가하세요` : `${Math.abs(diff).toFixed(0)}%를 줄이세요`
                return (
                  <p key={task.id} className="text-sm text-danger">
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

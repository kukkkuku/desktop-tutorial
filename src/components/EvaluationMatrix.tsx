import { Fragment } from 'react'
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
import { useResizableColumns } from '../hooks/useResizableColumns'
import ResizableTh from './table/ResizableTh'

const MEDALS = ['🥇', '🥈', '🥉']

const RESULT_COLUMNS = {
  rank: 70,
  name: 160,
  grade: 90,
  score: 100,
}

export default function EvaluationMatrix() {
  const { state, dispatch } = useAppState()
  const resultCols = useResizableColumns(RESULT_COLUMNS)
  const { tasks, members, contributions, criteria, peerReviews } = state
  const memberResults = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const activeMembers = members.filter((m) => m.active)
  const activeMemberIds = new Set(activeMembers.map((m) => m.id))

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

  return (
    <div>
      <h3 className="text-lg font-semibold text-black">평가 매트릭스</h3>
      <p className="mt-1 text-sm text-gray-600">
        과제(행) × 팀원(열)로 기여도와 개인수행등급을 입력하세요. 참여하지 않은 칸은 비워두면 됩니다.{' '}
        <strong className="text-black">기여도</strong>와 <strong className="text-black">개인수행등급</strong> 컬럼은
        항상 표시되며, 개인수행등급을 사용하지 않도록 설정했거나 해당 칸의 기여도가 0이면 회색으로
        비활성화됩니다(입력값은 보존).{' '}
        각 과제의 기여도 합계는 반드시 100이 되어야 합니다. 기여도 합계 열은 좌측에 고정되어 스크롤해도 항상 보입니다.{' '}
        비활성 팀원은 매트릭스에서 제외되며 기여도 합계에도 포함되지 않습니다.
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
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#F3F4F6] text-black">
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-20 w-40 min-w-[10rem] border-b border-gray-200 bg-[#F3F4F6] px-4 py-3 align-bottom font-semibold"
                  >
                    과제 \ 팀원
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky left-40 z-20 border-b border-l border-gray-200 bg-[#F3F4F6] px-4 py-3 align-bottom font-semibold"
                  >
                    기여도 합계
                  </th>
                  {activeMembers.map((member) => (
                    <th
                      key={member.id}
                      colSpan={2}
                      className="border-b border-l border-gray-200 px-4 py-2 text-center font-semibold"
                    >
                      {member.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  {activeMembers.map((member) => (
                    <Fragment key={member.id}>
                      <th className="border-l border-gray-200 px-3 py-2 text-center text-xs font-medium">
                        기여도(%)
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium">개인수행등급</th>
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
                      <td className="sticky left-0 z-10 w-40 min-w-[10rem] bg-white px-4 py-3">
                        <div className="font-medium">{task.name}</div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {task.importance} · 업무량 {task.workload} · 점수 {taskScore.toFixed(1)}
                        </div>
                      </td>
                      <td
                        className={`sticky left-40 z-10 border-l border-gray-200 bg-white px-4 py-3 font-semibold ${
                          valid ? 'text-success' : 'text-danger'
                        }`}
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
                                className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={grade}
                                disabled={!gradeEnabled}
                                title={percent === 0 ? '기여도가 0이면 개인수행등급을 설정할 수 없습니다' : undefined}
                                onChange={(e) => handleGradeChange(task.id, member.id, e.target.value as PerformanceGrade)}
                                className={`w-16 rounded-md border px-2 py-1 text-sm ${
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

          <h3 className="mt-8 text-lg font-semibold text-black">팀원 평가 결과</h3>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="table-fixed text-left text-sm" style={{ width: resultCols.totalWidth }}>
              <thead className="bg-[#F3F4F6] text-black">
                <tr>
                  {(
                    [
                      ['rank', '순위', 'text-center'],
                      ['name', '팀원명', ''],
                      ['grade', '등급', 'text-center'],
                      ['score', '점수', 'text-right'],
                    ] as const
                  ).map(([key, label, align]) => (
                    <ResizableTh
                      key={key}
                      width={resultCols.widths[key]}
                      onResizeStart={resultCols.startResize(key)}
                      onResizeMove={resultCols.onResizeMove}
                      onResizeEnd={resultCols.onResizeEnd}
                      className={`px-4 py-2.5 font-semibold ${align}`}
                    >
                      {label}
                    </ResizableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memberResults.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      활성화된 팀원이 없습니다.
                    </td>
                  </tr>
                )}
                {memberResults.map((row, index) => (
                  <tr key={row.member.id} className="border-t border-gray-200 text-black">
                    <td className="px-4 py-2.5 text-center font-semibold">{MEDALS[index] ?? index + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{row.member.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_COLORS[row.grade]}`}>
                        {row.grade}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">
                      {row.cumulativeScore.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

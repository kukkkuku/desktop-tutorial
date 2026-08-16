import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import { useTeamProfile } from '../state/TeamContext'
import { calcAllTaskScores, calcMemberResults, GRADE_COLORS } from '../utils/calculations'
import { calcPromotionReadiness } from '../utils/promotion'
import { downloadIndividualResultReports, downloadResultsReport } from '../utils/excel'
import { useResizableColumns } from '../hooks/useResizableColumns'
import PromotionBadge from './PromotionBadge'
import ResizableTh from './table/ResizableTh'

const MEDALS = ['🥇', '🥈', '🥉']

const RANKING_COLUMNS = {
  rank: 80,
  name: 180,
  role: 140,
  tasks: 120,
  weighted: 170,
  cumulative: 120,
  grade: 110,
}

const TASK_COLUMNS = {
  name: 180,
  performanceGrade: 100,
  taskGrade: 100,
  workload: 90,
  achievement: 180,
  score: 90,
  contributors: 200,
}

export default function EvaluationResults() {
  const { state } = useAppState()
  const { openMemberDetail } = useMemberDetail()
  const { profile } = useTeamProfile()
  const rankingCols = useResizableColumns(RANKING_COLUMNS)
  const taskCols = useResizableColumns(TASK_COLUMNS)
  const { tasks, members, contributions, criteria, meetingNotes, peerReviews } = state

  const taskScores = calcAllTaskScores(tasks, criteria)
  const memberResults = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const activeMemberNameById = new Map(members.filter((m) => m.active).map((m) => [m.id, m.name]))

  function readinessFor(memberId: string) {
    const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
    const member = members.find((m) => m.id === memberId)
    if (!member) return null
    return calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores)
  }

  function taskContributors(taskId: string) {
    return contributions
      .filter((c) => c.taskId === taskId && c.contributionPercent > 0 && activeMemberNameById.has(c.memberId))
      .sort((a, b) => b.contributionPercent - a.contributionPercent)
      .map((c) => ({ name: activeMemberNameById.get(c.memberId)!, percent: c.contributionPercent }))
  }
  const maxScore = Math.max(1, ...memberResults.map((r) => r.weightedAverageScore))
  const CHART_HEIGHT = 180
  const avgWeightedScore =
    memberResults.length > 0
      ? memberResults.reduce((sum, r) => sum + r.weightedAverageScore, 0) / memberResults.length
      : 0
  const avgLineTop = CHART_HEIGHT - Math.min(CHART_HEIGHT, (avgWeightedScore / maxScore) * CHART_HEIGHT)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-black">평가 결과</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadResultsReport(members, tasks, contributions, criteria, meetingNotes, peerReviews)}
            disabled={memberResults.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            결과 리포트 엑셀 다운로드
          </button>
          <button
            onClick={() => downloadIndividualResultReports(members, tasks, contributions, criteria, meetingNotes, peerReviews)}
            disabled={memberResults.length === 0}
            className="rounded-md border-2 border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            팀원별 결과 개별 다운로드
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        설정한 기준에 따라 계산된 팀원별 종합 점수와 순위입니다. '팀원별 결과 개별 다운로드'는 전체 순위 없이 본인
        점수만 담긴 파일을 팀원별로 각각 만들어줍니다 — 개인에게 결과만 따로 전달할 때 사용하세요.
      </p>

      {memberResults.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-500">팀원별 종합 점수(가중평균)</h3>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="h-0 w-4 border-t-2 border-dashed border-gray-400" />
              팀 평균 {avgWeightedScore.toFixed(1)}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-gray-500">
            <strong className="text-black">누적 점수</strong>는 참여한 모든 과제의 점수에 기여도(%)를 반영해 합산한
            값이고, <strong className="text-black">종합 점수(가중평균)</strong>는 이를 참여 비중(기여도 합)으로 나눠
            업무량이 달라도 서로 비교할 수 있게 만든 값입니다.{' '}
            <strong className="text-black">평가등급</strong>과 <strong className="text-black">순위</strong>는 누적
            점수가 팀 평균 대비 어느 정도인지(비율)를 기준으로 정해집니다.
          </p>
          <div className="mt-4 overflow-x-auto pb-2">
            <div className="relative flex items-start gap-4">
              <div
                className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-gray-400"
                style={{ top: `${avgLineTop}px` }}
              />
              {memberResults.map((row) => {
                const aboveAverage = row.weightedAverageScore >= avgWeightedScore
                const barHeightPx = Math.max(4, (row.weightedAverageScore / maxScore) * CHART_HEIGHT)
                return (
                  <div key={row.member.id} className="flex flex-col items-center gap-2">
                    <div className="relative flex w-12 items-end justify-center" style={{ height: CHART_HEIGHT }}>
                      <span
                        className="absolute text-xs font-semibold text-black"
                        style={{ bottom: `${barHeightPx + 4}px` }}
                      >
                        {row.weightedAverageScore.toFixed(1)}
                      </span>
                      <div
                        className={`w-12 rounded-t-md ${aboveAverage ? 'bg-accent' : 'bg-gray-300'}`}
                        style={{ height: `${barHeightPx}px` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600">{row.member.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> 평균 이상
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gray-300" /> 평균 미만
            </span>
          </div>
        </div>
      )}

      <h3 className="mt-8 text-lg font-semibold text-black">팀원별 순위</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              {(
                [
                  ['rank', '순위'],
                  ['name', '이름'],
                  ['role', '역할'],
                  ['tasks', '참여 과제 수'],
                  ['weighted', '종합 점수(가중평균)'],
                  ['cumulative', '누적 점수'],
                  ['grade', '평가등급'],
                ] as const
              ).map(([key, label]) => (
                <ResizableTh key={key} width={rankingCols.widths[key]} onResizeStart={rankingCols.startResize(key)} onResizeMove={rankingCols.onResizeMove} onResizeEnd={rankingCols.onResizeEnd}>
                  {label}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {memberResults.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  활성화된 팀원이 없습니다.
                </td>
              </tr>
            )}
            {memberResults.map((row, index) => (
              <tr key={row.member.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-semibold">{MEDALS[index] ?? index + 1}</td>
                <td className="px-4 py-3 font-medium">
                  <button
                    onClick={() => openMemberDetail(row.member.id)}
                    className="flex items-center gap-1.5 text-left hover:text-accent hover:underline"
                  >
                    {row.member.name}
                    <PromotionBadge readiness={readinessFor(row.member.id)} />
                  </button>
                </td>
                <td className="px-4 py-3">{row.member.role || '-'}</td>
                <td className="px-4 py-3">{row.participatedTaskCount}건</td>
                <td className="px-4 py-3">{row.weightedAverageScore.toFixed(1)}</td>
                <td className="px-4 py-3 font-semibold">{row.cumulativeScore.toFixed(1)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${GRADE_COLORS[row.grade]}`}>
                    {row.grade}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-lg font-semibold text-black">과제별 현황</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              {(
                [
                  ['name', '과제명'],
                  ['performanceGrade', '성과등급'],
                  ['taskGrade', '과제등급'],
                  ['workload', '업무량'],
                  ['achievement', '성과'],
                  ['score', '점수'],
                  ['contributors', '팀원별 기여도'],
                ] as const
              ).map(([key, label]) => (
                <ResizableTh key={key} width={taskCols.widths[key]} onResizeStart={taskCols.startResize(key)} onResizeMove={taskCols.onResizeMove} onResizeEnd={taskCols.onResizeEnd}>
                  {label}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {taskScores.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  등록된 과제가 없습니다.
                </td>
              </tr>
            )}
            {taskScores.map(({ task, score }) => {
              const contributors = taskContributors(task.id)
              return (
                <tr key={task.id} className="border-t border-gray-200 text-black">
                  <td className="px-4 py-3 font-medium">{task.name}</td>
                  <td className="px-4 py-3">{task.performanceGrade}</td>
                  <td className="px-4 py-3">{task.importance}</td>
                  <td className="px-4 py-3">{task.workload}</td>
                  <td className="px-4 py-3 text-gray-600">{task.achievement || '-'}</td>
                  <td className="px-4 py-3 font-semibold">{score.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    {contributors.length === 0 ? (
                      <span className="text-gray-400">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {contributors.map((c) => (
                          <span
                            key={c.name}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                          >
                            {c.name} {c.percent}%
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

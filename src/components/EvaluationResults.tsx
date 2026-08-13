import { useAppState } from '../state/AppContext'
import { calcAllTaskScores, calcMemberResults, GRADE_COLORS } from '../utils/calculations'
import { downloadIndividualResultReports, downloadResultsReport } from '../utils/excel'

const MEDALS = ['🥇', '🥈', '🥉']

export default function EvaluationResults() {
  const { state } = useAppState()
  const { tasks, members, contributions, criteria, meetingNotes, peerReviews } = state

  const taskScores = calcAllTaskScores(tasks, criteria)
  const memberResults = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
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
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">순위</th>
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">역할</th>
              <th className="px-4 py-3 font-semibold">참여 과제 수</th>
              <th className="px-4 py-3 font-semibold">종합 점수(가중평균)</th>
              <th className="px-4 py-3 font-semibold">누적 점수(단순합)</th>
            </tr>
          </thead>
          <tbody>
            {memberResults.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  활성화된 팀원이 없습니다.
                </td>
              </tr>
            )}
            {memberResults.map((row, index) => (
              <tr key={row.member.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-semibold">{MEDALS[index] ?? index + 1}</td>
                <td className="px-4 py-3 font-medium">{row.member.name}</td>
                <td className="px-4 py-3">{row.member.role || '-'}</td>
                <td className="px-4 py-3">{row.participatedTaskCount}건</td>
                <td className="px-4 py-3 font-semibold">{row.weightedAverageScore.toFixed(1)}</td>
                <td className="px-4 py-3">{row.cumulativeScore.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-lg font-semibold text-black">과제별 현황</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">과제명</th>
              <th className="px-4 py-3 font-semibold">성과등급</th>
              <th className="px-4 py-3 font-semibold">과제등급</th>
              <th className="px-4 py-3 font-semibold">업무량</th>
              <th className="px-4 py-3 font-semibold">성과</th>
              <th className="px-4 py-3 font-semibold">점수</th>
            </tr>
          </thead>
          <tbody>
            {taskScores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  등록된 과제가 없습니다.
                </td>
              </tr>
            )}
            {taskScores.map(({ task, score }) => (
              <tr key={task.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-medium">{task.name}</td>
                <td className="px-4 py-3">{task.performanceGrade}</td>
                <td className="px-4 py-3">{task.importance}</td>
                <td className="px-4 py-3">{task.workload}</td>
                <td className="px-4 py-3 text-gray-600">{task.achievement || '-'}</td>
                <td className="px-4 py-3 font-semibold">{score.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-lg font-semibold text-black">팀원별 평가등급</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">팀원명</th>
              <th className="px-4 py-3 font-semibold">누적점수</th>
              <th className="px-4 py-3 font-semibold">기대점수</th>
              <th className="px-4 py-3 font-semibold">비율</th>
              <th className="px-4 py-3 font-semibold">평가등급</th>
            </tr>
          </thead>
          <tbody>
            {memberResults.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  활성화된 팀원이 없습니다.
                </td>
              </tr>
            )}
            {memberResults.map((row) => (
              <tr key={row.member.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-medium">{row.member.name}</td>
                <td className="px-4 py-3">{row.cumulativeScore.toFixed(1)}</td>
                <td className="px-4 py-3">{row.expectedScore.toFixed(1)}</td>
                <td className="px-4 py-3">{(row.ratio * 100).toFixed(1)}%</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${GRADE_COLORS[row.grade]}`}
                  >
                    {row.grade}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-lg font-semibold text-black">평가 기준 현황</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <CriteriaBadge label="성과등급" weight={criteria.performanceGradeWeight} />
        <CriteriaBadge label="과제등급" weight={criteria.taskGradeWeight} />
        <CriteriaBadge label="업무량" weight={criteria.workloadWeight} />
        <CriteriaBadge label="개인수행등급" weight={criteria.personalGradeWeight} />
        <CriteriaBadge label="피어리뷰" weight={criteria.peerReviewWeight} />
        <CriteriaBadge label="기여도" weight={100} />
      </div>
    </div>
  )
}

function CriteriaBadge({ label, weight }: { label: string; weight: number }) {
  const active = weight > 0
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-orange-50 text-accent' : 'bg-gray-100 text-gray-400'
      }`}
    >
      {label} {weight}%
    </span>
  )
}

import { useAppState } from '../state/AppContext'
import { calcAllTaskScores, calcMemberResults, GRADE_COLORS } from '../utils/calculations'
import { downloadResultsReport } from '../utils/excel'

const MEDALS = ['🥇', '🥈', '🥉']

export default function EvaluationResults() {
  const { state } = useAppState()
  const { tasks, members, contributions, criteria, meetingNotes } = state

  const taskScores = calcAllTaskScores(tasks, criteria)
  const memberResults = calcMemberResults(members, tasks, contributions, criteria)
  const maxScore = Math.max(1, ...memberResults.map((r) => r.weightedAverageScore))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-black">평가 결과</h2>
        <button
          onClick={() => downloadResultsReport(members, tasks, contributions, criteria, meetingNotes)}
          disabled={memberResults.length === 0}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          결과 리포트 엑셀 다운로드
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        설정한 기준에 따라 계산된 팀원별 종합 점수와 순위입니다.
      </p>

      {memberResults.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-500">팀원별 종합 점수(가중평균)</h3>
          <div className="mt-4 flex items-end gap-4 overflow-x-auto pb-2" style={{ minHeight: 200 }}>
            {memberResults.map((row) => (
              <div key={row.member.id} className="flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-black">{row.weightedAverageScore.toFixed(1)}</span>
                <div
                  className="w-12 rounded-t-md bg-accent"
                  style={{ height: `${Math.max(4, (row.weightedAverageScore / maxScore) * 180)}px` }}
                />
                <span className="text-xs text-gray-600">{row.member.name}</span>
              </div>
            ))}
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
              <th className="px-4 py-3 font-semibold">중요도</th>
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
        <CriteriaBadge label="성과등급" active={criteria.usePerformanceGrade} />
        <CriteriaBadge label="중요도" active={criteria.useImportance} />
        <CriteriaBadge label="업무량" active={criteria.useWorkload} />
        <CriteriaBadge label="개인수행등급" active={criteria.usePersonalPerformanceGrade} />
        <CriteriaBadge label="기여도" active />
      </div>
    </div>
  )
}

function CriteriaBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-orange-50 text-accent' : 'bg-gray-100 text-gray-400'
      }`}
    >
      {active ? '✓' : '✕'} {label}
    </span>
  )
}

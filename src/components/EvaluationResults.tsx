import { useAppState } from '../state/AppContext'
import { calcAllTaskScores, calcMemberResults, GRADE_COLORS } from '../utils/calculations'

export default function EvaluationResults() {
  const { state } = useAppState()
  const { tasks, members, contributions, criteria } = state

  const taskScores = calcAllTaskScores(tasks, criteria)
  const memberResults = calcMemberResults(members, tasks, contributions, criteria)

  return (
    <div>
      <h2 className="text-xl font-bold text-black">평가 결과</h2>

      <h3 className="mt-6 text-lg font-semibold text-black">과제별 현황</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">과제명</th>
              <th className="px-4 py-3 font-semibold">성과등급</th>
              <th className="px-4 py-3 font-semibold">중요도</th>
              <th className="px-4 py-3 font-semibold">업무량</th>
              <th className="px-4 py-3 font-semibold">점수</th>
            </tr>
          </thead>
          <tbody>
            {taskScores.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
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
                <td className="px-4 py-3 font-semibold">{score.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-lg font-semibold text-black">팀원별 성과</h3>
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

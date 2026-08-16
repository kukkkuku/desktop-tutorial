import type { WorkspaceMeta } from '../../types'
import { GRADE_COLORS } from '../../utils/calculations'
import { getMemberPerformanceHistory } from '../../utils/memberHistory'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'

interface MemberPerformanceHistoryPanelProps {
  memberId: string
  periods: WorkspaceMeta[]
}

// 기존에 계산된 성과 데이터(참여 과제·기여도·개인 수행등급·개인 성과점수·종합점수·평가등급·순위)를
// 그대로 재사용한다 — 이 화면을 위해 별도로 입력하거나 복제 저장하지 않는다.
export default function MemberPerformanceHistoryPanel({ memberId, periods }: MemberPerformanceHistoryPanelProps) {
  const history = getMemberPerformanceHistory(memberId, periods)

  if (history.length === 0) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">참여한 평가 기간이 없습니다.</p>
  }

  return (
    <div className="space-y-5">
      {history.map(({ workspace, rank, cumulativeScore, grade, tasks }) => (
        <div key={workspace.id} className="rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-black">{workspace.periodName}</h4>
            {grade && cumulativeScore !== null && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {rank && <span className="font-semibold text-black">{rank}위</span>}
                <span>누적 {cumulativeScore.toFixed(1)}</span>
                <span className={`rounded-full px-2 py-0.5 font-bold ${GRADE_COLORS[grade]}`}>{grade}</span>
              </div>
            )}
          </div>

          {tasks.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-400">참여한 과제가 없습니다.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {tasks.map((t) => (
                <div key={t.taskId} className="rounded-md bg-gray-50 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-black">{t.taskName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[t.importance]}`}>
                      {t.importance}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-gray-500">
                    <span>기여도 {t.contributionPercent}%</span>
                    <span>개인 수행등급 {t.personalGrade}</span>
                    <span>개인 성과점수 {t.personalScore.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

import { useState } from 'react'
import type { WorkspaceMeta } from '../../types'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { GRADE_COLORS } from '../../utils/calculations'
import { getMemberPerformanceHistory } from '../../utils/memberHistory'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'

interface MemberPerformanceHistoryPanelProps {
  memberId: string
  periods: WorkspaceMeta[]
}

// 기존에 계산된 성과 데이터(참여 과제·기여도·개인 수행등급·개인 성과점수·종합점수·평가등급·순위)를
// 그대로 재사용한다 — 이 화면을 위해 별도로 입력하거나 복제 저장하지 않는다.
// 평가기간(워크스페이스) 하나가 아코디언 하나다(예: "2026 상반기",
// "2025 하반기") -- 연도로 묶지 않는다, 상/하반기가 서로 다른 실적이라
// 하나로 접으면 오히려 헷갈린다. 지금 보고 있는 기간(currentWorkspace)은
// 위쪽 "{연도} {기간}" 카드에 이미 나와 있으므로 여기서는 제외한다.
export default function MemberPerformanceHistoryPanel({ memberId, periods }: MemberPerformanceHistoryPanelProps) {
  const { currentWorkspace } = useWorkspaces()
  const history = getMemberPerformanceHistory(memberId, periods).filter((h) => h.workspace.id !== currentWorkspace?.id)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  if (history.length === 0) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">지난 평가 기간 기록이 없습니다.</p>
  }

  const allOpen = openIds.size === history.length
  function toggleAll() {
    setOpenIds(allOpen ? new Set() : new Set(history.map((h) => h.workspace.id)))
  }
  function toggleOne(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button onClick={toggleAll} className="text-xs font-medium text-gray-400 hover:text-accent">
          {allOpen ? '− 전체 히스토리 접기' : '전체 히스토리 펼치기 →'}
        </button>
      </div>

      <div className="space-y-2">
        {history.map(({ workspace, rank, cumulativeScore, grade, tasks }) => {
          const isOpen = openIds.has(workspace.id)
          return (
            <div key={workspace.id} className="rounded-lg border border-gray-200">
              <button onClick={() => toggleOne(workspace.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
                <span className="text-sm font-bold text-black">
                  {workspace.evaluationYear} {workspace.periodName}
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  {grade && cumulativeScore !== null && (
                    <>
                      {rank && <span className="font-semibold text-black">{rank}위</span>}
                      <span>누적 {cumulativeScore.toFixed(1)}</span>
                      <span className={`rounded-full px-2 py-0.5 font-bold ${GRADE_COLORS[grade]}`}>{grade}</span>
                    </>
                  )}
                  <span>{isOpen ? '접기' : '펼치기'}</span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-dashed border-gray-200 px-4 pb-4 pt-3">
                  {tasks.length === 0 ? (
                    <p className="text-[13px] text-gray-400">참여한 과제가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

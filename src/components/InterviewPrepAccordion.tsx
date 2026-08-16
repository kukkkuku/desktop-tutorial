import type { PerformanceGrade, Task } from '../types'
import { useAppState } from '../state/AppContext'
import { useTeamProfile } from '../state/TeamContext'
import { calcAllTaskScores, getContribution } from '../utils/calculations'
import { calcPromotionReadiness, trendArrow } from '../utils/promotion'
import { calcYearsSince } from '../utils/tenure'
import { getIncompleteActions } from '../utils/meetingActions'

interface TopTaskEntry {
  task: Task
  personalGrade: PerformanceGrade
  score: number
}

// 면담 화면 안에서 같은 화면 내 아코디언으로 펼쳐지는 면담 준비 요약.
// 새 페이지로 이동하지 않고, 기존에 계산/기록된 데이터만 모아서 보여준다.
export default function InterviewPrepAccordion({ memberId }: { memberId: string }) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const member = state.members.find((m) => m.id === memberId)
  if (!member) return null

  const todayStr = new Date().toISOString().slice(0, 10)

  const taskScores = calcAllTaskScores(state.tasks, state.criteria)
  const topTasks: TopTaskEntry[] = taskScores
    .map(({ task, score }): TopTaskEntry | null => {
      const contribution = getContribution(state.contributions, task.id, memberId)
      if (!contribution || contribution.contributionPercent <= 0) return null
      return { task, personalGrade: contribution.personalPerformanceGrade, score }
    })
    .filter((x): x is TopTaskEntry => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const achievementTrend = trendArrow(appraisals.slice(-3).flatMap((r) => [r.firstHalfGrade, r.secondHalfGrade]))
  const competencyTrend = trendArrow(appraisals.slice(-3).map((r) => r.competencyGrade))

  const criteria = profile.promotionCriteria.find((c) => c.fromLevel === member.level) ?? null
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const tenureMet = criteria ? levelTenureYears !== null && levelTenureYears >= criteria.tenureYears : null

  const lastPastNote = state.meetingNotes
    .filter((n) => n.memberId === memberId && n.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date))[0]

  const incompleteActions = getIncompleteActions(state.meetingNotes, memberId)

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
      <div>
        <p className="text-xs font-semibold text-gray-500">최근 주요 성과</p>
        {topTasks.length === 0 ? (
          <p className="mt-1 text-[13px] text-gray-400">참여한 과제 기록이 없습니다.</p>
        ) : (
          <div className="mt-1.5 space-y-1">
            {topTasks.map(({ task, personalGrade }) => (
              <div key={task.id} className="flex items-center justify-between rounded-md bg-white px-3 py-1.5 text-[13px]">
                <span className="text-black">{task.name}</span>
                <span className="font-semibold text-black">{personalGrade}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500">인사평가 추이</p>
        <div className="mt-1.5 rounded-md bg-white px-3 py-2 text-[13px] text-black">
          <p>업적 {achievementTrend}</p>
          <p>역량 {competencyTrend}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-promo">승진 준비</p>
        {criteria && readiness ? (
          <div className="mt-1.5 rounded-md border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-sm font-bold text-black">{criteria.toLevel}</p>
            <p className="text-lg font-bold text-black">
              {readiness.weightedScore.toFixed(1)} <span className="text-sm font-medium text-gray-400">/ {criteria.requiredScore}</span>
              <span className="ml-2 text-sm font-semibold text-promo">{readiness.progressPercent}%</span>
            </p>
            <div className="mt-2 space-y-1 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">직급 체류</span>
                <span className={tenureMet ? 'font-semibold text-success' : 'font-semibold text-gray-400'}>
                  {tenureMet === null ? '미확인' : tenureMet ? '충족' : '미충족'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">승진 점수</span>
                <span className="font-semibold text-black">{readiness.gap > 0 ? `${readiness.gap}점 부족` : '기준 충족'}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-[13px] text-gray-400">승진 기준이 설정되지 않았습니다.</p>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500">지난 면담</p>
        {lastPastNote ? (
          <div className="mt-1.5 rounded-md bg-white px-3 py-2 text-[13px] text-black">
            <p className="text-gray-400">{lastPastNote.date}</p>
            <p className="mt-0.5 whitespace-pre-wrap">{lastPastNote.comment || '(코멘트 없음)'}</p>
          </div>
        ) : (
          <p className="mt-1.5 text-[13px] text-gray-400">지난 면담 기록이 없습니다.</p>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500">지난 Action</p>
        {incompleteActions.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-gray-400">미완료 Action이 없습니다.</p>
        ) : (
          <ul className="mt-1.5 space-y-1 rounded-md bg-white px-3 py-2 text-[13px] text-black">
            {incompleteActions.map((a) => (
              <li key={a.id}>○ {a.content}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// 팀장용 대시보드(팀원 성장 관리 첫 화면)를 위한 집계 — 기존 계산 함수들
// (calcMemberResults, calcPromotionReadiness, getMemberPerformanceHistory)을
// 그대로 재사용하고, 여기서는 팀 전체 요약과 "관리 필요" 판정만 추가한다.
import type { AppState, EvaluationGrade, TeamMember, TeamProfile, WorkspaceMeta } from '../types'
import { calcMemberResults, type MemberResultRow } from './calculations'
import { calcPromotionReadiness, GRADE_ORDER, type PromotionReadiness } from './promotion'
import { getMemberPerformanceHistory } from './memberHistory'
import { calcYearsSince } from './tenure'

const NEEDS_MEETING_DAYS = 30
const PROMOTION_READY_THRESHOLD = 90

export interface TrendPoint {
  period: string
  grade: EvaluationGrade
}

export type GrowthFlagKey = 'no_recent_meeting' | 'performance_drop' | 'promotion_blocked' | 'no_tasks'

export interface GrowthFlag {
  key: GrowthFlagKey
  label: string
}

export interface MemberGrowthRow {
  member: TeamMember
  rank: number | null
  memberResult: MemberResultRow | undefined
  trendPoints: TrendPoint[]
  readiness: PromotionReadiness | null
  levelTenureYears: number | null
  lastMeetingDate: string | null
  daysSinceMeeting: number | null
  flags: GrowthFlag[]
  // "관리 필요 팀원" 한 줄 리스트에 쓰는 결합 텍스트 -- flags를 사람이 읽는
  // 한 줄로 압축한 것. flags가 비어 있으면 null.
  manageLabel: string | null
}

export interface TeamGrowthSummary {
  memberCount: number
  avgScore: number | null
  gradeDistribution: Record<EvaluationGrade, number>
  gradeUpCount: number // A 이상(S+A) 인원
  promotionReadyCount: number
  needsMeetingCount: number
  rows: MemberGrowthRow[]
}

function daysBetween(dateStr: string, todayStr: string): number {
  const a = new Date(dateStr).getTime()
  const b = new Date(todayStr).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

export function calcTeamGrowthSummary(state: AppState, profile: TeamProfile, periods: WorkspaceMeta[]): TeamGrowthSummary {
  const todayStr = new Date().toISOString().slice(0, 10)
  const activeMembers = state.members.filter((m) => m.active)
  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)

  const gradeDistribution: Record<EvaluationGrade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }

  const rows: MemberGrowthRow[] = activeMembers.map((member) => {
    const resultIdx = memberResults.findIndex((r) => r.member.id === member.id)
    const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined
    const rank = resultIdx >= 0 ? resultIdx + 1 : null
    if (memberResult) gradeDistribution[memberResult.grade] += 1

    const history = getMemberPerformanceHistory(member.id, periods)
    const trendPoints: TrendPoint[] = [...history]
      .reverse()
      .filter((h): h is typeof h & { grade: EvaluationGrade } => h.grade !== null)
      .map((h) => ({ period: h.workspace.periodName, grade: h.grade }))

    const appraisals = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)
    const levelTenureYears = calcYearsSince(member.currentLevelSince)
    const readiness = calcPromotionReadiness(
      member.level,
      appraisals,
      profile.promotionCriteria,
      profile.gradeScores,
      0,
      levelTenureYears,
    )

    const lastMeetingDate =
      state.meetingNotes
        .filter((n) => n.memberId === member.id && n.date <= todayStr)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null
    const daysSinceMeeting = lastMeetingDate ? daysBetween(lastMeetingDate, todayStr) : null

    const flags: GrowthFlag[] = []
    if (daysSinceMeeting === null || daysSinceMeeting > NEEDS_MEETING_DAYS) {
      flags.push({ key: 'no_recent_meeting', label: '최근 면담 미진행' })
    }
    if (trendPoints.length >= 2) {
      const last = GRADE_ORDER.indexOf(trendPoints[trendPoints.length - 1].grade)
      const prev = GRADE_ORDER.indexOf(trendPoints[trendPoints.length - 2].grade)
      if (last < prev) flags.push({ key: 'performance_drop', label: '성과 하락' })
    }
    let unmetPromotionConditions = 0
    if (readiness) {
      if (!readiness.tenureMet) unmetPromotionConditions += 1
      if (!readiness.eligible) unmetPromotionConditions += 1
    }
    if (unmetPromotionConditions > 0) {
      flags.push({ key: 'promotion_blocked', label: `승진 조건 ${unmetPromotionConditions}개 부족` })
    }
    if (!memberResult || memberResult.participatedTaskCount === 0) {
      flags.push({ key: 'no_tasks', label: '참여 과제 없음' })
    }

    const manageLabel =
      flags.length === 0
        ? null
        : flags
            .map((f) => (f.key === 'no_recent_meeting' ? '면담 미진행' : f.key === 'no_tasks' ? '참여 과제 없음' : f.label))
            .join(' · ')

    return {
      member,
      rank,
      memberResult,
      trendPoints,
      readiness,
      levelTenureYears,
      lastMeetingDate,
      daysSinceMeeting,
      flags,
      manageLabel,
    }
  })

  const scored = rows.map((r) => r.memberResult?.cumulativeScore).filter((s): s is number => s !== undefined)
  const avgScore = scored.length > 0 ? scored.reduce((sum, s) => sum + s, 0) / scored.length : null

  return {
    memberCount: activeMembers.length,
    avgScore,
    gradeDistribution,
    gradeUpCount: gradeDistribution.S + gradeDistribution.A,
    promotionReadyCount: rows.filter((r) => (r.readiness?.progressPercent ?? 0) >= PROMOTION_READY_THRESHOLD).length,
    needsMeetingCount: rows.filter((r) => r.flags.some((f) => f.key === 'no_recent_meeting')).length,
    rows,
  }
}

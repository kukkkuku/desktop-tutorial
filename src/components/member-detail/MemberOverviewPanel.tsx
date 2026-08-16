import type { TeamMember } from '../../types'
import type { MemberResultRow } from '../../utils/calculations'
import { GRADE_COLORS } from '../../utils/calculations'
import type { PromotionReadiness } from '../../utils/promotion'
import { formatLevelTenureLabel } from '../../utils/tenure'
import type { DetailTab } from './MemberDetailDrawer'

interface MemberOverviewPanelProps {
  member: TeamMember
  rank: number | null
  memberResult: MemberResultRow | undefined
  levelTenureYears: number | null
  readiness: PromotionReadiness | null
  achievementTrend: string
  competencyTrend: string
  lastMeetingDate: string | null
  onNavigate: (tab: DetailTab) => void
  onOpenMeetingPrep: () => void
}

export default function MemberOverviewPanel({
  member,
  rank,
  memberResult,
  levelTenureYears,
  readiness,
  achievementTrend,
  competencyTrend,
  lastMeetingDate,
  onNavigate,
  onOpenMeetingPrep,
}: MemberOverviewPanelProps) {
  return (
    <div className="space-y-4">
      {/* 현재 성과 — 오렌지, 성과평가 결과 (기존 결과 화면과 동일 계산) */}
      <button
        onClick={() => onNavigate('performance')}
        className="w-full rounded-lg border border-orange-100 bg-orange-50/60 px-4 py-3 text-left transition-colors hover:bg-orange-50"
      >
        <p className="text-xs font-semibold text-accent">현재 성과</p>
        {memberResult ? (
          <p className="mt-1 text-xl font-bold text-black">
            {rank ? `${rank}위 · ` : ''}
            {memberResult.cumulativeScore.toFixed(1)}점
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold align-middle ${GRADE_COLORS[memberResult.grade]}`}>
              {memberResult.grade}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-400">이번 기간 평가 데이터가 없습니다.</p>
        )}
      </button>

      {/* 승진 준비 — 남색, 성과점수와 완전히 다른 카드/색/단위로 분리 */}
      <button
        onClick={() => onNavigate('promotion')}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
      >
        <p className="text-xs font-semibold text-promo">승진 준비 (승진제도 기준)</p>
        {readiness ? (
          <>
            <p className="mt-1 text-xl font-bold text-black">
              {readiness.weightedScore.toFixed(1)} / {readiness.criteria.requiredScore}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {readiness.progressPercent}% · {readiness.gap > 0 ? `${readiness.gap}점 부족` : '자격점수 충족'}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-400">다음 직급 승진 기준이 설정되지 않았습니다.</p>
        )}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-200 px-3 py-2.5">
          <p className="text-[11px] font-medium text-gray-400">현 직급</p>
          <p className="mt-0.5 text-sm font-semibold text-black">
            {formatLevelTenureLabel(member.level, levelTenureYears)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 px-3 py-2.5">
          <p className="text-[11px] font-medium text-gray-400">다음 승진</p>
          <p className="mt-0.5 text-sm font-semibold text-black">{readiness?.criteria.toLevel ?? '-'}</p>
        </div>
      </div>

      <button
        onClick={() => onNavigate('promotion')}
        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50"
      >
        <p className="text-[11px] font-medium text-gray-400">최근 평가 (공식 인사평가)</p>
        <p className="mt-1 text-sm text-black">업적 {achievementTrend}</p>
        <p className="text-sm text-black">역량 {competencyTrend}</p>
      </button>

      <div className="rounded-lg border border-gray-200 px-3 py-2.5">
        <p className="text-[11px] font-medium text-gray-400">최근 면담</p>
        <p className="mt-0.5 text-sm font-semibold text-black">{lastMeetingDate ?? '면담 기록 없음'}</p>
      </div>

      <button
        onClick={onOpenMeetingPrep}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        면담 준비
      </button>
    </div>
  )
}

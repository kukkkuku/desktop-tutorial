import type { TeamMember } from '../../types'
import type { MemberResultRow } from '../../utils/calculations'
import { GRADE_COLORS } from '../../utils/calculations'
import type { PromotionReadiness } from '../../utils/promotion'
import { formatLevelTenureLabel } from '../../utils/tenure'
import type { NotesSubTab } from '../notes/NotesStage'

interface MemberOverviewPanelProps {
  member: TeamMember
  rank: number | null
  memberResult: MemberResultRow | undefined
  levelTenureYears: number | null
  readiness: PromotionReadiness | null
  achievementTrend: string
  competencyTrend: string
  lastMeetingDate: string | null
  onNavigateToNotes: (subTab: NotesSubTab) => void
}

// 팀원 상세는 이제 딥다이브 탭을 자체적으로 갖지 않는다 — 빠른 요약만 보여주고,
// 각 카드는 면담 탭의 해당 서브탭(성과 히스토리/인사평가·승진 관리/면담 기록)으로
// 바로 이동하는 진입점 역할만 한다.
export default function MemberOverviewPanel({
  member,
  rank,
  memberResult,
  levelTenureYears,
  readiness,
  achievementTrend,
  competencyTrend,
  lastMeetingDate,
  onNavigateToNotes,
}: MemberOverviewPanelProps) {
  return (
    <div className="space-y-4">
      {/* 현재 성과 — 성과평가 결과 (기존 결과 화면과 동일 계산) */}
      <button
        onClick={() => onNavigateToNotes('history')}
        className="w-full rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-left transition-colors hover:bg-blue-50"
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
        <p className="mt-1 text-[11px] text-accent/70">성과 히스토리 보기 →</p>
      </button>

      {/* 승진 준비 — 남색, 성과점수와 완전히 다른 카드/색/단위로 분리 */}
      <button
        onClick={() => onNavigateToNotes('promotion')}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
      >
        <p className="text-xs font-semibold text-promo">승진 준비 (승진제도 기준)</p>
        {readiness ? (
          <>
            <p className="mt-1 text-xl font-bold text-black">
              {readiness.weightedScore.toFixed(1)} / {readiness.criteria.requiredScore}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{readiness.gap > 0 ? `${readiness.gap}점 부족` : '자격점수 충족'}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-400">다음 직급 승진 기준이 설정되지 않았습니다.</p>
        )}
        <p className="mt-1 text-[11px] text-promo/70">인사평가·승진 관리 보기 →</p>
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
        onClick={() => onNavigateToNotes('promotion')}
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
        onClick={() => onNavigateToNotes('record')}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        면담 준비
      </button>
    </div>
  )
}

import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { calcMemberResults, GRADE_COLORS } from '../../utils/calculations'
import { calcPromotionReadiness } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { colorForIndex } from '../../utils/memberColors'

const PROMOTION_CANDIDATE_THRESHOLD = 70

interface MemberGrowthRailProps {
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onManageTeam: () => void
}

// 좌측 팀원 카드 레일 -- 팀원을 선택하면 우측 상세가 바뀐다. 첨부 디자인 그대로
// 이름 · 직무/직급 · 등급(점수) · 준비도 %를 카드로 보여주고, 준비도가 높으면
// "승진 후보" 배지를 단다.
export default function MemberGrowthRail({ selectedMemberId, onSelectMember, onManageTeam }: MemberGrowthRailProps) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const activeMembers = state.members.filter((m) => m.active)
  const results = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">팀원 성장 관리</h2>
      </div>

      {activeMembers.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-[13px] text-gray-500">
          등록된 팀원이 없습니다.
        </p>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {activeMembers.map((member) => {
            const idx = state.members.findIndex((m) => m.id === member.id)
            const resultIdx = results.findIndex((r) => r.member.id === member.id)
            const result = resultIdx >= 0 ? results[resultIdx] : undefined
            const appraisals = profile.hrAppraisals.filter((r) => r.memberId === member.id).sort((a, b) => a.year - b.year)
            const readiness = calcPromotionReadiness(
              member.level,
              appraisals,
              profile.promotionCriteria,
              profile.gradeScores,
              0,
              calcYearsSince(member.currentLevelSince),
            )
            const isCandidate = (readiness?.progressPercent ?? 0) >= PROMOTION_CANDIDATE_THRESHOLD
            const isSelected = selectedMemberId === member.id
            return (
              <button
                key={member.id}
                onClick={() => onSelectMember(member.id)}
                className={`w-full rounded-lg border px-3.5 py-3 text-left transition-colors ${
                  isSelected ? 'border-accent bg-orange-50/50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: colorForIndex(idx) }}
                  >
                    {member.name.slice(0, 1)}
                  </span>
                  <span className="text-sm font-bold text-black">{member.name}</span>
                  {isCandidate && (
                    <span className="ml-auto rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-success">승진 후보</span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {[member.role, formatLevelTenureLabel(member.level, calcYearsSince(member.currentLevelSince))].filter(Boolean).join(' · ') || '-'}
                </p>
                <div className="mt-1.5 flex items-center justify-between">
                  {result ? (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-black">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${GRADE_COLORS[result.grade]}`}>{result.grade}</span>
                      ({result.cumulativeScore.toFixed(1)}점)
                    </span>
                  ) : (
                    <span className="text-sm text-gray-300">데이터 없음</span>
                  )}
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    준비도 {readiness ? `${readiness.progressPercent}%` : '-'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <button
        onClick={onManageTeam}
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
      >
        팀원 관리
      </button>
    </div>
  )
}

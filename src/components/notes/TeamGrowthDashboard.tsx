import type { ReactNode } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { GRADE_COLORS } from '../../utils/calculations'
import { calcTeamGrowthSummary, type GrowthFlagKey } from '../../utils/teamGrowth'
import { colorForIndex } from '../../utils/memberColors'
import TrendSparkline from './TrendSparkline'

const FLAG_BADGE: Record<GrowthFlagKey, string> = {
  no_recent_meeting: 'text-danger bg-red-50',
  performance_drop: 'text-orange-600 bg-orange-50',
  promotion_blocked: 'text-promo bg-slate-100',
  no_tasks: 'text-gray-500 bg-gray-100',
}

function StatTile({ label, value, accentClass }: { label: string; value: ReactNode; accentClass?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <div className={`mt-1 text-xl font-bold ${accentClass ?? 'text-black'}`}>{value}</div>
    </div>
  )
}

interface TeamGrowthDashboardProps {
  onSelectMember: (memberId: string) => void
}

// 팀원 성장 관리의 첫 화면 -- 특정 팀원이 아니라 팀 전체 상태를 먼저 보여주는
// 팀장용 대시보드. 팀원을 클릭하면 MemberGrowthDetail로 넘어간다.
export default function TeamGrowthDashboard({ onSelectMember }: TeamGrowthDashboardProps) {
  const { state } = useAppState()
  const { profile } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)

  if (state.members.length === 0) {
    return (
      <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
        등록된 팀원이 없습니다. 팀원 관리에서 먼저 팀원을 등록하세요.
      </p>
    )
  }

  const summary = calcTeamGrowthSummary(state, profile, periods)
  const needsAttention = summary.rows.filter((r) => r.flags.length > 0)

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="팀원 수" value={`${summary.memberCount}명`} />
        <StatTile label="평균 성과" value={summary.avgScore !== null ? summary.avgScore.toFixed(1) : '-'} accentClass="text-accent" />
        <StatTile
          label="성과등급 분포"
          value={
            <div className="flex flex-wrap gap-1">
              {(['S', 'A', 'B', 'C', 'D'] as const)
                .filter((g) => summary.gradeDistribution[g] > 0)
                .map((g) => (
                  <span key={g} className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${GRADE_COLORS[g]}`}>
                    {g} {summary.gradeDistribution[g]}
                  </span>
                ))}
              {Object.values(summary.gradeDistribution).every((n) => n === 0) && <span className="text-sm text-gray-300">데이터 없음</span>}
            </div>
          }
        />
        <StatTile label="승진 준비 대상자" value={`${summary.promotionReadyCount}명`} accentClass="text-promo" />
        <StatTile label="면담 필요 인원" value={`${summary.needsMeetingCount}명`} accentClass="text-danger" />
      </div>

      {needsAttention.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-black">관리 필요 팀원</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {needsAttention.map((row) => {
              const idx = state.members.findIndex((m) => m.id === row.member.id)
              return (
                <button
                  key={row.member.id}
                  onClick={() => onSelectMember(row.member.id)}
                  className="rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-accent hover:bg-orange-50/40"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: colorForIndex(idx) }}
                    >
                      {row.member.name.slice(0, 1)}
                    </span>
                    <span className="text-sm font-semibold text-black">{row.member.name}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.flags.map((f) => (
                      <span key={f.key} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FLAG_BADGE[f.key]}`}>
                        {f.label}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-bold text-black">팀원 현황</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#F3F4F6] text-black">
              <tr>
                <th className="px-4 py-2.5 font-semibold">이름</th>
                <th className="px-4 py-2.5 font-semibold">성과등급</th>
                <th className="px-4 py-2.5 font-semibold">팀내 순위</th>
                <th className="px-4 py-2.5 font-semibold">고과 추이</th>
                <th className="px-4 py-2.5 font-semibold">승진 준비도</th>
                <th className="px-4 py-2.5 font-semibold">최근 면담일</th>
                <th className="px-4 py-2.5 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => {
                const idx = state.members.findIndex((m) => m.id === row.member.id)
                return (
                  <tr
                    key={row.member.id}
                    onClick={() => onSelectMember(row.member.id)}
                    className="cursor-pointer border-t border-gray-200 text-black transition-colors hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: colorForIndex(idx) }}
                        >
                          {row.member.name.slice(0, 1)}
                        </span>
                        {row.member.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.memberResult ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[row.memberResult.grade]}`}>
                          {row.memberResult.grade}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{row.rank ? `${row.rank}위` : '-'}</td>
                    <td className="px-4 py-3">
                      <TrendSparkline points={row.trendPoints} />
                    </td>
                    <td className="px-4 py-3">
                      {row.readiness ? (
                        <span className="font-semibold text-promo">{row.readiness.progressPercent}%</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.lastMeetingDate ?? '없음'}
                    </td>
                    <td className="px-4 py-3">
                      {row.flags.length === 0 ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-success">정상</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.flags.map((f) => (
                            <span key={f.key} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FLAG_BADGE[f.key]}`}>
                              {f.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import { GRADE_COLORS } from '../../utils/calculations'
import { calcTeamGrowthSummary } from '../../utils/teamGrowth'
import { colorForIndex } from '../../utils/memberColors'
import TrendSparkline from './TrendSparkline'

function Divider() {
  return <span className="h-3.5 w-px bg-gray-300" aria-hidden="true" />
}

interface TeamGrowthDashboardProps {
  onSelectMember: (memberId: string) => void
}

// 팀원 성장 관리의 첫 화면 -- 팀장이 팀 전체 상태를 빠르게 훑고, 관리가 필요한
// 팀원을 발견해서 바로 선택해 들어가는 화면. 큰 카드로 벌리지 않고 정보 밀도를
// 높여서, 한 화면에서 "누구부터 봐야 하는지"가 즉시 보이게 한다.
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
      {/* 상단 요약 -- 카드로 벌리지 않고 한 줄의 작은 KPI만 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-[13px]">
        <span className="font-bold text-black">팀원 {summary.memberCount}명</span>
        <Divider />
        <span className="text-gray-600">
          평균 성과 <b className="font-bold text-black">{summary.avgScore !== null ? summary.avgScore.toFixed(1) : '-'}</b>
        </span>
        <Divider />
        <span className="text-gray-600">
          A 이상 <b className="font-bold text-success">{summary.gradeUpCount}명</b>
        </span>
        <Divider />
        <span className="text-gray-600">
          승진 준비 <b className="font-bold text-promo">{summary.promotionReadyCount}명</b>
        </span>
        <Divider />
        <span className="text-gray-600">
          면담 필요 <b className="font-bold text-danger">{summary.needsMeetingCount}명</b>
        </span>
      </div>

      {needsAttention.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-black">관리 필요 팀원</h3>
          <div className="mt-1.5 divide-y divide-gray-100 rounded-lg border border-gray-200">
            {needsAttention.map((row) => {
              const idx = state.members.findIndex((m) => m.id === row.member.id)
              return (
                <div key={row.member.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-[13px]">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: colorForIndex(idx) }}
                    >
                      {row.member.name.slice(0, 1)}
                    </span>
                    <span className="shrink-0 font-semibold text-black">{row.member.name}</span>
                    <span className="truncate text-gray-500">{row.manageLabel}</span>
                  </span>
                  <button
                    onClick={() => onSelectMember(row.member.id)}
                    className="shrink-0 rounded-md border border-accent px-2.5 py-1 text-xs font-semibold text-accent hover:bg-orange-50"
                  >
                    관리하기
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-bold text-black">팀원 현황</h3>
        <div className="mt-1.5 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#F3F4F6] text-black">
              <tr>
                <th className="px-4 py-2.5 font-semibold">팀원</th>
                <th className="px-4 py-2.5 font-semibold">현재 성과</th>
                <th className="px-4 py-2.5 font-semibold">순위</th>
                <th className="px-4 py-2.5 font-semibold">고과 추이</th>
                <th className="px-4 py-2.5 font-semibold">승진 준비도</th>
                <th className="px-4 py-2.5 font-semibold">최근 면담</th>
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
                    <td className="px-4 py-2.5">
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
                    <td className="px-4 py-2.5">
                      {row.memberResult ? (
                        <span className="flex items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[row.memberResult.grade]}`}>
                            {row.memberResult.grade}
                          </span>
                          <span className="font-mono text-[13px] text-gray-600">{row.memberResult.cumulativeScore.toFixed(1)}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{row.rank ? `${row.rank}위` : '-'}</td>
                    <td className="px-4 py-2.5">
                      <TrendSparkline points={row.trendPoints} />
                    </td>
                    <td className="px-4 py-2.5">
                      {row.readiness ? (
                        <span className="font-semibold text-promo">{row.readiness.progressPercent}%</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{row.lastMeetingDate ?? '없음'}</td>
                    <td className="px-4 py-2.5">
                      {row.flags.length === 0 ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-success">정상</span>
                      ) : (
                        <span className="truncate text-[13px] text-gray-500">{row.manageLabel}</span>
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

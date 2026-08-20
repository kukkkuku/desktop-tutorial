import { useAppState } from '../../state/AppContext'
import { calcMemberResults } from '../../utils/calculations'
import { colorForIndex } from '../../utils/memberColors'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'

interface MemberGrowthRailProps {
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onManageTeam: () => void
}

function fmtShort(date: string): string {
  return date.slice(5).replace('-', '/')
}

// 팀원 목록 -- 가로 탭/버튼이 아니라 받은편지함처럼 세로로 쌓인 목록. 각 행은
// 아바타(팀원 색상 원 + 이름 첫 글자) + 이름 + 역할·직급을 왼쪽에, 최근 성과
// 등급과 최근 면담일을 오른쪽에 보여줘서 누르지 않고도 훑어볼 수 있다.
// 아바타 색은 캘린더 점(MeetingSchedulePanel)과 같은 인덱스 기준을 써서
// 같은 팀원이 어디서나 같은 색으로 보이게 한다.
export default function MemberGrowthRail({ selectedMemberId, onSelectMember, onManageTeam }: MemberGrowthRailProps) {
  const { state } = useAppState()
  const activeMembers = state.members.filter((m) => m.active)
  const results = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex h-full w-72 flex-col">
      <div className="flex items-center justify-between px-4 py-3.5">
        <h2 className="text-sm font-bold text-black">팀원 ({activeMembers.length})</h2>
        <button onClick={onManageTeam} className="text-xs font-semibold text-gray-400 hover:text-accent">
          팀원 관리
        </button>
      </div>

      {activeMembers.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-gray-400">등록된 팀원이 없습니다.</p>
      ) : (
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {activeMembers.map((member) => {
            const isSelected = selectedMemberId === member.id
            const colorIdx = state.members.findIndex((m) => m.id === member.id)
            const result = results.find((r) => r.member.id === member.id)
            const lastMeeting =
              state.meetingNotes
                .filter((n) => n.memberId === member.id && n.date <= todayStr)
                .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null
            return (
              <button
                key={member.id}
                onClick={() => onSelectMember(member.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-blue-50' : 'hover:bg-gray-100'
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: colorForIndex(colorIdx) }}
                >
                  {member.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${isSelected ? 'text-accent' : 'text-black'}`}>{member.name}</span>
                  <span className="block truncate text-[12px] text-gray-400">
                    {[member.role, formatLevelTenureLabel(member.level, calcYearsSince(member.currentLevelSince))].filter(Boolean).join(' · ') || '-'}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] leading-[1.6] text-gray-400">
                  {result ? (
                    <span className="block font-semibold text-gray-600">
                      {result.grade} {result.cumulativeScore.toFixed(0)}점
                    </span>
                  ) : (
                    <span className="block">-</span>
                  )}
                  <span className="block">{lastMeeting ? fmtShort(lastMeeting) : '면담 없음'}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

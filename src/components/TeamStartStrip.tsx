// 우리 팀(팀장의 성과관리 첫 화면 = 평가 목록 맨 위): 팀 만들기 · 평가 만들기 · 팀원 초대가 늘 있다(접히거나 사라지지 않음).
import { useMemo } from 'react'
import { ArrowRight, FolderPlus, Send, UsersRound } from 'lucide-react'
import type { WorkspaceMeta } from '../types'
import { isPendingEmail, readAccessCache } from '../utils/accessSheet'
import { getConnectedEmail } from '../utils/googleDrive'

export function useTeamInfo(workspaces: WorkspaceMeta[]) {
  return useMemo(() => {
    const me = (getConnectedEmail() ?? '').toLowerCase()
    const access = readAccessCache()
    const latest = [...workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const myTeam = access?.users.find((u) => u.email === me)?.team ?? ''
    // 팀 이름: 최근 평가의 팀, 없으면 권한 시트의 내 팀
    const name = latest?.teamName || myTeam
    const members = (access?.users ?? []).filter((u) => u.role === 'member' && (u.team ? u.team === name || u.team === myTeam : u.addedBy === me))
    return {
      name,
      latest,
      members: members.length,
      notInvited: members.filter((u) => !u.invitedAt && !isPendingEmail(u.email)).length,
      noMail: members.filter((u) => isPendingEmail(u.email)).length,
      known: !!access,
    }
  }, [workspaces])
}

export default function TeamStartStrip({
  team,
  onTeam,
  onEval,
  onInvite,
}: {
  team: ReturnType<typeof useTeamInfo>
  onTeam: () => void
  onEval: () => void
  onInvite: () => void
}) {
  const tiles = [
    { key: 'team', Icon: UsersRound, title: '팀 만들기', sub: team.name ? `지금 팀: ${team.name}` : '팀 이름을 정하고 첫 평가를 만듭니다', onClick: onTeam },
    {
      key: 'eval',
      Icon: FolderPlus,
      title: '평가 만들기',
      sub: team.latest ? `최근: ${team.latest.teamName} · ${team.latest.evaluationYear} ${team.latest.periodName}` : team.name ? `${team.name}의 첫 평가` : '팀을 먼저 만듭니다',
      onClick: onEval,
    },
    {
      key: 'invite',
      Icon: Send,
      title: '팀원 초대',
      sub: !team.known
        ? '팀원 추가 · 초대 메일'
        : `팀원 ${team.members}명${team.notInvited ? ` · 초대 안 보냄 ${team.notInvited}명` : ''}${team.noMail ? ` · Gmail 없음 ${team.noMail}명` : ''}`,
      onClick: onInvite,
    },
  ]
  return (
    <section>
      <h3 className="flex items-baseline gap-2 text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">
        우리 팀
        <span className="font-normal text-label-2">{team.name || '아직 팀이 없습니다'}</span>
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {tiles.map(({ key, Icon, title, sub, onClick }) => (
          <button
            key={key}
            onClick={onClick}
            className="group flex items-center gap-3 rounded-[12px] border border-hairline bg-white px-4 py-3.5 text-left transition-shadow hover:shadow-[0_0_0_1px_rgba(24,24,27,0.08),0_8px_24px_-8px_rgba(24,24,27,0.16)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
              <Icon size={18} strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">{title}</span>
              <span className="block truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-2">{sub}</span>
            </span>
            <ArrowRight size={14} className="shrink-0 text-label-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </section>
  )
}

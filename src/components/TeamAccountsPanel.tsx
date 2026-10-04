// 성과관리 › 팀원관리 › 초대 · 계정: 팀장이 우리 팀 팀원을 추가 · 초대하고 실적관리 시트를 공유하는 곳(관리 메뉴는 관리자만).
// 저장은 권한 시트(사용자 탭)에 -- 팀장이 그 시트의 편집자여야 한다(관리자가 관리 › 권한 시트에서 공유).
import { RefreshCw } from 'lucide-react'
import Button from './Button'
import Spinner from './Spinner'
import { icSm } from './ui/icon'
import MembersPanel from './admin/MembersPanel'
import { ShareBlock } from './admin/TaskSheetPanel'
import { useAccessData } from '../hooks/useAccessData'
import { useGoogleAccount } from '../hooks/useGoogleAccount'
import { getConnectedEmail } from '../utils/googleDrive'
import { isPendingEmail, taskSheetOf } from '../utils/accessSheet'
import { TASK_INPUT_SHEET_URL } from '../utils/progressBoard'
import { useWorkspaces } from '../state/WorkspaceContext'

export default function TeamAccountsPanel() {
  const { data, busy, error, reload, sync } = useAccessData()
  const { accountEmail } = useGoogleAccount()
  const me = (getConnectedEmail() ?? accountEmail ?? '').toLowerCase()
  const { currentWorkspace, workspaces } = useWorkspaces()
  if (!data)
    return (
      <section className="max-w-3xl rounded-card border border-dashed border-separator p-5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
        <p className="font-semibold text-label">{busy ? '불러오는 중…' : '팀원 명단(권한 시트)을 불러오지 못했습니다'}</p>
        {!busy && (
          <p className="mt-1">
            팀원을 추가 · 초대하려면 관리자가 이 계정에 권한 시트를 <b>편집자</b>로 공유해야 합니다. 관리자에게 요청한 뒤 다시 읽어 주세요. {error}
          </p>
        )}
        <div className="mt-3">
          <Button variant="primary" size="sm" onClick={() => void reload()} disabled={busy}>
            {busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <RefreshCw {...icSm} />}
            다시 읽기
          </Button>
        </div>
      </section>
    )
  // 시트 공유 대상: 우리 팀 팀원(내 팀 · 평가 목록 팀 이름, 팀이 비면 내가 추가한 사람) 중 Gmail이 있는 사람
  const myTeam = data.users.find((u) => u.email === me)?.team ?? ''
  const evalTeam = (currentWorkspace?.teamName ?? workspaces[0]?.teamName ?? '').trim()
  const people = data.users.filter(
    (u) => u.email !== me && u.role === 'member' && !isPendingEmail(u.email) && (u.team ? u.team === evalTeam || u.team === myTeam : u.addedBy === me),
  )
  return (
    <div className="space-y-6">
      <MembersPanel data={data} me={me} isAdmin={false} onChanged={sync} />
      <section className="max-w-6xl rounded-card border border-hairline bg-white p-5">
        <p className="mb-3 text-[length:calc(13px*var(--ui-fs,1))] font-semibold uppercase tracking-wide text-label-3">실적관리 시트 공유</p>
        <ShareBlock
          url={taskSheetOf(data)?.url ?? TASK_INPUT_SHEET_URL}
          who="우리 팀 팀원에게"
          why="초대한 팀원이 추진현황을 보고 저장하려면 이 시트의 편집자여야 합니다. 시트를 열어 [공유]에 아래 Gmail을 넣어 주세요(알림 메일은 꺼도 됩니다)."
          list={people}
        />
      </section>
    </div>
  )
}

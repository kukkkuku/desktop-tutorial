// 홈 › 팀원 초대(아직 평가가 없을 때): 우리 팀 명단에 팀원을 추가하고 초대 메일을 보낸다. 평가가 있으면 성과관리 › 팀원관리 표에서 한다.
// 실적관리 시트 공유는 관리자가(관리 › 실적관리 시트).
// 저장은 권한 시트(사용자 탭)에 -- 팀장이 그 시트의 편집자여야 한다(관리자가 관리 › 권한 시트에서 공유).
import { RefreshCw } from 'lucide-react'
import Button from './Button'
import Spinner from './Spinner'
import { icSm } from './ui/icon'
import MembersPanel from './admin/MembersPanel'
import { useAccessData } from '../hooks/useAccessData'
import { useGoogleAccount } from '../hooks/useGoogleAccount'
import { getConnectedEmail } from '../utils/googleDrive'

export default function TeamAccountsPanel() {
  const { data, busy, error, reload, sync } = useAccessData()
  const { accountEmail } = useGoogleAccount()
  const me = (getConnectedEmail() ?? accountEmail ?? '').toLowerCase()
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
  return (
    <div className="space-y-6">
      <MembersPanel data={data} me={me} isAdmin={false} onChanged={sync} />
    </div>
  )
}

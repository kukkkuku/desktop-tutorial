// 관리: 기능별 탭 셋.
//   팀원(팀장 · 관리자): 팀원 추가 · 초대 메일 · 시트 공유 · 빼기. 팀장은 자기가 추가한 사람만, 관리자는 모두.
//   과제 시트(관리자): 연구소가 함께 쓰는 과제(추진현황) 시트 하나를 연결.
//   권한(관리자): 누가 관리자 · 팀장 · 팀원인지.
// 모두 앱 설정을 담은 구글시트(권한 시트) 한 개에 저장된다 -- 화면에서는 그 시트를 직접 다룰 일이 없게 한다.
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import AppShell, { PageHeader, PageTabs } from '../shell/AppShell'
import UnderlineTabs from '../ui/UnderlineTabs'
import Button from '../Button'
import Spinner from '../Spinner'
import AccessEditor from './AccessEditor'
import MembersPanel from './MembersPanel'
import TaskSheetPanel from './TaskSheetPanel'
import { useGoogleAccount } from '../../hooks/useGoogleAccount'
import { icSm } from '../ui/icon'
import { ACCESS_EVENT, accessSheetUrl, getAccessSheetId, readAccessCache, refreshAccess } from '../../utils/accessSheet'
import { getConnectedEmail, withGoogleAccount } from '../../utils/googleDrive'
import { isSheetsApiConfigured } from '../../utils/sheetSources'

type Tab = 'members' | 'task' | 'roles'
const TITLES: Record<Tab, string> = { members: '팀원', task: '과제 시트', roles: '권한' }

export default function AdminApp() {
  const { isAdminUser } = useGoogleAccount()
  const me = (getConnectedEmail() ?? '').toLowerCase()
  const [tab, setTab] = useState<Tab>('members')
  const cur: Tab = isAdminUser ? tab : 'members'
  const { data, sync } = useAccess()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function reload() {
    if (!getAccessSheetId() || !isSheetsApiConfigured()) return
    setBusy(true)
    setError('')
    try {
      await refreshAccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : '읽지 못했습니다.')
    } finally {
      setBusy(false)
      sync()
    }
  }
  // 화면을 열 때 한 번 최신으로(고치기 전에 -- 덮어쓰기 충돌을 줄임)
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell header={<PageHeader area="관리" title={TITLES[cur]} />}>
      {/* 팀장: 팀원 탭만. 관리자: 팀원 · 과제 시트 · 권한 */}
      {isAdminUser && (
        <PageTabs>
          <UnderlineTabs
            items={[
              { key: 'members', label: '팀원', title: '팀원 추가 · 초대 메일 · 시트 공유' },
              { key: 'task', label: '과제 시트', title: '연구소가 함께 쓰는 과제(추진현황) 시트 연결' },
              { key: 'roles', label: '권한', title: '누가 관리자 · 팀장 · 팀원인지' },
            ]}
            value={cur}
            onChange={(k) => setTab(k as Tab)}
          />
        </PageTabs>
      )}
      <main className="w-full min-w-0 flex-1 px-6 pb-10 pt-5 lg:px-8">
        {!data ? (
          <section className="max-w-3xl rounded-card border border-dashed border-separator p-5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
            <p className="font-semibold text-label">{busy ? '불러오는 중…' : '팀원 · 권한 정보를 불러오지 못했습니다'}</p>
            {!busy && <p className="mt-1">이 계정이 권한 시트를 볼 수 있는지 확인하세요(관리자에게 뷰어 공유 요청). {error}</p>}
            <div className="mt-3 flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void reload()} disabled={busy}>
                {busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <RefreshCw {...icSm} />}
                다시 읽기
              </Button>
            </div>
          </section>
        ) : cur === 'members' ? (
          <MembersPanel data={data} me={me} isAdmin={isAdminUser} onChanged={sync} />
        ) : cur === 'task' ? (
          <TaskSheetPanel data={data} me={me} onChanged={sync} />
        ) : (
          <div className="max-w-6xl space-y-4">
            <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
              누가 <b className="text-label">관리자 · 팀장 · 팀원</b>인지 정합니다. 고치고 <b className="text-label">구글시트에 저장</b>하면 모두의 앱에 반영됩니다(변경 기록이
              남습니다).
            </p>
            <AccessEditor data={data} me={me} onSaved={sync} hideLinks />
            {accessSheetUrl() && (
              <a
                href={withGoogleAccount(accessSheetUrl()!)}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[length:calc(13px*var(--ui-fs,1))] text-label-3 hover:text-accent hover:underline"
              >
                원본 시트 보기 ↗
              </a>
            )}
          </div>
        )}
        {data && error && <p className="mt-3 rounded-card bg-danger/[0.06] px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] text-danger">{error}</p>}
      </main>
    </AppShell>
  )
}

function useAccess() {
  const [data, setData] = useState(readAccessCache)
  useEffect(() => {
    const on = () => setData(readAccessCache())
    window.addEventListener(ACCESS_EVENT, on)
    return () => window.removeEventListener(ACCESS_EVENT, on)
  }, [])
  return { data, sync: () => setData(readAccessCache()) }
}

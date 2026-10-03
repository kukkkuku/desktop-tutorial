// 관리(팀장 · 관리자): 권한 관리 시트 · 팀원 초대. 권한 표(사람 · 역할 · 연결 시트)를 고치는 것은 관리자만(팀장은 보기).
//   권한 시트: 누가 어떤 역할인지(「사용자」)와 팀별 추진현황 시트(「연결 시트」)를 구글시트 한 곳에 두고,
//   모두의 앱이 로그인할 때 읽는다. 여기서 바로 고쳐 "구글시트에 저장"(AccessEditor)하거나, 시트에서 고친 뒤 "다시 읽기".
import { useEffect, useState } from 'react'
import { Check, Copy, FileSpreadsheet, RefreshCw, ShieldCheck } from 'lucide-react'
import AppShell, { PageHeader, PageTabs } from '../shell/AppShell'
import UnderlineTabs from '../ui/UnderlineTabs'
import Button from '../Button'
import Spinner from '../Spinner'
import AdminInvitePanel from '../AdminInvitePanel'
import AccessEditor from './AccessEditor'
import { useGoogleAccount } from '../../hooks/useGoogleAccount'
import { icSm } from '../ui/icon'
import {
  ACCESS_EVENT,
  accessSheetUrl,
  appInviteUrl,
  createAccessSheet,
  forgetAccess,
  getAccessSheetId,
  readAccessCache,
  refreshAccess,
  setAccessSheetId,
} from '../../utils/accessSheet'
import { LEADER_EMAILS, ROLE_LABEL, roleOf } from '../../utils/roles'
import { getConnectedEmail, withGoogleAccount } from '../../utils/googleDrive'
import { TASK_INPUT_SHEET_URL, readLinkedSheet } from '../../utils/progressBoard'
import { isSheetsApiConfigured, parseSheetUrl } from '../../utils/sheetSources'

type Tab = 'access' | 'invite'

export default function AdminApp() {
  const { isAdminUser } = useGoogleAccount()
  // 팀원 초대가 먼저(관리를 열면 초대부터)
  const [tab, setTab] = useState<Tab>('invite')
  return (
    <AppShell header={<PageHeader area="관리" title={tab === 'access' ? '권한 시트' : '팀원 초대'} />}>
      <PageTabs>
        <UnderlineTabs
          items={[
            { key: 'invite', label: '팀원 초대', title: '앱 링크를 메일로 보내기' },
            { key: 'access', label: '권한 시트', title: '역할 · 팀별 추진현황 시트를 정하는 구글시트' },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </PageTabs>
      <main className="w-full min-w-0 flex-1 px-6 pb-10 pt-5 lg:px-8">
        {tab === 'access' ? <AccessSheetPanel canEdit={isAdminUser} /> : <AdminInvitePanel />}
      </main>
    </AppShell>
  )
}

function useAccess() {
  const [data, setData] = useState(readAccessCache)
  const [id, setId] = useState(getAccessSheetId)
  useEffect(() => {
    const on = () => {
      setData(readAccessCache())
      setId(getAccessSheetId())
    }
    window.addEventListener(ACCESS_EVENT, on)
    return () => window.removeEventListener(ACCESS_EVENT, on)
  }, [])
  return { data, id, sync: () => (setData(readAccessCache()), setId(getAccessSheetId())) }
}

function AccessSheetPanel({ canEdit }: { canEdit: boolean }) {
  const { data, id, sync } = useAccess()
  const [busy, setBusy] = useState<'' | 'create' | 'read' | 'link'>('')
  const [error, setError] = useState('')
  const [linkInput, setLinkInput] = useState('')
  const [copied, setCopied] = useState(false)
  const me = getConnectedEmail()
  // 화면을 열 때 한 번 시트를 다시 읽는다(고치기 전에 최신 내용으로 -- 저장 때 덮어쓰기 충돌을 줄임)
  useEffect(() => {
    if (id && isSheetsApiConfigured())
      void refreshAccess(id).then(sync, (e) => setError(`권한 시트를 읽지 못했습니다: ${e instanceof Error ? e.message : ''} 「읽기」를 눌러 다시 시도하세요.`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(kind: typeof busy, fn: () => Promise<unknown>) {
    setBusy(kind)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패했습니다.')
    } finally {
      setBusy('')
      sync()
    }
  }
  const create = () =>
    run('create', async () => {
      await createAccessSheet({ adminEmail: me ?? '', leaders: LEADER_EMAILS, sheetLink: readLinkedSheet() ?? TASK_INPUT_SHEET_URL })
      await refreshAccess()
    })
  const reread = () => run('read', () => refreshAccess())
  const connect = () =>
    run('link', async () => {
      const parsed = parseSheetUrl(linkInput)
      if (!parsed) throw new Error('구글시트 링크를 확인해 주세요. (https://docs.google.com/spreadsheets/d/…)')
      setAccessSheetId(parsed.spreadsheetId)
      await refreshAccess(parsed.spreadsheetId)
      setLinkInput('')
    })
  function copyInvite() {
    void navigator.clipboard?.writeText(appInviteUrl()).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  if (!isSheetsApiConfigured())
    return <p className="text-[14px] text-label-2">구글 연동이 켜져 있지 않은 빌드입니다. 권한 관리 시트는 구글 로그인이 필요합니다.</p>

  const url = accessSheetUrl(id)
  return (
    <div className="max-w-4xl space-y-5">
      {/* 이 화면이 무엇인지: 앱 설정을 담은 구글시트(권한 시트) 하나 = 표 두 개 */}
      <div className="rounded-card bg-subtle p-4 text-[14px] leading-relaxed text-label-2">
        <p>
          <b className="text-label">권한 시트</b>는 앱 설정을 적어 두는 구글시트 하나입니다. 과제를 입력하는 시트와는 다른 파일이고, 안에 표가 두 개 있습니다.
        </p>
        <ul className="mt-2 space-y-1">
          <li>
            <b className="text-label">① 누가 어떤 역할인지</b> · 관리자 · 팀장 · 팀원. 역할에 따라 앱 메뉴가 달라집니다.
          </li>
          <li>
            <b className="text-label">② 팀별 과제(추진현황) 시트</b> · 팀마다 과제를 입력하는 구글시트 링크. 팀원이 추진현황을 열면 이 시트가 뜹니다.
          </li>
        </ul>
        <p className="mt-2">모두의 앱이 로그인할 때 이 시트를 읽습니다. 아래 표에서 고치고 <b className="text-label">구글시트에 저장</b>하면 됩니다(시트의 「변경 기록」 탭에 남음).</p>
      </div>

      {!id && !canEdit ? (
        <p className="text-[14px] text-label-2">권한 관리 시트가 아직 연결되지 않았습니다. 관리자가 만들거나 연결하면 여기서 볼 수 있습니다.</p>
      ) : !id ? (
        <section className="rounded-card border border-separator p-5">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-label">
            <ShieldCheck size={17} strokeWidth={1.8} className="text-accent" />
            권한 관리 시트가 아직 없습니다
          </h3>
          <p className="mt-1 text-[14px] text-label-2">
            만들면 내 구글 드라이브에 「성과관리 앱 권한 관리」 시트가 생기고, 지금 아는 관리자 · 팀장과 지금 연결된 추진현황 시트가 미리 들어갑니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void create()} disabled={!!busy || !me}>
              {busy === 'create' ? <Spinner className="h-3.5 w-3.5" /> : <FileSpreadsheet {...icSm} />}
              권한 관리 시트 만들기
            </Button>
            <span className="text-[13px] text-label-3">구글 시트 쓰기 권한 창이 한 번 뜹니다.</span>
          </div>
          <LinkExisting value={linkInput} onChange={setLinkInput} onSubmit={() => void connect()} busy={busy === 'link'} />
        </section>
      ) : (
        <>
          <section className="rounded-card border border-separator p-5">
            <div className="flex flex-wrap items-center gap-3">
              <FileSpreadsheet size={18} strokeWidth={1.8} className="shrink-0 text-success" />
              <a
                href={withGoogleAccount(url!)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-[15px] font-semibold text-accent hover:underline"
              >
                {data?.title ?? '권한 관리 시트'} ↗
              </a>
              <span className="text-[13px] text-label-3">{data ? `${new Date(data.fetchedAt).toLocaleString('ko-KR')} 읽음` : '아직 못 읽음'}</span>
              <span className="ml-auto flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => void reread()} disabled={!!busy}>
                  {busy === 'read' ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw {...icSm} />}
                  다시 읽기
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => (forgetAccess(), sync())}
                    disabled={!!busy}
                    title="이 브라우저에서 권한 시트 연결을 끊습니다(시트는 그대로)"
                  >
                    연결 끊기
                  </Button>
                )}
              </span>
            </div>
            {me && (
              <p className="mt-2 text-[13.5px] text-label-2">
                지금 계정 {me} · <b>{ROLE_LABEL[roleOf(me)]}</b>
              </p>
            )}
          </section>


          {data ? (
            <AccessEditor data={data} me={me} onSaved={sync} readOnly={!canEdit} />
          ) : (
            <section className="rounded-card border border-dashed border-separator p-5 text-[14px] text-label-2">
              <p className="font-semibold text-label">표를 아직 불러오지 못했습니다</p>
              <p className="mt-1">
                권한 시트를 읽어야 ① 역할 표와 ② 팀별 과제 시트 표가 보입니다. 이 계정이 권한 시트를 볼 수 있는지 확인하고 읽기를 눌러 주세요.
              </p>
              <Button variant="primary" size="sm" className="mt-3" onClick={() => void reread()} disabled={!!busy}>
                {busy === 'read' ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw {...icSm} />}
                권한 시트 읽기
              </Button>
            </section>
          )}
          <section className="rounded-card border border-separator p-5">
            <h3 className="text-[14px] font-semibold text-label">팀원에게 공유하기</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-[14px] text-label-2">
              <li>
                <a href={withGoogleAccount(url!)} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  권한 관리 시트 열기 ↗
                </a>{' '}
                → 오른쪽 위 <b>공유</b>에서 팀원에게 <b>뷰어</b> 권한을 줍니다. 추진현황 시트도 따로 공유해야 합니다.
              </li>
              <li>
                팀원에게 아래 앱 링크를 보냅니다(관리 › 팀원 초대 메일에도 들어갑니다). 이 링크로 열면 팀원 앱이 이 권한 시트를 기억합니다.
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-control border border-hairline bg-subtle px-2 py-1 text-[13px]">{appInviteUrl(id)}</code>
                  <Button variant="secondary" size="sm" onClick={copyInvite}>
                    {copied ? <Check {...icSm} /> : <Copy {...icSm} />}
                    {copied ? '복사함' : '복사'}
                  </Button>
                </div>
              </li>
            </ol>
          </section>
          {canEdit && (
            <details className="text-[14px] text-label-2">
              <summary className="cursor-pointer select-none">고급 · 권한 시트 파일 자체를 다른 파일로 바꾸기</summary>
              <p className="mt-2 text-[13px] text-label-3">
                보통은 쓸 일이 없습니다. 권한 시트를 새로 만들어 옮겼을 때만 그 파일 링크를 넣습니다. 과제 시트를 바꾸려면 위 ② 표의 링크를 고치세요.
              </p>
              <LinkExisting value={linkInput} onChange={setLinkInput} onSubmit={() => void connect()} busy={busy === 'link'} />
            </details>
          )}
        </>
      )}
      {error && <p className="rounded-card bg-danger/[0.06] px-3 py-2 text-[14px] text-danger">{error}</p>}
    </div>
  )
}

function LinkExisting({ value, onChange, onSubmit, busy }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="mt-3 flex flex-wrap items-center gap-2"
    >
      <span className="text-[13.5px] text-label-2">이미 있는 권한 시트:</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/..."
        className="h-8 min-w-[280px] flex-1 rounded-control border border-hairline px-2.5 text-[13.5px] outline-none focus:border-accent"
      />
      <Button variant="secondary" size="sm" type="submit" disabled={!value.trim() || busy}>
        {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
        연결
      </Button>
    </form>
  )
}

// 관리 › 구글 시트: 과제 시트 연결(관리자) + 시트 공유 안내(관리자 · 팀장).
//   과제 시트: 연구소가 함께 쓰는 과제(추진현황) 시트 하나. 바꿀 때는 링크에 추진현황 탭이 있는지 먼저 확인한다.
//   시트 공유: 서버가 없어서 앱은 로그인한 사람 계정으로 시트를 읽는다.
//     과제 시트 → 팀장 · 팀원 모두 편집자 / 권한 시트 → 관리자 · 팀장만 편집자(팀원은 명단을 보지 않게 공유 안 함)
import { useEffect, useState } from 'react'
import { Copy, ExternalLink, FileSpreadsheet, Lock } from 'lucide-react'
import Button from '../Button'
import Spinner from '../Spinner'
import { icSm } from '../ui/icon'
import { accessSheetUrl, setTaskSheet, taskSheetOf, type AccessData, type AccessUser } from '../../utils/accessSheet'
import { fetchSpreadsheetTabs, parseSheetUrl, sheetUrl } from '../../utils/sheetSources'
import { TASK_INPUT_SHEET_URL, isProtectedSheet } from '../../utils/progressBoard'
import { withGoogleAccount } from '../../utils/googleDrive'

const YEAR_TAB = /추진현황|실적관리/

export default function TaskSheetPanel({ data, me, isAdmin, onChanged }: { data: AccessData; me: string; isAdmin: boolean; onChanged: () => void }) {
  const cur = taskSheetOf(data)
  const curId = cur ? parseSheetUrl(cur.url)?.spreadsheetId : null
  const [info, setInfo] = useState<{ title: string; years: string[] } | null>(null)
  const [infoErr, setInfoErr] = useState('')
  useEffect(() => {
    setInfo(null)
    setInfoErr('')
    if (!curId) return
    fetchSpreadsheetTabs(curId).then(
      ({ title, tabs }) =>
        setInfo({
          title,
          years: tabs.map((t) => t.title).filter((t) => YEAR_TAB.test(t)),
        }),
      (e) => setInfoErr(e instanceof Error ? e.message : '시트를 읽지 못했습니다.'),
    )
  }, [curId])

  const [editing, setEditing] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  async function save() {
    setBusy(true)
    setNote(null)
    try {
      const p = parseSheetUrl(link)
      if (!p) throw new Error('구글시트 링크를 확인해 주세요. (https://docs.google.com/spreadsheets/d/…)')
      const { title, tabs } = await fetchSpreadsheetTabs(p.spreadsheetId)
      const years = tabs.map((t) => t.title).filter((t) => YEAR_TAB.test(t))
      if (!years.length) throw new Error(`「${title}」에 추진현황 탭(예: 2026 추진현황)이 없습니다. 과제 시트 링크가 맞는지 확인해 주세요.`)
      await setTaskSheet(data.id, sheetUrl(p.spreadsheetId), title, me)
      onChanged()
      setEditing(false)
      setLink('')
      setNote({
        ok: true,
        text: `과제 시트를 「${title}」로 바꿨습니다. 모두의 앱이 다음에 열 때 이 시트를 씁니다.`,
      })
    } catch (e) {
      setNote({
        ok: false,
        text: e instanceof Error ? e.message : '바꾸지 못했습니다.',
      })
    } finally {
      setBusy(false)
    }
  }

  const locked = isProtectedSheet(curId ?? undefined)
  // 공유할 사람: 관리자는 모두, 팀장은 내가 추가한 사람만(나는 빼고)
  const people = (isAdmin ? data.users : data.users.filter((u) => u.addedBy === me)).filter((u) => u.email !== me)
  const managers = people.filter((u) => u.role !== 'member')
  const shares: {
    key: string
    name: string
    url: string | null
    who: string
    why: string
    list: AccessUser[]
  }[] = [
    {
      key: 'task',
      name: '과제(추진현황) 시트',
      url: cur?.url ?? TASK_INPUT_SHEET_URL,
      who: isAdmin ? '팀장 · 팀원 모두' : '내가 추가한 팀원',
      why: '추진현황을 보고 저장하는 데 필요',
      list: people,
    },
    ...(isAdmin
      ? [
          {
            key: 'access',
            name: '권한 시트',
            url: accessSheetUrl(),
            who: '관리자 · 팀장만',
            why: '역할을 읽고 팀원을 추가하는 데 필요 · 팀원은 공유하지 않습니다(명단이 보이지 않게)',
            list: managers,
          },
        ]
      : []),
  ]
  return (
    <div className="max-w-4xl space-y-6">
      <section className="space-y-3">
        <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">과제 시트</h3>
        <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
          연구소가 함께 쓰는 <b className="text-label">과제(추진현황) 시트 하나</b>
          {isAdmin ? '를 정합니다' : '입니다'}. 모든 사람이 추진현황을 열면 이 시트가 뜹니다.
        </p>
        <section className="rounded-card border border-separator p-5">
          {cur ? (
            <div className="flex flex-wrap items-start gap-3">
              <FileSpreadsheet size={22} strokeWidth={1.7} className="mt-0.5 shrink-0 text-emerald-700" />
              <div className="min-w-0 flex-1">
                <p className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">{info?.title ?? cur.note ?? '과제 시트'}</p>
                <p className="mt-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
                  {info
                    ? info.years.length
                      ? `연도 탭: ${info.years.join(' · ')}`
                      : '추진현황 탭이 없습니다'
                    : infoErr
                      ? `읽지 못함: ${infoErr}`
                      : '읽는 중…'}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[length:calc(13.5px*var(--ui-fs,1))]">
                  {locked ? (
                    <span className="flex items-center gap-1 text-label-2">
                      <Lock size={13} /> 운영 시트 · 앱에서는 읽기만 합니다(저장 안 함)
                    </span>
                  ) : (
                    <span className="text-success">✓ 앱에서 저장할 수 있는 시트</span>
                  )}
                </p>
              </div>
              <a
                href={withGoogleAccount(cur.url)}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-control border border-hairline px-3 py-1.5 text-[length:calc(13.5px*var(--ui-fs,1))] text-label hover:bg-black/[0.03]"
              >
                <ExternalLink {...icSm} />
                시트 열기
              </a>
            </div>
          ) : (
            <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">아직 연결한 과제 시트가 없습니다. 지금은 앱 기본 시트(테스트 시트)를 씁니다.</p>
          )}
          {isAdmin && (
            <div className="mt-4 border-t border-separator pt-4">
              {editing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void save()
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    autoFocus
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    className="h-9 min-w-[320px] flex-1 rounded-control border border-hairline px-3 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent"
                  />
                  <Button variant="secondary" type="button" onClick={() => setEditing(false)} disabled={busy}>
                    취소
                  </Button>
                  <Button variant="primary" type="submit" disabled={!link.trim() || busy}>
                    {busy && <Spinner className="h-3.5 w-3.5 text-white" />}
                    확인하고 바꾸기
                  </Button>
                </form>
              ) : (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  다른 시트로 바꾸기
                </Button>
              )}
              <p className="mt-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">
                링크를 넣으면 추진현황 탭이 있는지 먼저 확인합니다. 바꾼 뒤 아래 「시트 공유」대로 새 시트를 공유하고, 팀원에게는 초대 메일을 다시 보내세요(메일
                링크로 새 시트를 알려 줍니다).
              </p>
            </div>
          )}
        </section>
      </section>

      {/* 시트 공유 */}
      <section className="space-y-3">
        <h3 className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">시트 공유</h3>
        <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
          앱은 로그인한 사람의 구글 계정으로 시트를 읽습니다. 사람을 추가하면 시트를 열어 [공유]에 아래 Gmail을 넣어 주세요(알림 메일은 꺼도 됩니다).
        </p>
        {shares.map((x) => (
          <ShareCard key={x.key} name={x.name} url={x.url} who={x.who} why={x.why} list={x.list} />
        ))}
        {isAdmin && (
          <p className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">
            예전에 팀원에게 권한 시트를 공유했다면 권한 시트의 [공유]에서 빼도 됩니다. 팀원 앱은 초대 메일 링크로 과제 시트를 알아냅니다.
          </p>
        )}
      </section>

      {note && (
        <p
          className={`rounded-card px-3 py-2 text-[length:calc(14px*var(--ui-fs,1))] ${note.ok ? 'bg-success/[0.08] text-success' : 'bg-danger/[0.06] text-danger'}`}
        >
          {note.text}
        </p>
      )}
    </div>
  )
}

// 시트 하나: 누구에게 어떤 권한으로 + Gmail 목록 복사 + 시트 열기
function ShareCard({ name, url, who, why, list }: { name: string; url: string | null; who: string; why: string; list: AccessUser[] }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(list.map((u) => u.email).join(', '))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 복사가 막히면 아래 목록에서 직접 고른다
    }
  }
  return (
    <div className="rounded-card border border-separator p-4">
      <div className="flex flex-wrap items-center gap-3">
        <FileSpreadsheet size={20} strokeWidth={1.8} className="shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">
            {name} → <span className="text-accent">편집자</span>
            <span className="ml-2 font-normal text-label-2">{who}</span>
          </p>
          <p className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">{why}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void copy()} disabled={!list.length}>
          <Copy {...icSm} />
          {copied ? '복사함' : `Gmail ${list.length}개 복사`}
        </Button>
        {url && (
          <a
            href={withGoogleAccount(url)}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 rounded-control border border-hairline px-3 py-1.5 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium text-label hover:bg-black/[0.03]"
          >
            열어서 공유 ↗
          </a>
        )}
      </div>
      {list.length > 0 && (
        <p className="mt-2 select-all break-all rounded-control bg-subtle px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
          {list.map((u) => u.email).join(', ')}
        </p>
      )}
    </div>
  )
}

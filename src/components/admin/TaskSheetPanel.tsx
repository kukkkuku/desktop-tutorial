// 관리 › 실적관리 시트: 연구소가 함께 쓰는 실적관리(추진현황) 시트 연결(관리자) + 그 시트 공유 안내(관리자 · 팀장).
//   서버가 없어서 앱은 로그인한 사람 계정으로 시트를 읽는다 -- 팀장 · 팀원 모두 편집자로 공유해야 한다.
//   권한 시트 공유는 관리 › 권한 시트(관리자만)에서.
import { errText } from '../../utils/googleError'
import { useEffect, useState } from 'react'
import { toast } from '../ui/Toast'
import { Copy, ExternalLink, FileSpreadsheet, Lock } from 'lucide-react'
import Button from '../Button'
import Spinner from '../Spinner'
import Select from '../ui/Select'
import { icSm } from '../ui/icon'
import { isPendingEmail, setTaskSheet, setTaskTabs, taskSheetOf, taskTabOf, taskTabsOf, type AccessData, type AccessUser } from '../../utils/accessSheet'
import { fetchSpreadsheetTabs, parseSheetUrl, sheetUrl } from '../../utils/sheetSources'
import { TASK_INPUT_SHEET_URL, isProtectedSheet, writeLinkedSheet } from '../../utils/progressBoard'
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
      (e) => setInfoErr(errText(e, '시트를 읽지 못했습니다.')),
    )
  }, [curId])

  const [editing, setEditing] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  // 알림은 화면 아래 토스트로(ui/Toast)
  const setNote = (n: { ok: boolean; text: string } | null) => {
    if (n) toast(n.text, n.ok ? 'ok' : 'error')
  }
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
      // 공유 시트를 바꿨으면 내가 따로 골라 둔 시트는 풀어 둔다(안 그러면 내 화면만 예전 시트를 계속 씀)
      writeLinkedSheet(null)
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
        text: errText(e, '바꾸지 못했습니다.'),
      })
    } finally {
      setBusy(false)
    }
  }

  // 앱에 보일 탭: 관리자가 체크한 것(정한 적이 없으면 올해 탭 하나). 먼저 열 탭은 그중 하나.
  const years = info?.years ?? []
  const thisYearTab = (() => {
    const t = `${new Date().getFullYear()} 추진현황`
    return years.includes(t) ? t : (years[0] ?? '')
  })()
  const visibleTabs = (() => {
    const set = (taskTabsOf(data) ?? []).filter((t) => years.includes(t))
    return set.length ? set : thisYearTab ? [thisYearTab] : []
  })()
  const openTab = (() => {
    const o = taskTabOf(data)
    return o && visibleTabs.includes(o) ? o : (visibleTabs[0] ?? '')
  })()
  async function saveTabs(tabs: string[], open: string) {
    setBusy(true)
    try {
      await setTaskTabs(data.id, tabs, open, me)
      onChanged()
      toast(`앱에는 ${tabs.map((t) => `「${t}」`).join(' · ')} 탭이 보입니다(먼저 열 탭: 「${open}」).`, 'ok')
    } catch (e) {
      toast(errText(e, '탭을 정하지 못했습니다.'), 'error')
    } finally {
      setBusy(false)
    }
  }
  async function toggleTab(tab: string) {
    const on = visibleTabs.includes(tab)
    if (on && visibleTabs.length === 1) return toast('앱에 보일 탭이 하나는 있어야 합니다.', 'error')
    const next = on ? visibleTabs.filter((t) => t !== tab) : years.filter((t) => t === tab || visibleTabs.includes(t))
    await saveTabs(next, next.includes(openTab) ? openTab : next[0])
  }
  async function pickOpen(tab: string) {
    if (tab === openTab) return
    await saveTabs(visibleTabs, tab)
  }
  const locked = isProtectedSheet(curId ?? undefined)
  // 공유할 사람: 관리자는 모두, 팀장은 내가 추가한 사람만(나는 빼고)
  const people = (isAdmin ? data.users : data.users.filter((u) => u.addedBy === me)).filter((u) => u.email !== me && !isPendingEmail(u.email))
  return (
    <div className="max-w-4xl space-y-6">
      <section className="space-y-3">
        <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
          연구소가 함께 쓰는 <b className="text-label">실적관리(추진현황) 시트 하나</b>
          {isAdmin ? '를 연결하고' : '입니다'}, 팀장 · 팀원에게 공유합니다. 모든 사람이 추진현황을 열면 이 시트가 뜹니다.
        </p>
        <section className="rounded-card border border-separator p-5">
          <p className="mb-3 text-[length:calc(13px*var(--ui-fs,1))] font-semibold uppercase tracking-wide text-label-3">1 · 시트 연결</p>
          {cur ? (
            <div className="flex flex-wrap items-start gap-3">
              <FileSpreadsheet size={22} strokeWidth={1.7} className="mt-0.5 shrink-0 text-emerald-700" />
              <div className="min-w-0 flex-1">
                <p className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">{info?.title ?? cur.note ?? '과제 시트'}</p>
                {info && info.years.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">앱에 보일 탭{isAdmin ? ' (체크한 탭만 모두의 연도 메뉴에 뜹니다)' : ''}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                        {info.years.map((y) => (
                          <label key={y} className={`flex items-center gap-1.5 text-[length:calc(14px*var(--ui-fs,1))] ${isAdmin ? 'cursor-pointer' : ''} ${visibleTabs.includes(y) ? 'text-label' : 'text-label-3'}`}>
                            <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={visibleTabs.includes(y)} disabled={!isAdmin || busy} onChange={() => void toggleTab(y)} />
                            {y}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">앱을 열면 먼저 열 탭</span>
                      {isAdmin ? (
                        <Select
                          value={openTab}
                          onChange={(e) => void pickOpen(e.target.value)}
                          disabled={busy}
                          aria-label="먼저 열 탭"
                          className="h-8 min-w-[220px] px-2.5 text-[length:calc(14px*var(--ui-fs,1))]"
                        >
                          {visibleTabs.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <b className="text-[length:calc(14px*var(--ui-fs,1))] text-label">{openTab}</b>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
                    {info ? '추진현황 탭이 없습니다' : infoErr ? `읽지 못함: ${infoErr}` : '읽는 중…'}
                  </p>
                )}
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
                링크를 넣으면 추진현황 탭이 있는지 먼저 확인합니다. 바꾼 뒤 아래 「공유」대로 새 시트를 공유하고, 팀원에게는 초대 메일을 다시 보내세요(메일
                링크로 새 시트를 알려 줍니다).
              </p>
            </div>
          )}
          <div className="mt-5 border-t border-separator pt-4">
            <p className="mb-3 text-[length:calc(13px*var(--ui-fs,1))] font-semibold uppercase tracking-wide text-label-3">2 · 공유</p>
            <ShareBlock
              url={cur?.url ?? TASK_INPUT_SHEET_URL}
              who={isAdmin ? '팀장 · 팀원 모두에게' : '내가 추가한 팀원에게'}
              why="추진현황을 보고 저장하려면 이 시트의 편집자여야 합니다. 시트를 열어 [공유]에 아래 Gmail을 넣어 주세요(알림 메일은 꺼도 됩니다)."
              list={people}
            />
          </div>
        </section>
      </section>

    </div>
  )
}

// 공유 안내: 누구에게 편집자로 + Gmail 목록 복사 + 시트 열기
export function ShareBlock({ url, who, why, list }: { url: string | null; who: string; why: string; list: AccessUser[] }) {
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
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">
            {who} <span className="text-accent">편집자</span>로 공유
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
      {list.length > 0 ? (
        <p className="mt-2 select-all break-all rounded-control bg-subtle px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
          {list.map((u) => u.email).join(', ')}
        </p>
      ) : (
        <p className="mt-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">공유할 사람이 아직 없습니다.</p>
      )}
    </div>
  )
}

// 팀원관리 › 피어리뷰 › 요청 · 제출 현황(팀장 화면).
//   요청을 열면 팀원이 과제 입력 › 피어리뷰에서 순위 · 근거를 제출하고, 여기서 누가 냈는지 보고 마감한다.
//   "결과 가져오기"는 제출을 단순 순위 결과로 옮긴다(이름으로 팀원을 찾음) -- 결과는 단순 순위 화면에서 본다.
// 요청 · 제출은 과제 입력이 연결한 구글시트의 숨은 탭에 있다(utils/peerRequest).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Lock, LockOpen, Plus, RefreshCw } from 'lucide-react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { RankReview } from '../types'
import { v4 as uuidv4 } from 'uuid'
import Button from './Button'
import Spinner from './Spinner'
import DatePicker from './DatePicker'
import ConfirmDialog from './ConfirmDialog'
import { getConnectedEmail, withGoogleAccount } from '../utils/googleDrive'
import { memberEmail } from '../utils/roles'
import { SheetsAuthError, chooseSheetsAccountNext, sheetUrl } from '../utils/sheetSources'
import {
  dueLabel,
  loadPeerBoard,
  openPeerRequest,
  peerSheetId,
  peerSheetWritable,
  setPeerRequestOpen,
  type PeerRequest,
  type PeerSubmission,
} from '../utils/peerRequest'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function PeerRequestPanel({ onShowResults }: { onShowResults?: () => void }) {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const periodLabel = currentWorkspace ? `${currentWorkspace.evaluationYear} ${currentWorkspace.periodName}` : ''
  const active = state.members.filter((m) => m.active)
  const sheetId = peerSheetId()
  const writable = peerSheetWritable(sheetId)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ msg: string; auth: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [requests, setRequests] = useState<PeerRequest[]>([])
  const [subs, setSubs] = useState<PeerSubmission[]>([])

  const load = useCallback(async () => {
    if (!sheetId) return setLoading(false)
    setLoading(true)
    setError(null)
    try {
      const b = await loadPeerBoard(sheetId)
      setRequests(b.requests)
      setSubs(b.submissions)
    } catch (e) {
      setError({ msg: e instanceof Error ? e.message : String(e), auth: e instanceof SheetsAuthError })
    } finally {
      setLoading(false)
    }
  }, [sheetId])
  useEffect(() => {
    void load()
  }, [load])

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError({ msg: e instanceof Error ? e.message : String(e), auth: e instanceof SheetsAuthError })
    } finally {
      setBusy(null)
    }
  }

  // ---------- 새 요청 ----------
  const [title, setTitle] = useState(`${periodLabel} 피어리뷰`.trim())
  const [due, setDue] = useState(() => ymd(new Date(Date.now() + 7 * 86_400_000)))
  const [picked, setPicked] = useState<Set<string>>(() => new Set(active.map((m) => m.id)))
  const pickedMembers = active.filter((m) => picked.has(m.id))
  const roster = pickedMembers.map((m) => m.name.trim())
  const noEmail = pickedMembers.filter((m) => !memberEmail(m)).map((m) => m.name)
  const dupNames = roster.filter((n, i) => roster.indexOf(n) !== i)
  const openOne = requests.find((r) => r.open) ?? null
  const canOpen = writable && !openOne && roster.length >= 2 && dupNames.length === 0 && title.trim() !== '' && busy === null

  // ---------- 결과 가져오기 ----------
  const [importReq, setImportReq] = useState<PeerRequest | null>(null)
  function importResults(req: PeerRequest) {
    setImportReq(null)
    const byName = new Map(state.members.map((m) => [m.name.trim(), m]))
    const missing = new Set<string>()
    let count = 0
    for (const s of subs.filter((x) => x.requestId === req.id)) {
      const reviewer = byName.get(s.reviewer.trim())
      if (!reviewer) {
        missing.add(s.reviewer)
        continue
      }
      const reviews: RankReview[] = []
      for (const e of s.entries) {
        const target = byName.get(e.target.trim())
        if (!target) {
          missing.add(e.target)
          continue
        }
        reviews.push({
          id: uuidv4(),
          mode: 'simple',
          reviewerMemberId: reviewer.id,
          targetMemberId: target.id,
          rank: e.rank,
          groupSize: s.entries.length,
          reason: e.reason,
          source: 'app',
          updatedAt: s.submittedAt,
        })
      }
      dispatch({ type: 'SET_RANK_REVIEWS', payload: { reviewerMemberId: reviewer.id, mode: 'simple', reviews } })
      count += 1
    }
    setNotice(`${count}명의 제출을 단순 순위 결과로 가져왔습니다.${missing.size ? ` 팀원 목록에 없는 이름은 뺐습니다: ${Array.from(missing).join(', ')}` : ''}`)
  }

  const subsOf = useMemo(() => {
    const m = new Map<string, PeerSubmission[]>()
    for (const s of subs) m.set(s.requestId, [...(m.get(s.requestId) ?? []), s])
    return m
  }, [subs])

  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-relaxed text-label-2">
        요청을 열면 팀원이 <b className="text-label">과제 입력 › 피어리뷰</b>에서 다른 팀원의 순위와 근거를 적어 제출합니다. 요청 · 제출은{' '}
        {sheetId ? (
          <a href={withGoogleAccount(sheetUrl(sheetId))} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            과제 입력에 연결된 구글시트 ↗
          </a>
        ) : (
          '과제 입력에 연결된 구글시트'
        )}
        의 숨은 탭에 저장됩니다.
      </p>
      {!writable && (
        <p className="rounded-[10px] bg-danger/10 px-3 py-2 text-[13px] text-danger">
          지금 과제 입력은 운영 중인 팀 시트에 연결돼 있어 요청을 열 수 없습니다. 과제 입력에서 테스트 시트를 연결해 주세요.
        </p>
      )}
      {error && (
        <div className="rounded-[10px] bg-danger/10 px-3 py-2 text-[13px] text-danger">
          <p>{error.msg}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              다시 시도
            </Button>
            {error.auth && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  chooseSheetsAccountNext()
                  void load()
                }}
              >
                계정 골라서 다시 연결
              </Button>
            )}
          </div>
        </div>
      )}
      {notice && (
        <p className="flex flex-wrap items-center gap-2 rounded-[10px] bg-success/10 px-3 py-2 text-[13px] text-success">
          {notice}
          {onShowResults && (
            <button onClick={onShowResults} className="font-semibold underline">
              단순 순위에서 결과 보기
            </button>
          )}
        </p>
      )}

      {/* 새 요청 */}
      <section className="mac-card p-4">
        <p className="text-[13px] font-semibold text-label">새 요청 열기</p>
        {openOne ? (
          <p className="mt-1 text-[12.5px] text-label-2">열린 요청「{openOne.title}」이 있습니다. 마감한 뒤에 새 요청을 열 수 있습니다.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px]">
                <span className="w-10 shrink-0 text-label-2">제목</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-8 w-[260px] rounded-control border border-hairline bg-white px-2 text-[13px]"
                />
              </label>
              <span className="flex items-center gap-2 text-[13px]">
                <span className="text-label-2">마감일</span>
                <DatePicker value={due} onChange={setDue} clearable={false} ariaLabel="마감일" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-[12.5px] text-label-2">
                참여 팀원 {roster.length}명 <span className="text-label-3">· 서로의 순위를 매깁니다(본인 제외)</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {active.map((m) => {
                  const on = picked.has(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        const next = new Set(picked)
                        if (on) next.delete(m.id)
                        else next.add(m.id)
                        setPicked(next)
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${on ? 'bg-accent text-white' : 'bg-white text-label-3 shadow-control line-through'}`}
                    >
                      {m.name}
                    </button>
                  )
                })}
              </div>
              {noEmail.length > 0 && (
                <p className="mt-1 text-[12px] text-orange-600">
                  이메일이 없는 팀원: {noEmail.join(', ')} -- 팀원 표의 "이메일"에 구글 계정을 넣으면 그 계정으로 로그인했을 때 자동으로 본인이 됩니다(없으면
                  제출할 때 이름을 직접 고릅니다).
                </p>
              )}
              {dupNames.length > 0 && (
                <p className="mt-1 text-[12px] text-danger">이름이 같은 팀원이 있습니다({dupNames.join(', ')}). 팀원 이름을 구분되게 바꿔 주세요.</p>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={!canOpen}
                onClick={() =>
                  void run('요청을 여는 중', async () => {
                    await openPeerRequest(sheetId!, {
                      title: title.trim(),
                      roster: pickedMembers.map((m) => ({ name: m.name.trim(), email: memberEmail(m) })),
                      due,
                      openedBy: getConnectedEmail() ?? '',
                    })
                    setNotice(null)
                  })
                }
              >
                <Plus size={14} className="mr-1" />
                요청 열기
              </Button>
            </div>
          </>
        )}
      </section>

      {/* 요청 목록 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-label">요청 · 제출 현황</p>
          <span className="flex items-center gap-2">
            {(loading || busy) && (
              <span className="flex items-center gap-1.5 text-xs text-label-2">
                <Spinner className="h-3.5 w-3.5 text-accent" />
                {busy ?? '불러오는 중'}
              </span>
            )}
            <button onClick={() => void load()} className="flex items-center gap-1 rounded-control px-2 py-1 text-[12.5px] text-label-2 hover:bg-black/[0.05]">
              <RefreshCw size={13} />
              새로고침
            </button>
          </span>
        </div>
        {!loading && requests.length === 0 && <p className="text-[13px] text-label-3">아직 연 요청이 없습니다.</p>}
        <div className="space-y-3">
          {requests.map((r) => {
            const got = subsOf.get(r.id) ?? []
            const by = new Map(got.map((s) => [s.reviewer, s]))
            const doneN = r.roster.filter((n) => by.has(n)).length
            return (
              <div key={r.id} className="mac-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`mac-badge ${r.open ? 'bg-accent-soft text-accent' : 'bg-black/[0.05] text-label-2'}`}>{r.open ? '열림' : '마감'}</span>
                  <span className="text-[14px] font-semibold text-label">{r.title}</span>
                  <span className="text-[12.5px] text-label-2">{dueLabel(r.due)}</span>
                  <span className="text-[12.5px] font-medium text-label">
                    제출 {doneN}/{r.roster.length}
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!writable || busy !== null || (!r.open && !!openOne)}
                      title={!r.open && openOne ? '다른 요청이 열려 있습니다' : undefined}
                      onClick={() => void run(r.open ? '마감하는 중' : '다시 여는 중', () => setPeerRequestOpen(sheetId!, r, !r.open))}
                    >
                      {r.open ? <Lock size={13} className="mr-1" /> : <LockOpen size={13} className="mr-1" />}
                      {r.open ? '마감' : '다시 열기'}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={got.length === 0} onClick={() => setImportReq(r)} title="제출을 단순 순위 결과로 옮깁니다">
                      <Download size={13} className="mr-1" />
                      결과 가져오기
                    </Button>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.roster.map((n) => {
                    const s = by.get(n)
                    // 명단의 계정과 제출한 계정이 다르면(다른 사람이 이름을 골라 냈을 수 있음) 표시
                    const odd = !!s && !!r.emails[n] && s.email.toLowerCase() !== r.emails[n]
                    return (
                      <span
                        key={n}
                        className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          odd ? 'bg-orange-100 text-orange-700' : s ? 'bg-success/10 text-success' : 'bg-white text-label-2 shadow-control'
                        }`}
                        title={
                          s
                            ? `${when(s.submittedAt)} 제출${s.email ? ` · ${s.email}` : ''}${odd ? ` · 명단 계정(${r.emails[n]})과 다름` : ''}`
                            : `미제출${r.emails[n] ? ` · ${r.emails[n]}` : ' · 계정 없음'}`
                        }
                      >
                        {n}
                        <span className="ml-1 opacity-60">{odd ? '계정 다름' : s ? when(s.submittedAt) : '미제출'}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <ConfirmDialog
        open={importReq !== null}
        title="결과를 가져올까요?"
        message={`「${importReq?.title ?? ''}」에 제출한 사람의 단순 순위를 이번 제출로 바꿉니다(그 사람이 앱 · 엑셀로 넣은 단순 순위는 대체됩니다).`}
        confirmLabel="가져오기"
        tone="accent"
        onConfirm={() => importReq && importResults(importReq)}
        onCancel={() => setImportReq(null)}
      />
    </div>
  )
}

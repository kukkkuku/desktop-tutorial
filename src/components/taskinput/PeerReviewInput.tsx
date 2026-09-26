// 과제 입력 › 피어리뷰(팀원 화면). 팀장이 성과관리에서 요청을 열었을 때만 입력할 수 있다.
//   나를 고르고 → 다른 팀원을 1위부터 줄 세우고(끌거나 ↑↓) → 사람마다 근거를 적고 → 제출.
// 제출은 연결된 구글시트의 숨은 탭에 적힌다(utils/peerRequest). 다시 내면 마지막 제출만 쓴다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, GripVertical, RefreshCw, Send, Users } from 'lucide-react'
import Button from '../Button'
import Spinner from '../Spinner'
import ConfirmDialog from '../ConfirmDialog'
import { getConnectedEmail } from '../../utils/googleDrive'
import { isLeaderEmail } from '../../utils/roles'
import { SheetsAuthError, chooseSheetsAccountNext } from '../../utils/sheetSources'
import {
  checkEntries,
  daysLeft,
  dueLabel,
  loadPeerBoard,
  peerSheetId,
  peerSheetWritable,
  readDraft,
  readMe,
  submitPeerReview,
  writeDraft,
  writeMe,
  type PeerEntry,
  type PeerRequest,
  type PeerSubmission,
} from '../../utils/peerRequest'

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function PeerReviewInput() {
  const sheetId = peerSheetId()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ msg: string; auth: boolean } | null>(null)
  const [requests, setRequests] = useState<PeerRequest[]>([])
  const [subs, setSubs] = useState<PeerSubmission[]>([])
  const [reqId, setReqId] = useState<string>('')

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

  const open = requests.filter((r) => r.open)
  const req = open.find((r) => r.id === reqId) ?? open[0] ?? null

  if (loading)
    return (
      <p className="flex items-center gap-2 py-10 text-[13px] text-label-2">
        <Spinner className="h-4 w-4 text-accent" />
        피어리뷰 요청을 확인하는 중…
      </p>
    )
  if (error)
    return (
      <div className="mx-auto max-w-[640px] rounded-[12px] bg-danger/10 px-4 py-3 text-[13px] text-danger">
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
    )
  if (!req)
    return (
      <div className="mx-auto flex max-w-[520px] flex-col items-center py-16 text-center">
        <Users size={34} strokeWidth={1.6} className="text-label-3" />
        <p className="mt-3 text-[15px] font-semibold text-label">지금 받은 피어리뷰 요청이 없습니다</p>
        <p className="mt-1 text-[13px] leading-relaxed text-label-2">팀장이 성과관리에서 요청을 열면 여기에 나타납니다. 마감일도 함께 보입니다.</p>
        <Button size="sm" variant="secondary" className="mt-4" onClick={() => void load()}>
          <RefreshCw size={14} className="mr-1" />
          다시 확인
        </Button>
      </div>
    )

  return (
    <div className="mx-auto max-w-[760px]">
      {open.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {open.map((r) => (
            <button
              key={r.id}
              onClick={() => setReqId(r.id)}
              className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${r.id === req.id ? 'bg-label text-white' : 'bg-black/[0.05] text-label-2 hover:bg-black/[0.08]'}`}
            >
              {r.title}
            </button>
          ))}
        </div>
      )}
      <RequestForm key={req.id} req={req} subs={subs.filter((s) => s.requestId === req.id)} sheetId={sheetId!} onSubmitted={load} onRefresh={load} />
    </div>
  )
}

function RequestForm({
  req,
  subs,
  sheetId,
  onSubmitted,
  onRefresh,
}: {
  req: PeerRequest
  subs: PeerSubmission[]
  sheetId: string
  onSubmitted: () => Promise<void>
  onRefresh: () => void
}) {
  // 로그인한 계정이 명단에 있으면 그 사람으로 고정. 없으면 계정이 안 적힌 이름 중에서 고른다(로그인 없이 쓰면 누구든).
  const email = (getConnectedEmail() ?? '').toLowerCase()
  const byEmail = req.roster.find((n) => email && req.emails[n] === email) ?? ''
  const choices = byEmail ? [byEmail] : req.roster.filter((n) => !email || !req.emails[n])
  const [picked, setMe] = useState(() => {
    const m = readMe()
    return choices.includes(m) ? m : ''
  })
  const me = byEmail || picked
  const mine = subs.find((s) => s.reviewer === me) ?? null
  const others = useMemo(() => req.roster.filter((n) => n !== me), [req.roster, me])
  const initial = useCallback((): PeerEntry[] => {
    const fromDraft = readDraft(req.id, me)
    const base = fromDraft ?? mine?.entries ?? []
    // 대상 명단이 바뀌었어도 지금 명단 기준으로 맞춘다(있던 순서 · 근거는 살림)
    const kept = base.filter((e) => others.includes(e.target))
    const added = others.filter((n) => !kept.some((e) => e.target === n)).map((target) => ({ target, rank: 0, reason: '' }))
    return [...kept, ...added].map((e, i) => ({ ...e, rank: i + 1 }))
  }, [req.id, me, mine, others])
  const [list, setList] = useState<PeerEntry[]>(initial)
  useEffect(() => setList(initial()), [initial])
  const [errors, setErrors] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const writable = peerSheetWritable(sheetId)
  const left = daysLeft(req.due)

  const update = (next: PeerEntry[]) => {
    const ranked = next.map((e, i) => ({ ...e, rank: i + 1 }))
    setList(ranked)
    writeDraft(req.id, me, ranked)
    setDone(null)
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return
    const next = [...list]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    update(next)
  }

  async function submit() {
    setConfirm(false)
    setBusy(true)
    try {
      const at = await submitPeerReview(sheetId, req.id, me, getConnectedEmail() ?? '', list)
      writeDraft(req.id, me, null)
      setDone(at)
      await onSubmitted()
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold text-label">{req.title}</h2>
          <p className="mt-0.5 text-[13px] text-label-2">
            <span className={left !== null && left <= 1 ? 'font-semibold text-danger' : ''}>{dueLabel(req.due)}</span>
            {req.openedBy && <span className="text-label-3"> · 요청 {req.openedBy}</span>}
          </p>
        </div>
        <button onClick={onRefresh} className="flex items-center gap-1 rounded-control px-2 py-1 text-[12.5px] text-label-2 hover:bg-black/[0.05]">
          <RefreshCw size={13} />
          새로고침
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[12px] bg-black/[0.03] px-3 py-2.5">
        <span className="text-[13px] font-semibold text-label">나</span>
        {byEmail ? (
          <span className="text-[13px] font-semibold text-label" title={`로그인한 계정(${email})으로 찾았습니다`}>
            {byEmail} <span className="font-normal text-label-3">· {email}</span>
          </span>
        ) : choices.length === 0 ? (
          isLeaderEmail(email) ? (
            <span className="text-[12.5px] text-label-2">
              팀장 계정({email})은 평가 명단에 없어 제출하지 않습니다. 요청 · 마감 · 제출 현황은 성과관리 › 팀원관리 › 피어리뷰에서 봅니다.
            </span>
          ) : (
            <span className="text-[12.5px] text-danger">
              이 요청의 명단에 로그인한 계정({email})이 없습니다. 팀장에게 팀원 정보의 이메일을 확인해 달라고 해 주세요.
            </span>
          )
        ) : (
          <select
            value={me}
            onChange={(e) => {
              setMe(e.target.value)
              writeMe(e.target.value)
              setErrors([])
            }}
            className="h-8 rounded-control border border-hairline bg-white px-2 text-[13px]"
            aria-label="나(평가자)"
          >
            <option value="">이름을 고르세요</option>
            {choices.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        {me && mine && (
          <span className="flex items-center gap-1 text-[12.5px] text-success">
            <CheckCircle2 size={14} />
            {when(mine.submittedAt)}에 제출함 · 고쳐서 다시 내면 마지막 것만 반영
          </span>
        )}
        {me && !mine && <span className="text-[12.5px] text-label-3">아직 제출 전</span>}
      </div>

      {!me ? (
        choices.length > 0 && (
          <p className="mt-6 text-[13px] text-label-2">명단에서 내 이름을 고르면 다른 팀원 {req.roster.length - 1}명의 순위와 근거를 적을 수 있습니다.</p>
        )
      ) : (
        <>
          <p className="mb-2 mt-5 text-[12.5px] text-label-2">1위부터 줄을 세우세요(끌어서 옮기거나 ↑↓). 모든 사람에게 근거를 적어야 제출됩니다.</p>
          <ol className="space-y-2">
            {list.map((e, i) => (
              <li
                key={e.target}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={() => {
                  if (drag !== null) move(drag, i)
                  setDrag(null)
                }}
                onDragEnd={() => setDrag(null)}
                className={`flex gap-3 rounded-[12px] border bg-white px-3 py-2.5 ${drag === i ? 'border-accent opacity-60' : 'border-hairline'}`}
              >
                <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
                  <GripVertical size={15} className="cursor-grab text-label-3" />
                  <span className="text-[17px] font-bold tabular-nums text-label">{i + 1}</span>
                  <span className="text-[10.5px] text-label-3">위</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-label">{e.target}</span>
                    <span className="flex gap-0.5">
                      <button
                        onClick={() => move(i, i - 1)}
                        disabled={i === 0}
                        className="rounded p-1 text-label-2 hover:bg-black/[0.06] disabled:opacity-30"
                        aria-label={`${e.target} 위로`}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        onClick={() => move(i, i + 1)}
                        disabled={i === list.length - 1}
                        className="rounded p-1 text-label-2 hover:bg-black/[0.06] disabled:opacity-30"
                        aria-label={`${e.target} 아래로`}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </span>
                  </div>
                  <textarea
                    value={e.reason}
                    onChange={(ev) => update(list.map((x, k) => (k === i ? { ...x, reason: ev.target.value } : x)))}
                    placeholder="순위 근거(함께 일하며 본 기여 · 협업 · 결과)"
                    rows={2}
                    className={`mt-1.5 w-full resize-y rounded-control border bg-white px-2 py-1.5 text-[13px] ${
                      errors.length && !e.reason.trim() ? 'border-danger' : 'border-hairline'
                    }`}
                    aria-label={`${e.target} 근거`}
                  />
                </div>
              </li>
            ))}
          </ol>
          {errors.length > 0 && (
            <ul className="mt-3 list-disc rounded-[10px] bg-danger/10 py-2 pl-7 pr-3 text-[12.5px] text-danger">
              {errors.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          {done && <p className="mt-3 text-[13px] text-success">제출했습니다({when(done)}). 팀장 화면의 제출 현황에 반영됩니다.</p>}
          {!writable && <p className="mt-3 text-[12.5px] text-danger">운영 중인 팀 시트에는 제출하지 않습니다. 과제 입력에서 테스트 시트를 연결해 주세요.</p>}
          <div className="mt-4 flex justify-end">
            <Button
              variant="primary"
              disabled={busy || !writable || list.length === 0}
              onClick={() => {
                const errs = checkEntries(list)
                setErrors(errs)
                if (!errs.length) setConfirm(true)
              }}
            >
              {busy ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Send size={14} className="mr-1.5" />}
              {mine ? '다시 제출' : '제출'}
            </Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={mine ? '다시 제출할까요?' : '제출할까요?'}
        message={`${me}(으)로 ${list.length}명의 순위와 근거를 제출합니다.${mine ? ' 이전 제출 대신 이번 것이 반영됩니다.' : ''} 마감 전에는 고쳐서 다시 낼 수 있습니다.`}
        confirmLabel="제출"
        tone="accent"
        onConfirm={() => void submit()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}

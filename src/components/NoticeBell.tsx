// 머리줄의 종: 지금 있는 알림을 한 줄씩 모아 보여 준다.
//   줄을 누르면 그 화면으로 가서 알림을 다시 띄워 보여 주고, 「영구 삭제」를 누르면 지워진다.
// 알림이 없으면 눌리지 않는다. 대상(사람 · 이름 · 기여도)이 또 바뀌면 지운 알림도 새로 뜬다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Trash2 } from 'lucide-react'
import { useAppState } from '../state/AppContext'
import { useAccessData } from '../hooks/useAccessData'
import { outOfSyncDetails } from '../utils/assigneeSync'
import { OPEN_EVAL_NOTICE_KEY, OPEN_TEAM_NOTICE_KEY, useDismissedNotices } from '../utils/dismissedNotices'
import { movedMembersOf, movedSig, unmatchedSig } from '../utils/teamRoster'
import { unmatchedAssigneeSummary } from '../utils/workBoard'
import IconButton from './IconButton'
import { ic, icSm } from './ui/icon'

interface Row {
  key: string
  kind: string
  text: string
  sigs: string[]
  go: () => void
}

export default function NoticeBell({ teamName, onOpenTeam, onOpenEvaluate }: { teamName: string; onOpenTeam: () => void; onOpenEvaluate: () => void }) {
  const { state } = useAppState()
  const { data: access } = useAccessData(false)
  const { deleted, remove, restore } = useDismissedNotices()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const sync = useMemo(() => outOfSyncDetails(state).filter((d) => !deleted.has(d.sig)), [state, deleted])
  const moved = useMemo(() => movedMembersOf(access, state.members, teamName), [access, state.members, teamName])
  const movedKey = movedSig(moved)
  const unmatched = useMemo(() => unmatchedAssigneeSummary(state.workBoard), [state.workBoard])
  const unmatchedKey = unmatchedSig(unmatched.map((u) => u.name))

  function flag(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value)
    } catch {
      /* 못 적어도 화면에는 간다 */
    }
  }
  const names = (list: string[], max: number) => list.slice(0, max).join(', ') + (list.length > max ? ` 외 ${list.length - max}명` : '')

  const rows: Row[] = []
  for (const d of sync)
    rows.push({
      key: d.sig,
      kind: '담당자·기여도 다름',
      text: d.task.name,
      sigs: [d.sig],
      go: () => {
        flag(OPEN_EVAL_NOTICE_KEY, '1')
        restore([d.sig])
        onOpenEvaluate()
      },
    })
  if (moved.length > 0 && !deleted.has(movedKey))
    rows.push({
      key: movedKey,
      kind: `팀 이동 ${moved.length}명`,
      text: names(
        moved.map((x) => x.m.name),
        3,
      ),
      sigs: [movedKey],
      go: () => {
        flag(OPEN_TEAM_NOTICE_KEY, 'moved')
        restore([movedKey])
        onOpenTeam()
      },
    })
  if (unmatched.length > 0 && !deleted.has(unmatchedKey))
    rows.push({
      key: unmatchedKey,
      kind: `목록에 없는 담당자 ${unmatched.length}명`,
      text: names(
        unmatched.map((u) => u.name),
        3,
      ),
      sigs: [unmatchedKey],
      go: () => {
        flag(OPEN_TEAM_NOTICE_KEY, 'unmatched')
        restore([unmatchedKey])
        onOpenTeam()
      },
    })
  const count = rows.length

  useEffect(() => {
    if (count === 0) setOpen(false)
  }, [count])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <IconButton
        onClick={() => setOpen((v) => !v)}
        disabled={count === 0}
        aria-expanded={open}
        aria-label={count ? `알림 ${count}개` : '알림 없음'}
        title={count ? `알림 ${count}개` : '알림이 없습니다'}
        className={`relative ${open ? 'bg-black/[0.05] text-label' : ''}`}
      >
        <Bell {...ic} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {count}
          </span>
        )}
      </IconButton>
      {open && count > 0 && (
        <div className="mac-pop absolute right-0 top-9 z-40 max-h-[70vh] w-[min(380px,90vw)] overflow-y-auto py-1 text-[length:calc(14px*var(--ui-fs,1))]">
          <ul>
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-1 pr-1.5 hover:bg-black/[0.04]">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    r.go()
                  }}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                  title="눌러서 해당 화면에서 보기"
                >
                  <span className="block text-xs text-label-3">{r.kind}</span>
                  <span className="block truncate text-label">{r.text}</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.sigs)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-xs text-label-3 hover:bg-black/[0.06] hover:text-danger"
                  title="이 알림을 영구 삭제합니다"
                >
                  <Trash2 {...icSm} />
                  영구 삭제
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

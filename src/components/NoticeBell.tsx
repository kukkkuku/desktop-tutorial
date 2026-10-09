// 머리줄의 종: 지금 있는 알림을 모두 모아 보여 준다(알림 배너 · 팀원관리 상자를 ✕로 닫아도 여기에 남음).
// 목록에서 「삭제」하면 지워진다. 알림이 없으면 눌리지 않는다.
// 담당자나 기여도 · 팀 이동 · 목록에 없는 담당자가 또 바뀌면 지운 알림도 새로 뜬다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAppState } from '../state/AppContext'
import { useAccessData } from '../hooks/useAccessData'
import { outOfSyncDetails } from '../utils/assigneeSync'
import { OPEN_TEAM_NOTICE_KEY, useDismissedNotices } from '../utils/dismissedNotices'
import { movedMembersOf, movedSig, unmatchedSig } from '../utils/teamRoster'
import { unmatchedAssigneeSummary } from '../utils/workBoard'
import IconButton from './IconButton'
import Button from './Button'
import { ic } from './ui/icon'

export default function NoticeBell({ teamName, onOpenTeam }: { teamName: string; onOpenTeam: () => void }) {
  const { state, dispatch } = useAppState()
  const { data: access } = useAccessData(false)
  const { deleted, remove } = useDismissedNotices()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const sync = useMemo(() => outOfSyncDetails(state).filter((d) => !deleted.has(d.sig)), [state, deleted])
  const moved = useMemo(() => movedMembersOf(access, state.members, teamName), [access, state.members, teamName])
  const movedKey = movedSig(moved)
  const unmatched = useMemo(() => unmatchedAssigneeSummary(state.workBoard), [state.workBoard])
  const unmatchedKey = unmatchedSig(unmatched.map((u) => u.name))
  const showMoved = moved.length > 0 && !deleted.has(movedKey)
  const showUnmatched = unmatched.length > 0 && !deleted.has(unmatchedKey)
  const count = sync.length + (showMoved ? 1 : 0) + (showUnmatched ? 1 : 0)

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

  function goTeam(kind: 'moved' | 'unmatched') {
    try {
      sessionStorage.setItem(OPEN_TEAM_NOTICE_KEY, kind)
    } catch {
      /* 못 적어도 팀원관리로는 간다 */
    }
    setOpen(false)
    onOpenTeam()
  }

  const item = 'rounded-control bg-black/[0.03] px-3 py-2 text-label'
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
        <div className="mac-pop absolute right-0 top-9 z-40 max-h-[70vh] w-[min(420px,90vw)] overflow-y-auto p-3 text-[length:calc(14px*var(--ui-fs,1))]">
          <ul className="space-y-2">
            {sync.map((d) => (
              <li key={d.task.id} className={item}>
                <div className="text-xs text-label-3">담당자와 기여도가 다른 평가과제</div>
                <div className="truncate font-medium" title={d.task.name}>
                  {d.task.name}
                </div>
                <div className="text-xs text-label-2">
                  담당자: {d.assignees.join(', ') || '없음'} · 기여도 입력: {d.participants.join(', ') || '없음'}
                </div>
                <div className="text-xs text-orange-800">
                  {d.missing.length > 0 && <span>담당자인데 기여도 0: <b>{d.missing.join(', ')}</b></span>}
                  {d.missing.length > 0 && d.extra.length > 0 && ' · '}
                  {d.extra.length > 0 && <span>담당자가 아닌데 기여도 있음: <b>{d.extra.join(', ')}</b></span>}
                </div>
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <Button type="button" size="sm" variant="secondary" onClick={() => remove([d.sig])}>
                    삭제
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => dispatch({ type: 'SYNC_CONTRIBUTIONS_TO_ASSIGNEES', payload: { taskIds: [d.task.id] } })}>
                    담당자대로 맞추기
                  </Button>
                </div>
              </li>
            ))}
            {showMoved && (
              <li className={item}>
                <div className="text-xs text-label-3">팀 이동 {moved.length}명</div>
                <div className="text-xs text-label-2">
                  {moved
                    .slice(0, 6)
                    .map((x) => `${x.m.name} → 「${x.u.team}」`)
                    .join(', ')}
                  {moved.length > 6 ? ` 외 ${moved.length - 6}명` : ''}
                </div>
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <Button type="button" size="sm" variant="secondary" onClick={() => remove([movedKey])}>
                    삭제
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => goTeam('moved')}>
                    팀원관리에서 보기
                  </Button>
                </div>
              </li>
            )}
            {showUnmatched && (
              <li className={item}>
                <div className="text-xs text-label-3">목록에 없는 담당자 {unmatched.length}명</div>
                <div className="text-xs text-label-2">
                  {unmatched
                    .slice(0, 8)
                    .map((u) => u.name)
                    .join(', ')}
                  {unmatched.length > 8 ? ` 외 ${unmatched.length - 8}명` : ''}
                </div>
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <Button type="button" size="sm" variant="secondary" onClick={() => remove([unmatchedKey])}>
                    삭제
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => goTeam('unmatched')}>
                    팀원관리에서 보기
                  </Button>
                </div>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

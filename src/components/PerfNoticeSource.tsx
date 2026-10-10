// 성과관리 화면의 알림(담당자·기여도 다름 · 팀 이동 · 목록에 없는 담당자)을 종 목록에 올려 둔다. 화면에는 아무것도 그리지 않는다.
import { useEffect, useMemo } from 'react'
import { useAppState } from '../state/AppContext'
import { useAccessData } from '../hooks/useAccessData'
import { useNoticeCenter, type NoticeRow } from '../state/NoticeCenter'
import { outOfSyncDetails } from '../utils/assigneeSync'
import { OPEN_EVAL_NOTICE_KEY, OPEN_TEAM_NOTICE_KEY, useDismissedNotices } from '../utils/dismissedNotices'
import { movedMembersOf, movedSig, unmatchedSig } from '../utils/teamRoster'
import { unmatchedAssigneeSummary } from '../utils/workBoard'

export default function PerfNoticeSource({ teamName, onOpenTeam, onOpenEvaluate }: { teamName: string; onOpenTeam: () => void; onOpenEvaluate: () => void }) {
  const { state } = useAppState()
  const { data: access } = useAccessData(false)
  const { deleted, remove, restore } = useDismissedNotices()
  const { setRows } = useNoticeCenter()

  const sync = useMemo(() => outOfSyncDetails(state).filter((d) => !deleted.has(d.sig)), [state, deleted])
  const moved = useMemo(() => movedMembersOf(access, state.members, teamName), [access, state.members, teamName])
  const unmatched = useMemo(() => unmatchedAssigneeSummary(state.workBoard), [state.workBoard])

  const rows = useMemo(() => {
    const flag = (key: string, value: string) => {
      try {
        sessionStorage.setItem(key, value)
      } catch {
        /* 못 적어도 화면에는 간다 */
      }
    }
    const names = (list: string[], max: number) => list.slice(0, max).join(', ') + (list.length > max ? ` 외 ${list.length - max}명` : '')
    const out: NoticeRow[] = []
    for (const d of sync)
      out.push({
        key: d.sig,
        kind: '담당자·기여도 다름',
        text: d.task.name,
        onDelete: () => remove([d.sig]),
        go: () => {
          flag(OPEN_EVAL_NOTICE_KEY, '1')
          restore([d.sig])
          onOpenEvaluate()
        },
      })
    const movedKey = movedSig(moved)
    if (moved.length > 0 && !deleted.has(movedKey))
      out.push({
        key: movedKey,
        kind: `팀 이동 ${moved.length}명`,
        text: names(
          moved.map((x) => x.m.name),
          3,
        ),
        onDelete: () => remove([movedKey]),
        go: () => {
          flag(OPEN_TEAM_NOTICE_KEY, 'moved')
          restore([movedKey])
          onOpenTeam()
        },
      })
    const unmatchedKey = unmatchedSig(unmatched.map((u) => u.name))
    if (unmatched.length > 0 && !deleted.has(unmatchedKey))
      out.push({
        key: unmatchedKey,
        kind: `목록에 없는 담당자 ${unmatched.length}명`,
        text: names(
          unmatched.map((u) => u.name),
          3,
        ),
        onDelete: () => remove([unmatchedKey]),
        go: () => {
          flag(OPEN_TEAM_NOTICE_KEY, 'unmatched')
          restore([unmatchedKey])
          onOpenTeam()
        },
      })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, moved, unmatched, deleted])

  useEffect(() => {
    setRows(rows)
  }, [rows, setRows])
  // 성과관리 화면을 떠나면 알림도 내린다
  useEffect(() => () => setRows([]), [setRows])
  return null
}

import { useEffect, useMemo, useState } from 'react'
import { useWorkspaces, workspaceStateKey } from '../state/WorkspaceContext'
import type { Task, TeamMember } from '../types'
import Button from './Button'

interface ImportFromPreviousPanelProps {
  teamName: string
  currentWorkspaceId: string
  // 취소 버튼은 독립 다이얼로그(ImportFromPreviousDialog)에서만 필요하다 --
  // 빠른 시작 팝업의 탭으로 쓸 때는 탭을 바꾸거나 팝업을 닫으면 되므로
  // 별도 취소 버튼이 없다.
  onCancel?: () => void
}

interface SourceState {
  tasks: Task[]
  members: TeamMember[]
  hasCriteria: boolean
}

function readSourceState(workspaceId: string): SourceState {
  try {
    const raw = localStorage.getItem(workspaceStateKey(workspaceId))
    if (!raw) return { tasks: [], members: [], hasCriteria: false }
    const parsed = JSON.parse(raw)
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      members: Array.isArray(parsed.members) ? parsed.members : [],
      hasCriteria: Boolean(parsed.criteria),
    }
  } catch {
    return { tasks: [], members: [], hasCriteria: false }
  }
}

// 이전 평가에서 팀원/과제를 지금 평가로 복사해온다. 평가 생성 시 자동으로
// 복사되던 예전 체크박스 대신, 생성 후 언제든 원할 때 쓰는 별도 액션이다.
// 팀·평가기간을 골라 원본을 정하고, 그 안의 과제/팀원을 하나씩 골라서
// 가져올 수 있다(기본은 전체 선택 -- "전체 해제"로 한 번에 뺄 수 있다).
// 독립 다이얼로그(ImportFromPreviousDialog)와 빠른 시작 팝업의 탭, 양쪽에서
// 그대로 재사용한다.
export default function ImportFromPreviousPanel({ teamName, currentWorkspaceId, onCancel }: ImportFromPreviousPanelProps) {
  const { workspaces, importFromWorkspace } = useWorkspaces()

  const hasAnySource = workspaces.some((w) => w.id !== currentWorkspaceId)
  const teamNames = useMemo(() => Array.from(new Set(workspaces.map((w) => w.teamName))).sort(), [workspaces])
  const [sourceTeam, setSourceTeam] = useState(teamName)

  const periodCandidates = useMemo(
    () =>
      workspaces
        .filter((w) => w.teamName === sourceTeam && w.id !== currentWorkspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [workspaces, sourceTeam, currentWorkspaceId],
  )
  const [sourceId, setSourceId] = useState(periodCandidates[0]?.id ?? '')

  // 팀을 바꾸면 그 팀의 가장 최근 기간으로 다시 맞춘다.
  useEffect(() => {
    if (!periodCandidates.some((w) => w.id === sourceId)) {
      setSourceId(periodCandidates[0]?.id ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTeam, periodCandidates])

  const sourceState = useMemo<SourceState>(
    () => (sourceId ? readSourceState(sourceId) : { tasks: [], members: [], hasCriteria: false }),
    [sourceId],
  )

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [importCriteria, setImportCriteria] = useState(true)
  const [done, setDone] = useState(false)

  // 원본 평가가 바뀔 때마다 전체 선택 상태로 초기화한다.
  useEffect(() => {
    setSelectedTaskIds(new Set(sourceState.tasks.map((t) => t.id)))
    setSelectedMemberIds(new Set(sourceState.members.map((m) => m.id)))
    setImportCriteria(sourceState.hasCriteria)
    setDone(false)
  }, [sourceState])

  function toggleTask(id: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allTasksSelected = sourceState.tasks.length > 0 && selectedTaskIds.size === sourceState.tasks.length
  const allMembersSelected = sourceState.members.length > 0 && selectedMemberIds.size === sourceState.members.length

  function handleImport() {
    if (!sourceId || (selectedTaskIds.size === 0 && selectedMemberIds.size === 0)) return
    importFromWorkspace(currentWorkspaceId, sourceId, {
      taskIds: Array.from(selectedTaskIds),
      memberIds: Array.from(selectedMemberIds),
      criteria: importCriteria,
    })
    setDone(true)
  }

  if (!hasAnySource) {
    return <p className="mt-4 text-sm text-gray-500">가져올 수 있는 이전 평가가 없습니다.</p>
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-black">팀</label>
          <select
            value={sourceTeam}
            onChange={(e) => setSourceTeam(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
          >
            {teamNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-black">평가기간</label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            disabled={periodCandidates.length === 0}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            {periodCandidates.length === 0 ? (
              <option value="">가져올 기간 없음</option>
            ) : (
              periodCandidates.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.evaluationYear} {w.periodName}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {!sourceId ? (
        <p className="mt-4 text-sm text-gray-500">이 팀에는 가져올 다른 기간이 없습니다. 다른 팀을 선택해보세요.</p>
      ) : done ? (
        <>
          <p className="mt-4 text-sm text-black">가져왔습니다. 화면을 새로고침하면 반영됩니다.</p>
          <Button variant="primary" onClick={() => window.location.reload()} className="mt-4 w-full">
            새로고침
          </Button>
        </>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <p className="text-sm font-semibold text-black">과제</p>
                <button
                  type="button"
                  onClick={() => setSelectedTaskIds(allTasksSelected ? new Set() : new Set(sourceState.tasks.map((t) => t.id)))}
                  disabled={sourceState.tasks.length === 0}
                  className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                >
                  전체 {allTasksSelected ? '해제' : '선택'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {sourceState.tasks.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-gray-400">과제가 없습니다.</p>
                ) : (
                  sourceState.tasks.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-black hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(t.id)}
                        onChange={() => toggleTask(t.id)}
                        className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                      />
                      {t.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <p className="text-sm font-semibold text-black">팀원</p>
                <button
                  type="button"
                  onClick={() => setSelectedMemberIds(allMembersSelected ? new Set() : new Set(sourceState.members.map((m) => m.id)))}
                  disabled={sourceState.members.length === 0}
                  className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                >
                  전체 {allMembersSelected ? '해제' : '선택'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {sourceState.members.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-gray-400">팀원이 없습니다.</p>
                ) : (
                  sourceState.members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-black hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.has(m.id)}
                        onChange={() => toggleMember(m.id)}
                        className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                      />
                      {m.name}
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3">
            <label className="flex items-center gap-2 text-sm text-black">
              <input
                type="checkbox"
                checked={importCriteria}
                onChange={(e) => setImportCriteria(e.target.checked)}
                disabled={!sourceState.hasCriteria}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent disabled:cursor-not-allowed"
              />
              평가기준도 가져오기
            </label>
            <div className="flex gap-2">
              {onCancel && (
                <Button variant="secondary" onClick={onCancel}>
                  취소
                </Button>
              )}
              <Button variant="primary" onClick={handleImport} disabled={selectedTaskIds.size === 0 && selectedMemberIds.size === 0}>
                선택 항목 가져오기
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

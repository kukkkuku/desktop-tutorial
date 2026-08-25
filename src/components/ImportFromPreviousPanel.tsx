import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import { useWorkspaces, workspaceStateKey } from '../state/WorkspaceContext'
import type { Criteria, Task, TeamMember } from '../types'
import Button from './Button'

interface ImportFromPreviousPanelProps {
  teamName: string
  currentWorkspaceId: string
  // 취소 버튼은 독립 다이얼로그에서만 필요하다 -- 빠른 시작 팝업의 탭으로
  // 쓸 때는 탭을 바꾸거나 팝업을 닫으면 되므로 별도 취소 버튼이 없다.
  onCancel?: () => void
  // 데이터를 적용한 뒤 "데이터 적용하여 빠르게 시작하기" 버튼을 누르면
  // 호출된다 -- 빠른 시작 팝업을 닫고 과제관리로 이동시키는 데 쓴다.
  onApplied?: () => void
}

interface SourceState {
  tasks: Task[]
  members: TeamMember[]
  criteria: Criteria | null
}

function readSourceState(workspaceId: string): SourceState {
  try {
    const raw = localStorage.getItem(workspaceStateKey(workspaceId))
    if (!raw) return { tasks: [], members: [], criteria: null }
    const parsed = JSON.parse(raw)
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      members: Array.isArray(parsed.members) ? parsed.members : [],
      criteria: parsed.criteria ?? null,
    }
  } catch {
    return { tasks: [], members: [], criteria: null }
  }
}

// 이전 평가에서 팀원/과제를 지금 평가로 복사해온다. 평가 생성 시 자동으로
// 복사되던 예전 체크박스 대신, 생성 후 언제든 원할 때 쓰는 별도 액션이다.
// 팀·평가기간을 골라 원본을 정하고, 그 안의 과제/팀원을 하나씩 골라서
// 가져올 수 있다(기본은 전체 선택 -- "전체 해제"로 한 번에 뺄 수 있다).
//
// 지금 열려 있는 평가(currentWorkspaceId)로만 가져오므로, localStorage를
// 거치지 않고 useAppState()의 dispatch로 바로 적용한다 -- 그래야 화면이
// 새로고침 없이 즉시 갱신된다. 팀원은 memberId를 그대로 유지한다("최근
// 5년 고과"가 같은 memberId로 기간별 이력을 이어붙이는 방식이라, id가
// 바뀌면 이력이 끊긴다). 과제는 그 평가만의 성과 기록이라 새 id로
// 복사하고 등급/목표/성과는 비운다.
export default function ImportFromPreviousPanel({ teamName, currentWorkspaceId, onCancel, onApplied }: ImportFromPreviousPanelProps) {
  const { workspaces } = useWorkspaces()
  const { state, dispatch } = useAppState()

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
    () => (sourceId ? readSourceState(sourceId) : { tasks: [], members: [], criteria: null }),
    [sourceId],
  )

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [importCriteria, setImportCriteria] = useState(true)
  const [justApplied, setJustApplied] = useState(false)
  const [pulsing, setPulsing] = useState(false)

  // 원본 평가가 바뀔 때마다 전체 선택 상태로 초기화한다.
  useEffect(() => {
    setSelectedTaskIds(new Set(sourceState.tasks.map((t) => t.id)))
    setSelectedMemberIds(new Set(sourceState.members.map((m) => m.id)))
    setImportCriteria(sourceState.criteria !== null)
    setJustApplied(false)
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

    const existingMemberIds = new Set(state.members.map((m) => m.id))
    const membersToAdd = sourceState.members.filter((m) => selectedMemberIds.has(m.id) && !existingMemberIds.has(m.id))
    for (const member of membersToAdd) {
      dispatch({ type: 'ADD_MEMBER', payload: member })
    }

    const tasksToAdd: Task[] = sourceState.tasks
      .filter((t) => selectedTaskIds.has(t.id))
      .map((t) => ({
        id: uuidv4(),
        name: t.name,
        importance: '일반',
        workload: '중',
        objective: '',
        achievement: '',
        performanceGrade: 'B',
      }))
    for (const task of tasksToAdd) {
      dispatch({ type: 'ADD_TASK', payload: task })
    }

    if (importCriteria && sourceState.criteria) {
      dispatch({ type: 'SET_CRITERIA', payload: sourceState.criteria })
    }

    setJustApplied(true)
    setPulsing(true)
    setTimeout(() => setPulsing(false), 400)
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
                disabled={!sourceState.criteria}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent disabled:cursor-not-allowed"
              />
              평가기준도 가져오기
            </label>
            <div className="flex gap-2">
              {onCancel && !justApplied && (
                <Button variant="secondary" onClick={onCancel}>
                  취소
                </Button>
              )}
              <button
                type="button"
                onClick={justApplied ? onApplied : handleImport}
                disabled={!justApplied && selectedTaskIds.size === 0 && selectedMemberIds.size === 0}
                className={`flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition-all duration-300 ease-out disabled:cursor-not-allowed disabled:opacity-40 ${
                  justApplied ? 'bg-success' : 'bg-accent hover:opacity-90'
                } ${pulsing ? 'scale-110' : 'scale-100'}`}
              >
                {justApplied && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {justApplied ? '데이터 적용하여 빠르게 시작하기' : '선택 항목 가져오기'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { EvaluationCycle, Task, WorkspaceMeta } from '../types'
import { createEmptyState } from './appReducer'
import { migrateLegacyDataOnce } from '../utils/legacyMigration'
import {
  cyclePreferenceKey,
  currentWorkspaceKey,
  workspaceStateKey as workspaceStateKeyFor,
  workspacesKey,
} from '../utils/storageKeys'
import { findWorkspace, inferStructuredPeriod } from '../utils/period'

// 다른 모듈들(backup.ts, memberHistory.ts, AppContext.tsx)이 계속 이 경로에서
// workspaceStateKey를 가져오므로, 실제 구현(storageKeys.ts, 계정 스코프 포함)을
// 그대로 재노출한다.
export function workspaceStateKey(id: string): string {
  return workspaceStateKeyFor(id)
}

export function readWorkspaceCounts(id: string): { taskCount: number; memberCount: number; memberNames: string[] } {
  try {
    const raw = localStorage.getItem(workspaceStateKey(id))
    if (!raw) return { taskCount: 0, memberCount: 0, memberNames: [] }
    const parsed = JSON.parse(raw)
    const members = Array.isArray(parsed.members) ? (parsed.members as { name?: string; active?: boolean }[]) : []
    return {
      taskCount: Array.isArray(parsed.tasks) ? parsed.tasks.length : 0,
      memberCount: members.length,
      memberNames: members.filter((m) => m.active !== false).map((m) => m.name ?? ''),
    }
  } catch {
    return { taskCount: 0, memberCount: 0, memberNames: [] }
  }
}

export function fmtWorkspaceDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// 예전 워크스페이스는 evaluationYear/evaluationCycle/evaluationPeriodCode/
// updatedAt이 없다(자유 텍스트 periodName만 있었다). periodName에서 최대한
// 구조화된 값을 추론해 채워 넣는다 -- 실패해도 원래 데이터(periodName 등)는
// 그대로 보존되고 사용자 정의 기간으로 안전하게 fallback된다.
function migrateWorkspaceMeta(raw: unknown): WorkspaceMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.teamName !== 'string' || typeof r.periodName !== 'string') return null
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()

  const hasStructuredFields =
    typeof r.evaluationYear === 'number' &&
    typeof r.evaluationCycle === 'string' &&
    typeof r.evaluationPeriodCode === 'string'

  const structured = hasStructuredFields
    ? {
        evaluationYear: r.evaluationYear as number,
        evaluationCycle: r.evaluationCycle as EvaluationCycle,
        evaluationPeriodCode: r.evaluationPeriodCode as string,
      }
    : inferStructuredPeriod(r.periodName, createdAt)

  return {
    id: r.id,
    teamName: r.teamName,
    periodName: r.periodName,
    ...structured,
    createdAt,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : createdAt,
  }
}

function loadWorkspaces(): WorkspaceMeta[] {
  try {
    const raw = localStorage.getItem(workspacesKey())
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(migrateWorkspaceMeta).filter((w): w is WorkspaceMeta => w !== null)
  } catch {
    return []
  }
}

function loadCyclePreferences(): Record<string, EvaluationCycle> {
  try {
    const raw = localStorage.getItem(cyclePreferenceKey())
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// 계정이 확인될 때마다(최초 로그인 게이트 통과, "다른 Google 계정 연결")
// 다시 호출해서 그 계정 스코프의 데이터로 상태를 새로 읽어들인다.
//
// currentId는 항상 null로 시작한다 -- 예전엔 마지막으로 열어둔 워크스페이스를
// localStorage에서 복원해 로그인하자마자 바로 그 평가 화면으로 들어갔는데,
// 그러면 프로젝트 관리(랜딩) 화면을 거치지 않고 건너뛰어버려 다른 팀/기간을
// 고를 기회 없이 항상 같은 평가로만 들어가게 된다. 로그인/새로고침 뒤에는
// 항상 랜딩 화면에서 이어할 평가를 고르거나 새로 만들도록, 저장된 마지막
// 선택은 더 이상 자동 복원하지 않는다.
function loadInitialWorkspaceState(): {
  workspaces: WorkspaceMeta[]
  currentId: string | null
  cyclePreferences: Record<string, EvaluationCycle>
} {
  migrateLegacyDataOnce()
  const workspaces = loadWorkspaces()
  return { workspaces, currentId: null, cyclePreferences: loadCyclePreferences() }
}

export interface NewPeriodInput {
  evaluationYear: number
  evaluationCycle: EvaluationCycle
  evaluationPeriodCode: string
  periodLabel: string
  // 같은 팀의 새 기간을 만들 때 팀원/과제를 이어받을지 -- 화면에서 체크박스로
  // 직접 고른다(기본값: 팀원은 이어받음, 과제는 새로 입력). 팀이 처음 만드는
  // 평가라 이어받을 대상이 없으면 무시된다.
  copyMembers?: boolean
  copyTaskNames?: boolean
}

interface WorkspaceContextValue {
  workspaces: WorkspaceMeta[]
  currentWorkspaceId: string | null
  currentWorkspace: WorkspaceMeta | null
  teamCyclePreference: (teamName: string) => EvaluationCycle
  setTeamCyclePreference: (teamName: string, cycle: EvaluationCycle) => void
  // 같은 teamName+evaluationYear+evaluationCycle+evaluationPeriodCode 조합의
  // 평가가 이미 있으면 그걸 열고, 없으면 새로 만들어서 연다 -- "있으면 열기 /
  // 없으면 생성"을 한 번의 호출로 처리해 화면에서 따로 분기하지 않아도 된다.
  openOrCreateEvaluation: (teamName: string, input: NewPeriodInput) => { id: string; created: boolean }
  selectWorkspace: (id: string) => void
  exitToLanding: () => void
  deleteWorkspace: (id: string) => void
  renameWorkspace: (id: string, teamName: string, periodName: string) => void
  touchWorkspace: (id: string) => void
  // 로그인 게이트 통과 직후, 그리고 "다른 Google 계정 연결" 직후 호출한다 --
  // 지금 연결된 계정 스코프의 데이터로 워크스페이스 상태를 다시 읽어들인다.
  reloadForAccount: () => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [init] = useState(loadInitialWorkspaceState)
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>(init.workspaces)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(init.currentId)
  const [cyclePreferences, setCyclePreferences] = useState<Record<string, EvaluationCycle>>(init.cyclePreferences)

  useEffect(() => {
    try {
      localStorage.setItem(workspacesKey(), JSON.stringify(workspaces))
    } catch {
      // Storage may be unavailable; keep running in-memory.
    }
  }, [workspaces])

  useEffect(() => {
    try {
      if (currentWorkspaceId) localStorage.setItem(currentWorkspaceKey(), currentWorkspaceId)
      else localStorage.removeItem(currentWorkspaceKey())
    } catch {
      // ignore
    }
  }, [currentWorkspaceId])

  useEffect(() => {
    try {
      localStorage.setItem(cyclePreferenceKey(), JSON.stringify(cyclePreferences))
    } catch {
      // ignore
    }
  }, [cyclePreferences])

  // 로그인 게이트를 처음 통과했을 때, 그리고 "다른 Google 계정 연결"로
  // 계정을 바꿨을 때 호출한다 -- 지금 연결된 계정(accountScope) 기준으로
  // 워크스페이스 목록/현재 선택/주기 설정을 다시 읽어 상태를 통째로
  // 교체한다. 계정을 바꾼 직후에는 currentWorkspaceId가 새 계정에 없는
  // id를 가리키고 있을 수 있으므로, 호출부가 이어서 exitToLanding()도
  // 함께 불러 항상 프로젝트 선택 화면으로 되돌아가게 한다.
  function reloadForAccount() {
    const next = loadInitialWorkspaceState()
    setWorkspaces(next.workspaces)
    setCurrentWorkspaceId(next.currentId)
    setCyclePreferences(next.cyclePreferences)
  }

  function teamCyclePreference(teamName: string): EvaluationCycle {
    return cyclePreferences[teamName] ?? 'half'
  }

  function setTeamCyclePreference(teamName: string, cycle: EvaluationCycle) {
    setCyclePreferences((prev) => ({ ...prev, [teamName]: cycle }))
  }

  function openOrCreateEvaluation(teamName: string, input: NewPeriodInput): { id: string; created: boolean } {
    const trimmedTeamName = teamName.trim()
    const existing = findWorkspace(workspaces, trimmedTeamName, input.evaluationYear, input.evaluationCycle, input.evaluationPeriodCode)
    if (existing) {
      setCurrentWorkspaceId(existing.id)
      return { id: existing.id, created: false }
    }

    const now = new Date().toISOString()
    const meta: WorkspaceMeta = {
      id: uuidv4(),
      teamName: trimmedTeamName,
      periodName: input.periodLabel.trim() || `${input.evaluationYear} ${input.evaluationPeriodCode}`,
      evaluationYear: input.evaluationYear,
      evaluationCycle: input.evaluationCycle,
      evaluationPeriodCode: input.evaluationPeriodCode,
      createdAt: now,
      updatedAt: now,
    }
    try {
      // 평가기준(criteria)은 팀이 계속 유지하는 설정이라 같은 팀의 가장 최근
      // 평가에서 항상 자동으로 이어받는다. 팀원/과제는 화면의 체크박스로
      // 사용자가 직접 고른다(기본값: 팀원 이어받음 / 과제는 새로 입력) --
      // "이전 평가에서 가져오기"는 이 승계와 별개로, 최근 평가가 아닌 다른
      // 기간에서 추가로 가져오고 싶을 때 쓰는 보조 수단이다.
      const sameTeamWorkspaces = workspaces.filter((w) => w.teamName === trimmedTeamName)
      const mostRecentSameTeam = sameTeamWorkspaces[sameTeamWorkspaces.length - 1]
      const empty = createEmptyState()
      if (mostRecentSameTeam) {
        const raw = localStorage.getItem(workspaceStateKey(mostRecentSameTeam.id))
        if (raw) {
          const prevState = JSON.parse(raw)
          if (prevState.criteria) empty.criteria = prevState.criteria
          if ((input.copyMembers ?? true) && Array.isArray(prevState.members)) {
            empty.members = prevState.members
          }
          if (input.copyTaskNames && Array.isArray(prevState.tasks)) {
            empty.tasks = prevState.tasks.map((t: Task) => ({
              id: uuidv4(),
              name: t.name,
              importance: '일반',
              workload: '중',
              objective: '',
              achievement: '',
              performanceGrade: 'B',
            }))
          }
        }
      }
      localStorage.setItem(workspaceStateKey(meta.id), JSON.stringify(empty))
    } catch {
      // ignore — AppProvider will still initialize an empty state on mount
    }
    setWorkspaces((prev) => [...prev, meta])
    setCurrentWorkspaceId(meta.id)
    return { id: meta.id, created: true }
  }

  function selectWorkspace(id: string) {
    setCurrentWorkspaceId(id)
  }

  function exitToLanding() {
    setCurrentWorkspaceId(null)
  }

  function deleteWorkspace(id: string) {
    setWorkspaces((prev) => prev.filter((w) => w.id !== id))
    try {
      localStorage.removeItem(workspaceStateKey(id))
    } catch {
      // ignore
    }
    setCurrentWorkspaceId((prev) => (prev === id ? null : prev))
  }

  function renameWorkspace(id: string, teamName: string, periodName: string) {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, teamName: teamName.trim(), periodName: periodName.trim() } : w)),
    )
  }

  function touchWorkspace(id: string) {
    setWorkspaces((prev) => {
      const now = new Date().toISOString()
      const idx = prev.findIndex((w) => w.id === id)
      if (idx === -1) return prev
      // updatedAt은 표시용 메타데이터라, 초 단위로 반복 갱신해서 매 키입력마다
      // 리렌더를 유발하지 않도록 1분 이내 재호출은 무시한다.
      if (Date.now() - new Date(prev[idx].updatedAt).getTime() < 60_000) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], updatedAt: now }
      return next
    })
  }

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? null

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspaceId,
        currentWorkspace,
        teamCyclePreference,
        setTeamCyclePreference,
        openOrCreateEvaluation,
        selectWorkspace,
        exitToLanding,
        deleteWorkspace,
        renameWorkspace,
        touchWorkspace,
        reloadForAccount,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaces() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspaceProvider')
  return ctx
}

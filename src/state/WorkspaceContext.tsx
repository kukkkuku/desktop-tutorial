import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { EvaluationCycle, Task, TeamMember, WorkspaceMeta } from '../types'
import { createEmptyState } from './appReducer'
import { isUntouchedLegacySample, migrateAppState } from '../utils/migrate'
import { findWorkspace, inferStructuredPeriod } from '../utils/period'

const WORKSPACES_KEY = 'ux-performance-evaluation-workspaces'
const CURRENT_KEY = 'ux-performance-evaluation-current-workspace'
const CYCLE_PREF_KEY = 'ux-performance-evaluation-cycle-pref'
const OLD_SINGLE_STATE_KEY = 'ux-performance-evaluation-state'
export const WORKSPACE_STATE_PREFIX = 'ux-performance-evaluation-workspace-'

export function workspaceStateKey(id: string): string {
  return `${WORKSPACE_STATE_PREFIX}${id}`
}

// Browsers that used the app before workspaces existed have their one and
// only evaluation saved under OLD_SINGLE_STATE_KEY. The first time this code
// runs there, wrap that data into a real workspace so it isn't lost — unless
// it's empty or the untouched legacy sample fixture, in which case there's
// nothing worth keeping and the user just starts from the landing screen.
function migrateLegacySingleState(): WorkspaceMeta[] {
  try {
    const raw = localStorage.getItem(OLD_SINGLE_STATE_KEY)
    if (!raw) return []
    const migrated = migrateAppState(JSON.parse(raw))
    if (!migrated || isUntouchedLegacySample(migrated)) return []
    const hasContent =
      migrated.tasks.length > 0 ||
      migrated.members.length > 0 ||
      migrated.meetingNotes.length > 0 ||
      migrated.peerReviews.length > 0
    if (!hasContent) return []

    const id = uuidv4()
    const now = new Date().toISOString()
    const meta: WorkspaceMeta = {
      id,
      teamName: 'UX팀',
      periodName: '기존 데이터',
      evaluationYear: new Date().getFullYear(),
      evaluationCycle: 'custom',
      evaluationPeriodCode: 'CUSTOM-기존-데이터',
      createdAt: now,
      updatedAt: now,
    }
    localStorage.setItem(workspaceStateKey(id), JSON.stringify(migrated))
    return [meta]
  } catch {
    return []
  }
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
    const raw = localStorage.getItem(WORKSPACES_KEY)
    if (raw === null) {
      const migrated = migrateLegacySingleState()
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify(migrated))
      if (migrated.length > 0) localStorage.setItem(CURRENT_KEY, migrated[0].id)
      return migrated
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(migrateWorkspaceMeta).filter((w): w is WorkspaceMeta => w !== null)
  } catch {
    return []
  }
}

function loadCurrentId(workspaces: WorkspaceMeta[]): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    if (raw && workspaces.some((w) => w.id === raw)) return raw
    return null
  } catch {
    return null
  }
}

function loadCyclePreferences(): Record<string, EvaluationCycle> {
  try {
    const raw = localStorage.getItem(CYCLE_PREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadInitialWorkspaceState(): {
  workspaces: WorkspaceMeta[]
  currentId: string | null
  cyclePreferences: Record<string, EvaluationCycle>
} {
  const workspaces = loadWorkspaces()
  return { workspaces, currentId: loadCurrentId(workspaces), cyclePreferences: loadCyclePreferences() }
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
  importFromWorkspace: (targetId: string, sourceId: string, opts: { members: boolean; tasks: boolean }) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [init] = useState(loadInitialWorkspaceState)
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>(init.workspaces)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(init.currentId)
  const [cyclePreferences, setCyclePreferences] = useState<Record<string, EvaluationCycle>>(init.cyclePreferences)

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces))
    } catch {
      // Storage may be unavailable; keep running in-memory.
    }
  }, [workspaces])

  useEffect(() => {
    try {
      if (currentWorkspaceId) localStorage.setItem(CURRENT_KEY, currentWorkspaceId)
      else localStorage.removeItem(CURRENT_KEY)
    } catch {
      // ignore
    }
  }, [currentWorkspaceId])

  useEffect(() => {
    try {
      localStorage.setItem(CYCLE_PREF_KEY, JSON.stringify(cyclePreferences))
    } catch {
      // ignore
    }
  }, [cyclePreferences])

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

  // 다른 평가기간의 팀원/과제를 지금 평가로 가져온다. 팀원은 memberId를 그대로
  // 유지한다 -- 팀원 관리의 "최근 5년 고과"가 같은 memberId를 기간마다 찾아
  // 이력을 이어붙이는 방식이라, id가 바뀌면 그 팀원의 과거 이력이 끊긴다.
  // 과제는 그 평가만의 성과 기록이라 새 id로 복사하고 등급/목표/성과는 비운다.
  function importFromWorkspace(targetId: string, sourceId: string, opts: { members: boolean; tasks: boolean }) {
    try {
      const sourceRaw = localStorage.getItem(workspaceStateKey(sourceId))
      const targetRaw = localStorage.getItem(workspaceStateKey(targetId))
      if (!sourceRaw || !targetRaw) return
      const source = JSON.parse(sourceRaw)
      const target = JSON.parse(targetRaw)

      if (opts.members && Array.isArray(source.members)) {
        const existingIds = new Set((target.members as TeamMember[]).map((m) => m.id))
        const toAdd = (source.members as TeamMember[]).filter((m) => !existingIds.has(m.id))
        target.members = [...target.members, ...toAdd]
      }
      if (opts.tasks && Array.isArray(source.tasks)) {
        const copied: Task[] = (source.tasks as Task[]).map((t) => ({
          id: uuidv4(),
          name: t.name,
          importance: '일반',
          workload: '중',
          objective: '',
          achievement: '',
          performanceGrade: 'B',
        }))
        target.tasks = [...target.tasks, ...copied]
      }

      localStorage.setItem(workspaceStateKey(targetId), JSON.stringify(target))
      touchWorkspace(targetId)
    } catch {
      // Import is best-effort; leave the target workspace untouched on failure.
    }
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
        importFromWorkspace,
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

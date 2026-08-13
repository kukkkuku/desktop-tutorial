import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Task, WorkspaceMeta } from '../types'
import { createEmptyState } from './appReducer'
import { isUntouchedLegacySample, migrateAppState } from '../utils/migrate'

const WORKSPACES_KEY = 'ux-performance-evaluation-workspaces'
const CURRENT_KEY = 'ux-performance-evaluation-current-workspace'
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
    const meta: WorkspaceMeta = {
      id,
      teamName: 'UX팀',
      periodName: '기존 데이터',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(workspaceStateKey(id), JSON.stringify(migrated))
    return [meta]
  } catch {
    return []
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
    return Array.isArray(parsed) ? parsed : []
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

function loadInitialWorkspaceState(): { workspaces: WorkspaceMeta[]; currentId: string | null } {
  const workspaces = loadWorkspaces()
  return { workspaces, currentId: loadCurrentId(workspaces) }
}

export interface CreateWorkspaceOptions {
  copyMembers?: boolean
  copyTaskNames?: boolean
}

interface WorkspaceContextValue {
  workspaces: WorkspaceMeta[]
  currentWorkspaceId: string | null
  currentWorkspace: WorkspaceMeta | null
  createWorkspace: (teamName: string, periodName: string, options?: CreateWorkspaceOptions) => void
  selectWorkspace: (id: string) => void
  exitToLanding: () => void
  deleteWorkspace: (id: string) => void
  renameWorkspace: (id: string, teamName: string, periodName: string) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [init] = useState(loadInitialWorkspaceState)
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>(init.workspaces)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(init.currentId)

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

  function createWorkspace(teamName: string, periodName: string, options: CreateWorkspaceOptions = {}) {
    const { copyMembers = true, copyTaskNames = false } = options
    const trimmedTeamName = teamName.trim()
    const meta: WorkspaceMeta = {
      id: uuidv4(),
      teamName: trimmedTeamName,
      periodName: periodName.trim(),
      createdAt: new Date().toISOString(),
    }

    // A new period for a team that already exists can optionally carry over
    // that team's roster (stable across periods) and/or just the previous
    // period's task names (a fresh start for grades/objectives/achievements,
    // since those are period-specific and copying them over would be
    // misleading). Criteria always carries over -- those are a team setting,
    // not a period-specific one.
    const sameTeamWorkspaces = workspaces.filter((w) => w.teamName === trimmedTeamName)
    const mostRecentSameTeam = sameTeamWorkspaces[sameTeamWorkspaces.length - 1]
    if (mostRecentSameTeam) {
      try {
        const raw = localStorage.getItem(workspaceStateKey(mostRecentSameTeam.id))
        if (raw) {
          const prevState = JSON.parse(raw)
          const carriedOverState = {
            ...createEmptyState(),
            members: copyMembers && Array.isArray(prevState.members) ? prevState.members : [],
            criteria: prevState.criteria ?? createEmptyState().criteria,
            tasks:
              copyTaskNames && Array.isArray(prevState.tasks)
                ? prevState.tasks.map(
                    (t: Task): Task => ({
                      id: uuidv4(),
                      name: t.name,
                      importance: '일반',
                      workload: '중',
                      objective: '',
                      achievement: '',
                      performanceGrade: 'B',
                    }),
                  )
                : [],
          }
          localStorage.setItem(workspaceStateKey(meta.id), JSON.stringify(carriedOverState))
        }
      } catch {
        // Fall through — the new workspace just starts fully empty.
      }
    }

    setWorkspaces((prev) => [...prev, meta])
    setCurrentWorkspaceId(meta.id)
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

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? null

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspaceId,
        currentWorkspace,
        createWorkspace,
        selectWorkspace,
        exitToLanding,
        deleteWorkspace,
        renameWorkspace,
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

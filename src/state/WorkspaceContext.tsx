import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { WorkspaceMeta } from '../types'
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

interface WorkspaceContextValue {
  workspaces: WorkspaceMeta[]
  currentWorkspaceId: string | null
  currentWorkspace: WorkspaceMeta | null
  createWorkspace: (teamName: string, periodName: string) => void
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

  function createWorkspace(teamName: string, periodName: string) {
    const trimmedTeamName = teamName.trim()
    const meta: WorkspaceMeta = {
      id: uuidv4(),
      teamName: trimmedTeamName,
      periodName: periodName.trim(),
      createdAt: new Date().toISOString(),
    }

    // A new period for a team that already exists starts with that team's
    // roster and criteria carried over (those tend to stay stable across
    // periods), but empty tasks/contributions/peerReviews/meetingNotes
    // (those are specific to each period and shouldn't leak between them).
    const sameTeamWorkspaces = workspaces.filter((w) => w.teamName === trimmedTeamName)
    const mostRecentSameTeam = sameTeamWorkspaces[sameTeamWorkspaces.length - 1]
    if (mostRecentSameTeam) {
      try {
        const raw = localStorage.getItem(workspaceStateKey(mostRecentSameTeam.id))
        if (raw) {
          const prevState = JSON.parse(raw)
          const carriedOverState = {
            ...createEmptyState(),
            members: Array.isArray(prevState.members) ? prevState.members : [],
            criteria: prevState.criteria ?? createEmptyState().criteria,
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

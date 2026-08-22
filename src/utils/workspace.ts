import type {
  AppState,
  EvaluationPeriod,
  EvaluationPeriodType,
  EvaluationProject,
  Task,
  Team,
  WorkspaceState,
} from '../types'
import { createEmptyState } from '../state/appReducer'
import { migrateAppState } from './migrate'

export const WORKSPACE_SCHEMA_VERSION = 1 as const

export function createEmptyWorkspace(): WorkspaceState {
  return { schemaVersion: WORKSPACE_SCHEMA_VERSION, teams: [], projects: [], activeProjectId: null }
}

export function formatEvaluationPeriod(period: EvaluationPeriod, separator = ' ') {
  if (period.type === 'custom') return `${period.startDate || '-'} ~ ${period.endDate || '-'}`
  return `${period.year}${separator}${period.value}`
}

export function evaluationPeriodFolderName(period: EvaluationPeriod) {
  if (period.type === 'custom') return `${period.year}_${period.startDate || '시작'}_${period.endDate || '종료'}`
  return `${period.year}_${period.value}`
}

export function getPeriodOptions(type: EvaluationPeriodType) {
  if (type === 'half') return ['상반기', '하반기']
  if (type === 'quarter') return ['1분기', '2분기', '3분기', '4분기']
  if (type === 'annual') return ['연간']
  return ['사용자 지정']
}

export interface CreateProjectInput {
  teamId: string
  period: EvaluationPeriod
  sourceProjectId?: string
  copyMembers: boolean
  copyCriteria: boolean
  taskIds: string[]
}

export function createEvaluationProject(
  workspace: WorkspaceState,
  input: CreateProjectInput,
): EvaluationProject {
  const source = workspace.projects.find((project) => project.id === input.sourceProjectId)
  const now = new Date().toISOString()
  const appState = createEmptyState()

  if (source && input.copyMembers) appState.members = source.appState.members.map((member) => ({ ...member }))
  if (source && input.copyCriteria) appState.criteria = { ...source.appState.criteria }
  if (source && input.taskIds.length > 0) {
    appState.tasks = source.appState.tasks
      .filter((task) => input.taskIds.includes(task.id))
      .map((task): Task => ({
        id: crypto.randomUUID(),
        name: task.name,
        objective: task.objective,
        importance: '일반',
        performanceGrade: 'B',
        workload: '중',
        achievement: '',
      }))
  }

  return {
    id: crypto.randomUUID(),
    teamId: input.teamId,
    period: input.period,
    createdAt: now,
    updatedAt: now,
    appState,
  }
}

export function updateEvaluationProjectState(
  workspace: WorkspaceState,
  projectId: string,
  state: AppState,
): WorkspaceState {
  const project = workspace.projects.find((item) => item.id === projectId)
  if (!project || JSON.stringify(project.appState) === JSON.stringify(state)) return workspace
  const team = workspace.teams.find((item) => item.id === project.teamId)
  const projectMembersById = new Map(state.members.map((member) => [member.id, member]))
  const mergedTeamMembers = [
    ...(team?.members ?? []).map((member) => ({ ...(projectMembersById.get(member.id) ?? member) })),
    ...state.members
      .filter((member) => !team?.members.some((existing) => existing.id === member.id))
      .map((member) => ({ ...member })),
  ]
  return {
    ...workspace,
    teams: workspace.teams.map((item) => item.id === project.teamId ? { ...item, members: mergedTeamMembers } : item),
    projects: workspace.projects.map((item) => item.id === project.id
      ? { ...item, appState: state, updatedAt: new Date().toISOString() }
      : item),
  }
}

export function migrateWorkspace(raw: unknown): WorkspaceState | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<WorkspaceState>
  if (!Array.isArray(value.teams) || !Array.isArray(value.projects)) return null
  const teams = value.teams
    .filter((team): team is Team => Boolean(team && typeof team.id === 'string' && typeof team.name === 'string'))
    .map((team) => ({
      ...team,
      members: Array.isArray(team.members) ? team.members : [],
      growthProfiles: Array.isArray(team.growthProfiles) ? team.growthProfiles : [],
      meetingNotes: Array.isArray(team.meetingNotes) ? team.meetingNotes : [],
    }))
  const projects = value.projects.flatMap((project) => {
    if (!project || typeof project.id !== 'string' || typeof project.teamId !== 'string' || !project.period) return []
    const appState = migrateAppState(project.appState)
    if (!appState) return []
    return [{ ...project, appState } as EvaluationProject]
  })
  const teamsWithLongTermData = teams.map((team) => {
    const growthProfiles = team.growthProfiles.map((profile) => ({
      ...profile,
      positionYears: profile.positionYears ?? 5,
      performanceHistory: Array.isArray(profile.performanceHistory) ? profile.performanceHistory : [],
      auxiliaryMetrics: profile.auxiliaryMetrics ?? { position: 0, rewardPenalty: 0, tenure: 0, education: 0 },
    }))
    if (team.meetingNotes.length > 0) return { ...team, growthProfiles }
    const notes = projects
      .filter((project) => project.teamId === team.id)
      .flatMap((project) => project.appState.meetingNotes)
    return {
      ...team,
      growthProfiles,
      meetingNotes: Array.from(new Map(notes.map((note) => [note.id, note])).values()),
    }
  })
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    teams: teamsWithLongTermData,
    projects,
    activeProjectId: projects.some((project) => project.id === value.activeProjectId) ? value.activeProjectId! : null,
  }
}

export function migrateLegacyState(raw: unknown): AppState | null {
  return migrateAppState(raw)
}

export function migrateLegacyWorkspace(raw: unknown, now = new Date()): WorkspaceState | null {
  const appState = migrateLegacyState(raw)
  if (!appState) return null
  const hasData = appState.tasks.length > 0
    || appState.members.length > 0
    || appState.contributions.length > 0
    || appState.meetingNotes.length > 0
    || appState.peerReviews.length > 0
  if (!hasData) return null

  const teamId = crypto.randomUUID()
  const projectId = crypto.randomUUID()
  const timestamp = now.toISOString()
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    teams: [{
      id: teamId,
      name: '기존 팀',
      members: appState.members.map((member) => ({ ...member })),
      growthProfiles: [],
      meetingNotes: appState.meetingNotes.map((note) => ({ ...note })),
      createdAt: timestamp,
    }],
    projects: [{
      id: projectId,
      teamId,
      period: { year: now.getFullYear(), type: 'annual', value: '연간' },
      createdAt: timestamp,
      updatedAt: timestamp,
      appState,
    }],
    activeProjectId: null,
  }
}

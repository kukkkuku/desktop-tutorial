import { useEffect, useState } from 'react'
import type { TeamMember } from '../types'
import { useWorkspace } from '../state/WorkspaceContext'
import { getMemberEvaluationHistory, getMemberProjectPerformance } from '../utils/growth'
import Badge, { type BadgeTone } from './Badge'
import DisclosureIcon from './DisclosureIcon'
import EvaluationNoteButton from './EvaluationNoteButton'
import { useAppState } from '../state/AppContext'

const GRADE_TONES: Record<string, BadgeTone> = {
  S: 'grade-s', A: 'grade-a', B: 'grade-b', C: 'grade-c', D: 'grade-d',
}

function TaskRows({ tasks, memberName, onNoteSave }: { tasks: NonNullable<ReturnType<typeof getMemberProjectPerformance>>['majorTasks']; memberName: string; onNoteSave: (taskId: string, note: string) => void }) {
  if (tasks.length === 0) return <p className="border-t border-gray-100 px-4 py-4 text-xs text-gray-400">참여 과제가 없습니다.</p>
  return <div className="divide-y divide-gray-100 border-t border-gray-100 px-4">{tasks.map((task) => <div key={task.id} className="grid grid-cols-[auto_minmax(0,1fr)_42px_30px_28px_52px] items-center gap-2 py-2.5 text-xs"><span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">{task.importance}</span><span className="min-w-0 font-medium text-gray-800">{task.name}</span><span className="text-right tabular-nums text-gray-500">{task.contributionPercent.toFixed(0)}%</span><span className="text-center font-semibold">{task.grade}</span><EvaluationNoteButton note={task.evaluationNote} label={`${memberName} · ${task.name} 평가 근거`} onSave={(note) => onNoteSave(task.id, note)} /><span className="text-right font-semibold tabular-nums">{task.individualScore.toFixed(1)}</span></div>)}</div>
}

export default function RecentPerformanceSummary({ member }: { member: TeamMember }) {
  const { dispatch } = useAppState()
  const { workspace, activeTeam, activeProject, updateProjectState } = useWorkspace()
  const history = activeTeam ? getMemberEvaluationHistory(workspace, activeTeam.id, member.id) : []
  const defaultProjectId = history.some((item) => item.projectId === activeProject?.id) ? activeProject?.id ?? '' : history[0]?.projectId ?? ''
  const [openProjectIds, setOpenProjectIds] = useState<string[]>(defaultProjectId ? [defaultProjectId] : [])

  useEffect(() => {
    setOpenProjectIds(defaultProjectId ? [defaultProjectId] : [])
  }, [defaultProjectId, member.id])

  function toggleProject(projectId: string) {
    setOpenProjectIds((ids) => ids.includes(projectId) ? ids.filter((id) => id !== projectId) : [...ids, projectId])
  }

  function saveEvaluationNote(projectId: string, taskId: string, note: string) {
    if (projectId === activeProject?.id) {
      dispatch({ type: 'SET_CONTRIBUTION_NOTE', payload: { taskId, memberId: member.id, evaluationNote: note } })
      return
    }
    const project = workspace.projects.find((item) => item.id === projectId)
    if (!project) return
    updateProjectState(projectId, {
      ...project.appState,
      contributions: project.appState.contributions.map((contribution) => contribution.taskId === taskId && contribution.memberId === member.id ? { ...contribution, evaluationNote: note } : contribution),
    })
  }

  if (history.length === 0) return <section className="pb-4"><h3 className="ui-section-title">성과</h3><p className="mt-2 text-sm text-gray-500">아직 평가 성과가 없습니다.</p></section>

  return <section className="space-y-2 pb-4" aria-label="평가기간별 성과">
    {history.map((item) => {
      const open = openProjectIds.includes(item.projectId)
      const detail = getMemberProjectPerformance(workspace, item.projectId, member.id)
      const current = item.projectId === activeProject?.id
      return <article key={item.projectId} className={`overflow-hidden rounded-lg border bg-white ${current ? 'border-gray-300' : 'border-gray-200'}`}>
        <button type="button" onClick={() => toggleProject(item.projectId)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="flex min-w-0 flex-wrap items-center gap-2"><strong className="text-sm text-gray-950">{item.label}</strong><span className="text-sm font-semibold tabular-nums text-gray-700">{item.score.toFixed(1)}점</span><Badge tone={GRADE_TONES[item.grade] ?? 'neutral'}>{item.grade}</Badge>{current && <span className="text-[11px] font-medium text-gray-400">현재 평가기간</span>}</span>
          <DisclosureIcon open={open} className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
        {open && detail && <TaskRows tasks={detail.majorTasks} memberName={member.name} onNoteSave={(taskId, note) => saveEvaluationNote(item.projectId, taskId, note)} />}
      </article>
    })}
  </section>
}

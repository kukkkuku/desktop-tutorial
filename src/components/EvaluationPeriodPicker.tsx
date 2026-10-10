import { useEffect, useMemo, useRef, useState } from 'react'
import type { EvaluationCycle, WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import { CYCLE_LABELS, customPeriodCode, findWorkspace, periodOptionsForCycle } from '../utils/period'
import { ArrowRight, Check, Settings } from 'lucide-react'
import Button from './Button'
import IconButton from './IconButton'
import YearPicker from './YearPicker'
import { ic, icSm } from './ui/icon'
import Select from './ui/Select'

interface EvaluationPeriodPickerProps {
  teamName: string
  defaultYear?: number // 보는 연도(새 평가의 처음 연도)
  // 열기/생성 둘 다 이 콜백 하나로 끝난다 -- 호출 시점엔 이미 해당 평가가
  // 선택(selectWorkspace)된 뒤이므로, 모달을 닫거나 화면을 전환하면 된다.
  onDone: (workspaceId: string, created: boolean) => void // created: 새로 만들었는지(이미 있던 기간을 연 게 아니라)
}

export default function EvaluationPeriodPicker({ teamName, defaultYear, onDone }: EvaluationPeriodPickerProps) {
  const { workspaces, teamCyclePreference, setTeamCyclePreference, openOrCreateEvaluation } = useWorkspaces()
  const teamWorkspaces = useMemo(
    () => workspaces.filter((w) => w.teamName === teamName).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [workspaces, teamName],
  )
  const mostRecent = teamWorkspaces[teamWorkspaces.length - 1] as WorkspaceMeta | undefined

  const sourceCounts = useMemo(() => (mostRecent ? readWorkspaceCounts(mostRecent.id) : { taskCount: 0, memberCount: 0, memberNames: [] as string[], taskNames: [] as string[] }), [mostRecent])

  const [cycle, setCycle] = useState<EvaluationCycle>(mostRecent?.evaluationCycle ?? teamCyclePreference(teamName))
  const [year, setYear] = useState<number>(defaultYear ?? mostRecent?.evaluationYear ?? new Date().getFullYear())
  const [periodCode, setPeriodCode] = useState<string>(mostRecent?.evaluationPeriodCode ?? periodOptionsForCycle(cycle)[0]?.code ?? '')
  const [customLabel, setCustomLabel] = useState<string>(cycle === 'custom' ? (mostRecent?.periodName ?? '') : '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  // 팀원/과제 복사 여부 -- 이 팀에 이미 다른 기간이 있을 때만 의미가 있다.
  const [copyMembers, setCopyMembers] = useState(true)
  const [copyTaskNames, setCopyTaskNames] = useState(false)

  useEffect(() => {
    if (!settingsOpen) return
    function onClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [settingsOpen])

  // 연도 그리드에 점으로 표시할, 이 팀이 실제로 평가를 만든 연도들.
  const yearsWithData = useMemo(() => new Set(teamWorkspaces.map((w) => w.evaluationYear)), [teamWorkspaces])

  const fixedOptions = periodOptionsForCycle(cycle)
  const customWorkspacesForTeam = useMemo(() => teamWorkspaces.filter((w) => w.evaluationCycle === 'custom'), [teamWorkspaces])

  function handleCycleChange(next: EvaluationCycle) {
    setCycle(next)
    setTeamCyclePreference(teamName, next)
    if (next !== 'custom') {
      setPeriodCode(periodOptionsForCycle(next)[0]?.code ?? '')
    } else {
      setCustomLabel('')
      setPeriodCode('')
    }
  }

  const effectivePeriodCode = cycle === 'custom' ? customPeriodCode(customLabel) : periodCode
  const effectiveLabel = cycle === 'custom' ? customLabel.trim() : (fixedOptions.find((o) => o.code === periodCode)?.label ?? '')

  const matched = effectivePeriodCode ? findWorkspace(teamWorkspaces, teamName, year, cycle, effectivePeriodCode) : null
  const canSubmit = cycle !== 'custom' ? Boolean(periodCode) : customLabel.trim().length > 0

  function handleSubmit() {
    if (!canSubmit) return
    const { id } = openOrCreateEvaluation(teamName, {
      evaluationYear: year,
      evaluationCycle: cycle,
      evaluationPeriodCode: effectivePeriodCode,
      periodLabel: effectiveLabel,
      copyMembers,
      copyTaskNames,
    })
    onDone(id, !matched)
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <YearPicker year={year} onChange={setYear} yearsWithData={yearsWithData} />

        {cycle === 'custom' ? (
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="예: 특별 평가"
            className="h-8 min-w-0 flex-1 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label"
          />
        ) : (
          <Select
            value={periodCode}
            onChange={(e) => setPeriodCode(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-control border border-hairline px-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label"
          >
            {fixedOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </Select>
        )}

        <div className="relative shrink-0" ref={settingsRef}>
          <IconButton onClick={() => setSettingsOpen((v) => !v)} title="평가 주기 설정" aria-label="평가 주기 설정">
            <Settings {...ic} />
          </IconButton>
          {settingsOpen && (
            <div className="mac-pop absolute right-0 top-full z-30 mt-1.5 w-44 py-1">
              <p className="px-3.5 py-1 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label-3">평가 주기</p>
              {(['half', 'quarter', 'month', 'custom'] as EvaluationCycle[]).map((c) => (
                <button key={c} onClick={() => handleCycleChange(c)} className="mac-menu-item">
                  <Check {...icSm} className={cycle === c ? '' : 'invisible'} />
                  {CYCLE_LABELS[c]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {cycle === 'custom' && customWorkspacesForTeam.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {customWorkspacesForTeam.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setYear(w.evaluationYear)
                setCustomLabel(w.periodName)
              }}
              className="rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[length:calc(14px*var(--ui-fs,1))] text-label-2 hover:bg-accent-soft hover:text-accent"
            >
              {w.evaluationYear} {w.periodName}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-card border border-separator p-4">
        {matched ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">
                {year} {effectiveLabel}
              </span>
              <span className="text-[length:calc(14px*var(--ui-fs,1))] text-label-3">최근 수정 {fmtWorkspaceDate(matched.updatedAt)}</span>
            </div>
            <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
              과제 {readWorkspaceCounts(matched.id).taskCount}개 · 팀원 {readWorkspaceCounts(matched.id).memberCount}명
            </p>
            <Button variant="primary" onClick={handleSubmit} className="mt-3 w-full">
              평가 계속하기 <ArrowRight {...icSm} />
            </Button>
          </>
        ) : (
          <>
            <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
              {year} {effectiveLabel || '평가'}가 없습니다.
            </p>
            {mostRecent && (
              <div className="mt-3 space-y-1.5 border-t border-separator pt-3">
                <p className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label-3">
                  새 평가에 가져올 것 <span className="font-normal">-- 이 팀의 가장 최근 평가 「{mostRecent.evaluationYear} {mostRecent.periodName}」에서</span>
                </p>
                <label className="flex items-start gap-2 text-[length:calc(14px*var(--ui-fs,1))] text-label">
                  <input type="checkbox" className="mt-1" checked={copyMembers} onChange={(e) => setCopyMembers(e.target.checked)} />
                  <span>
                    팀원 {sourceCounts.memberCount}명 그대로 가져오기
                    {sourceCounts.memberNames.length > 0 && (
                      <span className="block text-xs text-label-3">
                        {sourceCounts.memberNames.slice(0, 6).join(', ')}
                        {sourceCounts.memberNames.length > 6 ? ` 외 ${sourceCounts.memberNames.length - 6}명` : ''}
                      </span>
                    )}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[length:calc(14px*var(--ui-fs,1))] text-label">
                  <input type="checkbox" className="mt-1" checked={copyTaskNames} onChange={(e) => setCopyTaskNames(e.target.checked)} />
                  <span>
                    과제 {sourceCounts.taskCount}개의 이름만 가져오기
                    <span className="block text-xs text-label-3">분류 · 성과등급 · 목표 · 성과는 비워 두고 새로 입력합니다</span>
                  </span>
                </label>
              </div>
            )}
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} className="mt-3 w-full">
              {year} {effectiveLabel || ''} 평가 만들기 <ArrowRight {...icSm} />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

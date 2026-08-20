import { useEffect, useMemo, useRef, useState } from 'react'
import type { EvaluationCycle, WorkspaceMeta } from '../types'
import { fmtWorkspaceDate, readWorkspaceCounts, useWorkspaces } from '../state/WorkspaceContext'
import { CYCLE_LABELS, customPeriodCode, findWorkspace, periodOptionsForCycle } from '../utils/period'
import Button from './Button'
import IconButton from './IconButton'

function GearIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

function ChevronIcon({ className, direction }: { className?: string; direction: 'left' | 'right' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  )
}

const YEAR_GRID_SIZE = 8

// 연도를 <select>가 아니라 작은 캘린더형 팝오버(연도 그리드)에서 고른다 --
// 버튼에 선택된 연도 + 달력 아이콘을 두고, 누르면 8개씩 연도 그리드가 뜨고
// ‹ › 로 앞뒤 연대를 넘길 수 있다. 실제로 데이터가 있는 연도는 점으로 표시.
function YearPicker({
  year,
  onChange,
  yearsWithData,
}: {
  year: number
  onChange: (y: number) => void
  yearsWithData: Set<number>
}) {
  const [open, setOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState(() => year - (year % YEAR_GRID_SIZE ? year % YEAR_GRID_SIZE : 0) - Math.floor(YEAR_GRID_SIZE / 2))
  const ref = useRef<HTMLDivElement>(null)
  const thisYear = new Date().getFullYear()

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const years = Array.from({ length: YEAR_GRID_SIZE }, (_, i) => rangeStart + i)

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-50"
      >
        <CalendarIcon className="h-4 w-4 text-gray-400" />
        {year}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-52 rounded-md border border-gray-200 bg-white p-2 shadow-md">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <IconButton onClick={() => setRangeStart((s) => s - YEAR_GRID_SIZE)} aria-label="이전 연대" title="이전 연대">
              <ChevronIcon direction="left" className="h-4 w-4" />
            </IconButton>
            <span className="text-xs font-semibold text-gray-400">
              {rangeStart} – {rangeStart + YEAR_GRID_SIZE - 1}
            </span>
            <IconButton onClick={() => setRangeStart((s) => s + YEAR_GRID_SIZE)} aria-label="다음 연대" title="다음 연대">
              <ChevronIcon direction="right" className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => {
                  onChange(y)
                  setOpen(false)
                }}
                className={`relative rounded-md py-1.5 text-sm ${
                  y === year ? 'bg-accent font-bold text-white' : y === thisYear ? 'font-semibold text-accent hover:bg-gray-100' : 'text-black hover:bg-gray-50'
                }`}
              >
                {y}
                {yearsWithData.has(y) && y !== year && (
                  <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface EvaluationPeriodPickerProps {
  teamName: string
  // 열기/생성 둘 다 이 콜백 하나로 끝난다 -- 호출 시점엔 이미 해당 평가가
  // 선택(selectWorkspace)된 뒤이므로, 모달을 닫거나 화면을 전환하면 된다.
  onDone: (workspaceId: string) => void
}

export default function EvaluationPeriodPicker({ teamName, onDone }: EvaluationPeriodPickerProps) {
  const { workspaces, teamCyclePreference, setTeamCyclePreference, openOrCreateEvaluation } = useWorkspaces()
  const teamWorkspaces = useMemo(
    () => workspaces.filter((w) => w.teamName === teamName).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [workspaces, teamName],
  )
  const mostRecent = teamWorkspaces[teamWorkspaces.length - 1] as WorkspaceMeta | undefined

  const [cycle, setCycle] = useState<EvaluationCycle>(mostRecent?.evaluationCycle ?? teamCyclePreference(teamName))
  const [year, setYear] = useState<number>(mostRecent?.evaluationYear ?? new Date().getFullYear())
  const [periodCode, setPeriodCode] = useState<string>(mostRecent?.evaluationPeriodCode ?? periodOptionsForCycle(cycle)[0]?.code ?? '')
  const [customLabel, setCustomLabel] = useState<string>(cycle === 'custom' ? mostRecent?.periodName ?? '' : '')
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
  const customWorkspacesForTeam = useMemo(
    () => teamWorkspaces.filter((w) => w.evaluationCycle === 'custom'),
    [teamWorkspaces],
  )

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
  const effectiveLabel =
    cycle === 'custom' ? customLabel.trim() : fixedOptions.find((o) => o.code === periodCode)?.label ?? ''

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
    onDone(id)
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
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
          />
        ) : (
          <select
            value={periodCode}
            onChange={(e) => setPeriodCode(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black"
          >
            {fixedOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        <div className="relative shrink-0" ref={settingsRef}>
          <IconButton onClick={() => setSettingsOpen((v) => !v)} title="평가 주기 설정" aria-label="평가 주기 설정">
            <GearIcon className="h-4 w-4" />
          </IconButton>
          {settingsOpen && (
            <div className="absolute right-0 top-full z-10 mt-2 w-44 rounded-md border border-gray-200 bg-white p-2 shadow-md">
              <p className="px-1.5 py-1 text-xs font-semibold text-gray-400">평가 주기</p>
              {(['half', 'quarter', 'month', 'custom'] as EvaluationCycle[]).map((c) => (
                <button
                  key={c}
                  onClick={() => handleCycleChange(c)}
                  className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm ${
                    cycle === c ? 'bg-black font-semibold text-white' : 'text-black hover:bg-gray-50'
                  }`}
                >
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
              className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:border-accent hover:text-accent"
            >
              {w.evaluationYear} {w.periodName}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        {matched ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-black">
                {year} {effectiveLabel}
              </span>
              <span className="text-xs text-gray-400">최근 수정 {fmtWorkspaceDate(matched.updatedAt)}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              과제 {readWorkspaceCounts(matched.id).taskCount}개 · 팀원 {readWorkspaceCounts(matched.id).memberCount}명
            </p>
            <Button variant="primary" onClick={handleSubmit} className="mt-3 w-full">
              평가 계속하기 →
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              {year} {effectiveLabel || '평가'}가 없습니다.
            </p>
            {mostRecent && (
              <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-400">'{mostRecent.periodName}'에서 가져오기</p>
                <label className="flex items-center gap-2 text-xs text-black">
                  <input
                    type="checkbox"
                    checked={copyMembers}
                    onChange={(e) => setCopyMembers(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  팀원 정보 복사
                </label>
                <label className="flex items-center gap-2 text-xs text-black">
                  <input
                    type="checkbox"
                    checked={copyTaskNames}
                    onChange={(e) => setCopyTaskNames(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  과제명 복사 (등급·목표·성과는 새로 입력)
                </label>
              </div>
            )}
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} className="mt-3 w-full">
              {year} {effectiveLabel || ''} 평가 만들기 →
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

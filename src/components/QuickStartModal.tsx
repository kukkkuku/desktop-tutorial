import { useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { Task, TeamMember } from '../types'
import BulkUploadPanel from './BulkUploadPanel'
import ImportFromPreviousPanel from './ImportFromPreviousPanel'
import Button from './Button'
import IconButton from './IconButton'

interface QuickStartModalProps {
  teamName: string
  currentWorkspaceId: string
  hasOtherPeriods: boolean
  onClose: () => void
  // "직접 입력"으로 과제/팀원을 등록했거나, "이전 평가 가져오기"에서
  // 데이터를 적용한 뒤 호출한다 -- 과제관리 탭으로 이동시켜 방금 넣은
  // 결과를 바로 보여준다.
  onDataReady: () => void
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

type EntryTarget = 'task' | 'member'
type Tab = 'direct' | 'excel' | 'import'

// 하나의 칩(추가된 과제명/팀원 이름)을 보여준다 -- x를 누르면 그
// 자리에서 뺄 수 있다.
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-2.5 pr-1.5 text-sm text-black">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} 삭제`}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-black"
      >
        <XIcon className="h-3 w-3" />
      </button>
    </span>
  )
}

// 좌우 큰 영역(과제 / 팀원)에 칩이 쌓인다. 영역을 눌러 어디에 추가할지
// 고른 뒤, 하단 입력창에서 이름을 입력하고 Enter를 치면 그 칩이 선택된
// 영역으로 들어간다. 여러 줄(또는 쉼표 구분)을 붙여넣으면 한 번에
// 여러 칩으로 나뉜다.
function EntryPanel({
  title,
  count,
  items,
  active,
  onSelect,
  onRemove,
}: {
  title: string
  count: number
  items: string[]
  active: boolean
  onSelect: () => void
  onRemove: (index: number) => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-[160px] flex-col items-start gap-2 rounded-lg border-2 p-3 text-left transition-colors ${
        active ? 'border-accent bg-blue-50/40' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <p className={`text-sm font-semibold ${active ? 'text-accent' : 'text-black'}`}>
        {title} {count > 0 && <span className="font-normal text-gray-400">{count}개</span>}
      </p>
      <div className="flex flex-wrap content-start gap-1.5">
        {items.map((name, i) => (
          <Chip key={`${name}-${i}`} label={name} onRemove={() => onRemove(i)} />
        ))}
        {items.length === 0 && <p className="text-xs text-gray-300">{active ? '아래에 입력하고 Enter' : '눌러서 선택'}</p>}
      </div>
    </button>
  )
}

// "직접 입력" 탭 -- 과제관리/팀원관리의 상세 폼(등급/업무량/목표/직급/
// 입사일 등)까지 다 채우게 하지 않고, 과제명·팀원 이름만 빠르게 받아서
// 한 번에 등록한다. 나머지 항목은 필요할 때 각 화면에서 채우면 된다.
// 상세 필드는 각각 기본값(과제: 일반/B/중, 팀원: 직급·입사일 등
// 비워둠)으로 넣는다.
function DirectEntryPanel({ onDone }: { onDone: () => void }) {
  const { state, dispatch, markRecentlyAdded } = useAppState()
  const [target, setTarget] = useState<EntryTarget>('task')
  const [taskNames, setTaskNames] = useState<string[]>([])
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')

  const setCurrentNames = target === 'task' ? setTaskNames : setMemberNames

  function addNames(raw: string) {
    const names = raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) return
    setCurrentNames((prev) => {
      const next = [...prev]
      for (const name of names) {
        if (!next.includes(name)) next.push(name)
      }
      return next
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 등 조합형 입력(IME)은 마지막 글자를 조합 확정할 때도 Enter
    // keydown이 한 번 더 발생한다 -- 이걸 그대로 커밋해버리면 조합 중이던
    // 글자가 먼저 끊겨 들어가면서 한 번의 Enter가 여러 칩으로 쪼개진다.
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      addNames(inputValue)
      setInputValue('')
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\n') && !text.includes(',')) return
    e.preventDefault()
    addNames(text)
  }

  const canStart = taskNames.length > 0 || memberNames.length > 0

  function handleStart() {
    const addedIds: string[] = []
    for (const name of taskNames) {
      if (state.tasks.some((t) => t.name === name)) continue
      const task: Task = { id: uuidv4(), name, importance: '일반', performanceGrade: 'B', workload: '중', objective: '', achievement: '' }
      dispatch({ type: 'ADD_TASK', payload: task })
      addedIds.push(task.id)
    }
    for (const name of memberNames) {
      if (state.members.some((m) => m.name === name)) continue
      const member: TeamMember = {
        id: uuidv4(),
        name,
        active: true,
        level: '',
        yearsOfService: null,
        role: '',
        comment: '',
        hireDate: null,
        currentLevelSince: null,
      }
      dispatch({ type: 'ADD_MEMBER', payload: member })
      addedIds.push(member.id)
    }
    if (addedIds.length > 0) markRecentlyAdded(addedIds)
    onDone()
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <EntryPanel
          title="과제"
          count={taskNames.length}
          items={taskNames}
          active={target === 'task'}
          onSelect={() => setTarget('task')}
          onRemove={(i) => setTaskNames((prev) => prev.filter((_, idx) => idx !== i))}
        />
        <EntryPanel
          title="팀원"
          count={memberNames.length}
          items={memberNames}
          active={target === 'member'}
          onSelect={() => setTarget('member')}
          onRemove={(i) => setMemberNames((prev) => prev.filter((_, idx) => idx !== i))}
        />
      </div>

      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={target === 'task' ? '과제명을 입력하고 Enter (예: 신규 랜딩페이지 제작)' : '팀원 이름을 입력하고 Enter (예: 김민수)'}
        className="mt-3 w-full rounded-md border border-accent px-3 py-2 text-sm text-black outline-none ring-accent/15 focus:ring-2"
      />

      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={handleStart} disabled={!canStart}>
          시작하기
        </Button>
      </div>
    </div>
  )
}

// 헤더의 번개 아이콘("빠른 시작")으로 어디서든 열 수 있는 시작 방법
// 선택 팝업. 세 방법(직접 입력/Excel로 시작/이전 평가 가져오기)을 탭으로
// 나란히 두고 팝업 안에서 바로 전환한다 -- 예전엔 방법을 고르면 다른
// 화면으로 완전히 넘어가고 되돌아가려면 "뒤로가기"가 필요했는데, 방법을
// 바꿔볼 때마다 화면이 통째로 바뀌는 게 번거롭다는 피드백을 반영해
// 탭 전환으로 바꿨다. 각 탭의 실제 동작은 이미 있는 화면의 로직을
// 그대로 재사용한다 -- Excel은 데이터 관리 드로어와 같은 BulkUploadPanel,
// 이전 평가는 ImportFromPreviousDialog와 같은 ImportFromPreviousPanel.
export default function QuickStartModal({ teamName, currentWorkspaceId, hasOtherPeriods, onClose, onDataReady }: QuickStartModalProps) {
  const [tab, setTab] = useState<Tab>('direct')

  const tabs: { key: Tab; label: string; hint: string }[] = [
    { key: 'direct', label: '직접 입력', hint: '선택한 영역에 이름을 빠르게 등록' },
    { key: 'excel', label: 'Excel로 시작', hint: '통합 양식으로 내려받고 일괄 등록' },
    ...(hasOtherPeriods ? [{ key: 'import' as const, label: '이전 평가 가져오기', hint: '팀과 평가기간을 골라 선택 복사' }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[640px] max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <h3 className="text-lg font-bold text-black">빠른 시작</h3>
            <p className="mt-1 text-sm text-gray-500">과제와 팀원을 빠르게 준비합니다. 닫으면 기존 화면에서 각각 입력할 수 있습니다.</p>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <XIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="mt-4 flex gap-6 border-b border-gray-200 px-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex flex-col items-start gap-1 border-b-2 pb-3 pt-1 text-left transition-colors ${
                tab === t.key ? 'border-accent' : 'border-transparent'
              }`}
            >
              <span className={`text-sm font-semibold ${tab === t.key ? 'text-accent' : 'text-black'}`}>{t.label}</span>
              <span className="text-xs text-gray-400">{t.hint}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'direct' && <DirectEntryPanel onDone={onDataReady} />}
          {tab === 'excel' && <BulkUploadPanel />}
          {tab === 'import' && hasOtherPeriods && (
            <ImportFromPreviousPanel teamName={teamName} currentWorkspaceId={currentWorkspaceId} onApplied={onDataReady} />
          )}
        </div>
      </div>
    </div>
  )
}

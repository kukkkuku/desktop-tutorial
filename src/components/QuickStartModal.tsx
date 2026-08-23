import { useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import type { Task, TeamMember } from '../types'
import ImportFromPreviousDialog from './ImportFromPreviousDialog'
import Button from './Button'
import IconButton from './IconButton'

interface QuickStartModalProps {
  teamName: string
  currentWorkspaceId: string
  hasOtherPeriods: boolean
  onClose: () => void
  // "Excel로 시작" -- 이미 데이터 관리 > 로컬 파일 탭에 있는 "전체 일괄
  // 업로드"(과제·팀원·피어리뷰 자동 구분)를 그대로 쓴다. 여기서 새로
  // 만들지 않고 그 화면을 열어준다.
  onOpenDataManager: () => void
  // "직접 입력"으로 과제/팀원을 빠르게 등록한 뒤 호출한다 -- 과제관리
  // 탭으로 이동시켜 방금 넣은 결과를 바로 보여준다.
  onDirectEntry: () => void
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 5v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

function OptionCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-accent hover:bg-blue-50/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-accent">{icon}</span>
      <span>
        <p className="text-sm font-semibold text-black">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
      </span>
    </button>
  )
}

type EntryTarget = 'task' | 'member'

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

// "직접 입력"을 눌렀을 때 -- 과제관리/팀원관리의 상세 폼(등급/업무량/
// 목표/직급/입사일 등)까지 다 채우게 하지 않고, 과제명·팀원 이름만
// 빠르게 받아서 한 번에 등록한다. 나머지 항목은 필요할 때 각 화면에서
// 채우면 된다. 상세 필드는 각각 기본값(과제: 일반/B/중, 팀원: 직급·
// 입사일 등 비워둠)으로 넣는다.
function DirectEntryStep({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { state, dispatch } = useAppState()
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
    if (e.key === 'Enter') {
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
    for (const name of taskNames) {
      if (state.tasks.some((t) => t.name === name)) continue
      const task: Task = { id: uuidv4(), name, importance: '일반', performanceGrade: 'B', workload: '중', objective: '', achievement: '' }
      dispatch({ type: 'ADD_TASK', payload: task })
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
    }
    onDone()
  }

  return (
    <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-black">직접 입력</h3>
          <p className="mt-1 text-sm text-gray-500">영역을 고르고 아래에 이름을 입력해 Enter를 치세요. 나머지 항목은 나중에 채우면 됩니다.</p>
        </div>
        <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
          <XIcon className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
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

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" onClick={handleStart} disabled={!canStart}>
          시작하기
        </Button>
      </div>
    </div>
  )
}

// 헤더의 번개 아이콘("빠른 시작")으로 어디서든 열 수 있는 시작 방법
// 선택 모달. 과제관리 빈 화면에 있는 온보딩과 목적은 같지만(시작 방법
// 고르기), 특정 탭이 빈 상태일 때만 보이는 게 아니라 언제든 누를 수
// 있는 진입점이다. 세 선택지 모두 새로 구현하지 않고 이미 있는 화면을
// 그대로 연결한다 -- Excel은 데이터 관리 드로어, 직접 입력은 과제관리
// 탭 이동, 이전 평가는 기존 ImportFromPreviousDialog.
export default function QuickStartModal({
  teamName,
  currentWorkspaceId,
  hasOtherPeriods,
  onClose,
  onOpenDataManager,
  onDirectEntry,
}: QuickStartModalProps) {
  const [step, setStep] = useState<'menu' | 'import' | 'direct'>('menu')

  if (step === 'import') {
    return <ImportFromPreviousDialog teamName={teamName} currentWorkspaceId={currentWorkspaceId} onClose={onClose} />
  }

  if (step === 'direct') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <DirectEntryStep onClose={onClose} onDone={onDirectEntry} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">빠른 시작</h3>
            <p className="mt-1 text-sm text-gray-500">과제·팀원을 등록하는 방법을 선택하세요.</p>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <XIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <OptionCard
            icon={<ExcelIcon className="h-5 w-5" />}
            title="Excel로 한 번에 시작"
            hint="과제·팀원 양식을 받아서 채운 뒤 업로드하면 한 번에 등록됩니다"
            onClick={onOpenDataManager}
          />
          <OptionCard
            icon={<PencilIcon className="h-5 w-5" />}
            title="직접 입력"
            hint="과제명·팀원 이름만 빠르게 입력해서 바로 시작하세요"
            onClick={() => setStep('direct')}
          />
          {hasOtherPeriods && (
            <OptionCard
              icon={<HistoryIcon className="h-5 w-5" />}
              title="이전 평가에서 가져오기"
              hint="과제·팀원을 이전 기간에서 이어받으세요"
              onClick={() => setStep('import')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

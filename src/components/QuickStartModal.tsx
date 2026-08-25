import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
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

// 좌우 큰 영역(과제 / 팀원)이 각자 자기 입력창을 갖는다 -- 예전엔 영역을
// 먼저 눌러 "어디에 추가할지" 고른 뒤 하단의 공용 입력창에 쳐야 해서,
// 이미 과제가 선택된 채로 팝업이 열려도 커서가 거기 가 있지 않았다.
// 이제 두 영역 다 처음부터 입력 가능한 상태라 그럴 필요가 없고, 영역도
// 세로로 넉넉히 커져서(칩 목록이 스크롤되는 만큼) 입력창은 항상 그
// 영역 하단에 붙어 있다. 박스 아무 곳이나 눌러도 그 영역의 입력창에
// 포커스가 간다.
function EntryPanel({
  title,
  items,
  onRemove,
  inputValue,
  onInputChange,
  onKeyDown,
  onPaste,
  placeholder,
  autoFocus,
}: {
  title: string
  items: string[]
  onRemove: (index: number) => void
  inputValue: string
  onInputChange: (v: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void
  placeholder: string
  autoFocus?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex h-full flex-col gap-2 rounded-lg border-2 border-gray-200 bg-white p-3 transition-colors focus-within:border-accent focus-within:bg-blue-50/20"
    >
      <p className="shrink-0 text-sm font-semibold text-black">
        {title} {items.length > 0 && <span className="font-normal text-gray-400">{items.length}개</span>}
      </p>
      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto">
        {items.map((name, i) => (
          <Chip key={`${name}-${i}`} label={name} onRemove={() => onRemove(i)} />
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full shrink-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-black outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
    </div>
  )
}

// "직접 입력" 탭 -- 과제관리/팀원관리의 상세 폼(등급/업무량/목표/직급/
// 입사일 등)까지 다 채우게 하지 않고, 과제명·팀원 이름만 빠르게 받아서
// 한 번에 등록한다. 나머지 항목은 필요할 때 각 화면에서 채우면 된다.
// 상세 필드는 각각 기본값(과제: 일반/B/중, 팀원: 직급·입사일 등
// 비워둠)으로 넣는다.
function DirectEntryPanel({ onDone }: { onDone: () => void }) {
  const { state, dispatch, markRecentlyAdded } = useAppState()
  const [taskNames, setTaskNames] = useState<string[]>([])
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [taskInput, setTaskInput] = useState('')
  const [memberInput, setMemberInput] = useState('')

  function addNames(raw: string, setNames: React.Dispatch<React.SetStateAction<string[]>>) {
    const names = raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) return
    setNames((prev) => {
      const next = [...prev]
      for (const name of names) {
        if (!next.includes(name)) next.push(name)
      }
      return next
    })
  }

  // 각 영역이 자기 입력값/추가 대상 배열을 따로 가지므로, 키 핸들러도
  // 영역별로 만들어서 그 값들을 클로저로 붙잡는다.
  function makeKeyDownHandler(
    value: string,
    setValue: (v: string) => void,
    setNames: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    return (e: KeyboardEvent<HTMLInputElement>) => {
      // 한글 등 조합형 입력(IME)은 마지막 글자를 조합 확정할 때도 Enter
      // keydown이 한 번 더 발생한다 -- 이걸 그대로 커밋해버리면 조합 중이던
      // 글자가 먼저 끊겨 들어가면서 한 번의 Enter가 여러 칩으로 쪼개진다.
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault()
        addNames(value, setNames)
        setValue('')
      }
    }
  }

  function makePasteHandler(setNames: React.Dispatch<React.SetStateAction<string[]>>) {
    return (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text')
      if (!text.includes('\n') && !text.includes(',')) return
      e.preventDefault()
      addNames(text, setNames)
    }
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
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="grid flex-1 grid-cols-2 gap-3">
        <EntryPanel
          title="과제"
          items={taskNames}
          onRemove={(i) => setTaskNames((prev) => prev.filter((_, idx) => idx !== i))}
          inputValue={taskInput}
          onInputChange={setTaskInput}
          onKeyDown={makeKeyDownHandler(taskInput, setTaskInput, setTaskNames)}
          onPaste={makePasteHandler(setTaskNames)}
          placeholder="과제명을 입력하고 Enter (예: 신규 랜딩페이지 제작)"
          autoFocus
        />
        <EntryPanel
          title="팀원"
          items={memberNames}
          onRemove={(i) => setMemberNames((prev) => prev.filter((_, idx) => idx !== i))}
          inputValue={memberInput}
          onInputChange={setMemberInput}
          onKeyDown={makeKeyDownHandler(memberInput, setMemberInput, setMemberNames)}
          onPaste={makePasteHandler(setMemberNames)}
          placeholder="팀원 이름을 입력하고 Enter (예: 김민수)"
        />
      </div>

      <div className="mt-5 flex shrink-0 justify-end">
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

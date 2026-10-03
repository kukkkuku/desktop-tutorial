// 과제관리 표의 평가 칸들(평가하기 · 과제별을 과제관리로 합친 것):
//   성과등급(평가 대상 줄만) · 목표/성과(한 칸 두 줄, 누르면 그 자리에 입력창) · 시작일/완료일(한 칸 두 줄)
// 표(DataGrid)의 칸 편집과 따로 움직이도록 칸 안 버튼을 누르면 표 선택으로 번지지 않게 막는다.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import type { PerformanceGrade } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { GRADE_COLORS } from '../../utils/calculations'
import { CHIP_BASE, CHIP_IDLE } from '../grid/DataGrid'
import { icSm } from '../ui/icon'

// 칸 바로 아래(모자라면 위)에 띄우는 작은 창. 바깥을 누르거나 스크롤하면 닫힌다.
function Pop({ anchor, onClose, children, width }: { anchor: DOMRect; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 })
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    const w = ref.current?.offsetWidth ?? 0
    const top = anchor.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, anchor.top - 4 - h) : anchor.bottom + 4
    setPos({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8)), top })
  }, [anchor])
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  return createPortal(
    <div ref={ref} onMouseDown={(e) => e.stopPropagation()} className="mac-pop fixed z-[60] p-2.5" style={{ left: pos.left, top: pos.top, width }}>
      {children}
    </div>,
    document.body,
  )
}

// 성과등급: 칩 하나 + 누르면 S · A · B · C · D (다시 누르면 지움)
export function GradeCell({ value, onPick, muted }: { value: PerformanceGrade | null; onPick: (v: PerformanceGrade | null) => void; muted?: boolean }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setAnchor(anchor ? null : btnRef.current!.getBoundingClientRect())
        }}
        title={muted ? '기준 설정에서 성과등급을 쓰지 않도록 되어 있습니다(값은 보존)' : '성과등급 고르기'}
        className="flex w-full items-center justify-between gap-1 rounded-control py-0.5"
      >
        {value ? (
          <span className={`${CHIP_BASE} ${muted ? 'bg-slate-100 text-slate-500' : GRADE_COLORS[value]}`}>{value}</span>
        ) : (
          <span className="text-[length:calc(14px*var(--ui-fs,1))] text-label-3">미입력</span>
        )}
        <ChevronDown {...icSm} className="shrink-0 text-label-3" />
      </button>
      {anchor && (
        <Pop anchor={anchor} onClose={() => setAnchor(null)}>
          <div className="flex gap-1.5">
            {PERFORMANCE_GRADE_OPTIONS.map((o) => (
              <button
                key={o}
                onClick={() => {
                  onPick(o === value ? null : o)
                  setAnchor(null)
                }}
                title={o === value ? '다시 누르면 지웁니다' : undefined}
                className={`${CHIP_BASE} cursor-pointer transition-colors ${o === value ? GRADE_COLORS[o] : CHIP_IDLE}`}
              >
                {o}
              </button>
            ))}
          </div>
        </Pop>
      )}
    </>
  )
}

// 목표 / 성과: 한 칸 두 줄(긴 글은 말줄임). 누르면 칸 자리에 두 입력창.
export function GoalCell({
  objective,
  achievement,
  onSave,
}: {
  objective: string
  achievement: string
  onSave: (objective: string, achievement: string) => void
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const empty = !objective.trim() && !achievement.trim()
  return (
    <>
      <div
        ref={boxRef}
        role="button"
        tabIndex={-1}
        onMouseDown={(e) => {
          // 기본 동작(누른 칸에 포커스)을 막아야 열린 입력창이 포커스를 가진다
          e.stopPropagation()
          e.preventDefault()
          const td = boxRef.current!.closest('td') ?? boxRef.current!
          setAnchor(td.getBoundingClientRect())
        }}
        title={empty ? '목표 · 성과 입력하기' : `목표: ${objective}\n성과: ${achievement}`}
        className="cursor-text py-1 text-[length:calc(14px*var(--ui-fs,1))] leading-snug"
      >
        {empty ? (
          <span className="text-orange-600">목표 · 성과 입력하기</span>
        ) : (
          <>
            <Line k="목표" v={objective} />
            <Line k="성과" v={achievement} />
          </>
        )}
      </div>
      {anchor && <GoalEditor anchor={anchor} objective={objective} achievement={achievement} onSave={onSave} onClose={() => setAnchor(null)} />}
    </>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <span className="shrink-0 text-[length:calc(12px*var(--ui-fs,1))] leading-[18px] text-label-3">{k}</span>
      <span className={`min-w-0 truncate ${v.trim() ? 'text-label' : 'text-label-3'}`}>{v.trim() ? v.replace(/\s*\n\s*/g, ' · ') : '-'}</span>
    </div>
  )
}

function GoalEditor({
  anchor,
  objective,
  achievement,
  onSave,
  onClose,
}: {
  anchor: DOMRect
  objective: string
  achievement: string
  onSave: (objective: string, achievement: string) => void
  onClose: () => void
}) {
  const [o, setO] = useState(objective)
  const [a, setA] = useState(achievement)
  const latest = useRef({ o, a })
  latest.current = { o, a }
  // 닫을 때(바깥 누름 · Esc · 닫기) 바뀐 것만 저장한다
  const close = useRef(() => {})
  close.current = () => {
    if (latest.current.o !== objective || latest.current.a !== achievement) onSave(latest.current.o, latest.current.a)
    onClose()
  }
  const box = 'mt-1 block w-full resize-y rounded-control border border-hairline px-2 py-1.5 text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed outline-none focus:border-accent'
  return (
    <Pop anchor={anchor} onClose={() => close.current()} width={Math.max(340, anchor.width)}>
      <label className="block text-[length:calc(12px*var(--ui-fs,1))] font-semibold text-label-2">
        목표
        <textarea autoFocus rows={3} value={o} onChange={(e) => setO(e.target.value)} className={box} />
      </label>
      <label className="mt-2 block text-[length:calc(12px*var(--ui-fs,1))] font-semibold text-label-2">
        성과
        <textarea rows={3} value={a} onChange={(e) => setA(e.target.value)} className={box} />
      </label>
      <div className="mt-1.5 flex items-center justify-between text-[length:calc(12px*var(--ui-fs,1))] text-label-3">
        <span>Enter 줄바꿈 · Esc · 바깥 누르면 저장하고 닫기</span>
        <button onClick={() => close.current()} className="rounded-control px-2 py-0.5 font-medium text-accent hover:bg-accent-soft">
          완료
        </button>
      </div>
    </Pop>
  )
}

// 시작일 / 완료일: 한 칸 두 줄. 누르면 날짜 두 칸(묶음 머리는 하위 과제에서 계산해 보기만).
export function PeriodCell({ start, done, onSave }: { start: string; done: string; onSave?: (start: string, done: string) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <div
        ref={boxRef}
        onMouseDown={
          onSave
            ? (e) => {
                e.stopPropagation()
                e.preventDefault()
                const td = boxRef.current!.closest('td') ?? boxRef.current!
                setAnchor(td.getBoundingClientRect())
              }
            : undefined
        }
        title={onSave ? '시작일 · 완료일 바꾸기' : '하위 과제의 가장 이른 시작일 · 가장 늦은 완료일'}
        className={`py-1 text-[length:calc(14px*var(--ui-fs,1))] tabular-nums leading-snug ${onSave ? 'cursor-text' : ''}`}
      >
        <div className={start ? 'text-label' : 'text-label-3'}>{start || '-'}</div>
        <div className={done ? 'text-label-2' : 'text-label-3'}>{done || '-'}</div>
      </div>
      {anchor && onSave && <PeriodEditor anchor={anchor} start={start} done={done} onSave={onSave} onClose={() => setAnchor(null)} />}
    </>
  )
}

function PeriodEditor({
  anchor,
  start,
  done,
  onSave,
  onClose,
}: {
  anchor: DOMRect
  start: string
  done: string
  onSave: (start: string, done: string) => void
  onClose: () => void
}) {
  const [s, setS] = useState(start)
  const [d, setD] = useState(done)
  const latest = useRef({ s, d })
  latest.current = { s, d }
  const close = useRef(() => {})
  close.current = () => {
    if (latest.current.s !== start || latest.current.d !== done) onSave(latest.current.s, latest.current.d)
    onClose()
  }
  const field = 'mt-1 block h-8 w-full rounded-control border border-hairline px-2 text-[length:calc(14px*var(--ui-fs,1))] outline-none focus:border-accent'
  return (
    <Pop anchor={anchor} onClose={() => close.current()} width={200}>
      <label className="block text-[length:calc(12px*var(--ui-fs,1))] font-semibold text-label-2">
        시작일
        <input type="date" autoFocus value={s} onChange={(e) => setS(e.target.value)} className={field} />
      </label>
      <label className="mt-2 block text-[length:calc(12px*var(--ui-fs,1))] font-semibold text-label-2">
        완료일
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={field} />
      </label>
      <div className="mt-2 text-right">
        <button onClick={() => close.current()} className="rounded-control px-2 py-0.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-accent hover:bg-accent-soft">
          완료
        </button>
      </div>
    </Pop>
  )
}

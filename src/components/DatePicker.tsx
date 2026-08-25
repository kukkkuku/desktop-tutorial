import { useEffect, useMemo, useRef, useState } from 'react'
import IconButton from './IconButton'

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

const YEAR_GRID_SIZE = 10
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseValue(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function formatValue(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

type Mode = 'days' | 'months' | 'years'

// 네이티브 <input type="date">는 브라우저마다 달력 팝업 생김새가 달라 앱의
// 다른 화면(연도 선택기, 승진심사 시기 등)과 스타일이 따로 놀았다. 같은
// 버튼+팝오버 언어(테두리 박스 버튼 → 팝오버, 선택된 값은 accent 배경,
// 오늘/이번 값은 accent 텍스트)로 통일하고, 연도 그리드(YearPicker)와
// 12개월 그리드(옛 PromotionDatePicker)의 드릴다운 방식을 그대로 가져와
// 날짜만 한 단계 더 붙였다 -- 날짜 → (라벨 클릭) → 월 → (라벨 클릭) → 연대.
// 입사일처럼 훨씬 과거로 가야 할 때도 한 달씩 넘기지 않고 바로 연도/월로
// 점프할 수 있어 더 편하다.
export default function DatePicker({
  value,
  onChange,
  placeholder = '선택',
  className,
  ariaLabel,
  clearable = true,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
  clearable?: boolean
}) {
  const parsed = parseValue(value)
  const today = new Date()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('days')
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth() + 1)
  const [yearRangeStart, setYearRangeStart] = useState(
    () => Math.floor((parsed?.year ?? today.getFullYear()) / YEAR_GRID_SIZE) * YEAR_GRID_SIZE,
  )
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const p = parseValue(value)
    setMode('days')
    setViewYear(p?.year ?? today.getFullYear())
    setViewMonth(p?.month ?? today.getMonth() + 1)
    setYearRangeStart(Math.floor((p?.year ?? today.getFullYear()) / YEAR_GRID_SIZE) * YEAR_GRID_SIZE)
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const dayCells = useMemo(() => {
    const startWeekday = new Date(viewYear, viewMonth - 1, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
    const cells: (number | null)[] = Array.from({ length: startWeekday }, () => null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [viewYear, viewMonth])

  function stepMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setViewYear(y)
    setViewMonth(m)
  }

  function pickDay(d: number) {
    onChange(formatValue(viewYear, viewMonth, d))
    setOpen(false)
  }

  const displayLabel = parsed ? `${parsed.year}.${pad2(parsed.month)}.${pad2(parsed.day)}` : placeholder

  return (
    <div className={`relative inline-block shrink-0 ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        className={`flex w-full items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium hover:bg-gray-50 ${
          parsed ? 'text-black' : 'text-gray-400'
        }`}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="truncate">{displayLabel}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-gray-200 bg-white p-2 shadow-md">
          {mode === 'days' && (
            <>
              <div className="flex items-center justify-between px-1 pb-1.5">
                <IconButton onClick={() => stepMonth(-1)} aria-label="이전 달" title="이전 달">
                  <ChevronIcon direction="left" className="h-4 w-4" />
                </IconButton>
                <button
                  type="button"
                  onClick={() => setMode('months')}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-black"
                >
                  {viewYear}년 {viewMonth}월
                </button>
                <IconButton onClick={() => stepMonth(1)} aria-label="다음 달" title="다음 달">
                  <ChevronIcon direction="right" className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="grid grid-cols-7 gap-0.5 px-1 pb-1 text-center text-[11px] font-medium text-gray-400">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {dayCells.map((d, i) => {
                  if (d === null) return <span key={`b${i}`} />
                  const isSelected = parsed?.year === viewYear && parsed?.month === viewMonth && parsed?.day === d
                  const isToday = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth && today.getDate() === d
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => pickDay(d)}
                      className={`rounded-md py-1.5 text-sm ${
                        isSelected ? 'bg-accent font-bold text-white' : isToday ? 'font-semibold text-accent hover:bg-blue-50' : 'text-black hover:bg-gray-50'
                      }`}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const t = new Date()
                    onChange(formatValue(t.getFullYear(), t.getMonth() + 1, t.getDate()))
                    setOpen(false)
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-blue-50"
                >
                  오늘
                </button>
                {clearable && value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('')
                      setOpen(false)
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-gray-400 hover:bg-gray-50 hover:text-black"
                  >
                    지우기
                  </button>
                )}
              </div>
            </>
          )}

          {mode === 'months' && (
            <>
              <div className="flex items-center justify-between px-1 pb-1.5">
                <IconButton onClick={() => setViewYear((y) => y - 1)} aria-label="이전 연도" title="이전 연도">
                  <ChevronIcon direction="left" className="h-4 w-4" />
                </IconButton>
                <button
                  type="button"
                  onClick={() => setMode('years')}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-black"
                >
                  {viewYear}년
                </button>
                <IconButton onClick={() => setViewYear((y) => y + 1)} aria-label="다음 연도" title="다음 연도">
                  <ChevronIcon direction="right" className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setViewMonth(m)
                      setMode('days')
                    }}
                    className={`rounded-md py-1.5 text-sm ${viewMonth === m ? 'bg-accent font-bold text-white' : 'text-black hover:bg-gray-50'}`}
                  >
                    {m}월
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === 'years' && (
            <>
              <div className="flex items-center justify-between px-1 pb-1.5">
                <IconButton onClick={() => setYearRangeStart((s) => s - YEAR_GRID_SIZE)} aria-label="이전 연대" title="이전 연대">
                  <ChevronIcon direction="left" className="h-4 w-4" />
                </IconButton>
                <span className="text-xs font-semibold text-gray-400">
                  {yearRangeStart} – {yearRangeStart + YEAR_GRID_SIZE - 1}
                </span>
                <IconButton onClick={() => setYearRangeStart((s) => s + YEAR_GRID_SIZE)} aria-label="다음 연대" title="다음 연대">
                  <ChevronIcon direction="right" className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: YEAR_GRID_SIZE }, (_, i) => yearRangeStart + i).map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setViewYear(y)
                      setMode('months')
                    }}
                    className={`rounded-md py-1.5 text-sm ${viewYear === y ? 'bg-accent font-bold text-white' : 'text-black hover:bg-gray-50'}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

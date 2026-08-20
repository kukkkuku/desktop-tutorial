import { useEffect, useRef, useState } from 'react'
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

const YEAR_GRID_SIZE = 8

// 연도를 <select>나 스피너형 number input이 아니라 작은 캘린더형 팝오버
// (연도 그리드)에서 고른다 -- 버튼에 선택된 연도 + 달력 아이콘을 두고,
// 누르면 8개씩 연도 그리드가 뜨고 ‹ › 로 앞뒤 연대를 넘길 수 있다. 실제로
// 데이터가 있는 연도는 점으로 표시. 평가 기간 선택(EvaluationPeriodPicker)에서
// 쓰던 걸 다른 화면(승진심사 시기 등)에서도 재사용할 수 있게 분리했다.
export default function YearPicker({
  year,
  onChange,
  yearsWithData = new Set(),
  className,
}: {
  year: number
  onChange: (y: number) => void
  yearsWithData?: Set<number>
  className?: string
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
    <div className={`relative inline-block shrink-0 ${className ?? ''}`} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-black hover:bg-gray-50"
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
                  y === year ? 'bg-accent font-bold text-white' : y === thisYear ? 'font-semibold text-accent hover:bg-blue-50' : 'text-black hover:bg-gray-50'
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

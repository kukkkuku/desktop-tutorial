import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import IconButton from './IconButton'
import { icSm } from './ui/icon'

const YEAR_GRID_SIZE = 10

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
  // 2020-2029처럼 실제 "연대" 경계(10의 배수)에 맞춰 시작 연도를 정한다.
  const [rangeStart, setRangeStart] = useState(() => Math.floor(year / YEAR_GRID_SIZE) * YEAR_GRID_SIZE)
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-1.5 rounded-control bg-white px-2.5 text-[13px] text-label shadow-control hover:bg-[#FAFAFA] ${
          open ? 'shadow-focus' : ''
        }`}
      >
        <Calendar {...icSm} className="shrink-0 text-label-2" />
        <span className="tabular-nums">{year}</span>
      </button>
      {open && (
        <div className="mac-pop absolute left-0 top-full z-30 mt-1.5 w-64 p-2">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <IconButton onClick={() => setRangeStart((s) => s - YEAR_GRID_SIZE)} aria-label="이전 연대" title="이전 연대">
              <ChevronLeft {...icSm} />
            </IconButton>
            <span className="text-[13px] font-semibold text-label-2 tabular-nums">
              {rangeStart} – {rangeStart + YEAR_GRID_SIZE - 1}
            </span>
            <IconButton onClick={() => setRangeStart((s) => s + YEAR_GRID_SIZE)} aria-label="다음 연대" title="다음 연대">
              <ChevronRight {...icSm} />
            </IconButton>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => {
                  onChange(y)
                  setOpen(false)
                }}
                type="button"
                className={`relative rounded-control py-1.5 text-[13px] tabular-nums ${
                  y === year ? 'bg-accent font-semibold text-white' : y === thisYear ? 'font-semibold text-accent hover:bg-accent-soft' : 'text-label hover:bg-black/[0.05]'
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

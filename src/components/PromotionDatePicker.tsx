import { useEffect, useRef, useState } from 'react'

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
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

// 승진심사 시기 -- 연도 입력칸 + 월 드롭다운 두 칸으로 나뉘어 있던 걸
// "2026년 4월" 하나의 인풋박스로 합쳤다(Figma select-month 참고). 박스를
// 누르면 연도 스테퍼 + 12개월 그리드 팝오버가 뜨고, 월을 고르면 바로
// 반영되고 닫힌다.
export default function PromotionDatePicker({
  year,
  month,
  onChange,
}: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(year)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setViewYear(year)
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div className="relative inline-flex shrink-0 items-center gap-1.5" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-semibold text-black hover:bg-gray-50"
      >
        {year}년 {month}월
        <ChevronDownIcon className="h-3 w-3 text-gray-400" />
      </button>
      <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-md border border-gray-200 bg-white p-3 shadow-md">
          <div className="flex items-center justify-between pb-2">
            <button onClick={() => setViewYear((y) => y - 1)} className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100" aria-label="이전 연도">
              ‹
            </button>
            <span className="text-sm font-semibold text-black">{viewYear}년</span>
            <button onClick={() => setViewYear((y) => y + 1)} className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100" aria-label="다음 연도">
              ›
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                onClick={() => {
                  onChange(viewYear, m)
                  setOpen(false)
                }}
                className={`rounded-md py-1.5 text-sm ${
                  viewYear === year && m === month ? 'bg-accent font-bold text-white' : 'text-black hover:bg-gray-50'
                }`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

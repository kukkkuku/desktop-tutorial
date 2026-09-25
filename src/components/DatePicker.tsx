// 날짜 입력(입사일·면담일 등). 버튼을 누르면 앱 공통 달력(grid/DatePopup)이 뜬다 --
// 표의 날짜 칸과 같은 달력이다(docs/DESIGN-SYSTEM.md). 값은 'YYYY-MM-DD'.
import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import DatePopup from './grid/DatePopup'
import { icSm } from './ui/icon'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = m ? `${m[1]}.${pad2(Number(m[2]))}.${pad2(Number(m[3]))}` : placeholder

  return (
    <div className={`relative inline-block shrink-0 ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        className={`flex h-8 w-full items-center gap-1.5 rounded-control bg-white px-2.5 text-[13px] shadow-control hover:bg-[#FAFAFA] ${
          m ? 'text-label' : 'text-label-3'
        } ${open ? 'shadow-focus' : ''}`}
      >
        <Calendar {...icSm} className="shrink-0 text-label-2" />
        <span className="truncate tabular-nums">{label}</span>
      </button>
      {open && (
        <div className="mac-pop absolute left-0 top-full z-30 mt-1.5">
          <DatePopup
            value={value}
            onPick={(iso) => {
              onChange(iso)
              setOpen(false)
            }}
            onClear={
              clearable
                ? () => {
                    onChange('')
                    setOpen(false)
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import MoodIcon, { MOOD_OPTIONS } from './MoodIcon'

interface MoodPickerProps {
  value: string | null
  onChange: (value: string | null) => void
  // 부모(MeetingForm)가 실측한 폼 너비를 기준으로 판단한 압축 모드 여부.
  // 넓으면 6단계를 한 줄로 펼치고, 좁으면 선택된(또는 기본) 아이콘 하나만
  // 보여주고 눌러서 팝오버로 고르게 한다.
  compact: boolean
}

export default function MoodPicker({ value, onChange, compact }: MoodPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  useEffect(() => {
    if (!compact) setOpen(false)
  }, [compact])

  function pick(v: string) {
    onChange(value === v ? null : v)
    setOpen(false)
  }

  const selected = MOOD_OPTIONS.find((o) => o.value === value) ?? null

  if (!compact) {
    return (
      <div className="flex items-start justify-between gap-1">
        {MOOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => pick(opt.value)}
            title={opt.label}
            aria-label={opt.label}
            className={`flex flex-col items-center gap-1 rounded-2xl px-1.5 py-1.5 transition-colors ${
              value === opt.value ? 'bg-accent/5 ring-2 ring-accent' : 'hover:bg-gray-50'
            }`}
          >
            <MoodIcon mood={opt.value} className="h-8 w-8" />
            <span className={`whitespace-nowrap text-[10px] ${value === opt.value ? 'font-bold text-black' : 'text-gray-400'}`}>{opt.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={selected ? selected.label : '기분 선택'}
        aria-label={selected ? selected.label : '기분 선택'}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          selected ? 'bg-accent/5 ring-2 ring-accent' : 'bg-gray-100 hover:bg-gray-200'
        }`}
      >
        <MoodIcon mood={selected?.value ?? 'question'} className="h-8 w-8" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 flex gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          {MOOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => pick(opt.value)}
              title={opt.label}
              aria-label={opt.label}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                value === opt.value ? 'bg-accent/10 ring-1 ring-accent' : 'hover:bg-gray-100'
              }`}
            >
              <MoodIcon mood={opt.value} className="h-7 w-7" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

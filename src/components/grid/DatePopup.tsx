// 앱의 유일한 달력(표 날짜 칸·DatePicker 모두 이것). 날짜를 누르면 바로 넣고,
// 가운데 제목을 누르면 날짜 → 월 → 연도 순으로 올라간다. 값은 'YYYY-MM-DD'.

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { icSm } from '../ui/icon'

const WEEK = ['월', '화', '수', '목', '금', '토', '일']

function pad(n: number) {
  return String(n).padStart(2, '0')
}
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function parseIso(v: string): Date | null {
  const m = v.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

interface Props {
  value: string
  onPick: (iso: string) => void
  onClear?: () => void
  // 표 칸처럼 타이핑도 되는 곳에서만 안내 문구를 보인다
  typingHint?: boolean
}

function Arrow({ dir, onClick, label }: { dir: 'l' | 'r'; onClick: () => void; label: string }) {
  const I = dir === 'l' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label"
    >
      <I {...icSm} />
    </button>
  )
}

export default function DatePopup({ value, onPick, onClear, typingHint = false }: Props) {
  const selected = parseIso(value)
  const today = new Date()
  const [view, setView] = useState(() => {
    const base = selected ?? today
    return { y: base.getFullYear(), m: base.getMonth() }
  })
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days')
  // 입력칸에 날짜를 쳐 넣으면 달력도 그 달로 따라간다.
  const selKey = selected ? toIso(selected) : ''
  useEffect(() => {
    if (selected) setView({ y: selected.getFullYear(), m: selected.getMonth() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey])

  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7 // 월요일 시작
  const cells = Array.from({ length: 42 }, (_, i) => new Date(view.y, view.m, 1 - lead + i))
  const same = (a: Date | null, b: Date) => !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const move = (dm: number) => setView((v) => ({ y: v.y + Math.floor((v.m + dm) / 12), m: (((v.m + dm) % 12) + 12) % 12 }))
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const yearStart = view.y - (((view.y % 12) + 12) % 12)

  return (
    <div className="w-[280px] p-3 text-sm">
      <div className="mb-2 flex gap-1">
        {[
          ['오늘', today],
          ['내일', tomorrow],
        ].map(([label, d]) => (
          <button
            key={label as string}
            type="button"
            onClick={() => onPick(toIso(d as Date))}
            className="rounded-control px-2.5 py-1 text-[13px] font-medium text-label hover:bg-black/[0.05]"
          >
            {label as string}
          </button>
        ))}
        {onClear && (
          <button type="button" onClick={onClear} className="ml-auto rounded-control px-2.5 py-1 text-[13px] text-label-2 hover:bg-black/[0.05]">
            지우기
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Arrow
          dir="l"
          label="이전"
          onClick={() => (mode === 'days' ? move(-1) : setView((v) => ({ ...v, y: v.y - (mode === 'years' ? 12 : 1) })))}
        />
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'days' ? 'months' : m === 'months' ? 'years' : 'days'))}
          className="flex items-center gap-1 rounded-control px-2 py-1 text-[13px] font-semibold text-label hover:bg-black/[0.05]"
        >
          {mode === 'days' ? `${view.y}년 ${view.m + 1}월` : mode === 'months' ? `${view.y}년` : `${yearStart}–${yearStart + 11}`}
          <ChevronDown size={12} strokeWidth={2} className="text-label-2" />
        </button>
        <Arrow
          dir="r"
          label="다음"
          onClick={() => (mode === 'days' ? move(1) : setView((v) => ({ ...v, y: v.y + (mode === 'years' ? 12 : 1) })))}
        />
      </div>

      {mode === 'days' ? (
        <>
          <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium text-label-3">
            {WEEK.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {cells.map((d) => {
              const inMonth = d.getMonth() === view.m
              const isSel = same(selected, d)
              const isToday = same(today, d)
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => onPick(toIso(d))}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] tabular-nums ${
                    isSel
                      ? 'bg-accent font-semibold text-white'
                      : isToday
                        ? 'font-semibold text-accent hover:bg-accent-soft'
                        : inMonth
                          ? 'text-label hover:bg-black/[0.05]'
                          : 'text-label-3/70 hover:bg-black/[0.03]'
                  }`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </>
      ) : mode === 'months' ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, m) => {
            const isSel = selected && selected.getFullYear() === view.y && selected.getMonth() === m
            const isNow = today.getFullYear() === view.y && today.getMonth() === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setView((v) => ({ ...v, m }))
                  setMode('days')
                }}
                className={`rounded-control py-2 text-[13px] ${isSel ? 'bg-accent font-semibold text-white' : isNow ? 'font-semibold text-accent hover:bg-accent-soft' : 'text-label hover:bg-black/[0.05]'}`}
              >
                {m + 1}월
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => yearStart + i).map((y) => {
            const isSel = selected && selected.getFullYear() === y
            const isNow = today.getFullYear() === y
            return (
              <button
                key={y}
                type="button"
                onClick={() => {
                  setView((v) => ({ ...v, y }))
                  setMode('months')
                }}
                className={`rounded-control py-2 text-[13px] tabular-nums ${isSel ? 'bg-accent font-semibold text-white' : isNow ? 'font-semibold text-accent hover:bg-accent-soft' : 'text-label hover:bg-black/[0.05]'}`}
              >
                {y}
              </button>
            )
          })}
        </div>
      )}
      {typingHint &&       <p className="mt-2 text-center text-[11px] text-label-3">직접 입력도 됩니다 (예: 2026-05-14) · Esc 취소</p>}
    </div>
  )
}

// 날짜 칸 달력 팝업. 날짜를 누르면 바로 넣고, 가운데 "YYYY년 M월"을 누르면 월 고르기로 바뀐다.
// 값은 'YYYY-MM-DD' 문자열(시트·엑셀과 같은 형식).

import { useEffect, useState } from 'react'

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
  onClear: () => void
}

function Arrow({ dir, onClick, label }: { dir: 'l' | 'r'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 'l' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} />
      </svg>
    </button>
  )
}

export default function DatePopup({ value, onPick, onClear }: Props) {
  const selected = parseIso(value)
  const today = new Date()
  const [view, setView] = useState(() => {
    const base = selected ?? today
    return { y: base.getFullYear(), m: base.getMonth() }
  })
  const [mode, setMode] = useState<'days' | 'months'>('days')
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

  return (
    <div className="w-[280px] p-3 text-sm">
      <div className="mb-2 flex gap-1.5">
        {[
          ['오늘', today],
          ['내일', tomorrow],
        ].map(([label, d]) => (
          <button
            key={label as string}
            type="button"
            onClick={() => onPick(toIso(d as Date))}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            {label as string}
          </button>
        ))}
        <button type="button" onClick={onClear} className="ml-auto rounded-md px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100">
          지우기
        </button>
      </div>

      <div className="flex items-center justify-between">
        <Arrow dir="l" label={mode === 'days' ? '이전 달' : '이전 해'} onClick={() => (mode === 'days' ? move(-1) : setView((v) => ({ ...v, y: v.y - 1 })))} />
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'days' ? 'months' : 'days'))}
          className="flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-black hover:bg-gray-100"
        >
          {mode === 'days' ? `${view.y}년 ${view.m + 1}월` : `${view.y}년`}
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={mode === 'months' ? 'rotate-180' : ''}>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        <Arrow dir="r" label={mode === 'days' ? '다음 달' : '다음 해'} onClick={() => (mode === 'days' ? move(1) : setView((v) => ({ ...v, y: v.y + 1 })))} />
      </div>

      {mode === 'days' ? (
        <>
          <div className="mt-2 grid grid-cols-7 text-center text-[11px] text-gray-400">
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
                        ? 'font-bold text-accent hover:bg-blue-50'
                        : inMonth
                          ? 'text-gray-800 hover:bg-gray-100'
                          : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
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
                className={`rounded-md py-2 text-[13px] ${isSel ? 'bg-accent font-semibold text-white' : isNow ? 'font-bold text-accent hover:bg-blue-50' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {m + 1}월
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-gray-400">직접 입력도 됩니다 (예: 2026-05-14) · Esc 취소</p>
    </div>
  )
}

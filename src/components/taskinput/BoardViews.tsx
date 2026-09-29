// 추진현황을 표 대신 보는 두 화면(같은 행 · 같은 거르기 · 저장 안 한 변경 포함).
//   보드: 상태(대기 · 진행중 · 완료 · 보류 · 중단)별 칸반. 카드를 다른 칸으로 끌면 상태가 바뀐다(표에서 고친 것과 같음 -- 저장해야 시트에 반영).
//   타임라인: 구분(L2)별 간트. 과제마다 두 줄 -- 위 회색 = 계획(회색 칸), 아래 색 = 실적(분홍 칸). 파란 세로 띠 = 이번 주.
// 계획 · 실적 · 완료는 진척률과 같은 규칙으로 센다(planRange: 회색/분홍 칸, S · F · 완 표시).
import { useMemo, useState } from 'react'
import type { ScheduleRowView } from './ScheduleTable'
import { STATUS_TONE } from './ScheduleTable'
import { planRange, type ProgressData, type ProgressRow } from '../../utils/progressBoard'

type WeekCols = ProgressData['weekCols']
const BASE_STATUSES = ['대기', '진행중', '완료', '보류', '중단']
const NO_STATUS = '(상태 없음)'
// 타임라인 구분별 색(막대 진한 색 · 연한 색)
const GROUP_HUES = [
  ['#3BA9D3', '#BFE5F3'],
  ['#3DBE84', '#C3EDD7'],
  ['#A7327A', '#E9BAD6'],
  ['#9A5BD6', '#DCC8F2'],
  ['#E08A2C', '#F6D9B8'],
  ['#4A6FDB', '#C9D5F5'],
]

const splitPeople = (s: string | undefined) =>
  (s ?? '')
    .split(/[,/·\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)

// 한 과제의 일정: 계획 · 실적 구간(주 번호), 착수 · 완료 여부, 지연
function scheduleOf(v: ScheduleRowView, weekCols: WeekCols, idx: Map<string, number>, nowIdx: number) {
  const pr = planRange(v.cells, weekCols)
  const at = (k: string | null) => (k ? (idx.get(k) ?? null) : null)
  const actual = weekCols.map((w, i) => (v.cells[w.key]?.f === 'actual' ? i : -1)).filter((i) => i >= 0)
  const hasPlan = pr.planStart !== null || pr.planEnd !== null
  const plan = hasPlan ? [at(pr.planStart) ?? at(pr.planEnd)!, at(pr.planEnd) ?? at(pr.planStart)!] : null
  const act = actual.length ? [actual[0], actual[actual.length - 1]] : null
  const done = at(pr.done) !== null && at(pr.done)! <= nowIdx
  const started = at(pr.started) !== null && at(pr.started)! <= nowIdx
  const late = !done && !!plan && plan[1] < nowIdx
  return { plan, act, done, started, late }
}
const weekLabel = (w: WeekCols[number] | undefined) => (w ? `${w.month}/${w.week}주` : '')

// ---------------- 보드 ----------------
export function KanbanBoard({
  views,
  weekCols,
  currentKey,
  statusOptions,
  onStatus,
}: {
  views: ScheduleRowView[]
  weekCols: WeekCols
  currentKey: string | null
  statusOptions?: string[]
  onStatus?: (row: ProgressRow, value: string) => void
}) {
  const idx = useMemo(() => new Map(weekCols.map((w, i) => [w.key, i])), [weekCols])
  const nowIdx = currentKey ? (idx.get(currentKey) ?? weekCols.length - 1) : weekCols.length - 1
  const list = views.filter((v) => !v.deleted && v.vals.name?.trim())
  const present = Array.from(new Set(list.map((v) => v.vals.status?.trim() || NO_STATUS)))
  const cols = [...new Set([...(statusOptions?.length ? statusOptions : BASE_STATUSES), ...present])].filter(
    (s) => s !== NO_STATUS || present.includes(NO_STATUS),
  )
  if (present.includes(NO_STATUS) && !cols.includes(NO_STATUS)) cols.unshift(NO_STATUS)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  return (
    <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-2">
      {cols.map((col) => {
        const cards = list.filter((v) => (v.vals.status?.trim() || NO_STATUS) === col)
        const tone = STATUS_TONE[col] ?? 'bg-black/[0.05] text-label-2'
        return (
          <section
            key={col}
            onDragOver={(e) => {
              if (!onStatus || !dragKey || col === NO_STATUS) return
              e.preventDefault()
              setOverCol(col)
            }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={(e) => {
              e.preventDefault()
              const v = list.find((x) => x.row.key === dragKey)
              if (v && onStatus && col !== NO_STATUS && (v.vals.status ?? '') !== col) onStatus(v.row, col)
              setDragKey(null)
              setOverCol(null)
            }}
            className={`flex w-[264px] shrink-0 flex-col rounded-[12px] bg-[#F4F4F6] p-2 transition-colors ${overCol === col ? 'bg-accent-soft ring-2 ring-accent/40' : ''}`}
          >
            <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${tone}`}>{col}</span>
              <span className="text-[12px] tabular-nums text-label-3">{cards.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {cards.map((v) => {
                const s = scheduleOf(v, weekCols, idx, nowIdx)
                const people = splitPeople(v.vals.assignees)
                return (
                  <article
                    key={v.row.key}
                    draggable={!!onStatus}
                    onDragStart={(e) => {
                      setDragKey(v.row.key)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => (setDragKey(null), setOverCol(null))}
                    className={`rounded-[10px] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] ${onStatus ? 'cursor-grab active:cursor-grabbing' : ''} ${dragKey === v.row.key ? 'opacity-40' : ''}`}
                    title={onStatus ? '다른 칸으로 끌면 상태가 바뀝니다(저장해야 시트에 반영)' : undefined}
                  >
                    <p className="truncate text-[11.5px] text-label-3">
                      {v.row.l2}
                      {v.row.l2Tag ? ` [${v.row.l2Tag}]` : ''}
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold leading-snug text-label">{v.vals.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      {v.vals.category && <span className="rounded-full bg-black/[0.05] px-1.5 py-[1px] text-label-2">{v.vals.category}</span>}
                      {s.plan && (
                        <span className="text-label-3">
                          {weekLabel(weekCols[s.plan[0]])} → {weekLabel(weekCols[s.plan[1]])}
                        </span>
                      )}
                      {s.late && <span className="rounded-full bg-red-100 px-1.5 py-[1px] font-semibold text-red-700">지연</span>}
                      {v.editedFields.size + v.editedCells.size > 0 && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" title="저장 안 한 변경" />}
                    </div>
                    {people.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {people.slice(0, 4).map((p) => (
                          <span key={p} className="flex items-center gap-1 rounded-full bg-[#F2F4F7] py-[1px] pl-[1px] pr-2 text-[11.5px] text-label-2">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9.5px] font-bold text-label shadow-sm">
                              {p.slice(0, 1)}
                            </span>
                            {p}
                          </span>
                        ))}
                        {people.length > 4 && <span className="text-[11px] text-label-3">+{people.length - 4}</span>}
                      </div>
                    )}
                  </article>
                )
              })}
              {cards.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] text-label-3">{onStatus && col !== NO_STATUS ? '여기로 끌어 놓기' : '없음'}</p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ---------------- 타임라인 ----------------
const WEEK_W = 18
const LEFT_W = 280
const ROW_H = 30

export function TimelineView({ views, weekCols, currentKey }: { views: ScheduleRowView[]; weekCols: WeekCols; currentKey: string | null }) {
  const idx = useMemo(() => new Map(weekCols.map((w, i) => [w.key, i])), [weekCols])
  const nowIdx = currentKey ? (idx.get(currentKey) ?? -1) : -1
  const asOf = nowIdx >= 0 ? nowIdx : weekCols.length - 1
  // 구분(L2)별로 묶기(표 순서 그대로)
  const groups = useMemo(() => {
    const out: { label: string; items: { v: ScheduleRowView; s: ReturnType<typeof scheduleOf> }[] }[] = []
    for (const v of views) {
      if (v.deleted || !v.vals.name?.trim()) continue
      const label = `${v.row.l2}${v.row.l2Tag ? ` [${v.row.l2Tag}]` : ''}`
      let g = out[out.length - 1]
      if (!g || g.label !== label) out.push((g = { label, items: [] }))
      g.items.push({ v, s: scheduleOf(v, weekCols, idx, asOf) })
    }
    return out
  }, [views, weekCols, idx, asOf])
  // 달 머리글: 같은 달 주들을 한 칸으로
  const months: { month: number; from: number; n: number }[] = []
  weekCols.forEach((w, i) => {
    const m = months[months.length - 1]
    if (m && m.month === w.month) m.n++
    else months.push({ month: w.month, from: i, n: 1 })
  })
  const W = weekCols.length * WEEK_W
  const bar = (from: number, to: number) => ({ left: from * WEEK_W + 1, width: Math.max(WEEK_W - 2, (to - from + 1) * WEEK_W - 2) })

  return (
    <div className="overflow-x-auto rounded-[12px] ring-1 ring-black/[0.06]">
      <div style={{ width: LEFT_W + W }} className="relative text-[12.5px]">
        {/* 이번 주 띠 */}
        {nowIdx >= 0 && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-0 bg-[#E6F1FB]"
            style={{ left: LEFT_W + nowIdx * WEEK_W, width: WEEK_W }}
            title="이번 주"
          />
        )}
        {/* 머리글: 달 · 주 */}
        <div className="sticky top-0 z-10 flex border-b border-[#E5E5EA] bg-white/95">
          <div className="flex shrink-0 items-end px-3 pb-1.5 text-[12px] font-semibold text-label-2" style={{ width: LEFT_W }}>
            <span className="flex flex-col gap-1">
              {/* 범례 */}
              <span className="flex items-center gap-3 text-[11.5px] font-normal text-label-2">
                <span className="flex items-center gap-1">
                  <i className="inline-block h-[6px] w-5 rounded-full bg-[#C9C9CF]" />
                  계획
                </span>
                <span className="flex items-center gap-1">
                  <i className="inline-block h-[6px] w-5 rounded-full bg-[#3BA9D3]" />
                  실적
                </span>
                <span className="flex items-center gap-1">
                  <i className="inline-block h-3 w-2 bg-[#E6F1FB]" />
                  이번 주
                </span>
              </span>
              완료 비율 · 과제
            </span>
          </div>
          <div className="relative" style={{ width: W, height: 44 }}>
            {months.map((m) => (
              <div
                key={m.from}
                className="absolute top-0 border-l border-[#E5E5EA] pt-1.5 text-center text-[12px] font-semibold text-label"
                style={{ left: m.from * WEEK_W, width: m.n * WEEK_W, height: 22 }}
              >
                {m.month}월
              </div>
            ))}
            {weekCols.map((w, i) => (
              <div
                key={w.key}
                className={`absolute bottom-0 text-center text-[10px] tabular-nums ${i === nowIdx ? 'font-bold text-accent' : 'text-label-3'}`}
                style={{ left: i * WEEK_W, width: WEEK_W, height: 20 }}
              >
                {w.week}
              </div>
            ))}
          </div>
        </div>
        {/* 몸통: 세로 달 선 */}
        <div className="relative">
          <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: LEFT_W, width: W }}>
            {months.map((m) => (
              <div key={m.from} className="absolute bottom-0 top-0 border-l border-[#EDEDF0]" style={{ left: m.from * WEEK_W }} />
            ))}
          </div>
          {groups.map((g, gi) => {
            const [dark] = GROUP_HUES[gi % GROUP_HUES.length]
            const withPlan = g.items.filter((x) => x.s.plan || x.s.act)
            const done = g.items.filter((x) => x.s.done).length
            const pct = g.items.length ? Math.round((done / g.items.length) * 100) : 0
            const from = Math.min(...withPlan.map((x) => Math.min(x.s.plan?.[0] ?? Infinity, x.s.act?.[0] ?? Infinity)))
            const to = Math.max(...withPlan.map((x) => Math.max(x.s.plan?.[1] ?? -1, x.s.act?.[1] ?? -1)))
            return (
              <div key={g.label + gi} className="relative border-b border-[#F0F0F3] pb-2 pt-3">
                {/* 구분 줄: 완료 비율 + 전체 막대(진한 부분 = 이번 주까지 지난 기간) */}
                <div className="relative flex items-center" style={{ height: ROW_H }}>
                  <div className="flex shrink-0 items-baseline gap-2 truncate px-3" style={{ width: LEFT_W }} title={`완료 ${done} / 과제 ${g.items.length}`}>
                    <span className="text-[15px] font-bold tabular-nums text-label">{pct}%</span>
                    <span className="truncate font-semibold text-label">{g.label}</span>
                  </div>
                  {withPlan.length > 0 && isFinite(from) && (
                    <div
                      className="absolute h-[6px] rounded-full bg-[#9A9AA0]"
                      style={{ ...bar(from, to), left: LEFT_W + bar(from, to).left, top: ROW_H / 2 - 3 }}
                    >
                      <div
                        className="h-full rounded-full bg-[#4A4A50]"
                        style={{ width: `${Math.max(0, Math.min(1, (asOf - from + 1) / (to - from + 1))) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
                {g.items.map(({ v, s }) => {
                  const people = splitPeople(v.vals.assignees).join(', ')
                  const endIdx = Math.max(s.plan?.[1] ?? -1, s.act?.[1] ?? -1)
                  const state = s.done ? '완료' : s.late ? '지연' : s.started ? '진행' : s.plan ? '예정' : '일정 없음'
                  return (
                    <div key={v.row.key} className="relative flex items-center" style={{ height: ROW_H }}>
                      <div className="flex shrink-0 items-center gap-2 px-3" style={{ width: LEFT_W }}>
                        <span
                          className={`w-9 shrink-0 text-[11px] font-semibold ${s.done ? 'text-emerald-700' : s.late ? 'text-red-600' : s.started ? 'text-accent' : 'text-label-3'}`}
                        >
                          {state}
                        </span>
                        <span className="truncate text-label-2" title={v.vals.name}>
                          {v.vals.name}
                        </span>
                      </div>
                      {/* 두 줄: 위 회색 = 계획, 아래 색 = 실적(시작 · 끝을 위아래로 바로 비교) */}
                      {s.plan && (
                        <div
                          className="absolute h-[7px] rounded-full bg-[#C9C9CF]"
                          style={{ ...bar(s.plan[0], s.plan[1]), left: LEFT_W + bar(s.plan[0], s.plan[1]).left, top: ROW_H / 2 - 8 }}
                          title={`계획 ${weekLabel(weekCols[s.plan[0]])} → ${weekLabel(weekCols[s.plan[1]])}`}
                        />
                      )}
                      {s.act && (
                        <div
                          className="absolute h-[7px] rounded-full"
                          style={{ ...bar(s.act[0], s.act[1]), left: LEFT_W + bar(s.act[0], s.act[1]).left, top: ROW_H / 2 + 1, background: dark }}
                          title={`실적 ${weekLabel(weekCols[s.act[0]])} → ${weekLabel(weekCols[s.act[1]])}${s.done ? ' · 완료' : ''}`}
                        />
                      )}
                      {people && endIdx >= 0 && (
                        <span
                          className="absolute truncate text-[11.5px] text-label-3"
                          style={{ left: LEFT_W + (endIdx + 1) * WEEK_W + 6, top: ROW_H / 2 - 9, maxWidth: 180 }}
                        >
                          {people}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {groups.length === 0 && <p className="py-10 text-center text-[13px] text-label-3">보여 줄 과제가 없습니다.</p>}
        </div>
      </div>
    </div>
  )
}

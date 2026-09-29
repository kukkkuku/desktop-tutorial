// 추진현황을 표 대신 보는 두 화면(같은 행 · 같은 거르기 · 저장 안 한 변경 포함).
//   보드: 상태(대기 · 진행중 · 완료 · 보류 · 중단)별 칸반. 카드를 다른 칸으로 끌면 상태가 바뀐다(표에서 고친 것과 같음 -- 저장해야 시트에 반영).
//   타임라인: 구분(L2)별 간트. 과제마다 두 줄 -- 위 회색 = 계획(회색 칸), 아래 색 = 실적(분홍 칸). 파란 세로 띠 = 이번 주.
// 계획 · 실적 · 완료는 진척률과 같은 규칙으로 센다(planRange: 회색/분홍 칸, S · F · 완 표시).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
// 막대 하나 = 과제 기간(계획 ∪ 실적). 안쪽 반투명 채움 = 실적(분홍 칸)이 기록된 만큼(완료면 끝까지).
// 실적이 계획 끝을 넘겼거나 계획이 끝났는데 완료가 없으면 계획 끝에 점선 + 지연.
// 주 칸 너비는 화면 너비에 맞춰 꽉 채운다(최소 MIN_WEEK). 과제명 칸 너비는 끌어서 조절(이 브라우저에 기억).
const MIN_WEEK = 14
const LEFT_KEY = 'timeline-left-w'
const ROW_H = 38
const BAR_H = 26
type Filter = 'all' | 'doing' | 'late' | 'month'

export function TimelineView({ views, weekCols, currentKey }: { views: ScheduleRowView[]; weekCols: WeekCols; currentKey: string | null }) {
  const idx = useMemo(() => new Map(weekCols.map((w, i) => [w.key, i])), [weekCols])
  const nowIdx = currentKey ? (idx.get(currentKey) ?? -1) : -1
  const asOf = nowIdx >= 0 ? nowIdx : weekCols.length - 1
  const nowMonth = weekCols[asOf]?.month
  const [filter, setFilter] = useState<Filter>('all')
  // 그룹(L1) 탭을 바꾸면 요약 카드 거르기는 전체로(다른 탭에서 눌러 둔 거르기가 남아 빈 화면이 되지 않게)
  const l1Key = views[0]?.row.l1 ?? ''
  useEffect(() => setFilter('all'), [l1Key])
  // 화면 너비 · 과제명 칸 너비
  const boxRef = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(0)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCw(el.clientWidth))
    ro.observe(el)
    setCw(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const [leftW, setLeftW] = useState(() => {
    try {
      return Math.min(600, Math.max(140, Number(localStorage.getItem(LEFT_KEY)) || 250))
    } catch {
      return 250
    }
  })
  const WEEK = cw ? Math.max(MIN_WEEK, (cw - leftW - 24) / Math.max(1, weekCols.length)) : 20
  function startResize(e: React.MouseEvent) {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = leftW
    let last = w0
    const move = (ev: MouseEvent) => {
      last = Math.min(600, Math.max(140, w0 + ev.clientX - x0))
      setLeftW(last)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.documentElement.classList.remove('cursor-col-resize')
      try {
        localStorage.setItem(LEFT_KEY, String(last))
      } catch {
        // 기억 못 해도 지금은 바뀐다
      }
    }
    document.documentElement.classList.add('cursor-col-resize')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  type Item = { v: ScheduleRowView; s: ReturnType<typeof scheduleOf> }
  // 구분(L2)별로 묶기(표 순서 그대로)
  const groups = useMemo(() => {
    const out: { label: string; items: Item[] }[] = []
    for (const v of views) {
      if (v.deleted || !v.vals.name?.trim()) continue
      const label = `${v.row.l2}${v.row.l2Tag ? ` [${v.row.l2Tag}]` : ''}`
      let g = out[out.length - 1]
      if (!g || g.label !== label) out.push((g = { label, items: [] }))
      g.items.push({ v, s: scheduleOf(v, weekCols, idx, asOf) })
    }
    return out
  }, [views, weekCols, idx, asOf])
  const all = groups.flatMap((g) => g.items)
  const isDoing = (x: Item) => x.s.started && !x.s.done
  const isLate = (x: Item) => x.s.late
  const isMonth = (x: Item) => !x.s.done && !!x.s.plan && weekCols[x.s.plan[1]]?.month === nowMonth
  const pass = (x: Item) => filter === 'all' || (filter === 'doing' ? isDoing(x) : filter === 'late' ? isLate(x) : isMonth(x))
  const cards: { k: Filter; label: string; n: number; sub: string; tone: string }[] = [
    { k: 'all', label: '전체 과제', n: all.length, sub: `완료 ${all.filter((x) => x.s.done).length}`, tone: 'text-label' },
    { k: 'doing', label: '진행 중', n: all.filter(isDoing).length, sub: '착수했고 완료 전', tone: 'text-accent' },
    { k: 'month', label: '이번 달 마감', n: all.filter(isMonth).length, sub: `${nowMonth ?? ''}월에 계획이 끝남`, tone: 'text-[#B7791F]' },
    { k: 'late', label: '지연', n: all.filter(isLate).length, sub: '계획이 끝났는데 완료 없음', tone: 'text-red-600' },
  ]
  // 달 머리글: 같은 달 주들을 한 칸으로
  const months: { month: number; from: number; n: number }[] = []
  weekCols.forEach((w, i) => {
    const m = months[months.length - 1]
    if (m && m.month === w.month) m.n++
    else months.push({ month: w.month, from: i, n: 1 })
  })
  const W = weekCols.length * WEEK
  const x0 = (i: number) => leftW + i * WEEK + 2
  const span = (a: number, b: number) => Math.max(WEEK - 4, (b - a + 1) * WEEK - 4)

  return (
    <div className="space-y-4">
      {/* 요약 카드: 누르면 그 과제만 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.k}
            onClick={() => setFilter(filter === c.k && c.k !== 'all' ? 'all' : c.k)}
            disabled={c.k !== 'all' && c.n === 0 && filter !== c.k}
            className={`rounded-[14px] border bg-white px-4 py-3 text-left transition-shadow enabled:hover:shadow-sm disabled:cursor-default disabled:opacity-60 ${filter === c.k ? 'border-accent ring-2 ring-accent/20' : 'border-[#ECECF0]'}`}
          >
            <p className="text-[12px] font-medium text-label-2">{c.label}</p>
            <p className={`mt-0.5 text-[24px] font-bold tabular-nums leading-tight ${c.tone}`}>{c.n}</p>
            <p className="text-[11.5px] text-label-3">{c.sub}</p>
          </button>
        ))}
      </div>

      <div ref={boxRef} className="overflow-x-auto rounded-[14px] border border-[#ECECF0] bg-white">
        <div style={{ width: leftW + W + 24 }} className="relative text-[12.5px]">
          {/* 과제명 칸 경계: 끌어서 너비 조절(더블클릭 = 기본) */}
          <div
            onMouseDown={startResize}
            onDoubleClick={() => {
              setLeftW(250)
              try {
                localStorage.removeItem(LEFT_KEY)
              } catch {
                // 무시
              }
            }}
            title="끌어서 과제명 칸 너비 조절 · 더블클릭하면 기본"
            className="group/lw absolute bottom-0 top-0 z-30 w-[9px] cursor-col-resize"
            style={{ left: leftW - 5 }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#ECECF0] group-hover/lw:w-[2px] group-hover/lw:bg-accent" />
          </div>
          {/* 오늘 세로선 */}
          {nowIdx >= 0 && (
            <div className="pointer-events-none absolute bottom-0 top-[30px] z-20 w-[2px] bg-label" style={{ left: leftW + nowIdx * WEEK + WEEK / 2 - 1 }}>
              <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-label px-1.5 py-[1px] text-[10px] font-semibold text-white">
                오늘
              </span>
            </div>
          )}
          {/* 머리글: 범례 · 달 · 주 */}
          <div className="sticky top-0 z-10 flex border-b border-[#ECECF0] bg-white">
            <div className="flex shrink-0 flex-col justify-end gap-1 px-4 pb-2" style={{ width: leftW }}>
              <span className="flex items-center gap-3 text-[11.5px] text-label-2">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-3 w-6 rounded-full border border-[#3BA9D3]/50 bg-[#3BA9D3]/10" />
                  기간
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-3 w-6 rounded-full bg-[#3BA9D3]/40" />
                  실적만큼 채움
                </span>
              </span>
            </div>
            <div className="relative" style={{ width: W, height: 52 }}>
              {months.map((m) => (
                <div
                  key={m.from}
                  className={`absolute top-2 text-center text-[12.5px] font-semibold ${m.month === nowMonth ? 'text-label' : 'text-label-2'}`}
                  style={{ left: m.from * WEEK, width: m.n * WEEK }}
                >
                  {m.month}월
                </div>
              ))}
              {weekCols.map((w, i) => (
                <div
                  key={w.key}
                  className={`absolute bottom-1.5 text-center text-[10px] tabular-nums ${i === nowIdx ? 'font-bold text-label' : 'text-label-3'}`}
                  style={{ left: i * WEEK, width: WEEK }}
                >
                  {w.week}
                </div>
              ))}
            </div>
          </div>
          {/* 몸통 */}
          <div className="relative pb-3">
            <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: leftW, width: W }}>
              {months.map((m) => (
                <div key={m.from} className="absolute bottom-0 top-0 border-l border-dashed border-[#EFEFF3]" style={{ left: m.from * WEEK }} />
              ))}
            </div>
            {groups.map((g, gi) => {
              const hue = GROUP_HUES[gi % GROUP_HUES.length][0]
              const items = g.items.filter(pass)
              if (!items.length) return null
              const done = g.items.filter((x) => x.s.done).length
              const pct = g.items.length ? Math.round((done / g.items.length) * 100) : 0
              const ranged = g.items.filter((x) => x.s.plan || x.s.act)
              const from = Math.min(...ranged.map((x) => Math.min(x.s.plan?.[0] ?? Infinity, x.s.act?.[0] ?? Infinity)))
              const to = Math.max(...ranged.map((x) => Math.max(x.s.plan?.[1] ?? -1, x.s.act?.[1] ?? -1)))
              return (
                <div key={g.label + gi} className="relative pt-4">
                  {/* 구분 머리: 회색 알약에 이름 · 완료 비율 */}
                  <div className="relative flex items-center" style={{ height: 30 }}>
                    <div className="flex shrink-0 items-center gap-2 truncate px-4" style={{ width: leftW }}>
                      <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hue }} />
                      <span className="truncate text-[13px] font-semibold text-label">{g.label}</span>
                    </div>
                    {ranged.length > 0 && isFinite(from) && (
                      <div
                        className="absolute flex h-[22px] items-center justify-between overflow-hidden rounded-full bg-[#A9ABB8] px-3 text-[11px] font-semibold text-white"
                        style={{ left: x0(from), width: span(from, to) }}
                        title={`완료 ${done} / 과제 ${g.items.length}`}
                      >
                        <span className="truncate">{g.label}</span>
                        <span className="shrink-0 pl-2 tabular-nums">{pct}%</span>
                      </div>
                    )}
                  </div>
                  {items.map(({ v, s }) => {
                    const people = splitPeople(v.vals.assignees).join(', ')
                    const a = Math.min(s.plan?.[0] ?? Infinity, s.act?.[0] ?? Infinity)
                    const b = Math.max(s.plan?.[1] ?? -1, s.act?.[1] ?? -1)
                    const has = isFinite(a) && b >= 0
                    // 채움: 완료면 끝까지, 아니면 실적(분홍)이 기록된 마지막 주까지
                    const fillTo = s.done ? b : (s.act?.[1] ?? -1)
                    const fillW = has && fillTo >= a ? Math.min(1, (fillTo - a + 1) / (b - a + 1)) : 0
                    const planEnd = s.plan?.[1]
                    // 계획 끝 점선은 아직 안 끝난 늦은 과제만(끝난 과제까지 그리면 어지럽다)
                    const over = !s.done && !!s.plan && planEnd !== undefined && (s.late || (!!s.act && s.act[1] > planEnd))
                    const state = s.done ? '완료' : s.late ? '지연' : s.started ? '진행' : s.plan ? '예정' : '일정 없음'
                    return (
                      <div key={v.row.key} className="relative flex items-center" style={{ height: ROW_H }}>
                        <div className="flex shrink-0 items-center gap-2 px-4" style={{ width: leftW }}>
                          <span
                            className={`w-8 shrink-0 text-[11px] font-semibold ${s.done ? 'text-emerald-700' : s.late ? 'text-red-600' : s.started ? 'text-accent' : 'text-label-3'}`}
                          >
                            {state}
                          </span>
                          <span className="truncate text-label-2" title={v.vals.name}>
                            {v.vals.name}
                          </span>
                        </div>
                        {has && (
                          <div
                            className="absolute overflow-hidden rounded-[10px] border"
                            style={{ left: x0(a), width: span(a, b), height: BAR_H, top: (ROW_H - BAR_H) / 2, background: `${hue}14`, borderColor: `${hue}66` }}
                            title={[
                              s.plan ? `계획 ${weekLabel(weekCols[s.plan[0]])} → ${weekLabel(weekCols[s.plan[1]])}` : '계획 없음',
                              s.act ? `실적 ${weekLabel(weekCols[s.act[0]])} → ${weekLabel(weekCols[s.act[1]])}` : '실적 없음',
                              s.done ? '완료' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            <div className="absolute inset-y-0 left-0" style={{ width: `${fillW * 100}%`, background: `${hue}55` }} />
                            <span className="relative block truncate px-2.5 text-[11.5px] font-semibold leading-[24px]" style={{ color: hue }}>
                              {v.vals.name}
                            </span>
                          </div>
                        )}
                        {/* 계획 끝(늦어진 과제만): 점선 */}
                        {has && over && planEnd !== undefined && planEnd < b && (
                          <div
                            className="absolute border-l-2 border-dashed border-red-400"
                            style={{ left: x0(planEnd) + span(planEnd, planEnd) + 1, top: (ROW_H - BAR_H) / 2 - 2, height: BAR_H + 4 }}
                            title={`계획 끝 ${weekLabel(weekCols[planEnd])}`}
                          />
                        )}
                        {has && (
                          <span
                            className="absolute flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-label-3"
                            style={{ left: x0(a) + span(a, b) + 8, top: (ROW_H - 16) / 2 }}
                          >
                            {s.late && <span className="rounded-full bg-red-50 px-1.5 font-semibold text-red-600">지연</span>}
                            {people}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {groups.every((g) => !g.items.some(pass)) && (
              <p className="py-10 text-center text-[13px] text-label-3">
                {filter === 'all' ? '보여 줄 과제가 없습니다.' : `${cards.find((c) => c.k === filter)?.label} 과제가 없습니다. `}
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="font-semibold text-accent hover:underline">
                    전체 보기
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

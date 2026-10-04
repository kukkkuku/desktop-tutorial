// 추진현황을 표 대신 보는 두 화면(같은 행 · 같은 거르기 · 저장 안 한 변경 포함).
//   보드: 단계(대기 · 진행중 · 완료 · 보류 · 중단)별 칸반. 카드를 다른 칸으로 끌면 상태 칸이 바뀐다(표에서 고친 것과 같음 -- 저장해야 시트에 반영).
//   단계는 stageOf 한 규칙으로 보드 · 타임라인이 같이 쓴다.
//   타임라인: 구분(L2)별 간트. 과제마다 두 줄 -- 위 회색 = 계획(회색 칸), 아래 색 = 실적(분홍 칸). 파란 세로 띠 = 이번 주.
// 계획 · 실적 · 완료는 진척률과 같은 규칙으로 센다(planRange: 회색/분홍 칸, S · F · 완 표시).
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ScheduleRowView } from './ScheduleTable'
import { STATUS_TONE } from './ScheduleTable'
import { planRange, type ProgressData, type ProgressRow } from '../../utils/progressBoard'

type WeekCols = ProgressData['weekCols']
// 타임라인 구분별 색(막대 진한 색 · 연한 색)
const GROUP_HUES = [
  ['#3BA9D3', '#BFE5F3'],
  ['#3DBE84', '#C3EDD7'],
  ['#A7327A', '#E9BAD6'],
  ['#9A5BD6', '#DCC8F2'],
  ['#E08A2C', '#F6D9B8'],
  ['#4A6FDB', '#C9D5F5'],
]

// 구분 색 직접 고르기 · 접어 둔 구분(이 브라우저에 기억)
const GROUP_COLORS_KEY = 'timeline-group-colors'
const COLLAPSE_KEY = 'timeline-collapsed'
const PICK_COLORS = ['#3BA9D3', '#3DBE84', '#A7327A', '#9A5BD6', '#E08A2C', '#4A6FDB', '#E04F5F', '#2BA6A0', '#8C8C99', '#B7791F']
const readJson = <T,>(k: string, d: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? d
  } catch {
    return d
  }
}
const writeJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    // 기억 못 해도 지금은 바뀐다
  }
}

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
  const stage = stageOf(v.vals.status, at(pr.done) !== null && at(pr.done)! <= nowIdx, (at(pr.started) !== null && at(pr.started)! <= nowIdx) || !!act)
  const done = stage === '완료'
  const started = stage === '진행중'
  const late = (stage === '대기' || stage === '진행중') && !!plan && plan[1] < nowIdx
  return { plan, act, done, started, late, stage }
}

// 보드 칸과 타임라인 상태를 같은 규칙으로: 상태 칸에 단계(대기 · 진행중 · 완료 · 보류 · 중단)가 적혀 있으면 그것,
// 비었거나 다른 값(-, 일상 같은 구분 값)이면 일정 칸으로 판단 -- 완료 표시 = 완료, 착수 표시나 실적 = 진행중, 나머지(계획만 있거나 아무것도 없음) = 대기.
const STAGES = ['대기', '진행중', '완료', '보류', '중단']
function stageOf(status: string | undefined, done: boolean, started: boolean) {
  const st = (status ?? '').replace(/\s/g, '')
  if (STAGES.includes(st)) return st
  return done ? '완료' : started ? '진행중' : '대기'
}
const weekLabel = (w: WeekCols[number] | undefined) => (w ? `${w.month}/${w.week}주` : '')

// ---------------- 보드 · 타임라인 공통 거르기 ----------------
// 단계(한 과제는 한 단계) 하나 + 위험 표시(지연 · 이번 달 마감, 단계와 겹칠 수 있음)하나를 고른다. 보드 · 타임라인이 같은 값을 쓴다.
export type ViewFilter = { stage: 'all' | '대기' | '진행중' | '보류중단' | '완료'; risk: null | 'late' | 'month' }
export const ALL_FILTER: ViewFilter = { stage: 'all', risk: null }
type Sched = ReturnType<typeof scheduleOf>
const stageHit = (s: Sched, st: ViewFilter['stage']) => st === 'all' || (st === '보류중단' ? s.stage === '보류' || s.stage === '중단' : s.stage === st)
const monthHit = (s: Sched, weekCols: WeekCols, nowMonth: number | undefined) =>
  (s.stage === '대기' || s.stage === '진행중') && !!s.plan && weekCols[s.plan[1]]?.month === nowMonth
const riskHit = (s: Sched, r: ViewFilter['risk'], weekCols: WeekCols, nowMonth: number | undefined) =>
  r === null || (r === 'late' ? s.late : monthHit(s, weekCols, nowMonth))
export const passView = (s: Sched, f: ViewFilter, weekCols: WeekCols, nowMonth: number | undefined) => stageHit(s, f.stage) && riskHit(s, f.risk, weekCols, nowMonth)

function ViewFilterBar({ list, value, onChange, weekCols, nowMonth }: { list: Sched[]; value: ViewFilter; onChange: (f: ViewFilter) => void; weekCols: WeekCols; nowMonth: number | undefined }) {
  const stages: [ViewFilter['stage'], string, string][] = [
    ['all', '전체', 'text-label'],
    ['대기', '대기', 'text-label-2'],
    ['진행중', '진행 중', 'text-accent'],
    ['보류중단', '보류 · 중단', 'text-[#8A6D3B]'],
    ['완료', '완료', 'text-emerald-700'],
  ]
  const risks: [NonNullable<ViewFilter['risk']>, string, string, string][] = [
    ['late', '지연', 'text-red-600', '계획이 끝났는데 완료가 없음'],
    ['month', '이번 달 마감', 'text-[#B7791F]', `${nowMonth ?? ''}월에 계획이 끝나는 대기 · 진행 중 과제`],
  ]
  const chip = (on: boolean) =>
    `flex h-8 items-center gap-1.5 rounded-full px-3 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium transition-colors ${
      on ? 'bg-label text-white' : 'bg-black/[0.04] text-label-2 hover:bg-black/[0.07]'
    }`
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stages.map(([k, label, tone]) => {
        const n = list.filter((s) => stageHit(s, k)).length
        if (k === '보류중단' && !n && value.stage !== k) return null
        const on = value.stage === k
        return (
          <button key={k} onClick={() => onChange({ ...value, stage: k })} className={chip(on)}>
            {label}
            <span className={`tabular-nums font-semibold ${on ? 'text-white' : tone}`}>{n}</span>
          </button>
        )
      })}
      <span className="mx-1.5 h-5 w-px bg-separator" />
      {risks.map(([k, label, tone, why]) => {
        const n = list.filter((s) => riskHit(s, k, weekCols, nowMonth)).length
        const on = value.risk === k
        return (
          <button key={k} title={why} onClick={() => onChange({ ...value, risk: on ? null : k })} className={chip(on)}>
            {k === 'late' && <span aria-hidden>⚠</span>}
            {label}
            <span className={`tabular-nums font-semibold ${on ? 'text-white' : tone}`}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------- 보드 ----------------
export function KanbanBoard({
  views,
  weekCols,
  currentKey,
  statusOptions,
  onStatus,
  filter = ALL_FILTER,
  onFilter,
}: {
  views: ScheduleRowView[]
  weekCols: WeekCols
  currentKey: string | null
  statusOptions?: string[]
  onStatus?: (row: ProgressRow, value: string) => void
  filter?: ViewFilter
  onFilter?: (f: ViewFilter) => void
}) {
  const idx = useMemo(() => new Map(weekCols.map((w, i) => [w.key, i])), [weekCols])
  const nowIdx = currentKey ? (idx.get(currentKey) ?? weekCols.length - 1) : weekCols.length - 1
  const list = views.filter((v) => !v.deleted && v.vals.name?.trim())
  const staged = list.map((v) => ({ v, s: scheduleOf(v, weekCols, idx, nowIdx) }))
  // 칸은 단계만: 대기 · 진행중 · 완료는 늘, 보류 · 중단은 시트 선택지에 있거나 쓰인 카드가 있을 때
  const nowMonth = weekCols[nowIdx]?.month
  // 단계를 고르면 그 칸만(보류 · 중단은 두 칸), 위험 표시는 카드를 거른다
  const cols = STAGES.filter((c) => ['대기', '진행중', '완료'].includes(c) || statusOptions?.includes(c) || staged.some((x) => x.s.stage === c)).filter(
    (c) => filter.stage === 'all' || (filter.stage === '보류중단' ? c === '보류' || c === '중단' : c === filter.stage),
  )
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  return (
    <div className="space-y-3">
    {onFilter && <ViewFilterBar list={staged.map((x) => x.s)} value={filter} onChange={onFilter} weekCols={weekCols} nowMonth={nowMonth} />}
    <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-2">
      {cols.map((col) => {
        const cards = staged.filter((x) => x.s.stage === col && riskHit(x.s, filter.risk, weekCols, nowMonth))
        const tone = STATUS_TONE[col] ?? 'bg-black/[0.05] text-label-2'
        return (
          <section
            key={col}
            onDragOver={(e) => {
              if (!onStatus || !dragKey) return
              e.preventDefault()
              setOverCol(col)
            }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={(e) => {
              e.preventDefault()
              const x = staged.find((x) => x.v.row.key === dragKey)
              if (x && onStatus && x.s.stage !== col) onStatus(x.v.row, col)
              setDragKey(null)
              setOverCol(null)
            }}
            className={`flex w-[264px] shrink-0 flex-col rounded-[12px] bg-[#F4F4F6] p-2 transition-colors ${overCol === col ? 'bg-accent-soft ring-2 ring-accent/40' : ''}`}
          >
            <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
              <span className={`rounded-full px-2 py-0.5 text-[length:calc(13px*var(--ui-fs,1))] font-semibold ${tone}`}>{col}</span>
              <span className="text-[length:calc(13px*var(--ui-fs,1))] tabular-nums text-label-3">{cards.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {cards.map(({ v, s }) => {
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
                    <p className="truncate text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">
                      {v.row.l2}
                      {v.row.l2Tag ? ` [${v.row.l2Tag}]` : ''}
                    </p>
                    <p className="mt-0.5 text-[length:calc(14px*var(--ui-fs,1))] font-semibold leading-snug text-label">{v.vals.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[length:calc(12.5px*var(--ui-fs,1))]">
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
                          <span key={p} className="flex items-center gap-1 rounded-full bg-[#F2F4F7] py-[1px] pl-[1px] pr-2 text-[length:calc(12.5px*var(--ui-fs,1))] text-label-2">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9.5px] font-bold text-label shadow-sm">
                              {p.slice(0, 1)}
                            </span>
                            {p}
                          </span>
                        ))}
                        {people.length > 4 && <span className="text-[length:calc(12px*var(--ui-fs,1))] text-label-3">+{people.length - 4}</span>}
                      </div>
                    )}
                  </article>
                )
              })}
              {cards.length === 0 && <p className="px-2 py-6 text-center text-[length:calc(13px*var(--ui-fs,1))] text-label-3">{onStatus ? '여기로 끌어 놓기' : '없음'}</p>}
            </div>
          </section>
        )
      })}
    </div>
    </div>
  )
}

// ---------------- 타임라인 ----------------
// 막대 하나 = 과제 기간(계획 ∪ 실적). 안쪽 반투명 채움 = 실적(분홍 칸)이 기록된 만큼(완료면 끝까지).
// 실적이 계획 끝을 넘겼거나 계획이 끝났는데 완료가 없으면 계획 끝 이후 구간을 빨간 빗금 + 지연.
// 주 칸 너비는 화면 너비에 맞춰 꽉 채운다(최소 MIN_WEEK). 과제명 칸 너비는 끌어서 조절(이 브라우저에 기억).
const MIN_WEEK = 14
const LEFT_KEY = 'timeline-left-w'
const ROW_H = 38
const BAR_H = 26
export function TimelineView({
  views,
  weekCols,
  currentKey,
  filter = ALL_FILTER,
  onFilter,
}: {
  views: ScheduleRowView[]
  weekCols: WeekCols
  currentKey: string | null
  filter?: ViewFilter
  onFilter?: (f: ViewFilter) => void
}) {
  const idx = useMemo(() => new Map(weekCols.map((w, i) => [w.key, i])), [weekCols])
  const nowIdx = currentKey ? (idx.get(currentKey) ?? -1) : -1
  const asOf = nowIdx >= 0 ? nowIdx : weekCols.length - 1
  const nowMonth = weekCols[asOf]?.month
  // 구분 색(사용자 지정) · 접기
  const [groupColors, setGroupColors] = useState<Record<string, string>>(() => readJson(GROUP_COLORS_KEY, {}))
  const setGroupColor = (label: string, hex: string | null) => {
    const next = { ...groupColors }
    if (hex) next[label] = hex
    else delete next[label]
    setGroupColors(next)
    writeJson(GROUP_COLORS_KEY, next)
  }
  const [collapsed, setCollapsed] = useState<string[]>(() => readJson(COLLAPSE_KEY, []))
  const toggleGroup = (label: string) => {
    const next = collapsed.includes(label) ? collapsed.filter((x) => x !== label) : [...collapsed, label]
    setCollapsed(next)
    writeJson(COLLAPSE_KEY, next)
  }
  const [colorFor, setColorFor] = useState<{ label: string; x: number; y: number } | null>(null)
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
  const pass = (x: Item) => passView(x.s, filter, weekCols, nowMonth)
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
      {onFilter && <ViewFilterBar list={all.map((x) => x.s)} value={filter} onChange={onFilter} weekCols={weekCols} nowMonth={nowMonth} />}

      <div ref={boxRef} className="overflow-x-auto rounded-[14px] border border-[#ECECF0] bg-white">
        <div style={{ width: leftW + W + 24 }} className="relative text-[length:calc(13.5px*var(--ui-fs,1))]">
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
              <button
                  onClick={() => {
                    const next = groups.every((g) => collapsed.includes(g.label)) ? [] : groups.map((g) => g.label)
                    setCollapsed(next)
                    writeJson(COLLAPSE_KEY, next)
                  }}
                  className="self-start whitespace-nowrap text-[length:calc(12.5px*var(--ui-fs,1))] text-accent hover:underline"
                >
                  {groups.length && groups.every((g) => collapsed.includes(g.label)) ? '모두 펼치기' : '모두 접기'}
                </button>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap text-[length:calc(12.5px*var(--ui-fs,1))] text-label-2">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-3 w-6 rounded-full border border-[#3BA9D3]/50 bg-[#3BA9D3]/10" />
                  계획
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-3 w-6 rounded-full bg-[#3BA9D3]/40" />
                  실적
                </span>
                <span className="flex items-center gap-1.5">
                  <i
                    className="inline-block h-3 w-6 rounded-full"
                    style={{ background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.22) 0 3px, transparent 3px 6px)' }}
                  />
                  계획 넘김
                </span>
              </span>
            </div>
            <div className="relative" style={{ width: W, height: 52 }}>
              {months.map((m) => (
                <div
                  key={m.from}
                  className={`absolute top-2 text-center text-[length:calc(13.5px*var(--ui-fs,1))] font-semibold ${m.month === nowMonth ? 'text-label' : 'text-label-2'}`}
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
              const hue = groupColors[g.label] ?? GROUP_HUES[gi % GROUP_HUES.length][0]
              const shut = collapsed.includes(g.label)
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
                    <div className="flex shrink-0 items-center gap-1.5 truncate pl-2 pr-4" style={{ width: leftW }}>
                      {/* 접기 · 펼치기 */}
                      <button
                        onClick={() => toggleGroup(g.label)}
                        title={shut ? '펼치기' : '접기'}
                        aria-label={shut ? '펼치기' : '접기'}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-label-3 hover:bg-black/[0.06] hover:text-label"
                      >
                        <span className={`inline-block text-[11px] transition-transform ${shut ? '' : 'rotate-90'}`}>▶</span>
                      </button>
                      {/* 구분 색: 누르면 고르기 */}
                      <button
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setColorFor({ label: g.label, x: r.left, y: r.bottom + 6 })
                        }}
                        title="구분 색 바꾸기"
                        aria-label="구분 색 바꾸기"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06]"
                      >
                        <i className="h-2.5 w-2.5 rounded-full" style={{ background: hue }} />
                      </button>
                      <button onClick={() => toggleGroup(g.label)} className="truncate text-left text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">
                        {g.label}
                        {shut && <span className="ml-1.5 font-normal text-label-3">{items.length}건</span>}
                      </button>
                    </div>
                    {ranged.length > 0 && isFinite(from) && (
                      <div
                        className="absolute flex h-[22px] items-center justify-between overflow-hidden rounded-full px-3 text-[length:calc(12px*var(--ui-fs,1))] font-semibold text-white"
                        style={{ left: x0(from), width: span(from, to), background: groupColors[g.label] ? hue : '#A9ABB8' }}
                        title={`완료 ${done} / 과제 ${g.items.length}`}
                      >
                        <span className="truncate">{g.label}</span>
                        <span className="shrink-0 pl-2 tabular-nums">{pct}%</span>
                      </div>
                    )}
                  </div>
                  {!shut && items.map(({ v, s }) => {
                    const people = splitPeople(v.vals.assignees).join(', ')
                    const a = Math.min(s.plan?.[0] ?? Infinity, s.act?.[0] ?? Infinity)
                    const b = Math.max(s.plan?.[1] ?? -1, s.act?.[1] ?? -1)
                    const has = isFinite(a) && b >= 0
                    // 채움: 완료면 끝까지, 아니면 실적(분홍)이 기록된 마지막 주까지
                    const fillTo = s.done ? b : (s.act?.[1] ?? -1)
                    const fillW = has && fillTo >= a ? Math.min(1, (fillTo - a + 1) / (b - a + 1)) : 0
                    const planEnd = s.plan?.[1]
                    // 계획 넘긴 구간 빗금은 아직 안 끝난 늦은 과제만(끝난 과제까지 그리면 어지럽다)
                    const over = !s.done && !!s.plan && planEnd !== undefined && (s.late || (!!s.act && s.act[1] > planEnd))
                    const state = s.late ? '지연' : s.stage
                    return (
                      <div key={v.row.key} className="relative flex items-center" style={{ height: ROW_H }}>
                        <div className="flex shrink-0 items-center gap-2 px-4" style={{ width: leftW }}>
                          <span
                            className={`w-10 shrink-0 whitespace-nowrap text-[length:calc(12px*var(--ui-fs,1))] font-semibold ${s.done ? 'text-emerald-700' : s.late ? 'text-red-600' : s.started ? 'text-accent' : 'text-label-3'}`}
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
                            {/* 계획 끝을 넘긴 구간(늦어진 과제만): 빨간 빗금, 글자는 그 위에 */}
                            {over && planEnd !== undefined && planEnd < b && (
                              <div
                                className="absolute inset-y-0 right-0"
                                style={{
                                  left: x0(planEnd) + span(planEnd, planEnd) - x0(a),
                                  background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.16) 0 4px, transparent 4px 8px)',
                                }}
                                title={`계획 끝 ${weekLabel(weekCols[planEnd])} 이후`}
                              />
                            )}
                            <span className="relative block truncate px-2.5 text-[length:calc(12.5px*var(--ui-fs,1))] font-semibold leading-[24px]" style={{ color: hue }}>
                              {v.vals.name}
                            </span>
                          </div>
                        )}
                        {has && (
                          <span
                            className="absolute flex items-center gap-1.5 whitespace-nowrap text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3"
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
            {colorFor && (
              <div className="fixed inset-0 z-50" onMouseDown={() => setColorFor(null)}>
                <div className="mac-pop absolute w-[212px] p-2.5" style={{ left: colorFor.x, top: colorFor.y }} onMouseDown={(e) => e.stopPropagation()}>
                  <p className="mb-2 truncate text-[length:calc(12.5px*var(--ui-fs,1))] font-semibold text-label-2">{colorFor.label} 색</p>
                  <div className="grid grid-cols-5 gap-2">
                    {PICK_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setGroupColor(colorFor.label, c)
                          setColorFor(null)
                        }}
                        className={`h-7 w-7 rounded-full ${groupColors[colorFor.label] === c ? 'ring-2 ring-label ring-offset-2' : ''}`}
                        style={{ background: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setGroupColor(colorFor.label, null)
                      setColorFor(null)
                    }}
                    className="mt-2 w-full rounded-[7px] py-1 text-[length:calc(13px*var(--ui-fs,1))] text-label-2 hover:bg-black/[0.05]"
                  >
                    기본 색으로
                  </button>
                </div>
              </div>
            )}
            {groups.every((g) => !g.items.some(pass)) && (
              <p className="py-10 text-center text-[length:calc(14px*var(--ui-fs,1))] text-label-3">
                {filter.stage === 'all' && !filter.risk ? '보여 줄 과제가 없습니다.' : '고른 조건의 과제가 없습니다. '}
                {(filter.stage !== 'all' || filter.risk) && onFilter && (
                  <button onClick={() => onFilter(ALL_FILTER)} className="font-semibold text-accent hover:underline">
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

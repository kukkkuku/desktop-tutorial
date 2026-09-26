// 과제 입력 › 진척률 -- 시트 「YYYY 진척률」 탭과 같은 모양의 표를 추진현황 일정 칸에서 자동으로 센다.
//   탭: 합산(중점과제 모음 + 일반업무 실적) | 실(H)별(구분 L2 한 줄씩 + 소계)
//   칸: 과제계획 | 착수(계획 · 실적 · 달성률) | 현재 진행중 | 완료(계획 · 실적 · 진척률)
// 세는 법(기준 주까지):
//   과제계획 = 한 해 일정(회색 계획 또는 분홍 실적)이 있는 과제
//   계획(회색)이 없는 과제는 실적(분홍) 시점을 계획으로 본다
//   착수 계획 = 착수 계획 주(회색 S · 회색 시작)가 기준 주 이전 / 착수 실적 = 착수(분홍 S · 분홍 시작)가 기준 주 이전
//   완료 계획 = 완료 계획 주(F · 회색 끝)가 기준 주 이전 / 완료 실적 = 완료(분홍 완)가 기준 주 이전
//   현재 진행중 = 착수했고 아직 완료 안 함
//   일반업무 실적(합산) = 같은 실에서 [중점]이 아닌 구분의 완료 실적 -- 그 중점과제의 주 담당팀 과제만(자동, 고칠 수 있음)
// 숫자 칸은 더블클릭으로 고칠 수 있다(팀장이 맞춤 · 이 브라우저에 기억). 우클릭: 과제 목록 · 자동값으로.
// PPT로 내보내기: 탭마다 한 장(미리보기에서 고르기).
import { useEffect, useMemo, useState } from 'react'
import { Download, List, Presentation, RotateCcw, X } from 'lucide-react'
import Button from '../Button'
import { effectiveCells, effectiveField, planRange, type Drafts, type ProgressData, type ProgressRow } from '../../utils/progressBoard'
import { exportRows } from '../../utils/progressExport'
import { accountScope } from '../../utils/accountScope'
import { icSm } from '../ui/icon'

export type Metric = 'plan' | 'startPlan' | 'startDone' | 'doing' | 'endPlan' | 'endDone' | 'general'
const METRIC_LABEL: Record<Metric, string> = {
  plan: '과제계획',
  startPlan: '착수 계획',
  startDone: '착수 실적',
  doing: '현재 진행중',
  endPlan: '완료 계획',
  endDone: '완료 실적',
  general: '일반업무 실적',
}
type Tasks = Record<Metric, ProgressRow[]>
const emptyTasks = (): Tasks => ({ plan: [], startPlan: [], startDone: [], doing: [], endPlan: [], endDone: [], general: [] })
function mergeTasks(a: Tasks, b: Tasks): Tasks {
  const out = emptyTasks()
  for (const k of Object.keys(out) as Metric[]) out[k] = [...a[k], ...b[k]]
  return out
}

export interface RateRow {
  id: string
  label: string
  group?: string // 실 탭: 업무구분(L1)
  tasks: Tasks
  sum?: boolean
}
export interface RateTable {
  key: string
  title: string
  firstHead: string
  rows: RateRow[]
  general?: boolean // 일반업무 실적 칸
  groupHead?: string // 앞 칸(업무구분) 머리글
}

const rate = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-')

// ---- 이 브라우저에 기억하는 고친 숫자
const overKey = (tab: string) => `progress-rate:overrides:${accountScope()}:${tab}`
function loadOver(tab: string): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(overKey(tab)) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export default function ProgressRate({ data, drafts, l1s, asOfDefault }: { data: ProgressData; drafts: Drafts; l1s: string[]; asOfDefault: string | null }) {
  const weekCols = data.weekCols
  const [asOf, setAsOf] = useState<string>(asOfDefault ?? weekCols[weekCols.length - 1]?.key ?? '')
  const [tab, setTab] = useState('sum')
  const [list, setList] = useState<{ title: string; rows: ProgressRow[] } | null>(null)
  const [over, setOverState] = useState<Record<string, number>>(() => loadOver(data.tabTitle))
  useEffect(() => setOverState(loadOver(data.tabTitle)), [data.tabTitle])
  function setOver(next: Record<string, number>) {
    setOverState(next)
    try {
      localStorage.setItem(overKey(data.tabTitle), JSON.stringify(next))
    } catch {
      // 기억 못 해도 화면엔 반영
    }
  }
  const [edit, setEdit] = useState<{ k: string; text: string } | null>(null)
  const [menu, setMenu] = useState<{ k: string; x: number; y: number; title: string; rows: ProgressRow[]; auto: number } | null>(null)
  const [pptOpen, setPptOpen] = useState(false)
  const idx = useMemo(() => new Map(weekCols.map((w, i) => [w.key, i])), [weekCols])
  const asOfIdx = idx.get(asOf) ?? weekCols.length - 1

  const tables: RateTable[] = useMemo(() => {
    const rows = exportRows(data, drafts, l1s).filter((r) => r.l3.trim())
    const at = (k: string | null) => (k ? (idx.get(k) ?? Infinity) : Infinity)
    const countRow = (row: ProgressRow): Tasks => {
      const cells = effectiveCells(row, row.isNew ? undefined : drafts.edits[row.key])
      const pr = planRange(cells, weekCols)
      const c = emptyTasks()
      // 계획(회색)이 없는 과제는 실적(분홍) 시점을 계획으로 본다(계획 없이 바로 진행한 일도 계획 대비로 셈)
      const hasPlan = pr.planStart !== null || pr.planEnd !== null
      const planStart = hasPlan ? pr.planStart : pr.started
      const planEnd = hasPlan ? pr.planEnd : pr.done
      if (hasPlan || pr.started !== null) c.plan.push(row)
      if (at(planStart) <= asOfIdx) c.startPlan.push(row)
      const started = at(pr.started) <= asOfIdx
      const done = at(pr.done) <= asOfIdx
      if (started) c.startDone.push(row)
      if (started && !done) c.doing.push(row)
      if (at(planEnd) <= asOfIdx) c.endPlan.push(row)
      if (done) c.endDone.push(row)
      return c
    }
    const silOf = (r: ProgressRow) => (r.h ?? '').replace(/\s+/g, ' ').trim() || r.l1
    const teamOf = (r: ProgressRow) => effectiveField(r, r.isNew ? undefined : drafts.edits[r.key], 'team').trim()
    // 실 → 구분(L2) 줄(시트 순서 그대로)
    const sils: string[] = []
    const groups: { sil: string; l1: string; l2: string; tag: string | null; rows: ProgressRow[]; t: Tasks }[] = []
    for (const r of rows) {
      const sil = silOf(r)
      if (!sils.includes(sil)) sils.push(sil)
      const last = groups[groups.length - 1]
      const c = countRow(r)
      if (last && last.sil === sil && last.l1 === r.l1 && last.l2 === r.l2 && last.tag === r.l2Tag) {
        last.rows.push(r)
        last.t = mergeTasks(last.t, c)
      } else groups.push({ sil, l1: r.l1, l2: r.l2, tag: r.l2Tag, rows: [r], t: c })
    }
    const isFocus = (g: { tag: string | null }) => (g.tag ?? '').includes('중점')
    const total = (list: RateRow[], id: string, label: string): RateRow => ({
      id,
      label,
      sum: true,
      tasks: list.reduce((a, r) => mergeTasks(a, r.tasks), emptyTasks()),
    })

    // 합산: 중점과제 + 일반업무 실적(같은 실의 일반 구분 완료 중 그 중점과제 주 담당팀 과제 -- 한 과제는 한 중점과제에만)
    const focus = groups.filter(isFocus)
    const usedGeneral = new Set<string>()
    const sumRows: RateRow[] = focus.map((g, i) => {
      const teams = new Map<string, number>()
      for (const r of g.rows) {
        const t = teamOf(r)
        if (t) teams.set(t, (teams.get(t) ?? 0) + 1)
      }
      const main = [...teams].sort((a, b) => b[1] - a[1])[0]?.[0]
      const general = groups
        .filter((x) => x.sil === g.sil && !isFocus(x))
        .flatMap((x) => x.t.endDone)
        .filter((r) => main && teamOf(r) === main && !usedGeneral.has(r.key))
      general.forEach((r) => usedGeneral.add(r.key))
      return { id: `f:${g.l1}␟${g.l2}`, label: `${i + 1}. ${g.l2}`, tasks: { ...g.t, general } }
    })
    const out: RateTable[] = [{ key: 'sum', title: '합산', firstHead: '중점과제 구분', rows: [...sumRows, total(sumRows, 'total', '계')], general: true }]
    for (const sil of sils) {
      const list: RateRow[] = groups
        .filter((g) => g.sil === sil)
        .map((g) => ({ id: `${g.l1}␟${g.l2}␟${g.tag ?? ''}`, label: g.tag ? `${g.l2} [${g.tag}]` : g.l2, group: g.l1, tasks: g.t }))
      out.push({ key: `sil:${sil}`, title: sil, firstHead: '구분(L2)', groupHead: '업무구분', rows: [...list, total(list, 'total', '소계')] })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, drafts, l1s, asOfIdx])

  // 칸 값: 고친 값 > (소계면 아래 줄 합) > 자동
  const keyOf = (t: RateTable, r: RateRow, m: Metric) => `${t.key}|${r.id}|${m}`
  const valueOf = (t: RateTable, r: RateRow, m: Metric): number => {
    const o = over[keyOf(t, r, m)]
    if (o !== undefined) return o
    if (r.sum) return t.rows.filter((x) => !x.sum).reduce((n, x) => n + valueOf(t, x, m), 0)
    return r.tasks[m].length
  }
  const autoOf = (t: RateTable, r: RateRow, m: Metric): number =>
    r.sum ? t.rows.filter((x) => !x.sum).reduce((n, x) => n + valueOf(t, x, m), 0) : r.tasks[m].length
  const cur = tables.find((t) => t.key === tab) ?? tables[0]
  const asOfLabel = (() => {
    const w = weekCols.find((x) => x.key === asOf)
    return w ? `${w.month}월 ${w.week}주` : ''
  })()

  const th = 'border border-[#9AA0A6] bg-[#C9DAF8] px-2 py-1.5 text-center text-[12px] font-bold text-[#14161A]'
  const td = 'relative border border-[#C9CDD3] px-2 py-1.5 text-center text-[12.5px] tabular-nums'
  const actualBg = 'bg-[#EAD6D4]' // 실적 칸(시트처럼 연한 분홍)
  const numCell = (t: RateTable, r: RateRow, m: Metric) => {
    const k = keyOf(t, r, m)
    const v = valueOf(t, r, m)
    const changed = over[k] !== undefined
    const title = `${t.title} · ${r.label} · ${METRIC_LABEL[m]}`
    return (
      <td
        key={m}
        className={`${td} ${m === 'startDone' || m === 'endDone' ? actualBg : ''} cursor-cell font-semibold hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-accent`}
        onDoubleClick={() => setEdit({ k, text: String(v) })}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({
            k,
            x: Math.min(e.clientX, window.innerWidth - 220),
            y: e.clientY,
            title,
            rows: r.sum ? t.rows.filter((x) => !x.sum).flatMap((x) => x.tasks[m]) : r.tasks[m],
            auto: autoOf(t, r, m),
          })
        }}
        title={`${changed ? `고친 값(자동 ${autoOf(t, r, m)}) · ` : ''}더블클릭: 고치기 · 우클릭: 과제 목록 · 자동값으로`}
      >
        {edit?.k === k ? (
          <input
            autoFocus
            value={edit.text}
            onChange={(e) => setEdit({ k, text: e.target.value.replace(/[^\d]/g, '') })}
            onBlur={() => commitEdit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setEdit(null)
            }}
            className="h-6 w-14 rounded border border-accent px-1 text-center text-[12.5px] outline-none"
          />
        ) : (
          v
        )}
        {changed && <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
      </td>
    )
  }
  function commitEdit() {
    if (!edit) return
    const next = { ...over }
    if (edit.text === '') delete next[edit.k]
    else next[edit.k] = Number(edit.text)
    setOver(next)
    setEdit(null)
  }
  const rateCell = (n: number, d: number, key: string) => (
    <td key={key} className={`${td} font-bold text-[#1155CC]`}>
      {rate(n, d)}
    </td>
  )

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-bold text-label">{data.tabTitle.replace(/추진현황/, '진척률')}</h2>
        <span className="text-[12px] text-label-3">추진현황 일정 칸에서 자동으로 셉니다 · 숫자는 더블클릭으로 고칠 수 있음</span>
        <label className="ml-auto flex items-center gap-1.5 text-[13px] text-label-2">
          기준 주
          <select value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-8 rounded-control border border-hairline px-2 text-[13px] text-label">
            {weekCols.map((w) => (
              <option key={w.key} value={w.key}>
                {w.month}월 {w.week}주{w.key === asOfDefault ? ' (이번 주)' : ''}
              </option>
            ))}
          </select>
        </label>
        {Object.keys(over).length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setOver({})} title="고친 숫자를 모두 자동값으로">
            <RotateCcw {...icSm} />
            고친 숫자 {Object.keys(over).length}개 되돌리기
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={() => setPptOpen(true)}>
          <Presentation {...icSm} />
          PPT로 내보내기
        </Button>
      </div>

      {/* 탭: 합산 · 실별 */}
      <div className="mt-4 flex items-end gap-1 shadow-[inset_0_-1px_0_#E3E3E8]">
        {tables.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-[10px] border px-4 py-2 text-[13px] font-semibold ${
              cur.key === t.key ? 'border-separator border-b-white bg-white text-label' : 'border-transparent text-label-2 hover:bg-black/[0.04]'
            }`}
          >
            {t.title}
          </button>
        ))}
      </div>

      <RateTableView
        table={cur}
        numCell={numCell}
        rateCell={rateCell}
        valueOf={valueOf}
        th={th}
        td={td}
        caption={`${asOfLabel} 기준 · 착수 계획 = 회색 S(또는 회색 시작) · 착수 실적 = 분홍 S(또는 분홍 시작) · 완료 계획 = F(또는 회색 끝) · 완료 실적 = 분홍 완 · 회색 계획이 없는 과제는 분홍 실적 시점을 계획으로 봄`}
      />
      {cur.rows.length <= 1 && (
        <p className="mt-6 text-center text-[13px] text-label-3">{cur.key === 'sum' ? '[중점] 구분이 없습니다.' : '셀 과제가 없습니다.'}</p>
      )}

      {menu && (
        <div className="fixed inset-0 z-50" onMouseDown={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))}>
          <div className="mac-pop absolute w-[210px] py-1 text-[13px]" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setList({ title: menu.title, rows: menu.rows })
                setMenu(null)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]"
            >
              <List size={14} className="text-label-2" />
              과제 목록 보기 ({menu.rows.length})
            </button>
            <button
              onClick={() => {
                setEdit({ k: menu.k, text: String(over[menu.k] ?? menu.auto) })
                setMenu(null)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]"
            >
              <span className="w-3.5" />
              숫자 고치기
            </button>
            {over[menu.k] !== undefined && (
              <button
                onClick={() => {
                  const next = { ...over }
                  delete next[menu.k]
                  setOver(next)
                  setMenu(null)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.05]"
              >
                <RotateCcw size={14} className="text-label-2" />
                자동값으로 ({menu.auto})
              </button>
            )}
          </div>
        </div>
      )}

      {list && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={() => setList(null)}>
          <div
            className="max-h-[80vh] w-[min(560px,calc(100vw-2rem))] overflow-auto rounded-[14px] bg-white p-5 shadow-dialog"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-bold text-label">
                {list.title} <span className="text-label-3">{list.rows.length}건</span>
              </h3>
              <button onClick={() => setList(null)} className="rounded-full p-1 text-label-3 hover:bg-black/[0.06]" aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            <ul className="mt-3 divide-y divide-separator text-[13px]">
              {list.rows.map((r) => (
                <li key={r.key} className="py-1.5">
                  <span className="text-label">{r.l3}</span>
                  <span className="ml-2 text-[11.5px] text-label-3">
                    {r.l1} › {r.l2}
                  </span>
                </li>
              ))}
              {list.rows.length === 0 && <li className="py-2 text-label-3">없음</li>}
            </ul>
          </div>
        </div>
      )}

      {pptOpen && (
        <PptPreview title={data.tabTitle.replace(/추진현황/, '진척률')} asOf={asOfLabel} tables={tables} valueOf={valueOf} onClose={() => setPptOpen(false)} />
      )}
    </div>
  )
}

// ---- 표 한 개(화면 · 미리보기 공통)
function RateTableView({
  table,
  numCell,
  rateCell,
  valueOf,
  th,
  td,
  caption,
  compact,
}: {
  table: RateTable
  numCell?: (t: RateTable, r: RateRow, m: Metric) => React.ReactNode
  rateCell: (n: number, d: number, key: string) => React.ReactNode
  valueOf: (t: RateTable, r: RateRow, m: Metric) => number
  th: string
  td: string
  caption?: string
  compact?: boolean
}) {
  const t = table
  const groupSpan = (i: number) => {
    const r = t.rows[i]
    if (!t.groupHead || r.sum) return 0
    if (i > 0 && t.rows[i - 1].group === r.group && !t.rows[i - 1].sum) return -1
    let n = 1
    while (t.rows[i + n] && !t.rows[i + n].sum && t.rows[i + n].group === r.group) n++
    return n
  }
  const plain = (r: RateRow, m: Metric) => (
    <td key={m} className={`${td} ${m === 'startDone' || m === 'endDone' ? 'bg-[#EAD6D4]' : ''} font-semibold`}>
      {valueOf(t, r, m)}
    </td>
  )
  const cell = numCell ?? ((_t: RateTable, r: RateRow, m: Metric) => plain(r, m))
  return (
    <table className={`w-full border-collapse ${compact ? '' : 'mt-3'}`}>
      {caption && <caption className="caption-bottom pt-2 text-left text-[11.5px] text-label-3">{caption}</caption>}
      <thead>
        <tr>
          {t.groupHead && (
            <th rowSpan={2} className={`${th} w-[14%]`}>
              {t.groupHead}
            </th>
          )}
          <th rowSpan={2} className={`${th} ${t.groupHead ? 'w-[28%]' : 'w-[34%]'}`}>
            {t.firstHead}
          </th>
          <th rowSpan={2} className={th}>
            과제
            <br />
            계획
          </th>
          <th colSpan={3} className={th}>
            착수
          </th>
          <th rowSpan={2} className={th}>
            현재
            <br />
            진행중
          </th>
          <th colSpan={3} className={th}>
            완료
          </th>
          {t.general && (
            <th rowSpan={2} className={th}>
              일반업무
              <br />
              실적
            </th>
          )}
        </tr>
        <tr>
          {['계획', '실적', '달성률', '계획', '실적', '진척률'].map((x, i) => (
            <th key={i} className={th}>
              {x}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r, i) => {
          const span = groupSpan(i)
          return (
            <tr key={r.id} className={r.sum ? 'bg-[#D9D9D9] font-bold' : ''}>
              {t.groupHead && span > 0 && (
                <td rowSpan={span} className={`${td} font-semibold`}>
                  {r.group}
                </td>
              )}
              <td className={`${td} ${r.sum ? 'text-center' : 'text-left'} font-semibold`} colSpan={r.sum && t.groupHead ? 2 : 1}>
                {r.label}
              </td>
              {cell(t, r, 'plan')}
              {cell(t, r, 'startPlan')}
              {cell(t, r, 'startDone')}
              {rateCell(valueOf(t, r, 'startDone'), valueOf(t, r, 'startPlan'), 'r1')}
              {cell(t, r, 'doing')}
              {cell(t, r, 'endPlan')}
              {cell(t, r, 'endDone')}
              {rateCell(valueOf(t, r, 'endDone'), valueOf(t, r, 'endPlan'), 'r2')}
              {t.general && cell(t, r, 'general')}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---- PPT 내보내기 미리보기: 탭마다 한 장(16:9). 고른 장만 받는다.
function PptPreview({
  title,
  asOf,
  tables,
  valueOf,
  onClose,
}: {
  title: string
  asOf: string
  tables: RateTable[]
  valueOf: (t: RateTable, r: RateRow, m: Metric) => number
  onClose: () => void
}) {
  const [pick, setPick] = useState<string[]>(() => tables.filter((t) => t.rows.length > 1).map((t) => t.key))
  const [busy, setBusy] = useState(false)
  const th = 'border border-[#9AA0A6] bg-[#C9DAF8] px-1.5 py-1 text-center text-[10px] font-bold text-[#14161A]'
  const td = 'border border-[#C9CDD3] px-1.5 py-1 text-center text-[10.5px] tabular-nums'
  const rateCell = (n: number, d: number, key: string) => (
    <td key={key} className={`${td} font-bold text-[#1155CC]`}>
      {rate(n, d)}
    </td>
  )
  async function download() {
    setBusy(true)
    try {
      await exportRatePpt(
        title,
        asOf,
        tables.filter((t) => pick.includes(t.key)),
        valueOf,
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex h-[min(900px,94vh)] w-[min(1100px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[14px] bg-[#F2F2F7] shadow-dialog">
        <div className="flex items-center gap-3 border-b border-separator bg-white px-5 py-3">
          <Presentation size={18} className="text-accent" />
          <h3 className="text-[15px] font-bold text-label">PPT로 내보내기 · 미리보기</h3>
          <span className="text-[12px] text-label-3">
            {pick.length}장 · 탭마다 한 장(16:9) · {asOf} 기준
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void download()} disabled={busy || pick.length === 0}>
              <Download {...icSm} />
              {busy ? '만드는 중…' : 'PPT 받기'}
            </Button>
            <button onClick={onClose} className="rounded-full p-1.5 text-label-3 hover:bg-black/[0.06]" aria-label="닫기">
              <X size={16} />
            </button>
          </span>
        </div>
        <div className="flex-1 space-y-5 overflow-auto p-6">
          {tables.map((t, i) => {
            const on = pick.includes(t.key)
            return (
              <div key={t.key} className="mx-auto max-w-[880px]">
                <label className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-label-2">
                  <input type="checkbox" checked={on} onChange={() => setPick(on ? pick.filter((k) => k !== t.key) : [...pick, t.key])} />
                  {i + 1}. {t.title}
                  {t.rows.length <= 1 && <span className="font-normal text-label-3">(빈 표)</span>}
                </label>
                <div
                  className={`relative aspect-[16/9] w-full overflow-hidden rounded-[6px] bg-white shadow-sm ring-1 ring-black/10 ${on ? '' : 'opacity-40'}`}
                >
                  <div className="absolute inset-0 flex flex-col px-[4.5%] pb-[3%] pt-[3.5%]">
                    <p className="text-[18px] font-bold text-[#14161A]">
                      {title} <span className="text-[#5F6368]">· {t.title}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#5F6368]">{asOf} 기준</p>
                    <div className="mt-3 min-h-0 flex-1 overflow-hidden">
                      <RateTableView table={t} rateCell={rateCell} valueOf={valueOf} th={th} td={td} compact />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// pptxgenjs로 받기: 탭마다 한 장, 표는 시트 모양(머리글 연한 파랑 · 실적 칸 연한 분홍 · 비율 파랑 굵게 · 합계 회색)
async function exportRatePpt(title: string, asOf: string, tables: RateTable[], valueOf: (t: RateTable, r: RateRow, m: Metric) => number) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 in
  const FONT = 'Malgun Gothic'
  const head = { bold: true, fill: { color: 'C9DAF8' }, align: 'center' as const, valign: 'middle' as const, fontFace: FONT, fontSize: 10, color: '14161A' }
  for (const t of tables) {
    const s = pptx.addSlide()
    s.addText(
      [
        { text: title, options: { bold: true, fontSize: 20, color: '14161A' } },
        { text: `  · ${t.title}`, options: { fontSize: 20, color: '5F6368' } },
      ],
      { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontFace: FONT },
    )
    s.addText(`${asOf} 기준`, { x: 0.5, y: 0.85, w: 12.3, h: 0.3, fontFace: FONT, fontSize: 10, color: '5F6368' })
    type Cell = { text: string; options?: Record<string, unknown> }
    const hc = (text: string, extra: Record<string, unknown> = {}): Cell => ({ text, options: { ...head, ...extra } })
    const row1: Cell[] = [
      ...(t.groupHead ? [hc(t.groupHead, { rowspan: 2 })] : []),
      hc(t.firstHead, { rowspan: 2 }),
      hc('과제\n계획', { rowspan: 2 }),
      hc('착수', { colspan: 3 }),
      hc('현재\n진행중', { rowspan: 2 }),
      hc('완료', { colspan: 3 }),
      ...(t.general ? [hc('일반업무\n실적', { rowspan: 2 })] : []),
    ]
    const row2: Cell[] = ['계획', '실적', '달성률', '계획', '실적', '진척률'].map((x) => hc(x))
    const body: Cell[][] = []
    t.rows.forEach((r, i) => {
      const base = {
        fontFace: FONT,
        fontSize: 10,
        valign: 'middle' as const,
        align: 'center' as const,
        bold: true,
        color: '14161A',
        ...(r.sum ? { fill: { color: 'D9D9D9' } } : {}),
      }
      const n = (m: Metric) => ({
        text: String(valueOf(t, r, m)),
        options: { ...base, ...(m === 'startDone' || m === 'endDone' ? { fill: { color: r.sum ? 'D9D9D9' : 'EAD6D4' } } : {}) },
      })
      const pc = (a: number, b: number) => ({ text: rate(a, b), options: { ...base, color: '1155CC' } })
      const line: Cell[] = []
      if (t.groupHead) {
        if (r.sum) line.push({ text: r.label, options: { ...base, colspan: 2 } })
        else {
          const prev = t.rows[i - 1]
          if (!prev || prev.sum || prev.group !== r.group) {
            let span = 1
            while (t.rows[i + span] && !t.rows[i + span].sum && t.rows[i + span].group === r.group) span++
            line.push({ text: r.group ?? '', options: { ...base, rowspan: span } })
          }
          line.push({ text: r.label, options: { ...base, align: 'left' } })
        }
      } else line.push({ text: r.label, options: { ...base, align: r.sum ? 'center' : 'left' } })
      line.push(
        n('plan'),
        n('startPlan'),
        n('startDone'),
        pc(valueOf(t, r, 'startDone'), valueOf(t, r, 'startPlan')),
        n('doing'),
        n('endPlan'),
        n('endDone'),
        pc(valueOf(t, r, 'endDone'), valueOf(t, r, 'endPlan')),
      )
      if (t.general) line.push(n('general'))
      body.push(line)
    })
    const numCols = 8 + (t.general ? 1 : 0)
    const firstW = t.groupHead ? [1.6, 3.4] : [4.6]
    const rest = (12.3 - firstW.reduce((a, b) => a + b, 0)) / numCols
    s.addTable([row1, row2, ...body] as never, {
      x: 0.5,
      y: 1.3,
      w: 12.3,
      colW: [...firstW, ...Array(numCols).fill(rest)],
      border: { type: 'solid', pt: 0.75, color: '9AA0A6' },
      rowH: Math.min(0.45, 5.6 / (t.rows.length + 2)),
      autoPage: true,
    })
  }
  await pptx.writeFile({ fileName: `${title}.pptx` })
}

// 추진현황 일정표 -- 첨부된 "일정표 빌더"의 표 모양(검은 머리 띠 · 월/주 칸 · 구분 병합 · 현재 선)을 따르고,
// 주차 칸은 시트와 똑같이 칠한다: 회색 = 계획, 분홍 = 실적, 글자 S / F / 완.
// 입력 중에는 고른 도구로 칸을 누르거나 한 줄 안에서 끌어 칠한다.
import { Fragment, useEffect, useRef, useState } from 'react'
import type { WeekColumn } from '../../types'
import type { CellState, FieldDef, ProgressRow } from '../../utils/progressBoard'
import { FILL_HEX } from '../../utils/progressBoard'

export interface ScheduleRowView {
  row: ProgressRow
  cells: Record<string, CellState>
  vals: Record<string, string> // 고친 값을 얹은 열 값(name, status, assignees, category, note …)
  editedCells: Set<string>
  editedFields: Set<string>
}

const STATUS_TONE: Record<string, string> = {
  진행중: 'bg-accent-soft text-accent',
  완료: 'bg-emerald-100 text-emerald-800',
  보류: 'bg-red-100 text-red-700',
  중단: 'bg-red-100 text-red-700',
}

// 열 종류별 기본 폭(px, 글자 13px 기준)
const FIELD_WIDTH: Record<FieldDef['kind'], number> = { memo: 200, date: 96, select: 78, person: 110, link: 130, text: 100 }

// 시트 칸 하나 -- 누르면 그 자리에서 입력(Enter/바깥 누르면 반영, Esc 취소).
function FieldCell({ f, value, edited, fontSize, onCommit }: { f: FieldDef; value: string; edited: boolean; fontSize: number; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)
  function start() {
    setDraft(value)
    cancelled.current = false
    setEditing(true)
  }
  function finish() {
    setEditing(false)
    if (!cancelled.current && draft !== value) onCommit(draft)
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelled.current = true
      ;(e.target as HTMLElement).blur()
    }
    if (e.key === 'Enter' && (f.kind !== 'memo' || e.metaKey || e.ctrlKey)) (e.target as HTMLElement).blur()
  }
  const inputCls = 'absolute inset-0 z-30 h-full w-full border-2 border-accent bg-white px-1.5 text-[1em] text-label outline-none'
  let display: React.ReactNode = value
  if (f.id === 'status' && value) display = <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.85em] font-semibold ${STATUS_TONE[value] ?? 'bg-black/[0.05] text-label-2'}`}>{value}</span>
  else if (f.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) display = value.slice(2).replace(/-/g, '.')
  return (
    <td
      onClick={editing ? undefined : start}
      title={value ? `${f.label}: ${value}` : `${f.label} · 눌러서 입력`}
      className="relative cursor-text border-b border-l border-dotted border-b-[#C9CDD3] border-l-[#D6DAE0] px-1.5 py-1 align-middle text-[0.92em] text-label hover:bg-accent/[0.06]"
    >
      <div className={`${f.kind === 'memo' ? 'line-clamp-2 whitespace-pre-line' : 'truncate'} break-all`}>{display}</div>
      {edited && <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
      {editing &&
        (f.kind === 'memo' ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={keys}
            placeholder="⌘/Ctrl+Enter로 반영"
            className="absolute left-0 top-0 z-30 rounded-control border-2 border-accent bg-white p-1.5 text-[1em] text-label shadow-dialog outline-none"
            style={{ width: Math.max(260, (FIELD_WIDTH.memo * fontSize) / 13), height: fontSize * 9 }}
          />
        ) : f.kind === 'date' ? (
          <input
            autoFocus
            type="date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(draft) ? draft : ''}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={keys}
            className={inputCls}
          />
        ) : (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={finish} onKeyDown={keys} list={`pb-opts-${f.id}`} className={inputCls} />
        ))}
    </td>
  )
}

export function cellLabel(c: CellState | undefined): string {
  if (!c) return ''
  if (c.m === 'S') return c.f === 'actual' ? '착수' : '착수 계획'
  if (c.m === 'F') return '완료 계획'
  if (c.m === '완') return '완료'
  return c.f === 'plan' ? '계획 기간' : c.f === 'actual' ? '진행 기간' : ''
}

export function CellSwatch({ cell, size = 18 }: { cell: CellState; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] border border-black/10 text-[10px] font-bold text-[#14161A]"
      style={{ width: size, height: size, background: cell.f ? `#${FILL_HEX[cell.f]}` : '#FFFFFF' }}
    >
      {cell.m}
    </span>
  )
}

export default function ScheduleTable({
  weekCols,
  rows,
  editing,
  currentKey,
  onPaint,
  onField,
  onOpenRow,
  onAddRow,
  fontSize = 13,
  fields = [],
  optionsOf,
}: {
  weekCols: WeekColumn[]
  rows: ScheduleRowView[]
  editing: boolean
  currentKey: string | null
  onPaint: (row: ProgressRow, weekKey: string) => void
  onField: (row: ProgressRow, id: string, value: string) => void
  onOpenRow: (row: ProgressRow) => void
  onAddRow?: (l2: string) => void
  fontSize?: number
  fields?: FieldDef[] // L3 오른쪽 시트 열(속성·분류·상태…) -- 표에 그대로 펼친다
  optionsOf?: (f: FieldDef) => string[]
}) {
  const cols = fields.filter((f) => f.id !== 'name')
  const colW = (f: FieldDef) => Math.round((FIELD_WIDTH[f.kind] * fontSize) / 13)
  const col1 = Math.round(fontSize * 11.5) // 구분 열 폭(항목 열이 이만큼 왼쪽에 붙는다)
  const months = Array.from(new Set(weekCols.map((w) => w.month)))
  const curIdx = currentKey ? weekCols.findIndex((w) => w.key === currentKey) : -1
  const monthStart = new Set(months.map((m) => weekCols.find((w) => w.month === m)!.key))
  // 끌어 칠하기: 누른 줄 안에서만 칠한다.
  const dragRow = useRef<string | null>(null)
  useEffect(() => {
    const up = () => (dragRow.current = null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // 같은 L2끼리 묶어 "구분" 칸을 합친다(시트 순서 그대로).
  const groups: { l2: string; tag: string | null; rows: ScheduleRowView[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.l2 === r.row.l2) last.rows.push(r)
    else groups.push({ l2: r.row.l2, tag: r.row.l2Tag, rows: [r] })
  }

  return (
    <table className="w-full table-fixed border-collapse select-none" style={{ minWidth: col1 + fontSize * 20 + weekCols.length * 24 + cols.reduce((n, f) => n + colW(f), 0), fontSize }}>
      <colgroup>
        <col style={{ width: col1 }} />
        <col style={{ width: Math.round(fontSize * 20) }} />
        {weekCols.map((w) => (
          <col key={w.key} />
        ))}
        {cols.map((f) => (
          <col key={f.id} style={{ width: colW(f) }} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10">
        <tr className="bg-[#14161A] text-white">
          <th rowSpan={2} className="sticky left-0 z-20 bg-[#14161A] px-2 py-2 text-[1em] font-bold">
            구분
          </th>
          <th rowSpan={2} style={{ left: col1 }} className="sticky z-20 bg-[#14161A] px-2 py-2 text-[1em] font-bold">
            항목
          </th>
          {months.map((m) => (
            <th key={m} colSpan={weekCols.filter((w) => w.month === m).length} className="border-l border-white/25 pb-0.5 pt-2 text-[1em] font-bold">
              {m}월
            </th>
          ))}
          {cols.map((f) => (
            <th key={f.id} rowSpan={2} className="border-l border-white/25 px-1.5 py-2 text-[0.92em] font-bold" title={f.label}>
              <span className="line-clamp-2 break-keep">{f.label}</span>
            </th>
          ))}
        </tr>
        <tr className="bg-[#14161A] text-[#9AA1AC]">
          {weekCols.map((w, i) => (
            <th key={w.key} className={`pb-1.5 text-[0.85em] font-medium ${monthStart.has(w.key) ? 'border-l border-white/25' : ''} ${i === curIdx ? 'text-[#FF6F63]' : ''}`}>
              {i === curIdx ? '▼' : w.week}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((g, gi) => (
          <Fragment key={`${g.l2}-${gi}`}>
            {g.rows.map((v, ri) => {
              const zebra = gi % 2 === 0 ? 'bg-[#F4F5F7]' : 'bg-white'
              return (
                <tr key={v.row.key} className={zebra} style={{ height: Math.round(fontSize * 3.4) }}>
                  {ri === 0 && (
                    <td
                      rowSpan={g.rows.length}
                      className={`sticky left-0 z-[5] border-b border-r border-[#C9CDD3] px-2 py-2 text-center align-top text-[1em] font-bold text-label ${zebra}`}
                    >
                      {/* 줄이 많은 L2도 이름이 보이도록 위에 붙이고, 스크롤해도 머리 띠 아래에 머문다. */}
                      <div className="sticky py-1" style={{ top: Math.round(fontSize * 4.8) }}>
                        <span className="whitespace-pre-line break-keep">{g.l2}</span>
                        {g.tag && <span className="mt-1 block text-[0.85em] font-semibold text-[#E8342A]">[{g.tag}]</span>}
                        <span className="mt-1 block text-[0.85em] font-medium text-label-3">{g.rows.length}건</span>
                        {onAddRow && (
                          <button onClick={() => onAddRow(g.l2)} className="mt-1.5 text-[0.85em] font-semibold text-accent hover:underline" title="이 L2에 과제(L3) 추가">
                            + 추가
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                  <td style={{ left: col1 }} className={`sticky z-[5] border-b border-r border-dotted border-b-[#C9CDD3] border-r-[#C9CDD3] px-2.5 py-1.5 ${zebra}`}>
                    <button onClick={() => onOpenRow(v.row)} className="flex w-full min-w-0 items-center gap-1 text-left" title={`${v.vals.name || '(이름 없음)'} · 눌러서 모든 항목 보기·입력`}>
                      {v.row.isNew && <span className="shrink-0 rounded-[3px] bg-accent px-1 text-[0.77em] font-bold text-white">새 과제</span>}
                      <span className={`truncate font-semibold hover:text-accent hover:underline ${v.vals.name ? 'text-label' : 'text-label-3'}`}>{v.vals.name || '(이름을 입력하세요)'}</span>
                      {(v.editedFields.size > 0 || v.row.isNew) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                    </button>
                  </td>
                  {weekCols.map((w, i) => {
                    const c = v.cells[w.key]
                    const edited = v.editedCells.has(w.key)
                    return (
                      <td
                        key={w.key}
                        onMouseDown={
                          editing
                            ? (e) => {
                                e.preventDefault()
                                dragRow.current = v.row.key
                                onPaint(v.row, w.key)
                              }
                            : undefined
                        }
                        onMouseEnter={editing ? () => dragRow.current === v.row.key && onPaint(v.row, w.key) : undefined}
                        title={`${w.month}월 ${w.week}주${c ? ` · ${cellLabel(c)}` : ''}${edited ? ' · 이 화면에서 고침(아직 시트에 저장 안 됨)' : ''}`}
                        style={c?.f ? { background: `#${FILL_HEX[c.f]}` } : undefined}
                        className={`relative border-b border-dotted border-b-[#C9CDD3] p-0 text-center text-[0.92em] font-bold text-[#14161A] ${
                          monthStart.has(w.key) ? 'border-l border-l-[#A6A6A6]' : 'border-l border-l-[#E5E7EB]'
                        } ${editing ? 'cursor-crosshair hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-accent' : ''}`}
                      >
                        {i === curIdx && <span className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-[#E8342A]/70" />}
                        <span className="relative">{c?.m}</span>
                        {edited && <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
                      </td>
                    )
                  })}
                  {cols.map((f) => (
                    <FieldCell
                      key={f.id}
                      f={f}
                      value={v.vals[f.id] ?? ''}
                      edited={v.editedFields.has(f.id) || (!!v.row.isNew && !!v.vals[f.id])}
                      fontSize={fontSize}
                      onCommit={(val) => onField(v.row, f.id, val)}
                    />
                  ))}
                </tr>
              )
            })}
          </Fragment>
        ))}
      </tbody>
      {/* 입력 칸 제안값(시트에 이미 있는 값) */}
      {optionsOf &&
        cols.map((f) => {
          const opts = optionsOf(f)
          return opts.length ? (
            <datalist key={f.id} id={`pb-opts-${f.id}`}>
              {opts.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          ) : null
        })}
    </table>
  )
}

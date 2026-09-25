// 추진현황 일정표 -- 첨부된 "일정표 빌더"의 표 모양(검은 머리 띠 · 월/주 칸 · 구분 병합 · 현재 선)을 따르고,
// 주차 칸은 시트와 똑같이 칠한다: 회색 = 계획, 분홍 = 실적, 글자 S / F / 완.
// 입력 중에는 고른 도구로 칸을 누르거나 한 줄 안에서 끌어 칠한다.
import { Fragment, useEffect, useRef } from 'react'
import type { WeekColumn } from '../../types'
import type { CellState, ProgressRow } from '../../utils/progressBoard'
import { FILL_HEX } from '../../utils/progressBoard'

export interface ScheduleRowView {
  row: ProgressRow
  cells: Record<string, CellState>
  status: string
  editedCells: Set<string>
  statusEdited: boolean
}

const STATUS_TONE: Record<string, string> = {
  진행중: 'bg-accent-soft text-accent',
  완료: 'bg-emerald-100 text-emerald-800',
  보류: 'bg-red-100 text-red-700',
  중단: 'bg-red-100 text-red-700',
}
export const STATUS_CHOICES = ['진행중', '완료', '보류', '-']

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
  onStatus,
}: {
  weekCols: WeekColumn[]
  rows: ScheduleRowView[]
  editing: boolean
  currentKey: string | null
  onPaint: (row: ProgressRow, weekKey: string) => void
  onStatus: (row: ProgressRow, status: string) => void
}) {
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
    <table className="w-full table-fixed border-collapse select-none text-[13px]" style={{ minWidth: 560 + weekCols.length * 24 }}>
      <colgroup>
        <col style={{ width: 150 }} />
        <col style={{ width: 260 }} />
        {weekCols.map((w) => (
          <col key={w.key} />
        ))}
        <col style={{ width: 150 }} />
      </colgroup>
      <thead className="sticky top-0 z-10">
        <tr className="bg-[#14161A] text-white">
          <th rowSpan={2} className="sticky left-0 z-20 bg-[#14161A] px-2 py-2 text-[13px] font-bold">
            구분
          </th>
          <th rowSpan={2} className="sticky left-[150px] z-20 bg-[#14161A] px-2 py-2 text-[13px] font-bold">
            항목
          </th>
          {months.map((m) => (
            <th key={m} colSpan={weekCols.filter((w) => w.month === m).length} className="border-l border-white/25 pb-0.5 pt-2 text-[13px] font-bold">
              {m}월
            </th>
          ))}
          <th rowSpan={2} className="border-l border-white/25 px-2 py-2 text-[13px] font-bold">
            상태 / 비고
          </th>
        </tr>
        <tr className="bg-[#14161A] text-[#9AA1AC]">
          {weekCols.map((w, i) => (
            <th key={w.key} className={`pb-1.5 text-[11px] font-medium ${monthStart.has(w.key) ? 'border-l border-white/25' : ''} ${i === curIdx ? 'text-[#FF6F63]' : ''}`}>
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
              const assignees = v.row.values.assignees ?? ''
              const category = v.row.values.category ?? ''
              const note = v.row.values.note ?? ''
              return (
                <tr key={v.row.key} className={`${zebra} h-11`}>
                  {ri === 0 && (
                    <td
                      rowSpan={g.rows.length}
                      className={`sticky left-0 z-[5] border-b border-r border-[#C9CDD3] px-2 py-2 text-center align-top text-[13px] font-bold text-label ${zebra}`}
                    >
                      {/* 줄이 많은 L2도 이름이 보이도록 위에 붙이고, 스크롤해도 머리 띠 아래에 머문다. */}
                      <div className="sticky top-[64px] py-1">
                        <span className="whitespace-pre-line break-keep">{g.l2}</span>
                        {g.tag && <span className="mt-1 block text-[11px] font-semibold text-[#E8342A]">[{g.tag}]</span>}
                        <span className="mt-1 block text-[11px] font-medium text-label-3">{g.rows.length}건</span>
                      </div>
                    </td>
                  )}
                  <td className={`sticky left-[150px] z-[5] border-b border-r border-dotted border-b-[#C9CDD3] border-r-[#C9CDD3] px-2.5 py-1.5 ${zebra}`}>
                    <p className="truncate font-semibold text-label" title={v.row.l3}>
                      {v.row.l3}
                    </p>
                    {(assignees || category) && (
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-label-3">
                        {category && <span className="rounded-[3px] bg-black/[0.06] px-1 text-label-2">{category}</span>}
                        <span className="truncate">{assignees}</span>
                      </p>
                    )}
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
                        className={`relative border-b border-dotted border-b-[#C9CDD3] p-0 text-center text-[12px] font-bold text-[#14161A] ${
                          monthStart.has(w.key) ? 'border-l border-l-[#A6A6A6]' : 'border-l border-l-[#E5E7EB]'
                        } ${editing ? 'cursor-crosshair hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-accent' : ''}`}
                      >
                        {i === curIdx && <span className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-[#E8342A]/70" />}
                        <span className="relative">{c?.m}</span>
                        {edited && <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
                      </td>
                    )
                  })}
                  <td className="border-b border-l border-dotted border-b-[#C9CDD3] border-l-[#A6A6A6] px-2 py-1">
                    {editing ? (
                      <select
                        value={v.status}
                        onChange={(e) => onStatus(v.row, e.target.value)}
                        className={`h-6 rounded-full border-0 px-2 text-[11px] font-semibold ${STATUS_TONE[v.status] ?? 'bg-black/[0.05] text-label-2'} ${
                          v.statusEdited ? 'ring-2 ring-orange-400' : ''
                        }`}
                      >
                        {!STATUS_CHOICES.includes(v.status) && <option value={v.status}>{v.status || '(빈칸)'}</option>}
                        {STATUS_CHOICES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      v.status && (
                        <span
                          className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold ${STATUS_TONE[v.status] ?? 'bg-black/[0.05] text-label-2'} ${
                            v.statusEdited ? 'ring-2 ring-orange-400' : ''
                          }`}
                        >
                          {v.status}
                        </span>
                      )
                    )}
                    {note && (
                      <p className="mt-0.5 truncate text-[11px] text-label-3" title={note}>
                        {note}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

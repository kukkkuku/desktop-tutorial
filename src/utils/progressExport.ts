// 과제 입력 › 추진현황을 엑셀(.xlsx)로 받기 -- 구글시트 탭 모양 그대로(H · L1 · L2 · L3 · 주차 칸 · 입력 열),
// 이 화면에서 고친 값(아직 시트에 저장 안 한 것 포함)을 얹고, 삭제로 표시한 과제는 뺀다.
// 머리글 색 · 칸 색(계획 회색/실적 분홍 · 칸 강조) · 칸 메모 · 병합(구분 이름)까지 옮긴다.
import ExcelJS from 'exceljs'
import { downloadStyledWorkbook } from './excel'
import { parseFmt } from './sheetSources'
import {
  effectiveBg,
  effectiveFmt,
  effectiveCells,
  effectiveField,
  effectiveNote,
  FILL_HEX,
  NO_L1,
  orderWithNewRows,
  type Drafts,
  type Level,
  type ProgressData,
  type ProgressRow,
} from './progressBoard'

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
}
const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } })

// 화면 순서 그대로의 행(모든 L1, 새 과제 포함, 삭제 표시 뺌)
export function exportRows(data: ProgressData, drafts: Drafts, l1s: string[]): ProgressRow[] {
  const deleted = new Set(drafts.deleted ?? [])
  return l1s.flatMap((l1) =>
    orderWithNewRows(
      data.rows.filter((r) => r.l1 === l1),
      drafts.newRows.filter((n) => n.l1 === l1),
      drafts.moves,
    ).filter((r) => !deleted.has(r.key)),
  )
}

export function buildProgressWorkbook(data: ProgressData, drafts: Drafts, l1s: string[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet((data.tabTitle || '추진현황').slice(0, 31))
  const hs = data.headerStyle
  const lv = data.levelCols ?? {}
  const nameField = data.fields.find((f) => f.id === 'name')
  const cols = data.fields.filter((f) => f.id !== 'name')

  // 시트 열 순서를 지키되 쓰지 않는 열은 뺀다.
  type Col =
    | { src: number; kind: 'level'; level: Level }
    | { src: number; kind: 'name' }
    | { src: number; kind: 'week'; key: string }
    | { src: number; kind: 'field'; id: string }
  const all: Col[] = [
    ...(Object.entries(lv) as [Level, number][]).map(([level, src]) => ({ src, kind: 'level' as const, level })),
    { src: nameField?.col ?? (lv.l2 ?? 0) + 1, kind: 'name' as const },
    ...data.weekCols.map((w) => ({ src: w.col, kind: 'week' as const, key: w.key })),
    ...cols.map((f) => ({ src: f.col, kind: 'field' as const, id: f.id })),
  ].sort((a, b) => a.src - b.src)
  const at = (i: number) => i + 1 // 엑셀 열 번호(1부터)

  // ---- 머리글 두 줄 ----
  const groupOf = new Map((hs?.groups ?? []).flatMap((g) => g.fieldIds.map((id) => [id, g] as const)))
  const head = (r: number, c: number, text: string, hex: string | null | undefined, dark = false) => {
    const cell = ws.getCell(r, c)
    cell.value = text
    cell.font = { bold: true, size: 10, color: { argb: dark ? 'FFFFFFFF' : 'FF14161A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.fill = fill(dark ? '14161A' : (hex ?? 'FFFFFF'))
    cell.border = BORDER
  }
  const levelLabel: Record<Level, string> = { h: 'H', l1: 'L1', l2: 'L2' }
  all.forEach((c, i) => {
    const x = at(i)
    if (c.kind === 'level' || c.kind === 'name') {
      head(1, x, c.kind === 'name' ? 'L3' : levelLabel[c.level], null, true)
      head(2, x, '', null, true)
      ws.mergeCells(1, x, 2, x)
    } else if (c.kind === 'week') {
      const w = data.weekCols.find((y) => y.key === c.key)!
      head(2, x, String(w.week), hs?.weeks[c.key] ?? 'E4E6EA')
      const first = data.weekCols.find((y) => y.month === w.month)!
      if (first.key === c.key) {
        const last = [...data.weekCols].reverse().find((y) => y.month === w.month)!
        const lastIdx = all.findIndex((y) => y.kind === 'week' && y.key === last.key)
        head(1, x, `${w.month}월`, hs?.months[w.month] ?? 'E4E6EA')
        if (lastIdx > i) ws.mergeCells(1, x, 1, at(lastIdx))
      }
    } else {
      const f = cols.find((y) => y.id === c.id)!
      const g = groupOf.get(f.id)
      if (g) {
        head(2, x, f.label, hs?.fields[f.id])
        if (g.fieldIds[0] === f.id) {
          const lastIdx = all.findIndex((y) => y.kind === 'field' && y.id === g.fieldIds[g.fieldIds.length - 1])
          head(1, x, g.label, g.bg)
          if (lastIdx > i) ws.mergeCells(1, x, 1, at(lastIdx))
        }
      } else {
        head(1, x, f.label, hs?.fields[f.id])
        head(2, x, '', hs?.fields[f.id])
        ws.mergeCells(1, x, 2, x)
      }
    }
  })

  // ---- 과제 줄 ----
  const rows = exportRows(data, drafts, l1s)
  const fieldById = new Map(cols.map((f) => [f.id, f]))
  const chain = (r: ProgressRow, l: Level) =>
    l === 'h' ? `${r.h ?? ''}` : l === 'l1' ? `${r.h ?? ''}␟${r.l1}` : `${r.h ?? ''}␟${r.l1}␟${r.l2}␟${r.l2Tag ?? ''}`
  const labelOf = (r: ProgressRow, l: Level) =>
    r.labels?.[l] ?? (l === 'h' ? (r.h ?? '') : l === 'l1' ? (r.l1 === NO_L1 ? '' : r.l1) : r.l2Tag ? `${r.l2} [${r.l2Tag}]` : r.l2)
  const spanStart: Record<string, number> = {}
  rows.forEach((row, ri) => {
    const y = ri + 3
    const e = row.isNew ? undefined : drafts.edits[row.key]
    const cells = effectiveCells(row, e)
    all.forEach((c, i) => {
      const cell = ws.getCell(y, at(i))
      cell.border = BORDER
      cell.alignment = { vertical: 'middle', wrapText: c.kind !== 'week', horizontal: c.kind === 'week' ? 'center' : undefined }
      cell.font = { size: 10 }
      if (c.kind === 'level') {
        const prev = rows[ri - 1]
        if (!prev || chain(prev, c.level) !== chain(row, c.level)) {
          cell.value = labelOf(row, c.level)
          cell.font = { size: 10, bold: true }
          cell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
          spanStart[`${i}`] = y
        }
        const next = rows[ri + 1]
        if ((!next || chain(next, c.level) !== chain(row, c.level)) && spanStart[`${i}`] < y) ws.mergeCells(spanStart[`${i}`], at(i), y, at(i))
        return
      }
      const key = c.kind === 'name' ? 'name' : c.kind === 'week' ? c.key : c.id
      if (c.kind === 'week') {
        const s = cells[c.key]
        if (s?.m) cell.value = s.m
        if (s?.f) cell.fill = fill(FILL_HEX[s.f])
        cell.font = { size: 9, bold: true }
      } else {
        const v = effectiveField(row, e, key)
        const f = fieldById.get(key)
        const d = f?.kind === 'date' ? v.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null
        if (d) {
          cell.value = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]))
          cell.numFmt = 'mm.dd'
        } else if (v) cell.value = v
        if (c.kind === 'name') cell.font = { size: 10, bold: true }
        const bg = effectiveBg(row, e, key)
        if (bg) cell.fill = fill(bg)
        const fm = parseFmt(effectiveFmt(row, e, key))
        if (fm.b || fm.c || fm.s)
          cell.font = {
            ...(cell.font ?? {}),
            ...(fm.b ? { bold: true } : {}),
            ...(fm.c ? { color: { argb: `FF${fm.c}` } } : {}),
            ...(fm.s ? { size: fm.s } : {}),
          }
        if (fm.a) cell.alignment = { ...(cell.alignment ?? {}), horizontal: fm.a }
      }
      const note = effectiveNote(row, e, key)
      if (note) cell.note = note
    })
  })

  // ---- 폭 · 틀 고정 ----
  all.forEach((c, i) => {
    const col = ws.getColumn(at(i))
    if (c.kind === 'week') col.width = 3.2
    else if (c.kind === 'name') col.width = 42
    else if (c.kind === 'level') col.width = c.level === 'l2' ? 18 : 12
    else col.width = fieldById.get(c.id)?.kind === 'memo' ? 26 : 12
  })
  const nameIdx = all.findIndex((c) => c.kind === 'name')
  ws.views = [{ state: 'frozen', xSplit: at(nameIdx), ySplit: 2 }]
  return wb
}

export async function downloadProgressExcel(data: ProgressData, drafts: Drafts, l1s: string[]) {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const base = [data.fileTitle, data.tabTitle].filter(Boolean).join(' ') || '추진현황'
  return downloadStyledWorkbook(buildProgressWorkbook(data, drafts, l1s), `${base}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.xlsx`)
}

// 과제 입력 › 추진현황을 엑셀(.xlsx)로 받기 -- 구글시트 탭 모양 그대로(H · L1 · L2 · L3 · 주차 칸 · 입력 열),
// 이 화면에서 고친 값(아직 시트에 저장 안 한 것 포함)을 얹고, 삭제로 표시한 과제는 뺀다.
// 머리글 색 · 칸 색(계획 회색/실적 분홍 · 칸 강조) · 칸 메모 · 병합(구분 이름)까지 옮긴다.
import ExcelJS from 'exceljs'
import { downloadStyledWorkbook } from './excel'
import { parseFmt } from './sheetSources'
import {
  applyL2Renames,
  effectiveBg,
  effectiveFmt,
  effectiveMerges,
  effectiveFields,
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

// 기존 추진현황 시트의 기본 모양(운영 시트에서 확인): 맑은 고딕 8pt, 머리글 굵게 · 연한 파랑, 가는 검은 테두리,
// 본문 줄 높이 19.5pt, 둘째 머리글 줄 20.25pt, 주 칸 폭 1.86, 눈금선 숨김
export const SHEET_FONT = 'Malgun Gothic'
export const SHEET_SIZE = 8
const HEAD_FILL = 'CFE2F3'
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
}
const font = (more: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: SHEET_FONT, size: SHEET_SIZE, ...more })
// 열 폭(엑셀 단위): 시트 머리글 이름별 -- 모르는 열은 11.57
export const FIELD_WIDTH: Record<string, number> = {
  속성: 9.71,
  분류: 7.29,
  상태: 7.29,
  수요부서: 15.29,
  담당팀: 14.43,
  담당자: 15.43,
  '내/외': 7.29,
  완료요청: 8.71,
  '디자인접수/start': 25.86,
  디자인개발: 43,
  디자인이관: 25.86,
  완료일: 8.71,
  'DB 업로드': 7.29,
  비고: 47.57,
  'URL, LINK': 71.57,
}
export function fieldWidth(label: string, kind?: string): number {
  const l = label.replace(/\s+/g, ' ').trim()
  return FIELD_WIDTH[l] ?? FIELD_WIDTH[l.replace(/\s/g, '')] ?? (kind === 'memo' ? 25.86 : 11.57)
}
export const LEVEL_WIDTH: Record<Level, number> = { h: 13.71, l1: 20.14, l2: 14.43 }
const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } })

// 화면 순서 그대로의 행(모든 L1, 새 과제 포함, 삭제 표시 뺌)
export function exportRows(data: ProgressData, drafts: Drafts, l1s: string[]): ProgressRow[] {
  const deleted = new Set(drafts.deleted ?? [])
  return l1s.flatMap((l1) =>
    applyL2Renames(
      orderWithNewRows(
        data.rows.filter((r) => r.l1 === l1),
        drafts.newRows.filter((n) => n.l1 === l1),
        drafts.moves,
      ).filter((r) => !deleted.has(r.key)),
      drafts,
    ),
  )
}

export function buildProgressWorkbook(data0: ProgressData, drafts: Drafts, l1s: string[]): ExcelJS.Workbook {
  // 새 열 · 지운 열을 얹은 입력 열로
  const eff = effectiveFields(data0.fields, data0.headerStyle, drafts)
  const data: ProgressData = { ...data0, fields: eff.fields, headerStyle: eff.headerStyle }
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
    cell.font = font({ bold: true, color: { argb: 'FF000000' } })
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.fill = fill(dark ? HEAD_FILL : (hex ?? HEAD_FILL))
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
      head(2, x, String(w.week), hs?.weeks[c.key] ?? HEAD_FILL)
      const first = data.weekCols.find((y) => y.month === w.month)!
      if (first.key === c.key) {
        const last = [...data.weekCols].reverse().find((y) => y.month === w.month)!
        const lastIdx = all.findIndex((y) => y.kind === 'week' && y.key === last.key)
        head(1, x, `${w.month}월`, hs?.months[w.month] ?? HEAD_FILL)
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
      // 시트처럼: 주 · 일반 입력 열은 가운데, 긴 글(메모 · 링크) 열은 왼쪽, L3는 굵게 왼쪽
      const long = c.kind === 'field' && (fieldById.get(c.id)?.kind === 'memo' || fieldById.get(c.id)?.kind === 'link')
      cell.alignment = {
        vertical: 'middle',
        horizontal: c.kind === 'name' || long ? 'left' : 'center',
        wrapText: c.kind === 'field' && (long || c.id === 'assignees'),
      }
      cell.font = font()
      if (c.kind === 'level') {
        const prev = rows[ri - 1]
        if (!prev || chain(prev, c.level) !== chain(row, c.level)) {
          cell.value = labelOf(row, c.level)
          cell.font = font({ bold: c.level === 'l2' })
          if (c.level === 'l2') {
            // 구분(L2) 칸 색 · 서식
            const e2 = row.isNew ? undefined : drafts.edits[row.key]
            const hex = effectiveBg(row, e2, 'lvl:l2')
            if (hex) cell.fill = fill(hex)
            const fm = parseFmt(effectiveFmt(row, e2, 'lvl:l2'))
            cell.font = {
              name: SHEET_FONT,
              size: fm.s ?? SHEET_SIZE,
              bold: true,
              ...(fm.i ? { italic: true } : {}),
              ...(fm.x ? { strike: true } : {}),
              ...(fm.c ? { color: { argb: `FF${fm.c}` } } : {}),
            }
          }
          cell.alignment =
            c.level === 'h' ? { vertical: 'middle', horizontal: 'center', wrapText: true } : { vertical: 'top', horizontal: 'left', wrapText: true }
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
        cell.font = font()
      } else {
        const v = effectiveField(row, e, key)
        const f = fieldById.get(key)
        const d = f?.kind === 'date' ? v.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null
        if (d) {
          cell.value = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]))
          cell.numFmt = 'm/d'
        } else if (v) cell.value = v
        if (c.kind === 'name') cell.font = font({ bold: true })
        const bg = effectiveBg(row, e, key)
        if (bg) cell.fill = fill(bg)
        const fm = parseFmt(effectiveFmt(row, e, key))
        if (fm.b || fm.i || fm.x || fm.c || fm.s)
          cell.font = {
            ...(cell.font ?? {}),
            ...(fm.b ? { bold: true } : {}),
            ...(fm.i ? { italic: true } : {}),
            ...(fm.x ? { strike: true } : {}),
            ...(fm.c ? { color: { argb: `FF${fm.c}` } } : {}),
            ...(fm.s ? { size: fm.s } : {}),
          }
        if (fm.a) cell.alignment = { ...(cell.alignment ?? {}), horizontal: fm.a }
      }
      const note = effectiveNote(row, e, key)
      if (note) cell.note = note
    })
  })

  // ---- 입력 열 칸 병합(줄 · 열이 붙어 있을 때만) ----
  const yOf = new Map(rows.map((r, ri) => [r.key, ri + 3]))
  for (const m of effectiveMerges(data, drafts)) {
    const ys = m.rows.map((k) => yOf.get(k) ?? -1).sort((p, q) => p - q)
    const xs = m.ids
      .map((id) => all.findIndex((c) => (id === 'name' ? c.kind === 'name' : c.kind === 'field' && c.id === id)))
      .map((i) => (i < 0 ? -1 : at(i)))
      .sort((p, q) => p - q)
    const tight = (v: number[]) => v.every((n) => n > 0) && v.every((n, i) => i === 0 || n === v[i - 1] + 1)
    if (tight(ys) && tight(xs) && ys.length * xs.length > 1) ws.mergeCells(ys[0], xs[0], ys[ys.length - 1], xs[xs.length - 1])
  }

  // ---- 폭 · 틀 고정 ----
  all.forEach((c, i) => {
    const col = ws.getColumn(at(i))
    if (c.kind === 'week') col.width = 1.86
    else if (c.kind === 'name') col.width = 68.71
    else if (c.kind === 'level') col.width = LEVEL_WIDTH[c.level]
    else {
      const f = fieldById.get(c.id)
      col.width = fieldWidth(f?.label ?? '', f?.kind)
    }
  })
  // 줄 높이(pt): 첫 머리글 15 · 둘째 20.25 · 본문 19.5
  ws.getRow(1).height = 15
  ws.getRow(2).height = 20.25
  for (let r = 3; r < rows.length + 3; r++) ws.getRow(r).height = 19.5
  const nameIdx = all.findIndex((c) => c.kind === 'name')
  ws.views = [{ state: 'frozen', xSplit: at(nameIdx), ySplit: 2, showGridLines: false }]
  return wb
}

export async function downloadProgressExcel(data: ProgressData, drafts: Drafts, l1s: string[]) {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const base = [data.fileTitle, data.tabTitle].filter(Boolean).join(' ') || '추진현황'
  return downloadStyledWorkbook(buildProgressWorkbook(data, drafts, l1s), `${base}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.xlsx`)
}

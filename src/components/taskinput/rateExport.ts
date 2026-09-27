// 진척률 표를 밖으로: 구글시트 「YYYY 진척률」 탭에 저장 · 엑셀 받기. (PPT는 ProgressRate의 미리보기에서)
// 모양은 화면 · PPT와 같다: 머리글 연한 파랑 · 실적 칸 연한 분홍 · 비율 파랑 굵게 · 합계 회색.
// 표마다 이름 칸을 두 칸(업무구분 · 구분)으로 맞춰, 한 탭에 위아래로 쌓아도 열이 어긋나지 않게 한다.
import ExcelJS from 'exceljs'
import type { Metric, RateRow, RateTable } from './ProgressRate'
import { replaceSheetTab } from '../../utils/sheetSources'
import { downloadStyledWorkbook } from '../../utils/excel'

type ValueOf = (t: RateTable, r: RateRow, m: Metric) => number
type Kind = 'head' | 'label' | 'num' | 'actual' | 'rate'
interface GridCell {
  v: string | number
  k: Kind
  sum?: boolean
  left?: boolean
}
// merges: [행, 열, 행 수, 열 수]
interface Grid {
  rows: (GridCell | null)[][]
  merges: [number, number, number, number][]
  cols: number
}

export const rateText = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-')
const COLOR = { head: 'C9DAF8', actual: 'EAD6D4', sum: 'D9D9D9', rate: '1155CC', ink: '14161A', line: '9AA0A6', sub: '5F6368' }
const WIDTHS = [110, 230, 64, 64, 64, 64, 72, 64, 64, 64, 80] // 픽셀(구글시트) -- 엑셀은 /7

export function tableGrid(t: RateTable, valueOf: ValueOf): Grid {
  const cols = 10 + (t.general ? 1 : 0)
  const H = (v: string): GridCell => ({ v, k: 'head' })
  const r1: (GridCell | null)[] = Array(cols).fill(null)
  const r2: (GridCell | null)[] = Array(cols).fill(null)
  const merges: Grid['merges'] = []
  if (t.groupHead) {
    r1[0] = H(t.groupHead)
    r1[1] = H(t.firstHead)
    merges.push([0, 0, 2, 1], [0, 1, 2, 1])
  } else {
    r1[0] = H(t.firstHead)
    merges.push([0, 0, 2, 2])
  }
  r1[2] = H('과제\n계획')
  merges.push([0, 2, 2, 1])
  r1[3] = H('착수')
  merges.push([0, 3, 1, 3])
  ;['계획', '실적', '달성률'].forEach((x, i) => (r2[3 + i] = H(x)))
  r1[6] = H('현재\n진행중')
  merges.push([0, 6, 2, 1])
  r1[7] = H('완료')
  merges.push([0, 7, 1, 3])
  ;['계획', '실적', '진척률'].forEach((x, i) => (r2[7 + i] = H(x)))
  if (t.general) {
    r1[10] = H('일반업무\n실적')
    merges.push([0, 10, 2, 1])
  }
  const rows: (GridCell | null)[][] = [r1, r2]
  t.rows.forEach((r, i) => {
    const R = rows.length
    const sum = !!r.sum
    const line: (GridCell | null)[] = []
    if (sum || !t.groupHead) {
      line.push({ v: r.label, k: 'label', sum, left: !sum }, null)
      merges.push([R, 0, 1, 2])
    } else {
      const prev = t.rows[i - 1]
      if (!prev || prev.sum || prev.group !== r.group) {
        let span = 1
        while (t.rows[i + span] && !t.rows[i + span].sum && t.rows[i + span].group === r.group) span++
        line.push({ v: r.group ?? '', k: 'label' })
        if (span > 1) merges.push([R, 0, span, 1])
      } else line.push(null)
      line.push({ v: r.label, k: 'label', left: true })
    }
    const n = (m: Metric): GridCell => ({ v: valueOf(t, r, m), k: m === 'startDone' || m === 'endDone' ? 'actual' : 'num', sum })
    const p = (a: Metric, b: Metric): GridCell => ({ v: rateText(valueOf(t, r, a), valueOf(t, r, b)), k: 'rate', sum })
    line.push(n('plan'), n('startPlan'), n('startDone'), p('startDone', 'startPlan'), n('doing'), n('endPlan'), n('endDone'), p('endDone', 'endPlan'))
    if (t.general) line.push(n('general'))
    rows.push(line)
  })
  return { rows, merges, cols }
}

const fill = (c: GridCell) => (c.sum ? COLOR.sum : c.k === 'head' ? COLOR.head : c.k === 'actual' ? COLOR.actual : null)

// ---- 구글시트: 한 탭에 제목 · (표 이름 + 표)를 위아래로
const rgb = (hex: string) => ({
  red: parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue: parseInt(hex.slice(4, 6), 16) / 255,
})

export async function saveRateToSheet(spreadsheetId: string, tabTitle: string, asOf: string, tables: RateTable[], valueOf: ValueOf) {
  type RowData = { values?: object[] }
  const rowData: RowData[] = []
  const merges: [number, number, number, number][] = []
  const text = (v: string, size: number, bold: boolean, color = COLOR.ink) => ({
    userEnteredValue: { stringValue: v },
    userEnteredFormat: { textFormat: { bold, fontSize: size, foregroundColor: rgb(color) } },
  })
  const stamp = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
  rowData.push({ values: [text(`${tabTitle} · ${asOf} 기준`, 14, true)] })
  rowData.push({ values: [text(`페이스 앱에서 저장 · ${stamp} · 추진현황 일정 칸에서 자동으로 센 값(앱에서 고친 숫자 포함)`, 9, false, COLOR.sub)] })
  rowData.push({})
  let cols = 0
  for (const t of tables) {
    const g = tableGrid(t, valueOf)
    cols = Math.max(cols, g.cols)
    rowData.push({ values: [text(t.title, 12, true)] })
    const top = rowData.length
    const border = { style: 'SOLID', color: rgb(COLOR.line) }
    for (const line of g.rows) {
      rowData.push({
        values: Array.from({ length: g.cols }, (_, c) => {
          const cell = line[c]
          const bg = cell ? fill(cell) : null
          return {
            ...(cell ? { userEnteredValue: typeof cell.v === 'number' ? { numberValue: cell.v } : { stringValue: cell.v } } : {}),
            userEnteredFormat: {
              ...(bg ? { backgroundColor: rgb(bg) } : {}),
              textFormat: { bold: true, fontSize: 10, foregroundColor: rgb(cell?.k === 'rate' ? COLOR.rate : COLOR.ink) },
              horizontalAlignment: cell?.left ? 'LEFT' : 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
              borders: { top: border, bottom: border, left: border, right: border },
            },
          }
        }),
      })
    }
    for (const [r, c, rs, cs] of g.merges) merges.push([top + r, c, rs, cs])
    rowData.push({})
  }
  const size = { rows: rowData.length + 5, cols: Math.max(cols, WIDTHS.length) }
  return replaceSheetTab(spreadsheetId, tabTitle, size, (sheetId) => [
    { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: rowData, fields: 'userEnteredValue,userEnteredFormat' } },
    ...merges.map(([r, c, rs, cs]) => ({
      mergeCells: { range: { sheetId, startRowIndex: r, endRowIndex: r + rs, startColumnIndex: c, endColumnIndex: c + cs }, mergeType: 'MERGE_ALL' },
    })),
    ...WIDTHS.map((px, i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    })),
  ])
}

// ---- 엑셀: 표마다 시트 한 장(탭 이름 = 합산 · 실 이름)
export async function downloadRateExcel(title: string, asOf: string, tables: RateTable[], valueOf: ValueOf) {
  const wb = new ExcelJS.Workbook()
  const used = new Set<string>()
  const argb = (hex: string) => ({ argb: `FF${hex}` })
  for (const t of tables) {
    let name = t.title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || '표'
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 28)} ${i}`
    used.add(name)
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] })
    ws.columns = WIDTHS.map((px) => ({ width: Math.round(px / 7) }))
    ws.getCell(1, 1).value = `${title} · ${t.title}`
    ws.getCell(1, 1).font = { bold: true, size: 14 }
    ws.getCell(2, 1).value = `${asOf} 기준`
    ws.getCell(2, 1).font = { size: 9, color: argb(COLOR.sub) }
    const g = tableGrid(t, valueOf)
    const top = 4
    g.rows.forEach((line, r) => {
      for (let c = 0; c < g.cols; c++) {
        const cell = line[c]
        const x = ws.getCell(top + r, c + 1)
        if (cell) x.value = cell.v
        const bg = cell ? fill(cell) : null
        if (bg) x.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(bg) }
        x.font = { bold: true, size: 10, color: argb(cell?.k === 'rate' ? COLOR.rate : COLOR.ink) }
        x.alignment = { horizontal: cell?.left ? 'left' : 'center', vertical: 'middle', wrapText: true }
        const b = { style: 'thin' as const, color: argb(COLOR.line) }
        x.border = { top: b, bottom: b, left: b, right: b }
      }
    })
    for (const [r, c, rs, cs] of g.merges) ws.mergeCells(top + r, c + 1, top + r + rs - 1, c + cs)
  }
  return downloadStyledWorkbook(wb, `${title} (${asOf}).xlsx`)
}

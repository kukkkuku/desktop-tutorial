import type { Worksheet } from 'exceljs'

// Color palette matches the team's own "가독성개선/무채색" (readability-improved,
// achromatic) styling: a dark neutral header with light gray bands that group
// columns by role, instead of any accent color.
export const EXCEL_STYLE = {
  headerBg: 'FF343A40',
  headerText: 'FFFFFFFF',
  headerBorder: 'FF202428',
  categoryBg: 'FFF2F3F5', // primary category/select columns (등급, 직급 등)
  metricBg: 'FFF7F8F9', // computed/secondary numeric columns
  freetextBg: 'FFFFFFFF', // identity + free-text columns
  border: 'FFD6DADF',
} as const

export type ColumnRole = 'freetext' | 'category' | 'metric'

export interface StyledColumn {
  header: string
  width: number
  role: ColumnRole
}

const roleBg: Record<ColumnRole, string> = {
  freetext: EXCEL_STYLE.freetextBg,
  category: EXCEL_STYLE.categoryBg,
  metric: EXCEL_STYLE.metricBg,
}

// Sets up column widths, a styled header row, and a styled (empty) data grid
// for `emptyRowCount` rows so the sheet reads as a proper table even before
// values are filled in. Call this before writing any cell values -- values
// set afterward on these rows keep the style already applied here.
export function applySheetStyle(ws: Worksheet, columns: StyledColumn[], emptyRowCount = 300): void {
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width }))

  const headerRow = ws.getRow(1)
  headerRow.height = 32
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: EXCEL_STYLE.headerText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_STYLE.headerBg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'medium', color: { argb: EXCEL_STYLE.headerBorder } } }
  })

  for (let r = 2; r <= emptyRowCount + 1; r++) {
    const row = ws.getRow(r)
    row.height = 27
    columns.forEach((col, i) => {
      const cell = row.getCell(i + 1)
      cell.font = { name: 'Calibri', size: 12 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: roleBg[col.role] } }
      cell.alignment = { horizontal: col.role === 'freetext' ? 'left' : 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: EXCEL_STYLE.border } },
        bottom: { style: 'thin', color: { argb: EXCEL_STYLE.border } },
      }
    })
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

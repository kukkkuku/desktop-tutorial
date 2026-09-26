// 과제 입력 › 이 화면에서 새로 만드는 연도(구글시트 없이 시작).
//   · 빈 표: 기본 열(속성 · 분류 · 상태 …)과 그 해 주 칸만 있는 시트 모양을 만들어 시트를 읽을 때와 같은 길로 읽는다.
//   · 저장(이 브라우저): 지금 표를 엑셀 내보내기와 같은 모양으로 그린 뒤 다시 읽어 고친 내용을 모두 반영한 표로 만든다.
//   · 구글시트로 만들기: 같은 모양을 연결된 파일의 새 탭 「YYYY 추진현황」에 그대로 쓴다.
import ExcelJS from 'exceljs'
import { parseSheet, type ParsedSheet, type RawSheet, type SheetMerge } from './sheetImport'
import { buildFieldDefs, buildHeaderStyle, effectiveFields, effectiveFmt, toProgressRows, yearWeeks, type Drafts, type ProgressData } from './progressBoard'
import { buildProgressWorkbook, exportRows } from './progressExport'

type Meta = Pick<ProgressData, 'spreadsheetId' | 'source' | 'tabTitle' | 'sheetGid'>

// 읽은 시트 → 표 데이터
export function sheetToData(parsed: ParsedSheet, raw: RawSheet, meta: Meta): ProgressData {
  const fields = buildFieldDefs(parsed.header, parsed.columnMap)
  const { hCol, l1Col, l2Col } = parsed.header
  const levelCols: ProgressData['levelCols'] = { l2: l2Col, ...(l1Col !== null ? { l1: l1Col } : {}), ...(hCol !== null ? { h: hCol } : {}) }
  const lc = Object.values(levelCols)
  return {
    ...meta,
    year: Number(meta.tabTitle.match(/(20\d{2})/)?.[1]) || null,
    fetchedAt: new Date().toISOString(),
    weekCols: parsed.header.weekCols.map(({ key, month, week, col }) => ({ key, month, week, col })),
    fields,
    headerStyle: buildHeaderStyle(parsed.header, raw, fields),
    rows: toProgressRows(parsed.rows, raw, fields, parsed.header.weekCols, levelCols),
    levelCols,
    levelMerges: raw.merges.filter((m) => m.c1 === m.c2 && lc.includes(m.c1)),
    headerRows: { top: parsed.header.headerRow, sub: Math.max(parsed.header.headerRow, parsed.header.dataStartRow - 1) },
    // 입력 열(L3 제외)끼리의 병합만(머리글 아래)
    fieldMerges: raw.merges.filter((m) => {
      if (m.r1 < parsed.header.dataStartRow) return false
      const inside = fields.filter((f) => f.col >= m.c1 && f.col <= m.c2)
      return inside.length === m.c2 - m.c1 + 1
    }),
  }
}

// 새 연도 기본 입력 열(시트 머리글 이름 그대로 -- 앱이 아는 열로 읽힌다)
export const DEFAULT_FIELD_LABELS = ['속성', '분류', '상태', '수요부서', '담당팀', '담당자', '내/외', '완료요청', '완료일', '비고']

const localTitle = (year: number) => `${year} 추진현황`
const localMeta = (year: number): Meta => ({ spreadsheetId: null, source: 'local', tabTitle: localTitle(year), sheetGid: null })

// 빈 표: L1 · L2 · L3 | 주 칸(1~12월) | 기본 열, 두 줄 머리글
export function blankProgress(year: number, labels = DEFAULT_FIELD_LABELS): ProgressData {
  const weeks = yearWeeks(year)
  const top: unknown[] = ['L1', 'L2', 'L3']
  const sub: unknown[] = ['L1', 'L2', 'L3']
  const merges: SheetMerge[] = [0, 1, 2].map((c) => ({ r1: 0, r2: 1, c1: c, c2: c }))
  let c = 3
  for (let m = 1; m <= 12; m++) {
    const ws = weeks.filter((w) => w.month === m)
    ws.forEach((w) => {
      top.push(`${m}월`)
      sub.push(String(w.week))
    })
    merges.push({ r1: 0, r2: 0, c1: c, c2: c + ws.length - 1 })
    c += ws.length
  }
  for (const l of labels) {
    top.push(l)
    sub.push(l)
    merges.push({ r1: 0, r2: 1, c1: c, c2: c })
    c++
  }
  const raw: RawSheet = { title: localTitle(year), rows: [top, sub], merges, fills: [], notes: [] }
  const parsed = parseSheet(raw)
  if ('error' in parsed) throw new Error(parsed.error)
  return { ...sheetToData(parsed, raw, localMeta(year)), year, local: true }
}

function argbHex(argb: string | undefined): string | null {
  if (!argb || !/^[0-9A-F]{8}$/i.test(argb)) return null
  const hex = argb.slice(2).toUpperCase()
  return hex === 'FFFFFF' ? null : hex
}
const excelSerial = (d: Date) => d.getTime() / 86400000 + 25569

// 엑셀 워크시트 → 시트 읽기 모양(값 · 병합 · 칸 색 · 메모)
function worksheetToRaw(ws: ExcelJS.Worksheet, title: string): RawSheet {
  const rows: unknown[][] = []
  const fills: (string | null)[][] = []
  const notes: (string | null)[][] = []
  const nCols = ws.columnCount
  for (let r = 1; r <= ws.rowCount; r++) {
    const row: unknown[] = []
    fills[r - 1] = []
    notes[r - 1] = []
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getCell(r, c)
      const v = cell.isMerged && cell.master !== cell ? null : cell.value
      if (v instanceof Date) {
        const serial = excelSerial(v)
        row.push({ kind: 'date', serial, text: `${String(v.getUTCMonth() + 1).padStart(2, '0')}.${String(v.getUTCDate()).padStart(2, '0')}` })
      } else row.push(v === undefined ? null : v)
      const f = cell.fill as { fgColor?: { argb?: string } } | undefined
      fills[r - 1][c - 1] = argbHex(f?.fgColor?.argb)
      const n = cell.note
      notes[r - 1][c - 1] = typeof n === 'string' ? n : n ? (n.texts ?? []).map((t) => t.text).join('') : null
    }
    rows.push(row)
  }
  const merges: SheetMerge[] = []
  for (const ref of (ws.model as { merges?: string[] }).merges ?? []) {
    const [a, b] = ref.split(':')
    const pa = decodeRef(a)
    const pb = decodeRef(b ?? a)
    merges.push({ r1: pa.r, c1: pa.c, r2: pb.r, c2: pb.c })
  }
  return { title, rows, merges, fills, notes }
}
function decodeRef(ref: string): { r: number; c: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/)!
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { r: Number(m[2]) - 1, c: c - 1 }
}

// 지금 표(고친 내용 포함)를 새 표 데이터로 굳힌다. 이름이 빈 새 과제는 표에 들어가지 못하므로 따로 돌려준다.
export function materialize(data: ProgressData, drafts: Drafts, l1s: string[]): { data: ProgressData; left: Drafts['newRows'] } {
  const wb = buildProgressWorkbook(data, drafts, l1s)
  const ws = wb.worksheets[0]
  const raw = worksheetToRaw(ws, data.tabTitle)
  // 글자 서식은 엑셀 글꼴이 아니라 고친 값에서 바로 옮긴다(기본 글꼴까지 서식으로 굳지 않게)
  const eff = effectiveFields(data.fields, data.headerStyle, drafts)
  const order = exportRows(data, drafts, l1s)
  // 엑셀 열 순서(내보내기와 같게): 시트 열 위치 순
  type C = { src: number; id: string | null }
  const colsOrder: C[] = [
    ...Object.entries(data.levelCols ?? {}).map(([lv, src]) => ({ src, id: lv === 'l2' ? 'lvl:l2' : null })),
    ...eff.fields.map((f) => ({ src: f.col, id: f.id })),
    ...data.weekCols.map((w) => ({ src: w.col, id: null })),
  ].sort((a, b) => a.src - b.src)
  raw.fmts = raw.rows.map(() => [])
  order.forEach((row, i) => {
    const e = row.isNew ? undefined : drafts.edits[row.key]
    colsOrder.forEach((c, ci) => {
      if (!c.id) return
      const t = effectiveFmt(row, e, c.id)
      if (t) raw.fmts![i + 2][ci] = t
    })
  })
  const parsed = parseSheet(raw)
  if ('error' in parsed) throw new Error(parsed.error)
  const next = sheetToData(parsed, raw, { spreadsheetId: data.spreadsheetId, source: data.source, tabTitle: data.tabTitle, sheetGid: data.sheetGid })
  return { data: { ...next, year: data.year, local: data.local, yearTabs: data.yearTabs }, left: drafts.newRows.filter((n) => !n.fields.name?.trim()) }
}

// ---------- 구글시트로 만들기: 워크시트를 새 탭에 그대로 쓰는 요청 ----------
function rgb(argb: string | undefined) {
  const hex = argb && /^[0-9A-F]{8}$/i.test(argb) ? argb.slice(2) : null
  return hex ? { red: parseInt(hex.slice(0, 2), 16) / 255, green: parseInt(hex.slice(2, 4), 16) / 255, blue: parseInt(hex.slice(4, 6), 16) / 255 } : undefined
}
export function worksheetRequests(ws: ExcelJS.Worksheet, sheetId: number): object[] {
  const nCols = ws.columnCount
  const rowData: object[] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const values: object[] = []
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getCell(r, c)
      const v = cell.isMerged && cell.master !== cell ? null : cell.value
      const font = cell.font ?? {}
      const fill = cell.fill as { fgColor?: { argb?: string } } | undefined
      const al = cell.alignment ?? {}
      const bg = rgb(fill?.fgColor?.argb)
      const fg = rgb(font.color?.argb)
      const text = {
        ...(font.bold ? { bold: true } : {}),
        ...(font.italic ? { italic: true } : {}),
        ...(font.strike ? { strikethrough: true } : {}),
        ...(font.size && font.size !== 10 ? { fontSize: font.size } : {}),
        ...(fg && font.color?.argb !== 'FF000000' ? { foregroundColor: fg } : {}),
      }
      const note = cell.note ? (typeof cell.note === 'string' ? cell.note : (cell.note.texts ?? []).map((t) => t.text).join('')) : ''
      values.push({
        ...(v instanceof Date
          ? { userEnteredValue: { numberValue: excelSerial(v) } }
          : typeof v === 'number'
            ? { userEnteredValue: { numberValue: v } }
            : v !== null && v !== undefined && String(v) !== ''
              ? { userEnteredValue: { stringValue: String(v) } }
              : {}),
        userEnteredFormat: {
          ...(bg ? { backgroundColor: bg } : {}),
          ...(Object.keys(text).length ? { textFormat: text } : {}),
          ...(al.horizontal ? { horizontalAlignment: String(al.horizontal).toUpperCase() } : {}),
          ...(al.vertical ? { verticalAlignment: al.vertical === 'middle' ? 'MIDDLE' : String(al.vertical).toUpperCase() } : {}),
          ...(al.wrapText ? { wrapStrategy: 'WRAP' } : {}),
          ...(v instanceof Date ? { numberFormat: { type: 'DATE', pattern: 'mm.dd' } } : {}),
        },
        ...(note ? { note } : {}),
      })
    }
    rowData.push({ values })
  }
  const requests: object[] = [
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: ws.rowCount, startColumnIndex: 0, endColumnIndex: nCols },
        rows: rowData,
        fields: 'userEnteredValue,userEnteredFormat,note',
      },
    },
  ]
  for (const ref of (ws.model as { merges?: string[] }).merges ?? []) {
    const [a, b] = ref.split(':')
    const pa = decodeRef(a)
    const pb = decodeRef(b ?? a)
    requests.push({
      mergeCells: { range: { sheetId, startRowIndex: pa.r, endRowIndex: pb.r + 1, startColumnIndex: pa.c, endColumnIndex: pb.c + 1 }, mergeType: 'MERGE_ALL' },
    })
  }
  for (let c = 1; c <= nCols; c++) {
    const w = ws.getColumn(c).width
    if (w)
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: c - 1, endIndex: c },
          properties: { pixelSize: Math.round(w * 7 + 5) },
          fields: 'pixelSize',
        },
      })
  }
  return requests
}

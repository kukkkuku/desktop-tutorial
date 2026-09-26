// 과제 입력 › 추진현황(이 앱에 불러온 데이터)을 성과관리 "가져오기" 화면이 읽는 모양으로 바꾼다.
// 가져오기 화면은 원래 시트를 읽어 머리글(ParsedHeader)과 행(ParsedRow)을 만드는데, 추진현황은 이미
// 읽어 둔 데이터가 있으므로 그대로 옮긴다. 아직 구글시트에 저장하지 않은 변경(고친 칸, 새 과제)도 들어가고,
// 삭제로 표시한 과제는 빠진다.
import type { ParsedHeader, ParsedRow } from './sheetImport'
import { effectiveCells, effectiveField, loadProgress, type Drafts, type ProgressData } from './progressBoard'
import { exportRows } from './progressExport'
import { COL_NAME, SYSTEM_COLUMNS } from './workBoard'

export interface ProgressSource {
  data: ProgressData
  drafts: Drafts
}

// 이 브라우저의 과제 입력 › 추진현황(올해 탭). 불러온 적이 없으면 null.
export function readProgressSource(): ProgressSource | null {
  const { data, drafts } = loadProgress()
  return data ? { data, drafts } : null
}

export function progressL1s(src: ProgressSource): string[] {
  const list = Array.from(new Set(src.data.rows.map((r) => r.l1)))
  for (const n of src.drafts.newRows) if (!list.includes(n.l1)) list.push(n.l1)
  return list
}

// 시트 열 번호 그대로의 머리글(열 매칭 이름 · 주차 칸 · H/L1/L2/L3 위치)
export function progressHeader(data: ProgressData): ParsedHeader {
  const labels: string[] = []
  for (const f of data.fields) labels[f.col] = f.id === 'name' ? 'L3' : f.label
  const lv = data.levelCols ?? {}
  if (lv.h !== undefined) labels[lv.h] = 'H'
  if (lv.l1 !== undefined) labels[lv.l1] = 'L1'
  if (lv.l2 !== undefined) labels[lv.l2] = 'L2'
  for (const w of data.weekCols) labels[w.col] = `${w.month}월 ${w.week}`
  const l3Col = data.fields.find((f) => f.id === 'name')?.col ?? (lv.l2 ?? 0) + 1
  return {
    headerRow: 0,
    dataStartRow: 1,
    labels: Array.from(labels, (x) => x ?? ''),
    hCol: lv.h ?? null,
    l1Col: lv.l1 ?? null,
    l2Col: lv.l2 ?? Math.max(0, l3Col - 1),
    l3Col,
    weekCols: data.weekCols,
  }
}

// 앱 열 id → 시트 열 번호(추진현황에서 짝지은 그대로)
export function progressColumnMap(data: ProgressData): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const c of SYSTEM_COLUMNS) out[c.id] = data.fields.find((f) => f.id === c.id)?.col ?? null
  return out
}

// 화면 순서 그대로의 과제 줄(고친 값 반영, 새 과제 포함, 삭제 표시 · 이름 없는 새 과제 제외)
export function progressParsedRows(src: ProgressSource): ParsedRow[] {
  const ids = SYSTEM_COLUMNS.map((c) => c.id).filter((id) => id !== COL_NAME)
  return exportRows(src.data, src.drafts, progressL1s(src))
    .map((r, i): ParsedRow | null => {
      const e = r.isNew ? undefined : src.drafts.edits[r.key]
      const l3 = effectiveField(r, e, 'name').trim()
      if (!l3) return null
      const values: Record<string, string> = {}
      for (const id of ids) {
        const v = effectiveField(r, e, id)
        if (v) values[id] = v
      }
      const weeks: ParsedRow['weeks'] = {}
      const fills: NonNullable<ParsedRow['fills']> = {}
      for (const [k, c] of Object.entries(effectiveCells(r, e))) {
        if (c.m) weeks[k] = c.m
        if (c.f) fills[k] = c.f
      }
      return { row: i, h: r.h, l1: r.l1, l2: r.l2, l2Tag: r.l2Tag, l3, hierarchyInferred: false, values, weeks, fills }
    })
    .filter((x): x is ParsedRow => x !== null)
}

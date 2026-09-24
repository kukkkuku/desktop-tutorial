// 순위 피어리뷰: 누가 누구에게 순위를 매기는지(목록), 팀원별 엑셀 양식 만들기·읽기,
// 결과 집계. 두 방식(simple / task)의 차이는 "목록을 어떻게 나누나"뿐이고 나머지는
// 같다. 모든 순위에는 근거가 있어야 한다.

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type { AppState, RankReview, RankReviewMode, Task, TeamMember } from '../types'
import { saveBlobLocally } from './localSave'

export const RANK_MODE_LABEL: Record<RankReviewMode, string> = {
  simple: '단순 순위',
  task: '과제별 순위',
}

const FORM_VERSION = 1

// ---------- 누구에게 순위를 매기나 ----------

export interface RankGroup {
  taskId?: string
  taskName?: string
  targets: TeamMember[]
}

// 평가과제 참여자 = 기여도가 0보다 큰 활성 팀원(L3로 만든 과제는 L3 담당자).
export function taskParticipants(task: Task, state: Pick<AppState, 'members' | 'contributions'>): TeamMember[] {
  const ids = new Set(state.contributions.filter((c) => c.taskId === task.id && c.contributionPercent > 0).map((c) => c.memberId))
  return state.members.filter((m) => m.active && ids.has(m.id))
}

export function rankGroupsFor(reviewer: TeamMember, mode: RankReviewMode, state: Pick<AppState, 'members' | 'contributions' | 'tasks'>): RankGroup[] {
  if (mode === 'simple') {
    const targets = state.members.filter((m) => m.active && m.id !== reviewer.id)
    return targets.length ? [{ targets }] : []
  }
  const groups: RankGroup[] = []
  for (const task of state.tasks) {
    const people = taskParticipants(task, state)
    if (!people.some((p) => p.id === reviewer.id)) continue
    const targets = people.filter((p) => p.id !== reviewer.id)
    if (targets.length) groups.push({ taskId: task.id, taskName: task.name, targets })
  }
  return groups
}

// ---------- 검사 ----------

export interface RankEntry {
  taskId?: string
  targetMemberId: string
  rank: number | null
  reason: string
}

// 한 목록 안에서: 1~N 사이, 중복 없음, 빠짐 없음, 근거 필수.
export function validateGroup(group: RankGroup, entries: RankEntry[], label = ''): string[] {
  const errors: string[] = []
  const n = group.targets.length
  const prefix = label ? `${label}: ` : ''
  const seen = new Map<number, string>()
  for (const t of group.targets) {
    const e = entries.find((x) => x.targetMemberId === t.id && (x.taskId ?? '') === (group.taskId ?? ''))
    if (!e || e.rank === null) {
      errors.push(`${prefix}${t.name}의 순위가 비어 있습니다.`)
      continue
    }
    if (!Number.isInteger(e.rank) || e.rank < 1 || e.rank > n) errors.push(`${prefix}${t.name}의 순위 ${e.rank}은(는) 1~${n} 사이여야 합니다.`)
    else if (seen.has(e.rank)) errors.push(`${prefix}${e.rank}위가 ${seen.get(e.rank)}과(와) ${t.name}에 겹칩니다.`)
    else seen.set(e.rank, t.name)
    if (!e.reason.trim()) errors.push(`${prefix}${t.name}의 순위 근거가 비어 있습니다. 근거는 꼭 적어야 합니다.`)
  }
  return errors
}

export function toReviews(reviewerMemberId: string, mode: RankReviewMode, groups: RankGroup[], entries: RankEntry[], source: 'excel' | 'app'): RankReview[] {
  const now = new Date().toISOString()
  const out: RankReview[] = []
  for (const g of groups) {
    for (const t of g.targets) {
      const e = entries.find((x) => x.targetMemberId === t.id && (x.taskId ?? '') === (g.taskId ?? ''))
      if (!e || e.rank === null) continue
      out.push({
        id: uuidv4(),
        mode,
        taskId: g.taskId,
        reviewerMemberId,
        targetMemberId: t.id,
        rank: e.rank,
        groupSize: g.targets.length,
        reason: e.reason.trim(),
        source,
        updatedAt: now,
      })
    }
  }
  return out
}

// ---------- 엑셀 양식 ----------

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A4150' } }
const INPUT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }
const THIN = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }

function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_')
}

export function buildRankWorkbook(reviewer: TeamMember, mode: RankReviewMode, groups: RankGroup[], periodLabel: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('피어리뷰', { views: [{ state: 'frozen', ySplit: 7 }] })
  const isTask = mode === 'task'
  ws.columns = isTask
    ? [{ width: 36 }, { width: 14 }, { width: 10 }, { width: 70 }, { width: 4, hidden: true }, { width: 4, hidden: true }]
    : [{ width: 16 }, { width: 10 }, { width: 80 }, { width: 4, hidden: true }]

  ws.getCell('A1').value = '팀원 피어리뷰'
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getCell('A2').value = '평가기간'
  ws.getCell('B2').value = periodLabel
  ws.getCell('A3').value = '평가자'
  ws.getCell('B3').value = reviewer.name
  ws.getCell('A4').value = '방식'
  ws.getCell('B4').value = RANK_MODE_LABEL[mode]
  ws.getCell('A5').value = isTask
    ? '과제마다 함께한 팀원에게 1위부터 순위를 중복 없이 매기고, 순위 근거를 꼭 적어 주세요.'
    : '다른 팀원에게 1위부터 순위를 중복 없이 매기고, 순위 근거를 꼭 적어 주세요.'
  ws.getCell('A5').font = { color: { argb: 'FF6B7280' }, size: 10 }
  for (const a of ['A2', 'A3', 'A4']) ws.getCell(a).font = { color: { argb: 'FF6B7280' } }
  for (const b of ['B2', 'B3', 'B4']) ws.getCell(b).font = { bold: true }

  const headers = isTask ? ['과제', '대상팀원', '순위', '순위 근거', '대상ID', '과제ID'] : ['대상팀원', '순위', '순위 근거', '대상ID']
  const headerRow = ws.getRow(7)
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = h
    c.fill = HEADER_FILL
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { vertical: 'middle' }
  })
  headerRow.height = 22

  let r = 8
  for (const g of groups) {
    const n = g.targets.length
    for (const t of g.targets) {
      const row = ws.getRow(r)
      const vals = isTask ? [g.taskName ?? '', t.name, null, null, t.id, g.taskId ?? ''] : [t.name, null, null, t.id]
      vals.forEach((v, i) => {
        row.getCell(i + 1).value = v as ExcelJS.CellValue
      })
      const rankCell = row.getCell(isTask ? 3 : 2)
      const reasonCell = row.getCell(isTask ? 4 : 3)
      rankCell.fill = INPUT_FILL
      reasonCell.fill = INPUT_FILL
      rankCell.alignment = { horizontal: 'center', vertical: 'top' }
      reasonCell.alignment = { wrapText: true, vertical: 'top' }
      rankCell.dataValidation = {
        type: 'whole',
        operator: 'between',
        allowBlank: false,
        formulae: [1, n],
        showErrorMessage: true,
        errorTitle: '순위',
        error: `1부터 ${n}까지의 숫자를 넣어 주세요.`,
      }
      for (let c = 1; c <= headers.length; c++) row.getCell(c).border = { bottom: THIN }
      row.height = 36
      r += 1
    }
  }

  const meta = wb.addWorksheet('_메타', { state: 'hidden' })
  meta.addRows([
    ['평가자ID', reviewer.id],
    ['평가자', reviewer.name],
    ['방식', mode],
    ['평가기간', periodLabel],
    ['양식버전', FORM_VERSION],
  ])
  return wb
}

export async function downloadRankForms(
  reviewers: TeamMember[],
  mode: RankReviewMode,
  state: Pick<AppState, 'members' | 'contributions' | 'tasks'>,
  periodLabel: string,
): Promise<{ files: number; skipped: string[] }> {
  const zip = new JSZip()
  const skipped: string[] = []
  let files = 0
  for (const reviewer of reviewers) {
    const groups = rankGroupsFor(reviewer, mode, state)
    if (groups.length === 0) {
      skipped.push(reviewer.name)
      continue
    }
    const buf = await buildRankWorkbook(reviewer, mode, groups, periodLabel).xlsx.writeBuffer()
    zip.file(safeFileName(`피어리뷰_${RANK_MODE_LABEL[mode]}_${periodLabel}_${reviewer.name}.xlsx`), buf)
    files += 1
  }
  if (files > 0) {
    const blob = await zip.generateAsync({ type: 'blob' })
    await saveBlobLocally(blob, safeFileName(`피어리뷰_${RANK_MODE_LABEL[mode]}_${periodLabel}_${files}명.zip`))
  }
  return { files, skipped }
}

// ---------- 엑셀 읽기 ----------

export interface ParsedRankFile {
  fileName: string
  reviewer: TeamMember | null
  mode: RankReviewMode | null
  groups: RankGroup[]
  entries: RankEntry[]
  errors: string[]
}

function cellStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

export function parseRankWorkbook(buffer: ArrayBuffer, fileName: string, state: Pick<AppState, 'members' | 'contributions' | 'tasks'>): ParsedRankFile {
  const wb = XLSX.read(buffer, { type: 'array' })
  const result: ParsedRankFile = { fileName, reviewer: null, mode: null, groups: [], entries: [], errors: [] }
  const byId = new Map(state.members.map((m) => [m.id, m]))
  const byName = new Map(state.members.map((m) => [m.name.trim(), m]))

  // 평가자·방식: 숨은 _메타 시트 우선, 없으면 본문(B3 평가자, 머리글로 방식 추정)
  const metaWs = wb.Sheets['_메타']
  const metaRows: unknown[][] = metaWs ? XLSX.utils.sheet_to_json(metaWs, { header: 1 }) : []
  const meta = new Map(metaRows.map((r) => [cellStr(r[0]), cellStr(r[1])]))
  const dataWs = wb.Sheets['피어리뷰'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(dataWs, { header: 1, defval: null })

  const reviewerName = meta.get('평가자') || cellStr(rows[2]?.[1])
  result.reviewer = byId.get(meta.get('평가자ID') ?? '') ?? byName.get(reviewerName) ?? null
  if (!result.reviewer) {
    result.errors.push(`평가자 "${reviewerName || '(없음)'}"를 팀원 목록에서 찾지 못했습니다.`)
    return result
  }

  const headerIdx = rows.findIndex((r) => ['대상팀원', '과제'].includes(cellStr(r?.[0])))
  if (headerIdx < 0) {
    result.errors.push('"대상팀원" 머리글을 찾지 못했습니다. 이 앱에서 내려받은 양식인지 확인해 주세요.')
    return result
  }
  const header = rows[headerIdx].map(cellStr)
  const metaMode = meta.get('방식')
  result.mode = metaMode === 'task' || metaMode === 'simple' ? metaMode : header[0] === '과제' ? 'task' : 'simple'
  const col = (name: string) => header.indexOf(name)
  const cTask = col('과제')
  const cTarget = col('대상팀원')
  const cRank = col('순위')
  const cReason = col('순위 근거')
  const cTargetId = col('대상ID')
  const cTaskId = col('과제ID')
  const taskByName = new Map(state.tasks.map((t) => [t.name.trim(), t]))

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    const targetName = cellStr(r[cTarget])
    if (!targetName) continue
    const target = (cTargetId >= 0 ? byId.get(cellStr(r[cTargetId])) : undefined) ?? byName.get(targetName)
    if (!target) {
      result.errors.push(`${i + 1}행: 대상팀원 "${targetName}"를 팀원 목록에서 찾지 못했습니다.`)
      continue
    }
    let taskId: string | undefined
    if (result.mode === 'task') {
      const t = (cTaskId >= 0 ? state.tasks.find((x) => x.id === cellStr(r[cTaskId])) : undefined) ?? taskByName.get(cellStr(r[cTask]))
      if (!t) {
        result.errors.push(`${i + 1}행: 과제 "${cellStr(r[cTask])}"를 평가과제에서 찾지 못했습니다.`)
        continue
      }
      taskId = t.id
    }
    const rawRank = cellStr(r[cRank])
    const rank = rawRank === '' ? null : Number(rawRank)
    result.entries.push({ taskId, targetMemberId: target.id, rank: rank !== null && Number.isFinite(rank) ? rank : null, reason: cellStr(r[cReason]) })
  }

  // 목록은 지금 앱의 과제·참여자 기준으로 다시 만든다(양식을 받은 뒤 바뀌었으면 알려 준다).
  result.groups = rankGroupsFor(result.reviewer, result.mode, state)
  if (result.mode === 'task') {
    const known = new Set(result.groups.map((g) => g.taskId))
    const orphan = Array.from(new Set(result.entries.filter((e) => !known.has(e.taskId)).map((e) => state.tasks.find((t) => t.id === e.taskId)?.name ?? '')))
    if (orphan.length) result.errors.push(`지금은 ${result.reviewer.name}이(가) 참여하지 않는 과제가 있습니다: ${orphan.join(', ')}. 양식을 다시 내려받아 주세요.`)
  }
  for (const g of result.groups) result.errors.push(...validateGroup(g, result.entries, g.taskName))
  return result
}

// ---------- 결과 ----------

export interface RankSummaryRow {
  member: TeamMember
  avgRank: number | null // 평균 순위(단순 방식)
  avgPercentile: number | null // 평균 상대 위치 0(1위)~100(꼴찌) -- 목록 크기가 달라도 비교되게
  count: number
  reasons: { reviewer: string; rank: number; groupSize: number; taskName?: string; reason: string }[]
}

// (rank-1)/(N-1): 1위=0, 꼴찌=1. N=1이면 비교 대상이 없으므로 뺀다.
function relative(r: RankReview): number | null {
  return r.groupSize > 1 ? (r.rank - 1) / (r.groupSize - 1) : null
}

export function summarizeRanks(reviews: RankReview[], mode: RankReviewMode, state: Pick<AppState, 'members' | 'tasks'>, taskId?: string): RankSummaryRow[] {
  const memberById = new Map(state.members.map((m) => [m.id, m]))
  const taskById = new Map(state.tasks.map((t) => [t.id, t]))
  const list = reviews.filter((r) => r.mode === mode && (taskId === undefined || r.taskId === taskId))
  const rows: RankSummaryRow[] = state.members
    .filter((m) => m.active)
    .map((member) => {
      const mine = list.filter((r) => r.targetMemberId === member.id)
      const rel = mine.map(relative).filter((x): x is number => x !== null)
      return {
        member,
        avgRank: mine.length ? mine.reduce((s, r) => s + r.rank, 0) / mine.length : null,
        avgPercentile: rel.length ? (rel.reduce((s, x) => s + x, 0) / rel.length) * 100 : null,
        count: mine.length,
        reasons: mine
          .map((r) => ({
            reviewer: memberById.get(r.reviewerMemberId)?.name ?? '(삭제된 팀원)',
            rank: r.rank,
            groupSize: r.groupSize,
            taskName: r.taskId ? taskById.get(r.taskId)?.name : undefined,
            reason: r.reason,
          }))
          .sort((a, b) => a.rank - b.rank),
      }
    })
  // 같은 목록(단순 방식, 또는 과제 하나) 안에서는 평균 순위, 과제 여러 개를 합칠 때는 상대 위치로.
  const key = (r: RankSummaryRow) => (mode === 'simple' || taskId !== undefined ? r.avgRank : r.avgPercentile)
  return rows.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka === null && kb === null) return a.member.name.localeCompare(b.member.name)
    if (ka === null) return 1
    if (kb === null) return -1
    return ka - kb
  })
}

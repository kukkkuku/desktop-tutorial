// 과제별 피어리뷰 양식(평가자 한 명당 파일 하나). 과제마다 시트 하나에 참여자 전원(본인
// 포함)을 순위(1..N)로 평가하고 근거를 적는다. 결과는 TaskPeerReview로 저장한다.
// (기여도 방식 코드는 예전 양식을 읽을 때를 위해 남아 있다.)
// 순위 시트는 "순위 검증"(빈칸·중복), 기여도 시트는 "기여도 합계" 검증 행이 있고,
// 올릴 때도 같은 규칙으로 검사해 어긋나면 받지 않는다.

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type { AppState, Task, TaskPeerMethod, TaskPeerReview, TeamMember } from '../types'
import { saveBlobLocally } from './localSave'
import { taskParticipants } from './rankReview'

const FORM_KIND = 'task-peer'
const FORM_VERSION = 2

export const TASK_PEER_METHOD_LABEL: Record<TaskPeerMethod, string> = { rank: '순위', contribution: '기여도' }

// 팀원은 순위만 매긴다(기여도는 팀장이 평가하기에서 정함, 2026-09 결정).
// Task.peerMethod와 method='contribution' 리뷰는 예전 데이터 호환용으로만 남는다.
export function peerMethodOf(_task?: Pick<Task, 'peerMethod'>): TaskPeerMethod {
  return 'rank'
}

export interface TaskPeerGroup {
  taskId: string
  taskName: string
  method: TaskPeerMethod
  people: TeamMember[] // 본인 포함, 본인이 맨 앞
}

export interface TaskPeerEntry {
  taskId: string
  targetMemberId: string
  value: number | null // 순위 또는 기여도(%)
  reason: string
}

type PeerState = Pick<AppState, 'members' | 'contributions' | 'tasks'>

export function taskPeerGroupsFor(reviewer: TeamMember, state: PeerState): TaskPeerGroup[] {
  const out: TaskPeerGroup[] = []
  for (const task of state.tasks) {
    const people = taskParticipants(task, state)
    if (!people.some((p) => p.id === reviewer.id) || people.length < 2) continue
    out.push({ taskId: task.id, taskName: task.name, method: peerMethodOf(task), people: [reviewer, ...people.filter((p) => p.id !== reviewer.id)] })
  }
  return out
}

// 과제 하나: 모든 칸 채움, 근거 필수.
//  순위: 1..N 정수, 중복 없음 / 기여도: 0~100, 합계 100.
export function validateTaskPeer(group: TaskPeerGroup, entries: TaskPeerEntry[], reviewerId: string): string[] {
  const errors: string[] = []
  const p = `${group.taskName}: `
  const n = group.people.length
  const unit = group.method === 'rank' ? '순위' : '기여도'
  const seen = new Map<number, string[]>()
  let sum = 0
  let missing = false
  for (const person of group.people) {
    const who = person.id === reviewerId ? `${person.name}(본인)` : person.name
    const e = entries.find((x) => x.taskId === group.taskId && x.targetMemberId === person.id)
    const v = e?.value ?? null
    if (v === null) {
      errors.push(`${p}${who}의 ${unit}가 비어 있습니다.`)
      missing = true
    } else if (group.method === 'rank') {
      if (!Number.isInteger(v) || v < 1 || v > n) errors.push(`${p}${who}의 순위 ${v}은(는) 1~${n} 사이 정수여야 합니다.`)
      else seen.set(v, [...(seen.get(v) ?? []), who])
    } else if (v < 0 || v > 100) errors.push(`${p}${who}의 기여도 ${v}은(는) 0~100 사이여야 합니다.`)
    else sum += v
    if (!e?.reason.trim()) errors.push(`${p}${who}의 근거가 비어 있습니다. 근거는 꼭 적어야 합니다.`)
  }
  if (group.method === 'rank') {
    for (const [rank, who] of seen) if (who.length > 1) errors.push(`${p}${rank}위가 ${who.join(', ')}에게 겹칩니다. 순위는 한 명에 하나씩입니다.`)
  } else if (!missing && Math.abs(sum - 100) > 0.01) errors.push(`${p}기여도 합계가 ${sum}%입니다. 100%가 되게 맞춰 주세요.`)
  return errors
}

export function toTaskPeerReviews(reviewer: TeamMember, groups: TaskPeerGroup[], entries: TaskPeerEntry[], source: 'excel' | 'app'): TaskPeerReview[] {
  const out: TaskPeerReview[] = []
  const now = new Date().toISOString()
  for (const g of groups)
    for (const person of g.people) {
      const e = entries.find((x) => x.taskId === g.taskId && x.targetMemberId === person.id)
      if (!e || e.value === null) continue
      out.push({
        id: uuidv4(),
        taskId: g.taskId,
        method: g.method,
        reviewerMemberId: reviewer.id,
        targetMemberId: person.id,
        value: e.value,
        groupSize: g.people.length,
        reason: e.reason.trim(),
        source,
        updatedAt: now,
      })
    }
  return out
}

// 이미 낸 리뷰(같은 방식)가 있으면 그 값을. 없으면 기여도는 균등 배분, 순위는 빈칸.
export function draftFor(reviewer: TeamMember, groups: TaskPeerGroup[], existing: TaskPeerReview[]): TaskPeerEntry[] {
  const out: TaskPeerEntry[] = []
  for (const g of groups) {
    const base = Math.floor(100 / g.people.length)
    const rest = 100 - base * g.people.length
    g.people.forEach((person, i) => {
      const r = existing.find((x) => x.taskId === g.taskId && x.method === g.method && x.targetMemberId === person.id && x.reviewerMemberId === reviewer.id)
      out.push({
        taskId: g.taskId,
        targetMemberId: person.id,
        value: r ? r.value : g.method === 'contribution' ? base + (i < rest ? 1 : 0) : null,
        reason: r?.reason ?? '',
      })
    })
  }
  return out
}

// ---------- 엑셀 ----------

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A4150' } }
const INPUT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }
const SUM_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const THIN = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }

function sheetNameFor(i: number, name: string): string {
  return `${i + 1}_${name}`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
}

function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_')
}

export function buildTaskPeerWorkbook(reviewer: TeamMember, groups: TaskPeerGroup[], draft: TaskPeerEntry[], periodLabel: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()

  const guide = wb.addWorksheet('안내')
  guide.columns = [{ width: 12 }, { width: 80 }]
  guide.mergeCells('A1:B1')
  guide.mergeCells('A2:B2')
  guide.getCell('A1').value = '피어리뷰 입력 안내'
  guide.getCell('A1').font = { bold: true, size: 14 }
  guide.getCell('A2').value = '과제별로 평가 대상 팀원(본인 포함)을 순위 또는 기여도로 평가하고 근거를 입력합니다.'
  guide.getRow(4).values = ['구분', '입력 안내']
  guide.getRow(4).eachCell((c) => {
    c.fill = HEADER_FILL
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  })
  guide.addRows([
    ['1', `평가기간(${periodLabel})·평가자(${reviewer.name})·과제·대상 팀원은 현재 데이터로 입력되어 있습니다.`],
    ['2', '과제 시트마다 평가 방식(순위 또는 기여도)이 정해져 있습니다. 연한 주황색 칸에 값과 근거를 입력합니다. 근거는 모든 칸에 꼭 적어 주세요.'],
    ['3', '순위 시트: 1위가 가장 높습니다. 한 사람에 한 순위씩, 겹치지 않게 1~인원수로 매깁니다(맨 아래 "검증" 칸 확인).'],
    ['4', '기여도 시트: 대상 전원의 기여도 합계가 100%여야 합니다(맨 아래 "검증" 칸 확인).'],
  ])
  guide.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

  const meta = wb.addWorksheet('_메타', { state: 'hidden' })
  meta.addRows([
    ['항목', '값'],
    ['평가기간', periodLabel],
    ['평가자', reviewer.name],
    ['평가자ID', reviewer.id],
    ['방식', FORM_KIND],
    ['양식버전', FORM_VERSION],
  ])

  groups.forEach((g, gi) => {
    const name = sheetNameFor(gi, g.taskName)
    const isRank = g.method === 'rank'
    const n = g.people.length
    meta.addRow(['과제', name, g.taskId, g.method])
    const ws = wb.addWorksheet(name)
    ws.columns = [{ width: 18 }, { width: 14 }, { width: 64 }, { width: 4, hidden: true }]
    ws.mergeCells('A1:C1')
    ws.mergeCells('A2:C2')
    ws.getCell('A1').value = `과제: ${g.taskName}`
    ws.getCell('A1').font = { bold: true, size: 13 }
    ws.getCell('A2').value = isRank
      ? `평가기간: ${periodLabel} · 평가 방식: 순위 (1위 = 가장 높음, 1~${n} 중복 없이)`
      : `평가기간: ${periodLabel} · 평가 방식: 기여도 (합계 100%)`
    ws.getCell('A2').font = { color: { argb: 'FF6B7280' } }
    const header = ws.getRow(3)
    ;['평가 대상', isRank ? '순위' : '기여도(%)', '근거', '대상ID'].forEach((h, i) => {
      const c = header.getCell(i + 1)
      c.value = h
      c.fill = HEADER_FILL
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    })
    const first = 4
    g.people.forEach((person, i) => {
      const row = ws.getRow(first + i)
      const d = draft.find((x) => x.taskId === g.taskId && x.targetMemberId === person.id)
      row.getCell(1).value = person.id === reviewer.id ? `${person.name} (본인)` : person.name
      row.getCell(2).value = d?.value ?? null
      row.getCell(3).value = d?.reason || null
      row.getCell(4).value = person.id
      for (const c of [2, 3]) row.getCell(c).fill = INPUT_FILL
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      row.getCell(2).dataValidation = {
        type: 'whole',
        operator: 'between',
        allowBlank: false,
        formulae: isRank ? [1, n] : [0, 100],
        showErrorMessage: true,
        error: isRank ? `1~${n} 사이 정수를 넣어 주세요.` : '0~100 사이 숫자를 넣어 주세요.',
      }
      for (let c = 1; c <= 3; c++) row.getCell(c).border = { bottom: THIN }
      row.height = 30
    })
    const last = first + n - 1
    const range = `B${first}:B${last}`
    const foot = ws.getRow(last + 1)
    if (isRank) {
      foot.getCell(1).value = '순위 검증'
      foot.getCell(2).value = { formula: `COUNT(${range})` }
      foot.getCell(3).value = {
        formula: `IF(COUNT(${range})<${n},"빈칸 확인",IF(SUMPRODUCT((COUNTIF(${range},${range})>1)*1)>0,"순위 중복 확인","정상"))`,
      }
    } else {
      foot.getCell(1).value = '기여도 합계'
      foot.getCell(2).value = { formula: `SUM(${range})` }
      foot.getCell(3).value = { formula: `IF(B${last + 1}=100,"정상","100% 확인")` }
    }
    for (let c = 1; c <= 3; c++) {
      foot.getCell(c).fill = SUM_FILL
      foot.getCell(c).font = { bold: true }
    }
  })
  return wb
}

export async function downloadTaskPeerForms(
  reviewers: TeamMember[],
  state: PeerState & Pick<AppState, 'taskPeerReviews'>,
  periodLabel: string,
): Promise<{ files: number; skipped: string[] }> {
  const zip = new JSZip()
  const skipped: string[] = []
  let files = 0
  for (const reviewer of reviewers) {
    const groups = taskPeerGroupsFor(reviewer, state)
    if (groups.length === 0) {
      skipped.push(reviewer.name)
      continue
    }
    const wb = buildTaskPeerWorkbook(reviewer, groups, draftFor(reviewer, groups, state.taskPeerReviews), periodLabel)
    zip.file(safeFileName(`피어리뷰_과제별_${periodLabel}_${reviewer.name}.xlsx`), await wb.xlsx.writeBuffer())
    files += 1
  }
  if (files > 0) await saveBlobLocally(await zip.generateAsync({ type: 'blob' }), safeFileName(`피어리뷰_과제별_${periodLabel}_${files}명.zip`))
  return { files, skipped }
}

export interface ParsedTaskPeerFile {
  fileName: string
  reviewer: TeamMember | null
  groups: TaskPeerGroup[]
  entries: TaskPeerEntry[]
  errors: string[]
}

function s(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

export function parseTaskPeerWorkbook(buffer: ArrayBuffer, fileName: string, state: PeerState): ParsedTaskPeerFile {
  const wb = XLSX.read(buffer, { type: 'array' })
  const out: ParsedTaskPeerFile = { fileName, reviewer: null, groups: [], entries: [], errors: [] }
  const byId = new Map(state.members.map((m) => [m.id, m]))
  const byName = new Map(state.members.map((m) => [m.name.trim(), m]))
  const metaRows: unknown[][] = wb.Sheets['_메타'] ? XLSX.utils.sheet_to_json(wb.Sheets['_메타'], { header: 1 }) : []
  const meta = new Map(metaRows.map((r) => [s(r[0]), s(r[1])]))
  const reviewerName = meta.get('평가자') ?? ''
  out.reviewer = byId.get(meta.get('평가자ID') ?? '') ?? byName.get(reviewerName) ?? null
  if (!out.reviewer) {
    out.errors.push(`평가자 "${reviewerName || '(없음)'}"를 팀원 목록에서 찾지 못했습니다.`)
    return out
  }
  const sheetMeta = new Map(metaRows.filter((r) => s(r[0]) === '과제').map((r) => [s(r[1]), { taskId: s(r[2]), method: s(r[3]) }]))
  const taskByName = new Map(state.tasks.map((t) => [t.name.trim(), t]))
  const fileMethod = new Map<string, TaskPeerMethod>()

  for (const sheetName of wb.SheetNames) {
    if (sheetName === '안내' || sheetName === '_메타') continue
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null })
    const titled = s(rows[0]?.[0]).replace(/^과제:\s*/, '')
    const m = sheetMeta.get(sheetName)
    const task = state.tasks.find((t) => t.id === m?.taskId) ?? taskByName.get(titled)
    const headerIdx = rows.findIndex((r) => s(r?.[0]) === '평가 대상')
    if (headerIdx < 0) continue
    if (!task) {
      out.errors.push(`시트 "${sheetName}"의 과제 "${titled}"를 평가과제에서 찾지 못했습니다.`)
      continue
    }
    const colB = s(rows[headerIdx][1])
    const method: TaskPeerMethod = m?.method === 'rank' || m?.method === 'contribution' ? m.method : colB === '순위' ? 'rank' : 'contribution'
    fileMethod.set(task.id, method)
    // 예전 양식(수행등급 열이 있던 v1)은 근거가 D열에 있다.
    const reasonCol = s(rows[headerIdx][2]) === '근거' ? 2 : 3
    const idCol = reasonCol + 1
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] ?? []
      const label = s(r[0])
      if (!label || label === '기여도 합계' || label === '순위 검증') break
      const person = byId.get(s(r[idCol])) ?? byName.get(label.replace(/\s*\(본인\)\s*$/, ''))
      if (!person) {
        out.errors.push(`${task.name}: "${label}"를 팀원 목록에서 찾지 못했습니다.`)
        continue
      }
      const raw = s(r[1]).replace(/[%위]$/, '')
      const v = raw === '' ? null : Number(raw)
      out.entries.push({ taskId: task.id, targetMemberId: person.id, value: v !== null && Number.isFinite(v) ? v : null, reason: s(r[reasonCol]) })
    }
  }

  // 지금 앱의 과제·참여자·방식 기준으로 검사한다(양식을 받은 뒤 바뀌었으면 알려 줌).
  const current = taskPeerGroupsFor(out.reviewer, state)
  const submittedTasks = new Set(out.entries.map((e) => e.taskId))
  out.groups = current.filter((g) => submittedTasks.has(g.taskId))
  for (const tid of submittedTasks) {
    const name = state.tasks.find((t) => t.id === tid)?.name
    const g = current.find((x) => x.taskId === tid)
    if (!g) out.errors.push(`${name}: 지금은 ${out.reviewer.name}이(가) 참여하지 않는 과제입니다. 양식을 다시 내려받아 주세요.`)
    else if (fileMethod.get(tid) !== g.method)
      out.errors.push(`${name}: 평가 방식이 ${TASK_PEER_METHOD_LABEL[g.method]}(으)로 바뀌었습니다. 양식을 다시 내려받아 주세요.`)
  }
  if (out.groups.length === 0 && out.errors.length === 0) out.errors.push('입력된 과제 시트를 찾지 못했습니다.')
  if (out.errors.length === 0) for (const g of out.groups) out.errors.push(...validateTaskPeer(g, out.entries, out.reviewer.id))
  return out
}

// 과제 하나의 대상자별 결과(지금 방식의 리뷰만). 순위는 평균 순위, 기여도는 평균 %.
export interface TaskPeerResultRow {
  member: TeamMember | null
  memberId: string
  avg: number
  count: number
  reviews: TaskPeerReview[]
}

export function summarizeTaskPeer(task: Task, state: Pick<AppState, 'members' | 'taskPeerReviews'>): TaskPeerResultRow[] {
  const method = peerMethodOf(task)
  const reviews = state.taskPeerReviews.filter((r) => r.taskId === task.id && r.method === method)
  const ids = Array.from(new Set(reviews.map((r) => r.targetMemberId)))
  const rows = ids.map((id) => {
    const mine = reviews.filter((r) => r.targetMemberId === id)
    return { member: state.members.find((m) => m.id === id) ?? null, memberId: id, avg: mine.reduce((a, r) => a + r.value, 0) / mine.length, count: mine.length, reviews: mine }
  })
  return rows.sort((a, b) => (method === 'rank' ? a.avg - b.avg : b.avg - a.avg))
}

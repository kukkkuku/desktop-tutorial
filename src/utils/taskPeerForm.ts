// 과제별 피어리뷰 양식(평가자 한 명당 파일 하나). 과제마다 시트 하나에 참여자 전원(본인
// 포함)의 기여도(%)·수행등급·근거를 적는다. 결과는 기존 PeerReview와 같은 구조로 저장한다
// (docs/DATA-MODEL.md의 PeerReview -- 합계 축: 과제 + 리뷰어 고정 → 대상자 합계 100%).
// 이 양식은 과제마다 "기여도 합계" 검증 행이 있고, 올릴 때도 100%가 아니면 받지 않는다.

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type { AppState, PeerReview, PerformanceGrade, TeamMember } from '../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../types'
import { saveBlobLocally } from './localSave'
import { taskParticipants } from './rankReview'

const FORM_KIND = 'task-peer'
const FORM_VERSION = 1

export interface TaskPeerGroup {
  taskId: string
  taskName: string
  people: TeamMember[] // 본인 포함, 본인이 맨 앞
}

export interface TaskPeerEntry {
  taskId: string
  targetMemberId: string
  contribution: number | null
  grade: PerformanceGrade | null
  reason: string
}

export function taskPeerGroupsFor(reviewer: TeamMember, state: Pick<AppState, 'members' | 'contributions' | 'tasks'>): TaskPeerGroup[] {
  const out: TaskPeerGroup[] = []
  for (const task of state.tasks) {
    const people = taskParticipants(task, state)
    if (!people.some((p) => p.id === reviewer.id) || people.length < 2) continue
    out.push({ taskId: task.id, taskName: task.name, people: [reviewer, ...people.filter((p) => p.id !== reviewer.id)] })
  }
  return out
}

// 과제 하나: 모든 칸 채움, 기여도 0~100 & 합계 100, 등급 S~D, 근거 필수.
export function validateTaskPeer(group: TaskPeerGroup, entries: TaskPeerEntry[], reviewerId: string): string[] {
  const errors: string[] = []
  const p = `${group.taskName}: `
  let sum = 0
  for (const person of group.people) {
    const who = person.id === reviewerId ? `${person.name}(본인)` : person.name
    const e = entries.find((x) => x.taskId === group.taskId && x.targetMemberId === person.id)
    if (!e || e.contribution === null) errors.push(`${p}${who}의 기여도가 비어 있습니다.`)
    else if (e.contribution < 0 || e.contribution > 100) errors.push(`${p}${who}의 기여도 ${e.contribution}은(는) 0~100 사이여야 합니다.`)
    else sum += e.contribution
    if (!e?.grade) errors.push(`${p}${who}의 수행등급이 비어 있습니다(S/A/B/C/D).`)
    if (!e?.reason.trim()) errors.push(`${p}${who}의 근거가 비어 있습니다. 근거는 꼭 적어야 합니다.`)
  }
  if (Math.abs(sum - 100) > 0.01 && !errors.some((x) => x.includes('기여도가 비어'))) errors.push(`${p}기여도 합계가 ${sum}%입니다. 100%가 되게 맞춰 주세요.`)
  return errors
}

export function toPeerReviews(reviewer: TeamMember, groups: TaskPeerGroup[], entries: TaskPeerEntry[]): PeerReview[] {
  const out: PeerReview[] = []
  for (const g of groups)
    for (const person of g.people) {
      const e = entries.find((x) => x.taskId === g.taskId && x.targetMemberId === person.id)
      if (!e || e.contribution === null || !e.grade) continue
      out.push({
        id: uuidv4(),
        taskId: g.taskId,
        reviewerMemberId: reviewer.id,
        reviewerName: reviewer.name,
        targetMemberId: person.id,
        contributionPercent: e.contribution,
        grade: e.grade,
        comment: e.reason.trim(),
      })
    }
  return out
}

// 이미 낸 리뷰가 있으면 그 값을, 없으면 기여도만 균등으로 채운 초안.
export function draftFor(reviewer: TeamMember, groups: TaskPeerGroup[], existing: PeerReview[]): TaskPeerEntry[] {
  const out: TaskPeerEntry[] = []
  for (const g of groups) {
    const base = Math.floor(100 / g.people.length)
    const rest = 100 - base * g.people.length
    g.people.forEach((person, i) => {
      const r = existing.find((x) => x.taskId === g.taskId && x.targetMemberId === person.id && (x.reviewerMemberId === reviewer.id || x.reviewerName === reviewer.name))
      out.push({
        taskId: g.taskId,
        targetMemberId: person.id,
        contribution: r?.contributionPercent ?? base + (i < rest ? 1 : 0),
        grade: r?.grade ?? null,
        reason: r?.comment ?? '',
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
  guide.columns = [{ width: 12 }, { width: 76 }]
  guide.mergeCells('A1:B1')
  guide.mergeCells('A2:B2')
  guide.getCell('A1').value = '피어리뷰 입력 안내'
  guide.getCell('A1').font = { bold: true, size: 14 }
  guide.getCell('A2').value = '과제별로 평가 대상 팀원의 기여도·수행등급·근거를 입력합니다.'
  guide.getRow(4).values = ['구분', '입력 안내']
  guide.getRow(4).eachCell((c) => {
    c.fill = HEADER_FILL
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  })
  guide.addRows([
    ['1', `평가기간(${periodLabel})·평가자(${reviewer.name})·과제·대상 팀원은 현재 데이터로 입력되어 있습니다.`],
    ['2', '과제별 시트의 연한 주황색 칸에 기여도·수행등급·근거를 입력합니다. 근거는 모든 칸에 꼭 적어 주세요.'],
    ['3', '과제별 평가 대상의 기여도 합계가 100%인지 확인합니다(맨 아래 "검증" 칸).'],
  ])

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
    meta.addRow(['과제', name, g.taskId])
    const ws = wb.addWorksheet(name)
    ws.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 56 }, { width: 4, hidden: true }]
    ws.mergeCells('A1:D1')
    ws.mergeCells('A2:D2')
    ws.getCell('A1').value = `과제: ${g.taskName}`
    ws.getCell('A1').font = { bold: true, size: 13 }
    ws.getCell('A2').value = `평가기간: ${periodLabel}`
    ws.getCell('A2').font = { color: { argb: 'FF6B7280' } }
    const header = ws.getRow(3)
    ;['평가 대상', '기여도(%)', '수행등급', '근거', '대상ID'].forEach((h, i) => {
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
      row.getCell(2).value = d?.contribution ?? null
      row.getCell(3).value = d?.grade ?? null
      row.getCell(4).value = d?.reason || null
      row.getCell(5).value = person.id
      for (const c of [2, 3, 4]) row.getCell(c).fill = INPUT_FILL
      row.getCell(4).alignment = { wrapText: true, vertical: 'top' }
      row.getCell(2).dataValidation = {
        type: 'whole',
        operator: 'between',
        allowBlank: false,
        formulae: [0, 100],
        showErrorMessage: true,
        error: '0~100 사이 숫자를 넣어 주세요.',
      }
      row.getCell(3).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${PERFORMANCE_GRADE_OPTIONS.join(',')}"`],
        showErrorMessage: true,
        error: 'S/A/B/C/D 중에서 고르세요.',
      }
      for (let c = 1; c <= 4; c++) row.getCell(c).border = { bottom: THIN }
      row.height = 30
    })
    const last = first + g.people.length - 1
    const sum = ws.getRow(last + 1)
    sum.getCell(1).value = '기여도 합계'
    sum.getCell(2).value = { formula: `SUM(B${first}:B${last})` }
    sum.getCell(3).value = '검증'
    sum.getCell(4).value = { formula: `IF(B${last + 1}=100,"정상","100% 확인")` }
    for (let c = 1; c <= 4; c++) {
      sum.getCell(c).fill = SUM_FILL
      sum.getCell(c).font = { bold: true }
    }
  })
  return wb
}

export async function downloadTaskPeerForms(
  reviewers: TeamMember[],
  state: Pick<AppState, 'members' | 'contributions' | 'tasks' | 'peerReviews'>,
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
    const wb = buildTaskPeerWorkbook(reviewer, groups, draftFor(reviewer, groups, state.peerReviews), periodLabel)
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

export function parseTaskPeerWorkbook(buffer: ArrayBuffer, fileName: string, state: Pick<AppState, 'members' | 'contributions' | 'tasks'>): ParsedTaskPeerFile {
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
  const sheetTask = new Map(metaRows.filter((r) => s(r[0]) === '과제').map((r) => [s(r[1]), s(r[2])]))
  const taskByName = new Map(state.tasks.map((t) => [t.name.trim(), t]))

  for (const sheetName of wb.SheetNames) {
    if (sheetName === '안내' || sheetName === '_메타') continue
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null })
    const titled = s(rows[0]?.[0]).replace(/^과제:\s*/, '')
    const task = state.tasks.find((t) => t.id === sheetTask.get(sheetName)) ?? taskByName.get(titled)
    const headerIdx = rows.findIndex((r) => s(r?.[0]) === '평가 대상')
    if (headerIdx < 0) continue
    if (!task) {
      out.errors.push(`시트 "${sheetName}"의 과제 "${titled}"를 평가과제에서 찾지 못했습니다.`)
      continue
    }
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] ?? []
      const label = s(r[0])
      if (!label || label === '기여도 합계') break
      const person = byId.get(s(r[4])) ?? byName.get(label.replace(/\s*\(본인\)\s*$/, ''))
      if (!person) {
        out.errors.push(`${task.name}: "${label}"를 팀원 목록에서 찾지 못했습니다.`)
        continue
      }
      const rawC = s(r[1])
      const c = rawC === '' ? null : Number(rawC)
      const g = s(r[2]).toUpperCase()
      out.entries.push({
        taskId: task.id,
        targetMemberId: person.id,
        contribution: c !== null && Number.isFinite(c) ? c : null,
        grade: (PERFORMANCE_GRADE_OPTIONS as string[]).includes(g) ? (g as PerformanceGrade) : null,
        reason: s(r[3]),
      })
    }
  }

  // 지금 앱의 과제·참여자 기준으로 검사한다(양식을 받은 뒤 참여자가 바뀌었으면 알려 줌).
  const current = taskPeerGroupsFor(out.reviewer, state)
  const submittedTasks = new Set(out.entries.map((e) => e.taskId))
  out.groups = current.filter((g) => submittedTasks.has(g.taskId))
  for (const tid of submittedTasks)
    if (!current.some((g) => g.taskId === tid))
      out.errors.push(`${state.tasks.find((t) => t.id === tid)?.name}: 지금은 ${out.reviewer.name}이(가) 참여하지 않는 과제입니다. 양식을 다시 내려받아 주세요.`)
  if (out.groups.length === 0 && out.errors.length === 0) out.errors.push('입력된 과제 시트를 찾지 못했습니다.')
  for (const g of out.groups) out.errors.push(...validateTaskPeer(g, out.entries, out.reviewer.id))
  return out
}

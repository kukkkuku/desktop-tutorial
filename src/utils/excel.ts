import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { v4 as uuidv4 } from 'uuid'
import type {
  Contribution,
  Criteria,
  Importance,
  Level,
  MeetingNote,
  PeerReview,
  PerformanceGrade,
  Task,
  TeamMember,
  Workload,
} from '../types'
import { IMPORTANCE_OPTIONS, LEVEL_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import { calcAllTaskScores, calcMemberParticipation, calcMemberResults, calcTaskScore } from './calculations'
import { calcYearsSince } from './tenure'
import { applySheetStyle, type StyledColumn } from './excelStyle'

// ---------- Styled workbook download (exceljs) ----------
// exceljs is used for every file the app *writes* because it can actually
// carry cell styling (fills, fonts, borders) into the .xlsx output -- the
// SheetJS Community Edition build used for *reading* uploads silently drops
// style information when writing, so it can't produce the styled templates.

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
}

function styledWorkbookToCsvText(wb: ExcelJS.Workbook): string {
  return wb.worksheets
    .map((ws) => {
      const lines: string[] = []
      ws.eachRow({ includeEmpty: false }, (row) => {
        const values = (row.values as unknown[]).slice(1)
        lines.push(values.map((v) => csvEscape(v == null ? '' : String(v))).join(','))
      })
      return `# ${ws.name}\n${lines.join('\n')}`
    })
    .join('\n\n')
}

async function saveStyledViaClaudeDownloads(wb: ExcelJS.Workbook, filename: string): Promise<boolean> {
  const downloads = window.claude?.downloads
  if (!downloads) return false

  const text = '﻿' + styledWorkbookToCsvText(wb) // U+FEFF BOM so Excel reads Korean text correctly

  try {
    await downloads.save({ filename: filename.replace(/\.xlsx$/i, '.csv'), data: text })
    return true
  } catch (err) {
    const code = (err as ClaudeDownloadsError | undefined)?.code
    if (code === 'declined') return false
    if (code !== 'extension_not_enabled' && code !== 'rejected_extension') {
      console.error('다운로드 실패:', err)
      alert('다운로드에 실패했습니다: ' + ((err as ClaudeDownloadsError | undefined)?.message ?? '알 수 없는 오류'))
      return false
    }
  }

  try {
    await downloads.save({ filename: filename.replace(/\.xlsx$/i, '.txt'), data: text })
    return true
  } catch (err) {
    const code = (err as ClaudeDownloadsError | undefined)?.code
    if (code === 'declined') return false
    console.error('다운로드 실패:', err)
    alert('다운로드에 실패했습니다: ' + ((err as ClaudeDownloadsError | undefined)?.message ?? '알 수 없는 오류'))
    return false
  }
}

async function downloadStyledWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<boolean> {
  if (window.claude?.downloads) return saveStyledViaClaudeDownloads(wb, filename)
  try {
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch (err) {
    console.error('엑셀 다운로드 실패:', err)
    alert(
      '엑셀 다운로드에 실패했습니다. 이 창이 미리보기(임베드) 화면이라면 브라우저 새 탭에서 열어 다시 시도해주세요.',
    )
    return false
  }
}

function addStyledSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  columns: StyledColumn[],
  rows: (string | number)[][],
  emptyRowCount = 300,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(sheetName)
  applySheetStyle(ws, columns, emptyRowCount)
  rows.forEach((rowValues, i) => {
    const row = ws.getRow(i + 2)
    rowValues.forEach((value, colIndex) => {
      row.getCell(colIndex + 1).value = value
    })
  })
  return ws
}

// ---------- Task template / import ----------

const TASK_COLUMNS: StyledColumn[] = [
  { header: '과제명', width: 24, role: 'freetext' },
  { header: '과제등급', width: 10, role: 'category' },
  { header: '업무량', width: 8, role: 'category' },
  { header: '목표', width: 28, role: 'freetext' },
  { header: '성과', width: 28, role: 'freetext' },
  { header: '성과등급', width: 10, role: 'category' },
]

function buildTaskTemplateWorkbook(): ExcelJS.Workbook {
  const rows: (string | number)[][] = [
    ['신규 랜딩페이지 제작', '핵심', '대', '전환율 15% 개선', '전환율 18% 달성', 'A'],
    ['내부 협업툴 정비', '일반', '소', '', '', ''],
  ]
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '과제양식', TASK_COLUMNS, rows)
  return wb
}

export async function downloadTaskTemplate() {
  await downloadStyledWorkbook(buildTaskTemplateWorkbook(), '과제_업로드_양식.xlsx')
}

// 빈 양식(위 downloadTaskTemplate)과 달리 지금 등록된 과제를 그대로 내보낸다.
export async function downloadCurrentTasksExcel(tasks: Task[], criteria: Criteria) {
  const rows: (string | number)[][] = tasks.map((task) => [
    task.name,
    task.importance,
    task.workload,
    task.objective || '-',
    task.achievement || '-',
    task.performanceGrade,
    Number(calcTaskScore(task, criteria).toFixed(1)),
  ])
  const columns: StyledColumn[] = [...TASK_COLUMNS, { header: '점수', width: 10, role: 'metric' }]
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '과제현황', columns, rows, 0)
  await downloadStyledWorkbook(wb, `과제현황_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export interface TaskImportResult {
  tasks: Task[]
  errors: string[]
  importedCount: number
  addedCount: number
  updatedCount: number
  addedIds: string[]
}

export function parseTaskWorkbook(buffer: ArrayBuffer, existingTasks: Task[]): TaskImportResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const errors: string[] = []
  const byName = new Map(existingTasks.map((t) => [t.name, t]))
  let importedCount = 0
  let addedCount = 0
  let updatedCount = 0
  const addedIds: string[] = []

  rows.forEach((row, index) => {
    const rowNum = index + 2
    const name = String(row['과제명'] ?? '').trim()
    const importanceRaw = String(row['과제등급'] ?? '').trim()
    const workloadRaw = String(row['업무량'] ?? '').trim()
    const objective = String(row['목표'] ?? '').trim()
    const achievement = String(row['성과'] ?? '').trim()
    const performanceGradeRaw = String(row['성과등급'] ?? '').trim().toUpperCase()

    const importance = (importanceRaw || '일반') as Importance
    const workload = (workloadRaw || '중') as Workload
    const performanceGrade = (performanceGradeRaw || 'B') as PerformanceGrade

    if (!name) {
      errors.push(`${rowNum}행: 과제명이 비어 있어 건너뛰었습니다.`)
      return
    }
    if (importanceRaw && !IMPORTANCE_OPTIONS.includes(importance)) {
      errors.push(`${rowNum}행 '${name}': 과제등급 '${row['과제등급']}'은(는) 유효하지 않습니다. (중점/핵심/일반/지원)`)
      return
    }
    if (workloadRaw && !WORKLOAD_OPTIONS.includes(workload)) {
      errors.push(`${rowNum}행 '${name}': 업무량 '${row['업무량']}'은(는) 유효하지 않습니다. (대/중/소)`)
      return
    }
    if (performanceGradeRaw && !PERFORMANCE_GRADE_OPTIONS.includes(performanceGrade)) {
      errors.push(`${rowNum}행 '${name}': 성과등급 '${row['성과등급']}'은(는) 유효하지 않습니다. (S/A/B/C/D)`)
      return
    }

    const existing = byName.get(name)
    const task: Task = {
      id: existing?.id ?? uuidv4(),
      name,
      importance,
      workload,
      objective,
      achievement,
      performanceGrade,
    }
    byName.set(name, task)
    importedCount += 1
    if (existing) {
      updatedCount += 1
    } else {
      addedCount += 1
      addedIds.push(task.id)
    }
  })

  return { tasks: Array.from(byName.values()), errors, importedCount, addedCount, updatedCount, addedIds }
}

// ---------- Team member template / import ----------

const MEMBER_COLUMNS: StyledColumn[] = [
  { header: '이름', width: 12, role: 'freetext' },
  { header: '직급', width: 10, role: 'category' },
  { header: '연차', width: 8, role: 'freetext' },
  { header: '역할', width: 16, role: 'freetext' },
  { header: '코멘트', width: 30, role: 'freetext' },
]

function buildMemberTemplateWorkbook(): ExcelJS.Workbook {
  const rows: (string | number)[][] = [
    ['김민준', '과장', 7, '리드', ''],
    ['이서연', '대리', 3, '디자인', ''],
  ]
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '팀원양식', MEMBER_COLUMNS, rows)
  return wb
}

export async function downloadMemberTemplate() {
  await downloadStyledWorkbook(buildMemberTemplateWorkbook(), '팀원_업로드_양식.xlsx')
}

const CURRENT_MEMBER_COLUMNS: StyledColumn[] = [
  { header: '이름', width: 14, role: 'freetext' },
  { header: '근속', width: 8, role: 'metric' },
  { header: '직급', width: 8, role: 'category' },
  { header: '연차', width: 10, role: 'metric' },
  { header: '역할', width: 16, role: 'freetext' },
  { header: '참여 과제 수', width: 12, role: 'metric' },
  { header: '받은 피어리뷰', width: 12, role: 'metric' },
  { header: '활성여부', width: 10, role: 'category' },
]

// 빈 양식(위 downloadMemberTemplate)과 달리 지금 등록된 팀원을 화면(팀원
// 관리 표)과 같은 컬럼 순서로 그대로 내보낸다.
export async function downloadCurrentMembersExcel(members: TeamMember[], tasks: Task[], contributions: Contribution[], peerReviews: PeerReview[]) {
  const rows: (string | number)[][] = members.map((member) => {
    const service = calcYearsSince(member.hireDate)
    const levelTenure = calcYearsSince(member.currentLevelSince)
    const { count } = calcMemberParticipation(member, tasks, contributions)
    const peerReviewCount = peerReviews.filter((r) => r.targetMemberId === member.id).length
    return [
      member.name,
      service !== null ? `${service}년` : '-',
      member.level || '-',
      levelTenure !== null ? `${levelTenure}년차` : '-',
      member.role || '-',
      count,
      peerReviewCount,
      member.active ? '활성' : '비활성',
    ]
  })
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '팀원현황', CURRENT_MEMBER_COLUMNS, rows, 0)
  await downloadStyledWorkbook(wb, `팀원현황_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export interface MemberImportResult {
  members: TeamMember[]
  errors: string[]
  importedCount: number
  addedCount: number
  updatedCount: number
  addedIds: string[]
}

export function parseMemberWorkbook(buffer: ArrayBuffer, existingMembers: TeamMember[]): MemberImportResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const errors: string[] = []
  const byName = new Map(existingMembers.map((m) => [m.name, m]))
  let importedCount = 0
  let addedCount = 0
  let updatedCount = 0
  const addedIds: string[] = []

  rows.forEach((row, index) => {
    const rowNum = index + 2
    const name = String(row['이름'] ?? '').trim()
    const levelRaw = String(row['직급'] ?? '').trim()
    const yearsRaw = row['연차']
    const role = String(row['역할'] ?? '').trim()
    const comment = String(row['코멘트'] ?? '').trim()

    if (!name) {
      errors.push(`${rowNum}행: 이름이 비어 있어 건너뛰었습니다.`)
      return
    }
    const levelValid = !levelRaw || LEVEL_OPTIONS.includes(levelRaw as Level)
    if (!levelValid) {
      errors.push(`${rowNum}행 '${name}': 직급 '${levelRaw}'은(는) 유효하지 않아 비워두고 등록했습니다. (사원/대리/과장/차장)`)
    }
    const yearsOfService = yearsRaw === '' || yearsRaw === undefined ? null : Number(yearsRaw)
    if (yearsOfService !== null && Number.isNaN(yearsOfService)) {
      errors.push(`${rowNum}행 '${name}': 연차 '${yearsRaw}'는 숫자여야 합니다.`)
      return
    }

    const existing = byName.get(name)
    const member: TeamMember = {
      id: existing?.id ?? uuidv4(),
      name,
      active: existing?.active ?? true,
      level: levelValid ? (levelRaw as Level) || '' : '',
      yearsOfService,
      role,
      comment,
    }
    byName.set(name, member)
    importedCount += 1
    if (existing) {
      updatedCount += 1
    } else {
      addedCount += 1
      addedIds.push(member.id)
    }
  })

  return { members: Array.from(byName.values()), errors, importedCount, addedCount, updatedCount, addedIds }
}

// ---------- Peer review template / import ----------

const PEER_REVIEW_COLUMNS: StyledColumn[] = [
  { header: '리뷰어', width: 12, role: 'metric' },
  { header: '대상팀원', width: 12, role: 'metric' },
  { header: '등급', width: 8, role: 'category' },
]

function buildPeerReviewTemplateWorkbook(members: TeamMember[]): ExcelJS.Workbook {
  const rows: (string | number)[][] = members.map((member) => ['', member.name, ''])
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '피어리뷰양식', PEER_REVIEW_COLUMNS, rows)
  return wb
}

export async function downloadPeerReviewTemplate(members: TeamMember[]) {
  await downloadStyledWorkbook(buildPeerReviewTemplateWorkbook(members), '피어리뷰_업로드_양식.xlsx')
}

// 빈 양식(위 downloadPeerReviewTemplate)과 달리 지금 등록된 피어리뷰를
// 그대로 내보낸다.
export async function downloadCurrentPeerReviewsExcel(peerReviews: PeerReview[], members: TeamMember[]) {
  const sorted = [...peerReviews].sort((a, b) => {
    const targetA = members.find((m) => m.id === a.targetMemberId)?.name ?? ''
    const targetB = members.find((m) => m.id === b.targetMemberId)?.name ?? ''
    return targetA.localeCompare(targetB) || a.reviewerName.localeCompare(b.reviewerName)
  })
  const rows: (string | number)[][] = []
  for (const review of sorted) {
    const target = members.find((m) => m.id === review.targetMemberId)
    if (!target) continue
    rows.push([review.reviewerName, target.name, review.grade])
  }
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '피어리뷰현황', PEER_REVIEW_COLUMNS, rows, 0)
  await downloadStyledWorkbook(wb, `피어리뷰현황_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export interface PeerReviewImportResult {
  peerReviews: PeerReview[]
  errors: string[]
  importedCount: number
  addedCount: number
  updatedCount: number
  affectedTargetNames: string[]
}

const REVIEWER_HEADER_ALIASES = ['리뷰어', '평가자', '리뷰자']
const TARGET_HEADER_ALIASES = ['대상팀원', '평가대상', '평가 대상', '대상자', '피평가자']
const GRADE_HEADER_ALIASES = ['등급', '평가등급', '점수']

function pickColumn(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias]
    if (value !== undefined && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

export function parsePeerReviewWorkbook(
  buffer: ArrayBuffer,
  members: TeamMember[],
  existingPeerReviews: PeerReview[],
): PeerReviewImportResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const errors: string[] = []
  const byKey = new Map(existingPeerReviews.map((r) => [`${r.reviewerName}::${r.targetMemberId}`, r]))
  const memberByName = new Map(members.map((m) => [m.name, m]))
  let importedCount = 0
  let addedCount = 0
  let updatedCount = 0
  let contentRowCount = 0
  const affectedTargetNames = new Set<string>()

  rows.forEach((row, index) => {
    const rowNum = index + 2
    const hasAnyContent = Object.values(row).some((v) => String(v ?? '').trim() !== '')
    if (!hasAnyContent) return
    contentRowCount += 1

    const reviewerName = pickColumn(row, REVIEWER_HEADER_ALIASES)
    const targetName = pickColumn(row, TARGET_HEADER_ALIASES)
    const gradeRaw = pickColumn(row, GRADE_HEADER_ALIASES).toUpperCase()

    if (!reviewerName || !targetName || !gradeRaw) {
      errors.push(
        `${rowNum}행: 리뷰어/대상팀원/등급 컬럼을 찾지 못했습니다. 엑셀 헤더가 '리뷰어', '대상팀원', '등급'인지 확인해주세요.`,
      )
      return
    }

    const targetMember = memberByName.get(targetName)
    if (!targetMember) {
      errors.push(`${rowNum}행: 대상팀원 '${targetName}'을(를) 찾을 수 없습니다.`)
      return
    }
    if (!PERFORMANCE_GRADE_OPTIONS.includes(gradeRaw as PerformanceGrade)) {
      errors.push(`${rowNum}행 '${reviewerName}→${targetName}': 등급 '${gradeRaw}'은(는) 유효하지 않습니다. (S/A/B/C/D)`)
      return
    }

    const key = `${reviewerName}::${targetMember.id}`
    const existing = byKey.get(key)
    const review: PeerReview = {
      id: existing?.id ?? uuidv4(),
      reviewerName,
      targetMemberId: targetMember.id,
      grade: gradeRaw as PerformanceGrade,
    }
    byKey.set(key, review)
    affectedTargetNames.add(targetName)
    importedCount += 1
    if (existing) {
      updatedCount += 1
    } else {
      addedCount += 1
    }
  })

  if (contentRowCount === 0) {
    errors.push('업로드한 파일에 내용이 없습니다. 다운로드한 양식에 리뷰어/대상팀원/등급을 채워 업로드해주세요.')
  }

  return {
    peerReviews: Array.from(byKey.values()),
    errors,
    importedCount,
    addedCount,
    updatedCount,
    affectedTargetNames: Array.from(affectedTargetNames),
  }
}

// ---------- Evaluation matrix current data export ----------

const MATRIX_COLUMNS: StyledColumn[] = [
  { header: '과제명', width: 24, role: 'freetext' },
  { header: '팀원', width: 12, role: 'freetext' },
  { header: '기여도(%)', width: 12, role: 'metric' },
  { header: '개인수행등급', width: 14, role: 'metric' },
  { header: '과제 점수', width: 10, role: 'metric' },
  { header: '가중 점수', width: 10, role: 'metric' },
]

// 평가 매트릭스 화면에 입력된 과제×팀원 기여도/개인수행등급을 행 단위로
// 풀어서 내보낸다(매트릭스 자체는 2차원 표라 그대로 시트에 옮기기보다
// 과제별상세처럼 한 줄에 한 조합씩 나열하는 편이 읽기 쉽다).
export async function downloadCurrentMatrixExcel(tasks: Task[], members: TeamMember[], contributions: Contribution[], criteria: Criteria) {
  const rows: (string | number)[][] = []
  for (const task of tasks) {
    const taskScore = calcTaskScore(task, criteria)
    for (const member of members.filter((m) => m.active)) {
      const contribution = contributions.find((c) => c.taskId === task.id && c.memberId === member.id)
      if (!contribution || contribution.contributionPercent <= 0) continue
      const personalFactor = criteria.personalGradeWeight > 0 ? contribution.personalPerformanceGrade : '미사용'
      rows.push([
        task.name,
        member.name,
        contribution.contributionPercent,
        personalFactor,
        Number(taskScore.toFixed(1)),
        Number((taskScore * (contribution.contributionPercent / 100)).toFixed(1)),
      ])
    }
  }
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '평가매트릭스', MATRIX_COLUMNS, rows, 0)
  await downloadStyledWorkbook(wb, `평가매트릭스_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ---------- Unified data management (all three templates + content-based upload routing) ----------

export type WorkbookKind = 'task' | 'member' | 'peer'

// Classifies an uploaded file by its header row instead of its filename, so
// renamed downloads (or files re-saved by email/chat apps) still route to
// the right parser.
export function detectWorkbookKind(buffer: ArrayBuffer): WorkbookKind | null {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const headerRow: unknown[] = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as unknown[]) ?? []
  const headers = new Set(headerRow.map((h) => String(h ?? '').trim()))

  if (headers.has('과제명')) return 'task'
  const hasPeerHeaders =
    REVIEWER_HEADER_ALIASES.some((h) => headers.has(h)) && TARGET_HEADER_ALIASES.some((h) => headers.has(h))
  if (hasPeerHeaders) return 'peer'
  if (headers.has('이름')) return 'member'
  return null
}

export async function downloadAllTemplatesZip(members: TeamMember[]) {
  const zip = new JSZip()
  const [taskBuf, memberBuf, peerBuf] = await Promise.all([
    buildTaskTemplateWorkbook().xlsx.writeBuffer(),
    buildMemberTemplateWorkbook().xlsx.writeBuffer(),
    buildPeerReviewTemplateWorkbook(members).xlsx.writeBuffer(),
  ])
  zip.file('과제_업로드_양식.xlsx', taskBuf)
  zip.file('팀원_업로드_양식.xlsx', memberBuf)
  zip.file('피어리뷰_업로드_양식.xlsx', peerBuf)

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '전체_업로드_양식.zip'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- Results report export ----------

const RANK_COLUMNS: StyledColumn[] = [
  { header: '순위', width: 6, role: 'category' },
  { header: '이름', width: 12, role: 'freetext' },
  { header: '역할', width: 14, role: 'freetext' },
  { header: '직급', width: 10, role: 'freetext' },
  { header: '참여 과제 수', width: 12, role: 'metric' },
  { header: '종합 점수(가중평균)', width: 16, role: 'metric' },
  { header: '누적 점수', width: 16, role: 'metric' },
  { header: '평가등급', width: 10, role: 'category' },
]

const DETAIL_COLUMNS: StyledColumn[] = [
  { header: '팀원', width: 12, role: 'freetext' },
  { header: '과제명', width: 20, role: 'freetext' },
  { header: '과제점수', width: 10, role: 'metric' },
  { header: '기여도(%)', width: 10, role: 'metric' },
  { header: '개인수행등급', width: 12, role: 'metric' },
  { header: '목표', width: 24, role: 'freetext' },
  { header: '성과', width: 24, role: 'freetext' },
  { header: '성과등급', width: 10, role: 'metric' },
  { header: '가중점수', width: 10, role: 'metric' },
  { header: '기여도합계 100% 여부', width: 16, role: 'metric' },
]

const NOTES_COLUMNS: StyledColumn[] = [
  { header: '팀원', width: 12, role: 'freetext' },
  { header: '날짜', width: 12, role: 'metric' },
  { header: '면담 코멘트', width: 50, role: 'freetext' },
]

const REPORT_PEER_REVIEW_COLUMNS: StyledColumn[] = [
  { header: '대상팀원', width: 12, role: 'freetext' },
  { header: '리뷰어', width: 12, role: 'freetext' },
  { header: '등급', width: 8, role: 'category' },
]

export async function downloadResultsReport(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[] = [],
  peerReviews: PeerReview[] = [],
) {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))

  const rankRows: (string | number)[][] = results.map((row, index) => [
    index + 1,
    row.member.name,
    row.member.role || '-',
    row.member.level || '-',
    row.participatedTaskCount,
    Number(row.weightedAverageScore.toFixed(1)),
    Number(row.cumulativeScore.toFixed(1)),
    row.grade,
  ])

  const detailRows: (string | number)[][] = []
  for (const task of tasks) {
    const taskScore = taskScoreMap.get(task.id) ?? 0
    const taskContributions = contributions.filter((c) => c.taskId === task.id && c.contributionPercent > 0)
    const sum = taskContributions.reduce((s, c) => s + c.contributionPercent, 0)
    const sumOk = Math.abs(sum - 100) <= 0.01 ? 'OK' : `${sum.toFixed(1)}%`
    for (const c of taskContributions) {
      const member = members.find((m) => m.id === c.memberId)
      if (!member) continue
      const personalFactor = criteria.personalGradeWeight > 0 ? c.personalPerformanceGrade : '미사용'
      const weighted = taskScore * (c.contributionPercent / 100)
      detailRows.push([
        member.name,
        task.name,
        Number(taskScore.toFixed(1)),
        c.contributionPercent,
        personalFactor,
        task.objective || '-',
        task.achievement || '-',
        task.performanceGrade,
        Number(weighted.toFixed(1)),
        sumOk,
      ])
    }
  }

  const sortedNotes = [...meetingNotes].sort((a, b) => {
    const memberA = members.find((m) => m.id === a.memberId)?.name ?? ''
    const memberB = members.find((m) => m.id === b.memberId)?.name ?? ''
    return memberA.localeCompare(memberB) || a.date.localeCompare(b.date)
  })
  const notesRows: (string | number)[][] = []
  for (const note of sortedNotes) {
    const member = members.find((m) => m.id === note.memberId)
    if (!member) continue
    notesRows.push([member.name, note.date, note.comment])
  }

  const sortedReviews = [...peerReviews].sort((a, b) => {
    const targetA = members.find((m) => m.id === a.targetMemberId)?.name ?? ''
    const targetB = members.find((m) => m.id === b.targetMemberId)?.name ?? ''
    return targetA.localeCompare(targetB) || a.reviewerName.localeCompare(b.reviewerName)
  })
  const peerReviewRows: (string | number)[][] = []
  for (const review of sortedReviews) {
    const target = members.find((m) => m.id === review.targetMemberId)
    if (!target) continue
    peerReviewRows.push([target.name, review.reviewerName, review.grade])
  }

  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '순위표', RANK_COLUMNS, rankRows)
  addStyledSheet(wb, '과제별상세', DETAIL_COLUMNS, detailRows)
  addStyledSheet(wb, '면담기록', NOTES_COLUMNS, notesRows)
  addStyledSheet(wb, '피어리뷰', REPORT_PEER_REVIEW_COLUMNS, peerReviewRows)
  await downloadStyledWorkbook(wb, `평가결과_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// Per-member result files, meant to be handed to each person individually
// instead of giving everyone access to the full team results (which would
// expose the whole ranking and everyone else's scores).

const SUMMARY_COLUMNS: StyledColumn[] = [
  { header: '항목', width: 18, role: 'category' },
  { header: '값', width: 20, role: 'freetext' },
]

const INDIVIDUAL_TASK_COLUMNS: StyledColumn[] = [
  { header: '과제명', width: 24, role: 'freetext' },
  { header: '기여도(%)', width: 12, role: 'metric' },
  { header: '개인수행등급', width: 14, role: 'metric' },
  { header: '과제점수', width: 10, role: 'metric' },
  { header: '가중점수', width: 10, role: 'metric' },
]

const INDIVIDUAL_NOTES_COLUMNS: StyledColumn[] = [
  { header: '날짜', width: 12, role: 'metric' },
  { header: '면담 코멘트', width: 50, role: 'freetext' },
]

export async function downloadIndividualResultReports(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[] = [],
  peerReviews: PeerReview[] = [],
) {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))
  const dateStr = new Date().toISOString().slice(0, 10)
  const zip = new JSZip()

  for (const row of results) {
    const member = row.member

    const summaryRows: (string | number)[][] = [
      ['이름', member.name],
      ['역할', member.role || '-'],
      ['직급', member.level || '-'],
      ['참여 과제 수', row.participatedTaskCount],
      ['종합 점수(가중평균)', Number(row.weightedAverageScore.toFixed(1))],
      ['누적 점수', Number(row.cumulativeScore.toFixed(1))],
      ['평가등급', row.grade],
    ]

    const taskRows: (string | number)[][] = []
    for (const task of tasks) {
      const contribution = contributions.find((c) => c.taskId === task.id && c.memberId === member.id)
      if (!contribution || contribution.contributionPercent <= 0) continue
      const taskScore = taskScoreMap.get(task.id) ?? 0
      const weighted = taskScore * (contribution.contributionPercent / 100)
      taskRows.push([
        task.name,
        contribution.contributionPercent,
        criteria.personalGradeWeight > 0 ? contribution.personalPerformanceGrade : '미사용',
        Number(taskScore.toFixed(1)),
        Number(weighted.toFixed(1)),
      ])
    }

    const memberNotes = meetingNotes
      .filter((n) => n.memberId === member.id)
      .sort((a, b) => a.date.localeCompare(b.date))
    const notesRows: (string | number)[][] = memberNotes.map((note) => [note.date, note.comment])

    const wb = new ExcelJS.Workbook()
    addStyledSheet(wb, '요약', SUMMARY_COLUMNS, summaryRows, summaryRows.length)
    addStyledSheet(wb, '참여 과제', INDIVIDUAL_TASK_COLUMNS, taskRows)
    addStyledSheet(wb, '면담기록', INDIVIDUAL_NOTES_COLUMNS, notesRows)

    const buffer = await wb.xlsx.writeBuffer()
    zip.file(`${member.name}_평가결과_${dateStr}.xlsx`, buffer)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `팀원별_평가결과_${dateStr}.zip`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

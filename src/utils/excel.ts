import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { v4 as uuidv4 } from 'uuid'
import type {
  AppState,
  Contribution,
  Criteria,
  EvaluationStatus,
  Importance,
  Level,
  MeetingActionItem,
  MeetingNote,
  PeerReview,
  PerformanceGrade,
  Task,
  TeamMember,
  WorkspaceMeta,
  Workload,
} from '../types'
import { IMPORTANCE_OPTIONS, LEVEL_OPTIONS, PERFORMANCE_GRADE_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import { calcAllTaskScores, calcMemberParticipation, calcMemberResults, calcTaskScore } from './calculations'
import { calcYearsSince } from './tenure'
import { applySheetStyle, type StyledColumn } from './excelStyle'
import { getMemberPerformanceHistory } from './memberHistory'

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
// 팀장이 상급자에게 바로 보여줄 수 있는 문서를 목표로, 시트 4개로 고정한다:
// 01 팀원 성과결과(요약) → 02 개인별 상세 → 03 과제별 결과 → 04 평가기준.

const SUMMARY_RESULT_COLUMNS: StyledColumn[] = [
  { header: '팀원', width: 12, role: 'freetext' },
  { header: '직급', width: 10, role: 'freetext' },
  { header: '성과점수', width: 12, role: 'metric' },
  { header: '최종 고과', width: 10, role: 'category' },
  { header: '전년도 고과', width: 12, role: 'metric' },
  { header: '증감', width: 10, role: 'metric' },
  { header: '비고', width: 24, role: 'freetext' },
]

const MEMBER_DETAIL_COLUMNS: StyledColumn[] = [
  { header: '팀원', width: 12, role: 'freetext' },
  { header: '과제', width: 20, role: 'freetext' },
  { header: '중요도', width: 10, role: 'category' },
  { header: '과제성과', width: 24, role: 'freetext' },
  { header: '기여도(%)', width: 10, role: 'metric' },
  { header: '개인 수행등급', width: 14, role: 'metric' },
  { header: '개인점수', width: 10, role: 'metric' },
]

const TASK_RESULT_COLUMNS: StyledColumn[] = [
  { header: '과제', width: 22, role: 'freetext' },
  { header: '과제성과', width: 24, role: 'freetext' },
  { header: '참여 팀원', width: 26, role: 'freetext' },
  { header: '기여도(%)', width: 26, role: 'freetext' },
  { header: '개인성과', width: 12, role: 'metric' },
]

const CRITERIA_COLUMNS: StyledColumn[] = [
  { header: '평가기준', width: 20, role: 'freetext' },
  { header: '반영 비율(%)', width: 14, role: 'metric' },
  { header: '사용 여부', width: 10, role: 'category' },
]

const CRITERIA_LABELS: { key: keyof Criteria; label: string }[] = [
  { key: 'taskGradeWeight', label: '과제 중요도' },
  { key: 'performanceGradeWeight', label: '과제 성과등급' },
  { key: 'workloadWeight', label: '업무량' },
  { key: 'contributionWeight', label: '팀원 기여도' },
  { key: 'personalGradeWeight', label: '개인 수행등급' },
  { key: 'peerReviewWeight', label: '피어리뷰' },
]

// 워크북만 만들고 저장은 하지 않는다 -- 파일로 바로 내려받는 경로
// (downloadResultsReport)와 구글 드라이브로 올리는 경로 양쪽에서 재사용한다.
export function buildResultsReportWorkbook(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  peerReviews: PeerReview[] = [],
  periods: WorkspaceMeta[] = [],
): { workbook: ExcelJS.Workbook; filename: string } {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))

  // 01. 팀원 성과결과
  const summaryRows: (string | number)[][] = results.map((row) => {
    const history = periods.length > 0 ? getMemberPerformanceHistory(row.member.id, periods) : []
    const prevGrade = history[1]?.grade ?? null
    const prevScore = history[1]?.cumulativeScore ?? null
    const delta = prevScore !== null ? Number((row.cumulativeScore - prevScore).toFixed(1)) : ''
    return [
      row.member.name,
      row.member.level || '-',
      Number(row.cumulativeScore.toFixed(1)),
      row.grade,
      prevGrade ?? '-',
      delta === '' ? '-' : delta > 0 ? `+${delta}` : `${delta}`,
      row.member.comment || '',
    ]
  })

  // 02. 개인별 상세
  const memberDetailRows: (string | number)[][] = []
  for (const row of results) {
    for (const task of tasks) {
      const contribution = contributions.find((c) => c.taskId === task.id && c.memberId === row.member.id)
      if (!contribution || contribution.contributionPercent <= 0) continue
      const taskScore = taskScoreMap.get(task.id) ?? 0
      const weighted = taskScore * (contribution.contributionPercent / 100)
      memberDetailRows.push([
        row.member.name,
        task.name,
        task.importance,
        task.achievement || '-',
        contribution.contributionPercent,
        criteria.personalGradeWeight > 0 ? contribution.personalPerformanceGrade : '미사용',
        Number(weighted.toFixed(1)),
      ])
    }
  }

  // 03. 과제별 결과
  const taskResultRows: (string | number)[][] = tasks.map((task) => {
    const participants = contributions
      .filter((c) => c.taskId === task.id && c.contributionPercent > 0)
      .map((c) => ({ member: members.find((m) => m.id === c.memberId), pct: c.contributionPercent }))
      .filter((p): p is { member: TeamMember; pct: number } => p.member !== undefined)
    const taskScore = taskScoreMap.get(task.id) ?? 0
    return [
      task.name,
      task.achievement || '-',
      participants.map((p) => p.member.name).join(', ') || '-',
      participants.map((p) => `${p.member.name} ${p.pct}%`).join(', ') || '-',
      Number(taskScore.toFixed(1)),
    ]
  })

  // 04. 평가기준
  const criteriaRows: (string | number)[][] = CRITERIA_LABELS.map(({ key, label }) => [
    label,
    criteria[key],
    criteria[key] > 0 ? '사용' : '미사용',
  ])

  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '01_팀원 성과결과', SUMMARY_RESULT_COLUMNS, summaryRows)
  addStyledSheet(wb, '02_개인별 상세', MEMBER_DETAIL_COLUMNS, memberDetailRows)
  addStyledSheet(wb, '03_과제별 결과', TASK_RESULT_COLUMNS, taskResultRows)
  addStyledSheet(wb, '04_평가기준', CRITERIA_COLUMNS, criteriaRows, criteriaRows.length)
  return { workbook: wb, filename: `평가결과_${new Date().toISOString().slice(0, 10)}.xlsx` }
}

export async function downloadResultsReport(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  peerReviews: PeerReview[] = [],
  periods: WorkspaceMeta[] = [],
) {
  const { workbook, filename } = buildResultsReportWorkbook(members, tasks, contributions, criteria, peerReviews, periods)
  await downloadStyledWorkbook(workbook, filename)
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

function buildMemberResultWorkbook(
  member: TeamMember,
  row: ReturnType<typeof calcMemberResults>[number],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[],
  taskScoreMap: Map<string, number>,
): ExcelJS.Workbook {
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
  return wb
}

export async function downloadIndividualResultReports(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[] = [],
  peerReviews: PeerReview[] = [],
  selectedMemberIds?: string[],
) {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))
  const dateStr = new Date().toISOString().slice(0, 10)
  const zip = new JSZip()

  const selected = selectedMemberIds ? new Set(selectedMemberIds) : null
  const targetRows = selected ? results.filter((row) => selected.has(row.member.id)) : results

  for (const row of targetRows) {
    const wb = buildMemberResultWorkbook(row.member, row, tasks, contributions, criteria, meetingNotes, taskScoreMap)
    const buffer = await wb.xlsx.writeBuffer()
    zip.file(`${row.member.name}_평가결과_${dateStr}.xlsx`, buffer)
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

// 결과 테이블의 한 행에서 바로 그 팀원 한 명의 엑셀만 내려받을 때 쓴다(zip 없이 단일 파일).
export async function downloadMemberResultExcel(
  member: TeamMember,
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[],
  peerReviews: PeerReview[],
) {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const row = results.find((r) => r.member.id === member.id)
  if (!row) return
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((r) => [r.task.id, r.score]))
  const wb = buildMemberResultWorkbook(member, row, tasks, contributions, criteria, meetingNotes, taskScoreMap)
  const dateStr = new Date().toISOString().slice(0, 10)
  await downloadStyledWorkbook(wb, `${member.name}_평가결과_${dateStr}.xlsx`)
}

// ---------- 전체 데이터 동기화(구글 드라이브) ----------
// "리포트"(위 함수들)는 사람이 읽기 좋게 가공한 결과물이라 다시 앱으로
// 불러올 수 없다. 동기화는 반대로 AppState 원본 필드를 그대로 시트에
// 옮기고, 그대로 다시 읽어 AppState로 복원할 수 있어야 한다(왕복 보존).

const SYNC_TASK_COLUMNS: StyledColumn[] = [
  { header: 'id', width: 24, role: 'freetext' },
  { header: '과제명', width: 24, role: 'freetext' },
  { header: '중요도', width: 10, role: 'category' },
  { header: '성과등급', width: 10, role: 'category' },
  { header: '업무량', width: 8, role: 'category' },
  { header: '목표', width: 28, role: 'freetext' },
  { header: '성과', width: 28, role: 'freetext' },
]

const SYNC_MEMBER_COLUMNS: StyledColumn[] = [
  { header: 'id', width: 24, role: 'freetext' },
  { header: '이름', width: 12, role: 'freetext' },
  { header: '활성', width: 8, role: 'category' },
  { header: '직급', width: 8, role: 'category' },
  { header: '근속연차', width: 10, role: 'metric' },
  { header: '역할', width: 14, role: 'freetext' },
  { header: '코멘트', width: 24, role: 'freetext' },
  { header: '입사일', width: 12, role: 'metric' },
  { header: '현직급발령일', width: 14, role: 'metric' },
  { header: '승진심사예정월', width: 14, role: 'metric' },
  { header: '보조점수JSON', width: 30, role: 'freetext' },
]

const SYNC_CONTRIBUTION_COLUMNS: StyledColumn[] = [
  { header: 'taskId', width: 24, role: 'freetext' },
  { header: 'memberId', width: 24, role: 'freetext' },
  { header: '기여도', width: 10, role: 'metric' },
  { header: '개인수행등급', width: 12, role: 'category' },
  { header: '근거메모', width: 24, role: 'freetext' },
  { header: '자동분배', width: 10, role: 'category' },
]

const SYNC_CRITERIA_COLUMNS: StyledColumn[] = [
  { header: '과제성과등급', width: 14, role: 'metric' },
  { header: '과제중요도', width: 14, role: 'metric' },
  { header: '업무량', width: 14, role: 'metric' },
  { header: '개인수행등급', width: 14, role: 'metric' },
  { header: '피어리뷰', width: 14, role: 'metric' },
  { header: '기여도', width: 14, role: 'metric' },
]

const SYNC_PEER_REVIEW_COLUMNS: StyledColumn[] = [
  { header: 'id', width: 24, role: 'freetext' },
  { header: '리뷰어', width: 14, role: 'freetext' },
  { header: 'targetMemberId', width: 24, role: 'freetext' },
  { header: '등급', width: 8, role: 'category' },
]

const SYNC_NOTES_COLUMNS: StyledColumn[] = [
  { header: 'id', width: 24, role: 'freetext' },
  { header: 'memberId', width: 24, role: 'freetext' },
  { header: '날짜', width: 12, role: 'metric' },
  { header: '코멘트', width: 30, role: 'freetext' },
  { header: '주요논의', width: 24, role: 'freetext' },
  { header: '다음확인일', width: 12, role: 'metric' },
  { header: '강점', width: 20, role: 'freetext' },
  { header: '보완필요', width: 20, role: 'freetext' },
  { header: '다음경험', width: 20, role: 'freetext' },
  { header: '커리어관심사', width: 20, role: 'freetext' },
  { header: '액션JSON', width: 30, role: 'freetext' },
]

const SYNC_STATUS_COLUMNS: StyledColumn[] = [
  { header: 'memberId', width: 24, role: 'freetext' },
  { header: '상태', width: 12, role: 'category' },
]

export function buildFullSyncWorkbook(
  state: AppState,
  workspaceLabel: string,
): { workbook: ExcelJS.Workbook; filename: string } {
  const wb = new ExcelJS.Workbook()

  addStyledSheet(
    wb,
    '과제',
    SYNC_TASK_COLUMNS,
    state.tasks.map((t) => [t.id, t.name, t.importance, t.performanceGrade, t.workload, t.objective, t.achievement]),
  )

  addStyledSheet(
    wb,
    '팀원',
    SYNC_MEMBER_COLUMNS,
    state.members.map((m) => [
      m.id,
      m.name,
      m.active ? 'TRUE' : 'FALSE',
      m.level,
      m.yearsOfService ?? '',
      m.role,
      m.comment,
      m.hireDate ?? '',
      m.currentLevelSince ?? '',
      m.promotionReviewDate ?? '',
      m.auxScores ? JSON.stringify(m.auxScores) : '',
    ]),
  )

  addStyledSheet(
    wb,
    '기여도',
    SYNC_CONTRIBUTION_COLUMNS,
    state.contributions.map((c) => [
      c.taskId,
      c.memberId,
      c.contributionPercent,
      c.personalPerformanceGrade,
      c.personalGradeNote ?? '',
      c.isAutoDistributed ? 'TRUE' : 'FALSE',
    ]),
  )

  addStyledSheet(
    wb,
    '평가기준',
    SYNC_CRITERIA_COLUMNS,
    [
      [
        state.criteria.performanceGradeWeight,
        state.criteria.taskGradeWeight,
        state.criteria.workloadWeight,
        state.criteria.personalGradeWeight,
        state.criteria.peerReviewWeight,
        state.criteria.contributionWeight,
      ],
    ],
    1,
  )

  addStyledSheet(
    wb,
    '피어리뷰',
    SYNC_PEER_REVIEW_COLUMNS,
    state.peerReviews.map((p) => [p.id, p.reviewerName, p.targetMemberId, p.grade]),
  )

  addStyledSheet(
    wb,
    '면담기록',
    SYNC_NOTES_COLUMNS,
    state.meetingNotes.map((n) => [
      n.id,
      n.memberId,
      n.date,
      n.comment,
      n.keyPoints ?? '',
      n.nextCheckDate ?? '',
      n.strengths ?? '',
      n.improvements ?? '',
      n.nextExperience ?? '',
      n.careerInterest ?? '',
      n.actions && n.actions.length > 0 ? JSON.stringify(n.actions) : '',
    ]),
  )

  addStyledSheet(
    wb,
    '평가상태',
    SYNC_STATUS_COLUMNS,
    Object.entries(state.evaluationStatus).map(([memberId, status]) => [memberId, status]),
  )

  const safeLabel = workspaceLabel.replace(/[\\/:*?"<>|]/g, '_')
  return { workbook: wb, filename: `${safeLabel}_동기화` }
}

// addStyledSheet가 만든 시트를 헤더 기준 객체 배열로 되읽는다. 스타일만 입혀둔
// 빈 행(최대 300행)은 첫 칸이 비어 있으니 자연히 걸러진다.
function readSheetAsObjects(ws: ExcelJS.Worksheet | undefined): Record<string, unknown>[] {
  if (!ws) return []
  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '')
  })
  const rows: Record<string, unknown>[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const first = row.getCell(1).value
    if (first === null || first === undefined || first === '') continue
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => {
      if (h) obj[h] = row.getCell(i + 1).value
    })
    rows.push(obj)
  }
  return rows
}

function str(v: unknown, fallback = ''): string {
  return v === null || v === undefined || v === '' ? fallback : String(v)
}

// buildFullSyncWorkbook의 역변환. 구글 드라이브에서 내려받은(또는 로컬) 동기화
// 워크북을 읽어 AppState를 그대로 복원한다.
export async function parseFullSyncWorkbook(buffer: ArrayBuffer): Promise<AppState> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const tasks: Task[] = readSheetAsObjects(wb.getWorksheet('과제')).map((r) => ({
    id: str(r['id'], uuidv4()),
    name: str(r['과제명']),
    importance: (str(r['중요도'], '일반') as Importance),
    performanceGrade: (str(r['성과등급'], 'B') as PerformanceGrade),
    workload: (str(r['업무량'], '중') as Workload),
    objective: str(r['목표']),
    achievement: str(r['성과']),
  }))

  const members: TeamMember[] = readSheetAsObjects(wb.getWorksheet('팀원')).map((r) => {
    let auxScores: TeamMember['auxScores'] = null
    const auxRaw = r['보조점수JSON']
    if (typeof auxRaw === 'string' && auxRaw.trim()) {
      try {
        auxScores = JSON.parse(auxRaw)
      } catch {
        auxScores = null
      }
    }
    return {
      id: str(r['id'], uuidv4()),
      name: str(r['이름']),
      active: str(r['활성'], 'TRUE').toUpperCase() !== 'FALSE',
      level: (str(r['직급']) as Level | ''),
      yearsOfService: typeof r['근속연차'] === 'number' ? (r['근속연차'] as number) : null,
      role: str(r['역할']),
      comment: str(r['코멘트']),
      hireDate: r['입사일'] ? str(r['입사일']) : null,
      currentLevelSince: r['현직급발령일'] ? str(r['현직급발령일']) : null,
      promotionReviewDate: r['승진심사예정월'] ? str(r['승진심사예정월']) : null,
      auxScores,
    }
  })

  const contributions: Contribution[] = readSheetAsObjects(wb.getWorksheet('기여도')).map((r) => ({
    taskId: str(r['taskId']),
    memberId: str(r['memberId']),
    contributionPercent: typeof r['기여도'] === 'number' ? (r['기여도'] as number) : Number(r['기여도']) || 0,
    personalPerformanceGrade: (str(r['개인수행등급'], 'B') as PerformanceGrade),
    personalGradeNote: r['근거메모'] ? str(r['근거메모']) : undefined,
    isAutoDistributed: str(r['자동분배'], 'FALSE').toUpperCase() === 'TRUE',
  }))

  const criteriaRow = readSheetAsObjects(wb.getWorksheet('평가기준'))[0]
  const criteria: Criteria = criteriaRow
    ? {
        taskGradeWeight: Number(criteriaRow['과제중요도']) || 0,
        performanceGradeWeight: Number(criteriaRow['과제성과등급']) || 0,
        workloadWeight: Number(criteriaRow['업무량']) || 0,
        personalGradeWeight: Number(criteriaRow['개인수행등급']) || 0,
        peerReviewWeight: Number(criteriaRow['피어리뷰']) || 0,
        contributionWeight: Number(criteriaRow['기여도']) || 0,
      }
    : {
        performanceGradeWeight: 100,
        taskGradeWeight: 100,
        workloadWeight: 100,
        personalGradeWeight: 0,
        peerReviewWeight: 0,
        contributionWeight: 100,
      }

  const peerReviews: PeerReview[] = readSheetAsObjects(wb.getWorksheet('피어리뷰')).map((r) => ({
    id: str(r['id'], uuidv4()),
    reviewerName: str(r['리뷰어']),
    targetMemberId: str(r['targetMemberId']),
    grade: (str(r['등급'], 'B') as PerformanceGrade),
  }))

  const meetingNotes: MeetingNote[] = readSheetAsObjects(wb.getWorksheet('면담기록')).map((r) => {
    let actions: MeetingActionItem[] | undefined
    const actionsRaw = r['액션JSON']
    if (typeof actionsRaw === 'string' && actionsRaw.trim()) {
      try {
        actions = JSON.parse(actionsRaw)
      } catch {
        actions = undefined
      }
    }
    const note: MeetingNote = {
      id: str(r['id'], uuidv4()),
      memberId: str(r['memberId']),
      date: str(r['날짜']),
      comment: str(r['코멘트']),
    }
    if (r['주요논의']) note.keyPoints = str(r['주요논의'])
    if (r['다음확인일']) note.nextCheckDate = str(r['다음확인일'])
    if (r['강점']) note.strengths = str(r['강점'])
    if (r['보완필요']) note.improvements = str(r['보완필요'])
    if (r['다음경험']) note.nextExperience = str(r['다음경험'])
    if (r['커리어관심사']) note.careerInterest = str(r['커리어관심사'])
    if (actions && actions.length > 0) note.actions = actions
    return note
  })

  const evaluationStatus: Record<string, EvaluationStatus> = {}
  for (const r of readSheetAsObjects(wb.getWorksheet('평가상태'))) {
    const memberId = str(r['memberId'])
    const status = r['상태']
    if (memberId && (status === 'evaluating' || status === 'reviewed' || status === 'confirmed')) {
      evaluationStatus[memberId] = status
    }
  }

  return { tasks, members, contributions, criteria, meetingNotes, peerReviews, evaluationStatus }
}

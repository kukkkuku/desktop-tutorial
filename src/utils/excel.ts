import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { v4 as uuidv4 } from 'uuid'
import type {
  AppState,
  Contribution,
  Criteria,
  Importance,
  Level,
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
import { saveBlobLocally } from './localSave'

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
    await saveBlobLocally(blob, filename)
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

// 업로드 파일이 "안내" 시트를 앞에 두고 실제 데이터는 두 번째 시트에 담는
// 경우(이 앱이 내려주는 이전 성과/피어리뷰 양식 등)가 있어, 항상 첫 번째
// 시트만 읽으면 안내 시트를 데이터로 착각해 0건으로 읽힌다. 헤더 후보 중
// 하나라도 가진 첫 시트를 찾고, 없으면 기존 동작대로 첫 시트로 되돌아간다.
function findDataSheet(wb: XLSX.WorkBook, headerCandidates: string[]): XLSX.WorkSheet {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const headerRow: unknown[] = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as unknown[]) ?? []
    const headers = new Set(headerRow.map((h) => String(h ?? '').trim()))
    if (headerCandidates.some((h) => headers.has(h))) return ws
  }
  return wb.Sheets[wb.SheetNames[0]]
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

const TASK_STATUS_COLUMNS: StyledColumn[] = [...TASK_COLUMNS, { header: '점수', width: 10, role: 'metric' }]

function buildTaskRows(tasks: Task[], criteria: Criteria): (string | number)[][] {
  return tasks.map((task) => [
    task.name,
    task.importance,
    task.workload,
    task.objective || '-',
    task.achievement || '-',
    task.performanceGrade,
    Number(calcTaskScore(task, criteria).toFixed(1)),
  ])
}

// 빈 양식(위 downloadTaskTemplate)과 달리 지금 등록된 과제를 그대로 내보낸다.
export async function downloadCurrentTasksExcel(tasks: Task[], criteria: Criteria) {
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '과제현황', TASK_STATUS_COLUMNS, buildTaskRows(tasks, criteria), 0)
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
  const ws = findDataSheet(wb, ['과제명'])
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

function buildMemberRows(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  peerReviews: PeerReview[],
): (string | number)[][] {
  return members.map((member) => {
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
}

// 빈 양식(위 downloadMemberTemplate)과 달리 지금 등록된 팀원을 화면(팀원
// 관리 표)과 같은 컬럼 순서로 그대로 내보낸다.
export async function downloadCurrentMembersExcel(members: TeamMember[], tasks: Task[], contributions: Contribution[], peerReviews: PeerReview[]) {
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '팀원현황', CURRENT_MEMBER_COLUMNS, buildMemberRows(members, tasks, contributions, peerReviews), 0)
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
  const ws = findDataSheet(wb, ['이름'])
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
// 팀장이 여기서 직접 입력하는 게 아니라, 이 양식을 팀원들에게 나눠주고
// (엑셀 파일로 메일/메신저 전달) 각자 자기 이름이 "리뷰어"인 행을 찾아
// 기여도·등급·근거를 채워 돌려받는 흐름이다. 과제×리뷰어×대상팀원 조합을
// 미리 다 나열해두므로(참여 안 한 조합은 빈칸으로 두면 됨) 받는 사람이
// 서식을 새로 만들 필요가 없다.

const PEER_REVIEW_TEMPLATE_COLUMNS: StyledColumn[] = [
  { header: '과제명', width: 22, role: 'category' },
  { header: '리뷰어', width: 12, role: 'category' },
  { header: '대상팀원', width: 12, role: 'metric' },
  { header: '기여도(%)', width: 12, role: 'freetext' },
  { header: '등급', width: 8, role: 'freetext' },
  { header: '근거', width: 40, role: 'freetext' },
]

function buildPeerReviewTemplateWorkbook(tasks: Task[], members: TeamMember[]): ExcelJS.Workbook {
  const activeMembers = members.filter((m) => m.active)
  const rows: (string | number)[][] = []
  for (const task of tasks) {
    for (const reviewer of activeMembers) {
      for (const target of activeMembers) {
        rows.push([task.name, reviewer.name, target.name, '', '', ''])
      }
    }
  }
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '피어리뷰양식', PEER_REVIEW_TEMPLATE_COLUMNS, rows, 0)
  return wb
}

export async function downloadPeerReviewTemplate(tasks: Task[], members: TeamMember[]) {
  await downloadStyledWorkbook(buildPeerReviewTemplateWorkbook(tasks, members), '피어리뷰_업로드_양식.xlsx')
}

// 빈 양식(위 downloadPeerReviewTemplate)과 달리 지금 등록된 피어리뷰를
// 그대로 내보낸다. 같은 열 구성이라 다시 업로드해서 조정하는 것도 가능하다.
export async function downloadCurrentPeerReviewsExcel(peerReviews: PeerReview[], members: TeamMember[], tasks: Task[]) {
  const memberById = new Map(members.map((m) => [m.id, m]))
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const sorted = [...peerReviews].sort((a, b) => {
    const targetA = memberById.get(a.targetMemberId)?.name ?? ''
    const targetB = memberById.get(b.targetMemberId)?.name ?? ''
    return targetA.localeCompare(targetB) || a.reviewerName.localeCompare(b.reviewerName)
  })
  const rows: (string | number)[][] = []
  for (const review of sorted) {
    const target = memberById.get(review.targetMemberId)
    if (!target) continue
    rows.push([
      review.taskId ? taskById.get(review.taskId)?.name ?? '' : '',
      review.reviewerName,
      target.name,
      review.contributionPercent ?? '',
      review.grade,
      review.comment ?? '',
    ])
  }
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '피어리뷰현황', PEER_REVIEW_TEMPLATE_COLUMNS, rows, 0)
  await downloadStyledWorkbook(wb, `피어리뷰현황_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export interface PeerReviewImportResult {
  peerReviews: PeerReview[]
  errors: string[]
  importedCount: number
  addedCount: number
  updatedCount: number
  affectedTargetNames: string[]
  // 기여도는 채웠지만 등급을 아직 안 채운 행(참여는 했지만 리뷰를 마치지
  // 않은 조합) 수 -- 조용히 0건 처리되지 않도록 별도로 센다.
  skippedNoGrade: number
}

const TASK_NAME_HEADER_ALIASES = ['과제명', '과제']
const REVIEWER_HEADER_ALIASES = ['리뷰어', '평가자', '리뷰자']
const TARGET_HEADER_ALIASES = ['대상팀원', '평가대상', '평가 대상', '대상자', '피평가자']
const CONTRIBUTION_HEADER_ALIASES = ['기여도(%)', '기여도', '기여도(%)*']
const GRADE_HEADER_ALIASES = ['등급', '평가등급', '점수', '수행등급', '개인수행등급']
const COMMENT_HEADER_ALIASES = ['근거', '코멘트', '의견']

function pickColumn(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias]
    if (value !== undefined && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

// ---------- 피어리뷰(리뷰어 한 명 = 파일 한 개, 과제 하나당 시트 하나) ----------
// 위 flat 양식(한 시트에 과제명/리뷰어/대상팀원 열을 다 나열)과 달리, 각
// 리뷰어에게 개별로 나눠주는 파일 형식도 있다: 시트가 "안내"/"_메타"
// (리뷰어 이름·평가기간 메타데이터) + 과제 시트 여러 개("1_과제명" 처럼
// 번호 접두어)로 구성되고, 각 과제 시트는 3행이 헤더("평가 대상"/
// "기여도(%)"/"수행등급"/"근거"), 4행부터 데이터, "기여도 합계"로
// 시작하는 검증용 수식 행에서 끝난다. 본인 행은 이름 뒤에 "(본인)"이
// 붙어 있다(자기 자신에 대한 리뷰로 그대로 반영한다).
const REVIEWER_META_SHEET_NAMES = ['_메타', '안내']
const REVIEWER_FILE_LABEL_REVIEWER = ['평가자', '리뷰어']
const PEER_SUMMARY_ROW_MARKER = '기여도 합계'
const TASK_SHEET_PREFIX = /^\s*\d+[._-]?\s*/
const SELF_MARKER = /\s*[(（]\s*본인\s*[)）]\s*$/

function readLabelValueSheet(ws: XLSX.WorkSheet, labels: string[]): string {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
  for (const row of rows) {
    const label = String(row?.[0] ?? '').trim()
    if (labels.includes(label)) return String(row?.[1] ?? '').trim()
  }
  return ''
}

function findReviewerFileHeaderRow(ws: XLSX.WorkSheet): number | null {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const cells = (rows[i] ?? []).map((v) => String(v ?? '').trim())
    if (TARGET_HEADER_ALIASES.some((h) => cells.includes(h)) && CONTRIBUTION_HEADER_ALIASES.some((h) => cells.includes(h))) {
      return i
    }
  }
  return null
}

// 워크북 전체를 봐야 판단할 수 있다(리뷰어 이름은 메타 시트, 대상/기여도
// 열은 과제 시트에 따로 있어 시트 하나만으로는 알 수 없다).
function isReviewerPerTaskWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.some((name) => {
    if (REVIEWER_META_SHEET_NAMES.includes(name)) return false
    return findReviewerFileHeaderRow(wb.Sheets[name]) !== null
  })
}

// 과제×리뷰어×대상팀원을 미리 다 나열해둔 양식이라, 등급을 채우지 않은
// 행(참여 안 한 조합)은 내용이 있어도 그냥 건너뛴다 -- 등급이 이 리뷰가
// "실제로 작성됐는지"를 가르는 기준이다. 리뷰어 한 명당 파일 한 개(과제별
// 시트)로 받는 형식도 같은 결과 타입으로 함께 지원한다.
export function parsePeerReviewWorkbook(
  buffer: ArrayBuffer,
  tasks: Task[],
  members: TeamMember[],
  existingPeerReviews: PeerReview[],
): PeerReviewImportResult {
  const wb = XLSX.read(buffer, { type: 'array' })

  const errors: string[] = []
  const byKey = new Map(
    existingPeerReviews.map((r) => [`${r.taskId ?? ''}::${r.reviewerMemberId ?? r.reviewerName}::${r.targetMemberId}`, r]),
  )
  const memberByName = new Map(members.map((m) => [m.name, m]))
  const taskByName = new Map(tasks.map((t) => [t.name, t]))
  let importedCount = 0
  let addedCount = 0
  let updatedCount = 0
  let filledRowCount = 0
  let skippedNoGrade = 0
  const affectedTargetNames = new Set<string>()

  // 한 조합(과제×리뷰어×대상팀원)을 검증하고 byKey에 반영한다. 두 파일
  // 형식(한 시트에 다 나열 / 리뷰어별 파일+과제별 시트) 모두 이 한 곳을
  // 거치게 해서 검증·카운트 로직이 갈라지지 않게 한다.
  function applyRow(params: {
    rowLabel: string
    taskName: string
    reviewerName: string
    targetName: string
    gradeRaw: string
    contributionRaw: string
    comment: string
  }) {
    const { rowLabel, taskName, reviewerName, targetName, contributionRaw, comment } = params
    const gradeRaw = params.gradeRaw.toUpperCase()
    if (!gradeRaw) {
      if (contributionRaw.trim() !== '') skippedNoGrade += 1
      return
    }
    filledRowCount += 1

    if (!reviewerName || !targetName) {
      errors.push(`${rowLabel}: 리뷰어/대상팀원 칸이 비어 있습니다.`)
      return
    }
    if (!PERFORMANCE_GRADE_OPTIONS.includes(gradeRaw as PerformanceGrade)) {
      errors.push(`${rowLabel} '${reviewerName}→${targetName}': 등급 '${gradeRaw}'은(는) 유효하지 않습니다. (S/A/B/C/D)`)
      return
    }
    const reviewerMember = memberByName.get(reviewerName)
    if (!reviewerMember) {
      errors.push(`${rowLabel}: 리뷰어 '${reviewerName}'을(를) 팀원에서 찾을 수 없습니다.`)
      return
    }
    const targetMember = memberByName.get(targetName)
    if (!targetMember) {
      errors.push(`${rowLabel}: 대상팀원 '${targetName}'을(를) 찾을 수 없습니다.`)
      return
    }
    const task = taskName ? taskByName.get(taskName) : undefined
    if (taskName && !task) {
      errors.push(`${rowLabel}: 과제 '${taskName}'을(를) 찾을 수 없습니다.`)
      return
    }
    const contributionPercent = contributionRaw === '' ? undefined : Number(contributionRaw)
    if (contributionPercent !== undefined && Number.isNaN(contributionPercent)) {
      errors.push(`${rowLabel} '${reviewerName}→${targetName}': 기여도 '${contributionRaw}'는 숫자여야 합니다.`)
      return
    }

    const key = `${task?.id ?? ''}::${reviewerMember.id}::${targetMember.id}`
    const existing = byKey.get(key)
    const review: PeerReview = {
      id: existing?.id ?? uuidv4(),
      taskId: task?.id,
      reviewerMemberId: reviewerMember.id,
      reviewerName: reviewerMember.name,
      targetMemberId: targetMember.id,
      contributionPercent,
      grade: gradeRaw as PerformanceGrade,
      comment: comment || undefined,
    }
    byKey.set(key, review)
    affectedTargetNames.add(targetName)
    importedCount += 1
    if (existing) {
      updatedCount += 1
    } else {
      addedCount += 1
    }
  }

  if (isReviewerPerTaskWorkbook(wb)) {
    const metaSheet = REVIEWER_META_SHEET_NAMES.map((n) => wb.Sheets[n]).find((s) => s !== undefined)
    const reviewerName = metaSheet ? readLabelValueSheet(metaSheet, REVIEWER_FILE_LABEL_REVIEWER) : ''
    if (!reviewerName) {
      errors.push('이 파일에서 리뷰어(평가자) 이름을 찾지 못했습니다. "_메타" 또는 "안내" 시트에 평가자 행이 있는지 확인해주세요.')
    } else {
      for (const sheetName of wb.SheetNames) {
        if (REVIEWER_META_SHEET_NAMES.includes(sheetName)) continue
        const ws = wb.Sheets[sheetName]
        const headerRowIndex = findReviewerFileHeaderRow(ws)
        if (headerRowIndex === null) continue // 이 시트는 리뷰 데이터 시트가 아니다(예: 다른 안내성 시트).

        const taskName = sheetName.replace(TASK_SHEET_PREFIX, '').trim()
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRowIndex })
        rows.forEach((row, index) => {
          const targetRaw = pickColumn(row, TARGET_HEADER_ALIASES)
          if (!targetRaw || targetRaw === PEER_SUMMARY_ROW_MARKER) return // 데이터 끝(검증용 합계 행) 또는 빈 행.
          applyRow({
            rowLabel: `[${sheetName}] ${headerRowIndex + index + 2}행`,
            taskName,
            reviewerName,
            targetName: targetRaw.replace(SELF_MARKER, '').trim(),
            gradeRaw: pickColumn(row, GRADE_HEADER_ALIASES),
            contributionRaw: pickColumn(row, CONTRIBUTION_HEADER_ALIASES),
            comment: pickColumn(row, COMMENT_HEADER_ALIASES),
          })
        })
      }
    }
  } else {
    const ws = findDataSheet(wb, [...REVIEWER_HEADER_ALIASES, ...TARGET_HEADER_ALIASES])
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    rows.forEach((row, index) => {
      applyRow({
        rowLabel: `${index + 2}행`,
        taskName: pickColumn(row, TASK_NAME_HEADER_ALIASES),
        reviewerName: pickColumn(row, REVIEWER_HEADER_ALIASES),
        targetName: pickColumn(row, TARGET_HEADER_ALIASES),
        gradeRaw: pickColumn(row, GRADE_HEADER_ALIASES),
        contributionRaw: pickColumn(row, CONTRIBUTION_HEADER_ALIASES),
        comment: pickColumn(row, COMMENT_HEADER_ALIASES),
      })
    })
  }

  if (filledRowCount === 0) {
    errors.push(
      skippedNoGrade > 0
        ? `업로드한 파일에 기여도가 채워진 조합이 ${skippedNoGrade}건 있지만, 등급(수행등급)이 비어 있어 하나도 가져오지 못했습니다. 각 조합의 등급을 채운 뒤 다시 업로드해주세요.`
        : '업로드한 파일에 채워진 등급이 없습니다. 다운로드한 양식에서 실제로 참여한 조합의 기여도/등급/근거를 채워 업로드해주세요.',
    )
  }

  return {
    peerReviews: Array.from(byKey.values()),
    errors,
    importedCount,
    addedCount,
    updatedCount,
    affectedTargetNames: Array.from(affectedTargetNames),
    skippedNoGrade,
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
function buildMatrixRows(tasks: Task[], members: TeamMember[], contributions: Contribution[], criteria: Criteria): (string | number)[][] {
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
  return rows
}

export async function downloadCurrentMatrixExcel(tasks: Task[], members: TeamMember[], contributions: Contribution[], criteria: Criteria) {
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '평가매트릭스', MATRIX_COLUMNS, buildMatrixRows(tasks, members, contributions, criteria), 0)
  await downloadStyledWorkbook(wb, `평가매트릭스_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ---------- Unified data management (all three templates + content-based upload routing) ----------

export type WorkbookKind = 'task' | 'member' | 'peer' | 'history'

// 시트 하나를 넘겨받아 헤더 집합을 돌려준다 -- detectWorkbookKind가 "안내"
// 시트를 지나쳐 실제 데이터 시트까지 훑어보는 데 쓴다. 첫 행만 보지 않고
// 위쪽 몇 행을 다 훑는 이유: "이전 성과" 양식처럼 제목/부제 행이 실제
// 헤더 행 위에 몇 줄 더 있는 경우, 첫 행만 보면 헤더 신호(이름/평가연도
// 등)를 영영 못 찾아 종류 판정 자체가 실패한다.
function headerSetOf(ws: XLSX.WorkSheet): Set<string> {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const headers = new Set<string>()
  for (const row of rows.slice(0, 8)) {
    for (const cell of row ?? []) {
      const text = String(cell ?? '').trim()
      if (text) headers.add(text)
    }
  }
  return headers
}

// Classifies an uploaded file by its header row instead of its filename, so
// renamed downloads (or files re-saved by email/chat apps) still route to
// the right parser. 시트가 여러 개면("안내" 시트가 앞에 오는 경우 등) 전부
// 훑어서 하나라도 인식되는 시트가 있으면 그 종류로 판단한다.
export function detectWorkbookKind(buffer: ArrayBuffer): WorkbookKind | null {
  const wb = XLSX.read(buffer, { type: 'array' })
  // 리뷰어 한 명당 파일 한 개(과제별 시트, 리뷰어 이름은 별도 메타 시트)
  // 형식은 리뷰어/대상팀원 신호가 시트 하나에 같이 있지 않아 아래 시트별
  // 헤더 검사로는 못 잡는다 -- 워크북 전체를 보고 먼저 확인한다.
  if (isReviewerPerTaskWorkbook(wb)) return 'peer'
  for (const name of wb.SheetNames) {
    const headers = headerSetOf(wb.Sheets[name])
    // 피어리뷰 양식도 어느 과제인지 가리키는 '과제명' 열을 갖고 있으므로,
    // '과제명'만 보고 task로 단정하면 안 된다 -- 리뷰어/대상팀원처럼 더
    // 구체적인 피어리뷰 신호부터 먼저 확인한다.
    const hasPeerHeaders =
      REVIEWER_HEADER_ALIASES.some((h) => headers.has(h)) && TARGET_HEADER_ALIASES.some((h) => headers.has(h))
    if (hasPeerHeaders) return 'peer'
    if (headers.has('과제명')) return 'task'
    // 이전 성과(승진심사용 5개년 이력) -- '이름'만으로는 팀원 양식과
    // 구분이 안 되므로 '평가연도'가 같이 있는지로 가른다.
    if (headers.has('이름') && headers.has('평가연도')) return 'history'
    if (headers.has('이름')) return 'member'
  }
  return null
}

// "전체 데이터 초기화" 전 백업용 -- 이 브라우저에 저장된 프로젝트(워크스페이스)
// 전부를 각자의 결과 리포트(buildResultsReportWorkbook)로 만들어 하나의 zip에
// 담는다. 파일명은 팀명_기간명으로 구분한다.
export async function downloadAllWorkspacesExcelZip(
  entries: { meta: WorkspaceMeta; state: AppState }[],
) {
  const zip = new JSZip()
  for (const { meta, state } of entries) {
    const { workbook } = buildResultsReportWorkbook(
      state.members,
      state.tasks,
      state.contributions,
      state.criteria,
      state.peerReviews,
    )
    const buf = await workbook.xlsx.writeBuffer()
    const safeName = `${meta.teamName}_${meta.periodName}`.replace(/[\\/:*?"<>|]/g, '_')
    zip.file(`${safeName}.xlsx`, buf)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  await saveBlobLocally(blob, `전체_백업_엑셀_${new Date().toISOString().slice(0, 10)}.zip`)
}

export async function downloadAllTemplatesZip(tasks: Task[], members: TeamMember[]) {
  const zip = new JSZip()
  const [taskBuf, memberBuf, peerBuf] = await Promise.all([
    buildTaskTemplateWorkbook().xlsx.writeBuffer(),
    buildMemberTemplateWorkbook().xlsx.writeBuffer(),
    buildPeerReviewTemplateWorkbook(tasks, members).xlsx.writeBuffer(),
  ])
  zip.file('과제_업로드_양식.xlsx', taskBuf)
  zip.file('팀원_업로드_양식.xlsx', memberBuf)
  zip.file('피어리뷰_업로드_양식.xlsx', peerBuf)

  const blob = await zip.generateAsync({ type: 'blob' })
  await saveBlobLocally(blob, '전체_업로드_양식.zip')
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

function buildSummaryResultRows(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  peerReviews: PeerReview[],
  periods: WorkspaceMeta[],
): (string | number)[][] {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  return results.map((row) => {
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
}

function buildMemberDetailRows(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  peerReviews: PeerReview[],
): (string | number)[][] {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))
  const rows: (string | number)[][] = []
  for (const row of results) {
    for (const task of tasks) {
      const contribution = contributions.find((c) => c.taskId === task.id && c.memberId === row.member.id)
      if (!contribution || contribution.contributionPercent <= 0) continue
      const taskScore = taskScoreMap.get(task.id) ?? 0
      const weighted = taskScore * (contribution.contributionPercent / 100)
      rows.push([
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
  return rows
}

function buildTaskResultRows(tasks: Task[], members: TeamMember[], contributions: Contribution[], criteria: Criteria): (string | number)[][] {
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))
  return tasks.map((task) => {
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
}

function buildCriteriaRows(criteria: Criteria): (string | number)[][] {
  return CRITERIA_LABELS.map(({ key, label }) => [label, criteria[key], criteria[key] > 0 ? '사용' : '미사용'])
}

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
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '01_팀원 성과결과', SUMMARY_RESULT_COLUMNS, buildSummaryResultRows(members, tasks, contributions, criteria, peerReviews, periods))
  addStyledSheet(wb, '02_개인별 상세', MEMBER_DETAIL_COLUMNS, buildMemberDetailRows(members, tasks, contributions, criteria, peerReviews))
  addStyledSheet(wb, '03_과제별 결과', TASK_RESULT_COLUMNS, buildTaskResultRows(tasks, members, contributions, criteria))
  const criteriaRows = buildCriteriaRows(criteria)
  addStyledSheet(wb, '04_평가기준', CRITERIA_COLUMNS, criteriaRows, criteriaRows.length)
  return { workbook: wb, filename: `평가결과_${new Date().toISOString().slice(0, 10)}.xlsx` }
}

// ---------- Google Sheet 보기용 워크북(구글 드라이브 저장 전용) ----------
// 위 결과 리포트(사람이 보고하기 위한 4개 시트)와 팀원/과제/기여도 원본
// 현황을 한 파일에 모아, 구글 시트로 변환해 드라이브에 올린다. 이 문서는
// 어디까지나 "보기 편한 사본"이고 이 앱의 source of truth가 아니다 --
// 실제 복원(불러오기)은 별도로 저장하는 JSON 원본으로만 한다.
export function buildGoogleSheetViewWorkbook(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  peerReviews: PeerReview[] = [],
  periods: WorkspaceMeta[] = [],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  addStyledSheet(wb, '팀원 성과결과', SUMMARY_RESULT_COLUMNS, buildSummaryResultRows(members, tasks, contributions, criteria, peerReviews, periods))
  addStyledSheet(wb, '과제관리', TASK_STATUS_COLUMNS, buildTaskRows(tasks, criteria), 0)
  addStyledSheet(wb, '팀원관리', CURRENT_MEMBER_COLUMNS, buildMemberRows(members, tasks, contributions, peerReviews), 0)
  addStyledSheet(wb, '기여도평가', MATRIX_COLUMNS, buildMatrixRows(tasks, members, contributions, criteria), 0)
  addStyledSheet(wb, '개인별 상세', MEMBER_DETAIL_COLUMNS, buildMemberDetailRows(members, tasks, contributions, criteria, peerReviews))
  const criteriaRows = buildCriteriaRows(criteria)
  addStyledSheet(wb, '평가기준', CRITERIA_COLUMNS, criteriaRows, criteriaRows.length)
  return wb
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
  await saveBlobLocally(zipBlob, `팀원별_평가결과_${dateStr}.zip`)
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

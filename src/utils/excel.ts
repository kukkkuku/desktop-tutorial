import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type {
  Contribution,
  Criteria,
  Importance,
  Level,
  MeetingNote,
  PeerReview,
  PerformanceGrade,
  Position,
  Task,
  TeamMember,
  Workload,
} from '../types'
import { IMPORTANCE_OPTIONS, LEVEL_OPTIONS, PERFORMANCE_GRADE_OPTIONS, POSITION_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import { calcAllTaskScores, calcMemberResults } from './calculations'

// Claude's Artifact preview blocks raw browser downloads and only allows
// files to leave the frame through window.claude.downloads.save(), which
// does not support the .xlsx extension -- so inside that preview we fall
// back to a CSV rendering of the same workbook. The real deployed app
// (no window.claude present) always gets the full .xlsx file.
function workbookToCsvText(wb: XLSX.WorkBook): string {
  return wb.SheetNames.map((name) => `# ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join(
    '\n\n',
  )
}

async function saveViaClaudeDownloads(wb: XLSX.WorkBook, filename: string): Promise<boolean> {
  const downloads = window.claude?.downloads
  if (!downloads) return false

  const text = '﻿' + workbookToCsvText(wb) // U+FEFF BOM so Excel reads Korean text correctly

  // .csv is in the "extended" allowlist, which may not be enabled for this
  // view -- if so, retry with .txt, which is always in the base allowlist.
  try {
    await downloads.save({ filename: filename.replace(/\.xlsx$/i, '.csv'), data: text })
    return true
  } catch (err) {
    const code = (err as ClaudeDownloadsError | undefined)?.code
    if (code === 'declined') return false // user dismissed the prompt, nothing to report
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

function downloadWorkbookAsFile(wb: XLSX.WorkBook, filename: string): boolean {
  try {
    const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbArray], {
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

async function downloadWorkbook(wb: XLSX.WorkBook, filename: string): Promise<boolean> {
  if (window.claude?.downloads) return saveViaClaudeDownloads(wb, filename)
  return downloadWorkbookAsFile(wb, filename)
}

// ---------- Task template / import ----------

const TASK_HEADERS = ['과제명', '과제등급', '업무량', '목표', '성과', '성과등급'] as const

export async function downloadTaskTemplate() {
  const rows = [
    [...TASK_HEADERS],
    ['신규 랜딩페이지 제작', '핵심', '대', '전환율 15% 개선', '전환율 18% 달성', 'A'],
    ['내부 협업툴 정비', '일반', '소', '', '', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 28 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '과제양식')
  await downloadWorkbook(wb, '과제_업로드_양식.xlsx')
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

const MEMBER_HEADERS = ['이름', '직책', '직급', '연차', '역할', '코멘트'] as const

export async function downloadMemberTemplate() {
  const rows = [
    [...MEMBER_HEADERS],
    ['김민준', '팀장', '과장', 7, '기획', ''],
    ['이서연', '', '대리', 3, '디자인', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 30 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '팀원양식')
  await downloadWorkbook(wb, '팀원_업로드_양식.xlsx')
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
    const positionRaw = String(row['직책'] ?? '').trim()
    const levelRaw = String(row['직급'] ?? '').trim()
    const yearsRaw = row['연차']
    const role = String(row['역할'] ?? '').trim()
    const comment = String(row['코멘트'] ?? '').trim()

    if (!name) {
      errors.push(`${rowNum}행: 이름이 비어 있어 건너뛰었습니다.`)
      return
    }
    if (positionRaw && !POSITION_OPTIONS.includes(positionRaw as Position)) {
      errors.push(`${rowNum}행 '${name}': 직책 '${positionRaw}'은(는) 유효하지 않습니다. (팀장/PM/PL/팀원)`)
      return
    }
    if (levelRaw && !LEVEL_OPTIONS.includes(levelRaw as Level)) {
      errors.push(`${rowNum}행 '${name}': 직급 '${levelRaw}'은(는) 유효하지 않습니다. (사원/대리/과장/차장)`)
      return
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
      position: (positionRaw as Position) || '',
      level: (levelRaw as Level) || '',
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

const PEER_REVIEW_HEADERS = ['리뷰어', '대상팀원', '등급'] as const

export async function downloadPeerReviewTemplate(members: TeamMember[]) {
  const rows: (string | number)[][] = [[...PEER_REVIEW_HEADERS]]
  for (const member of members) {
    rows.push(['', member.name, ''])
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '피어리뷰양식')
  await downloadWorkbook(wb, '피어리뷰_업로드_양식.xlsx')
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

// ---------- Results report export ----------

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

  const rankRows = [
    ['순위', '이름', '역할', '직책', '직급', '참여 과제 수', '종합 점수(가중평균)', '누적 점수(단순합)'],
    ...results.map((row, index) => [
      index + 1,
      row.member.name,
      row.member.role || '-',
      row.member.position || '-',
      row.member.level || '-',
      row.participatedTaskCount,
      Number(row.weightedAverageScore.toFixed(1)),
      Number(row.cumulativeScore.toFixed(1)),
    ]),
  ]
  const rankSheet = XLSX.utils.aoa_to_sheet(rankRows)
  rankSheet['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
  ]

  const detailRows: (string | number)[][] = [
    ['팀원', '과제명', '과제점수', '기여도(%)', '개인수행등급', '목표', '성과', '성과등급', '가중점수', '기여도합계 100% 여부'],
  ]
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
  const detailSheet = XLSX.utils.aoa_to_sheet(detailRows)
  detailSheet['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 24 },
    { wch: 24 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
  ]

  const notesRows: (string | number)[][] = [['팀원', '날짜', '면담 코멘트']]
  const sortedNotes = [...meetingNotes].sort((a, b) => {
    const memberA = members.find((m) => m.id === a.memberId)?.name ?? ''
    const memberB = members.find((m) => m.id === b.memberId)?.name ?? ''
    return memberA.localeCompare(memberB) || a.date.localeCompare(b.date)
  })
  for (const note of sortedNotes) {
    const member = members.find((m) => m.id === note.memberId)
    if (!member) continue
    notesRows.push([member.name, note.date, note.comment])
  }
  const notesSheet = XLSX.utils.aoa_to_sheet(notesRows)
  notesSheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 50 }]

  const peerReviewRows: (string | number)[][] = [['대상팀원', '리뷰어', '등급']]
  const sortedReviews = [...peerReviews].sort((a, b) => {
    const targetA = members.find((m) => m.id === a.targetMemberId)?.name ?? ''
    const targetB = members.find((m) => m.id === b.targetMemberId)?.name ?? ''
    return targetA.localeCompare(targetB) || a.reviewerName.localeCompare(b.reviewerName)
  })
  for (const review of sortedReviews) {
    const target = members.find((m) => m.id === review.targetMemberId)
    if (!target) continue
    peerReviewRows.push([target.name, review.reviewerName, review.grade])
  }
  const peerReviewSheet = XLSX.utils.aoa_to_sheet(peerReviewRows)
  peerReviewSheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rankSheet, '순위표')
  XLSX.utils.book_append_sheet(wb, detailSheet, '과제별상세')
  XLSX.utils.book_append_sheet(wb, notesSheet, '면담기록')
  XLSX.utils.book_append_sheet(wb, peerReviewSheet, '피어리뷰')
  await downloadWorkbook(wb, `평가결과_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// Per-member result files, meant to be handed to each person individually
// instead of giving everyone access to the full team results (which would
// expose the whole ranking and everyone else's scores).
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

  for (const row of results) {
    const member = row.member

    const summaryRows: (string | number)[][] = [
      ['이름', member.name],
      ['역할', member.role || '-'],
      ['직책', member.position || '-'],
      ['직급', member.level || '-'],
      ['참여 과제 수', row.participatedTaskCount],
      ['종합 점수(가중평균)', Number(row.weightedAverageScore.toFixed(1))],
      ['누적 점수(단순합)', Number(row.cumulativeScore.toFixed(1))],
      ['평가등급', row.grade],
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
    summarySheet['!cols'] = [{ wch: 18 }, { wch: 20 }]

    const taskRows: (string | number)[][] = [['과제명', '기여도(%)', '개인수행등급', '과제점수', '가중점수']]
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
    const taskSheet = XLSX.utils.aoa_to_sheet(taskRows)
    taskSheet['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }]

    const notesRows: (string | number)[][] = [['날짜', '면담 코멘트']]
    const memberNotes = meetingNotes
      .filter((n) => n.memberId === member.id)
      .sort((a, b) => a.date.localeCompare(b.date))
    for (const note of memberNotes) {
      notesRows.push([note.date, note.comment])
    }
    const notesSheet = XLSX.utils.aoa_to_sheet(notesRows)
    notesSheet['!cols'] = [{ wch: 12 }, { wch: 50 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, summarySheet, '요약')
    XLSX.utils.book_append_sheet(wb, taskSheet, '참여 과제')
    XLSX.utils.book_append_sheet(wb, notesSheet, '면담기록')

    await downloadWorkbook(wb, `${member.name}_평가결과_${dateStr}.xlsx`)
  }
}

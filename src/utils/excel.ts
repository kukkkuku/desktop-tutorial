import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type {
  Contribution,
  Criteria,
  Importance,
  Level,
  PerformanceGrade,
  Position,
  Task,
  TeamMember,
  Workload,
} from '../types'
import { IMPORTANCE_OPTIONS, LEVEL_OPTIONS, PERFORMANCE_GRADE_OPTIONS, POSITION_OPTIONS, WORKLOAD_OPTIONS } from '../types'
import { calcAllTaskScores, calcMemberResults } from './calculations'

function downloadWorkbook(wb: XLSX.WorkBook, filename: string): boolean {
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

// ---------- Task template / import ----------

const TASK_HEADERS = ['과제명', '과제등급', '업무량', '목표', '성과', '성과등급'] as const

export function downloadTaskTemplate() {
  const rows = [
    [...TASK_HEADERS],
    ['신규 랜딩페이지 제작', '핵심', '대', '전환율 15% 개선', '전환율 18% 달성', 'A'],
    ['내부 협업툴 정비', '일반', '소', '', '', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 28 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '과제양식')
  downloadWorkbook(wb, '과제_업로드_양식.xlsx')
}

export interface TaskImportResult {
  tasks: Task[]
  errors: string[]
  importedCount: number
}

export function parseTaskWorkbook(buffer: ArrayBuffer, existingTasks: Task[]): TaskImportResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const errors: string[] = []
  const byName = new Map(existingTasks.map((t) => [t.name, t]))
  let importedCount = 0

  rows.forEach((row, index) => {
    const rowNum = index + 2
    const name = String(row['과제명'] ?? '').trim()
    const importance = String(row['과제등급'] ?? '').trim() as Importance
    const workload = String(row['업무량'] ?? '').trim() as Workload
    const objective = String(row['목표'] ?? '').trim()
    const achievement = String(row['성과'] ?? '').trim()
    const performanceGradeRaw = String(row['성과등급'] ?? '').trim().toUpperCase()
    const performanceGrade = (performanceGradeRaw || 'B') as PerformanceGrade

    if (!name) {
      errors.push(`${rowNum}행: 과제명이 비어 있어 건너뛰었습니다.`)
      return
    }
    if (!IMPORTANCE_OPTIONS.includes(importance)) {
      errors.push(`${rowNum}행 '${name}': 과제등급 '${row['과제등급']}'은(는) 유효하지 않습니다. (중점/핵심/일반/지원)`)
      return
    }
    if (!WORKLOAD_OPTIONS.includes(workload)) {
      errors.push(`${rowNum}행 '${name}': 업무량 '${row['업무량']}'은(는) 유효하지 않습니다. (대/중/소)`)
      return
    }
    if (!PERFORMANCE_GRADE_OPTIONS.includes(performanceGrade)) {
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
  })

  return { tasks: Array.from(byName.values()), errors, importedCount }
}

// ---------- Team member template / import ----------

const MEMBER_HEADERS = ['이름', '직책', '직급', '연차', '역할', '코멘트'] as const

export function downloadMemberTemplate() {
  const rows = [
    [...MEMBER_HEADERS],
    ['김민준', '팀장', '과장', 7, '기획', ''],
    ['이서연', '', '대리', 3, '디자인', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 30 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '팀원양식')
  downloadWorkbook(wb, '팀원_업로드_양식.xlsx')
}

export interface MemberImportResult {
  members: TeamMember[]
  errors: string[]
  importedCount: number
}

export function parseMemberWorkbook(buffer: ArrayBuffer, existingMembers: TeamMember[]): MemberImportResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const errors: string[] = []
  const byName = new Map(existingMembers.map((m) => [m.name, m]))
  let importedCount = 0

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
  })

  return { members: Array.from(byName.values()), errors, importedCount }
}

// ---------- Results report export ----------

export function downloadResultsReport(
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
) {
  const results = calcMemberResults(members, tasks, contributions, criteria)
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
      const personalFactor = criteria.usePersonalPerformanceGrade
        ? c.personalPerformanceGrade
        : '미사용'
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

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rankSheet, '순위표')
  XLSX.utils.book_append_sheet(wb, detailSheet, '과제별상세')
  downloadWorkbook(wb, `평가결과_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

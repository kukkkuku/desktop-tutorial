import * as XLSX from 'xlsx'
import type { EvaluationGrade, Level, TeamMember } from '../types'

export interface ParsedAppraisalYear {
  year: number
  firstHalfGrade: EvaluationGrade | ''
  secondHalfGrade: EvaluationGrade | ''
  competencyGrade: EvaluationGrade | ''
}

export interface ParsedEmployeeSheet {
  sheetName: string
  name: string
  hireDate: string | null
  currentLevel: Level | null
  years: ParsedAppraisalYear[]
}

export interface PromotionImportMatch {
  sheet: ParsedEmployeeSheet
  member: TeamMember | null
}

// 승진 시뮬레이션 Excel은 시트마다 팀원 한 명(사번/이름/입사일 + 연도별 업적·역량 등급)을
// 담는 고정 레이아웃이다 — '승진기준'/'Sheet1'은 데이터가 아닌 기준표/작업용 시트라 제외.
const SKIP_SHEETS = new Set(['승진기준', 'Sheet1'])
const VALID_GRADES = new Set(['S', 'A', 'B', 'C', 'D'])
const YEAR_COLS = ['G', 'H', 'I', 'J', 'K']
const KNOWN_LEVELS: Level[] = ['사원', '대리', '과장', '차장', '부장']

function toGrade(value: unknown): EvaluationGrade | '' {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toUpperCase()
  return VALID_GRADES.has(trimmed) ? (trimmed as EvaluationGrade) : ''
}

// 시트명(대리1/대리2/과장1/과장2/차장/부장)에서 뒤에 붙은 번호를 떼면 그 팀원의
// 현재 직급이 된다. A6(승진직급)은 "다음 목표 직급"이라 현재 직급 판단에는 쓰지 않는다.
function levelFromSheetName(sheetName: string): Level | null {
  const stripped = sheetName.replace(/[0-9]+$/, '').trim()
  return (KNOWN_LEVELS as string[]).includes(stripped) ? (stripped as Level) : null
}

// xlsx 시리얼 날짜와, 서식 없이 "2021.09.27"처럼 입력되어 202109.27 같은 숫자로
// 저장된 값(원본 파일에 실제로 존재하는 패턴) 둘 다 처리한다.
export function parseHireDateCell(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'number') {
    const intPart = Math.floor(value)
    const year = Math.floor(intPart / 100)
    const month = intPart % 100
    const day = Math.round((value - intPart) * 100)
    if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    return null
  }
  return null
}

function cellVal(ws: XLSX.WorkSheet, ref: string): unknown {
  return ws[ref]?.v
}

export function parsePromotionHistoryWorkbook(buffer: ArrayBuffer): ParsedEmployeeSheet[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const results: ParsedEmployeeSheet[] = []

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue
    const ws = wb.Sheets[sheetName]
    const rawName = cellVal(ws, 'B3')
    const name = typeof rawName === 'string' ? rawName.trim() : ''
    if (!name) continue

    const hireDate = parseHireDateCell(cellVal(ws, 'C3'))
    const currentLevel = levelFromSheetName(sheetName)

    const years: ParsedAppraisalYear[] = []
    for (const col of YEAR_COLS) {
      const yearVal = cellVal(ws, `${col}2`)
      const year = typeof yearVal === 'number' ? yearVal : Number(yearVal)
      if (!Number.isFinite(year)) continue
      const firstHalfGrade = toGrade(cellVal(ws, `${col}3`))
      const secondHalfGrade = toGrade(cellVal(ws, `${col}4`))
      const competencyGrade = toGrade(cellVal(ws, `${col}5`))
      if (!firstHalfGrade && !secondHalfGrade && !competencyGrade) continue
      years.push({ year, firstHalfGrade, secondHalfGrade, competencyGrade })
    }

    results.push({ sheetName, name, hireDate, currentLevel, years })
  }

  return results
}

// 이름이 정확히 일치하는 기존 팀원에만 연결한다 — 새 팀원을 임의로 만들지 않는다.
export function matchToMembers(sheets: ParsedEmployeeSheet[], members: TeamMember[]): PromotionImportMatch[] {
  return sheets.map((sheet) => ({
    sheet,
    member: members.find((m) => m.name === sheet.name) ?? null,
  }))
}

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
  promotionReviewDate: string | null
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

// 승급심사예정일(D3, YYYY-MM-DD 파싱)을 member.promotionReviewDate가 쓰는
// "YYYY-MM"(월 단위 input[type=month]) 형식으로 잘라 반환한다.
function parsePromotionReviewDateCell(value: unknown): string | null {
  const parsed = parseHireDateCell(value)
  return parsed ? parsed.slice(0, 7) : null
}

function cellVal(ws: XLSX.WorkSheet, ref: string): unknown {
  return ws[ref]?.v
}

// 시트마다 "평가등급" 표가 두 곳에 있다: 상단 고정 블록(2행=연도헤더,
// 3~5행=업적상/업적하/역량, 항상 최근 5개년 고정폭)과, 하단 "육성 시뮬레이션"
// 블록(26행=연도헤더, 27~29행=업적상/업적하/역량, 팀원 개인의 승급심사예정일
// 기준으로 연도가 앵커링됨). 두 블록은 겹치는 연도는 같은 값을 담고 있지만,
// 하단 블록에만 더 최신 연도(예: 승급심사예정일에 가까운 해)가 추가로 들어있는
// 경우가 많다 — 상단만 읽으면 그 최신 연도가 통째로 누락된다.
function readYearBlock(ws: XLSX.WorkSheet, headerRow: number, firstRow: number, secondRow: number, competencyRow: number): ParsedAppraisalYear[] {
  const years: ParsedAppraisalYear[] = []
  for (const col of YEAR_COLS) {
    const yearVal = cellVal(ws, `${col}${headerRow}`)
    const year = typeof yearVal === 'number' ? yearVal : Number(yearVal)
    if (!Number.isFinite(year)) continue
    const firstHalfGrade = toGrade(cellVal(ws, `${col}${firstRow}`))
    const secondHalfGrade = toGrade(cellVal(ws, `${col}${secondRow}`))
    const competencyGrade = toGrade(cellVal(ws, `${col}${competencyRow}`))
    if (!firstHalfGrade && !secondHalfGrade && !competencyGrade) continue
    years.push({ year, firstHalfGrade, secondHalfGrade, competencyGrade })
  }
  return years
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
    const promotionReviewDate = parsePromotionReviewDateCell(cellVal(ws, 'D3'))
    const currentLevel = levelFromSheetName(sheetName)

    const byYear = new Map<number, ParsedAppraisalYear>()
    for (const y of readYearBlock(ws, 2, 3, 4, 5)) byYear.set(y.year, y)
    for (const y of readYearBlock(ws, 26, 27, 28, 29)) byYear.set(y.year, y)
    const years = Array.from(byYear.values()).sort((a, b) => a.year - b.year)

    results.push({ sheetName, name, hireDate, promotionReviewDate, currentLevel, years })
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

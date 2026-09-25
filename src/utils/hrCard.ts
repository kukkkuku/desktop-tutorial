// 회사 "종합 인사기록카드"(.xls/.xlsx)에서 이 앱이 쓰는 값만 읽는다.
// 카드에는 주민번호·연락처·주소·가족 같은 민감 정보가 있지만 읽지도 저장하지도 않는다.
// 읽는 것: 이름(팀원 매칭용), 직위(→직급), 당사입사(→입사일), 최종승진일(→직급 발령일),
// 최근 발령의 소속(→담당팀), 직책(→역할이 비어 있을 때만).
//
// 카드 모양: "라벨 칸" 오른쪽의 첫 값 칸이 그 값이다(병합 칸이라 열 위치가 조금씩 다름).
// 한 시트에 여러 명이 이어 붙어 있을 수 있어 "종합인사기록카드" 제목마다 한 사람으로 나눈다.
import * as XLSX from 'xlsx'
import type { Level } from '../types'
import { LEVEL_OPTIONS } from '../types'

export interface HRCardPerson {
  name: string
  level: Level | null
  levelRaw: string
  hireDate: string | null
  currentLevelSince: string | null
  team: string | null
  position: string | null // 직책(팀원/팀장 등)
  source: string // 파일명 · 시트
}

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '').trim()

function toIsoDate(v: string): string | null {
  const m = v.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function parseBlock(rows: string[][], source: string): HRCardPerson | null {
  const find = (label: string): { r: number; c: number } | null => {
    for (let r = 0; r < rows.length; r++) {
      const c = rows[r].findIndex((x) => norm(x) === label)
      if (c >= 0) return { r, c }
    }
    return null
  }
  const valueRight = (label: string): string => {
    const at = find(label)
    if (!at) return ''
    const row = rows[at.r]
    for (let c = at.c + 1; c < row.length; c++) if (norm(row[c])) return String(row[c]).trim()
    return ''
  }
  // 이름: "사 번" 줄의 맨 왼쪽 값
  const idAt = find('사번')
  if (!idAt) return null
  const name = rows[idAt.r].slice(0, idAt.c).map((x) => String(x).trim()).find(Boolean) ?? ''
  if (!name) return null

  const levelRaw = valueRight('직위')
  const level = (LEVEL_OPTIONS as string[]).includes(levelRaw) ? (levelRaw as Level) : null

  // 담당팀: 발령사항 표의 가장 최근(첫) 줄 소속
  let team: string | null = null
  const head = find('발령일')
  if (head) {
    const teamCol = rows[head.r].findIndex((x) => norm(x) === '소속')
    for (let r = head.r + 1; r < rows.length && teamCol >= 0; r++) {
      if (!toIsoDate(String(rows[r][head.c] ?? ''))) break
      const t = String(rows[r][teamCol] ?? '').trim()
      if (t) {
        team = t
        break
      }
    }
  }

  return {
    name,
    level,
    levelRaw,
    hireDate: toIsoDate(valueRight('당사입사')),
    currentLevelSince: toIsoDate(valueRight('최종승진일')),
    team,
    position: valueRight('직책') || null,
    source,
  }
}

export function parseHRCards(buffer: ArrayBuffer, fileName: string): HRCardPerson[] {
  const wb = XLSX.read(buffer)
  const out: HRCardPerson[] = []
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' })
    const starts = rows.map((r, i) => (r.some((x) => norm(x) === '종합인사기록카드') ? i : -1)).filter((i) => i >= 0)
    const bounds = starts.length ? starts : [0]
    bounds.forEach((start, k) => {
      const person = parseBlock(rows.slice(start, bounds[k + 1] ?? rows.length), `${fileName} · ${sheetName}`)
      if (person) out.push(person)
    })
  }
  return out
}

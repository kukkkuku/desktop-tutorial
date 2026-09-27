// 주차 칸 칠하기 색(계획 · 실적). 기본은 시트에서 쓰던 회색 · 분홍이고, 칠하기 도구를 우클릭해 바꿀 수 있다.
// 바꾼 색은 이 브라우저에 기억하고, 화면 · 구글시트 저장 · 엑셀 받기 · 시트 다시 읽기(이 색이면 계획/실적으로 알아봄)에 모두 쓴다.
import type { WeekFill } from './sheetImport'

export const DEFAULT_FILL_HEX: Record<WeekFill, string> = { plan: 'D9D9D9', actual: 'F4CCCC' }
const KEY = 'progress-board:fill-colors'

function load(): Record<WeekFill, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const ok = (x: unknown) => typeof x === 'string' && /^[0-9A-F]{6}$/i.test(x)
    return { plan: ok(v?.plan) ? v.plan.toUpperCase() : DEFAULT_FILL_HEX.plan, actual: ok(v?.actual) ? v.actual.toUpperCase() : DEFAULT_FILL_HEX.actual }
  } catch {
    return { ...DEFAULT_FILL_HEX }
  }
}

let current: Record<WeekFill, string> = typeof localStorage === 'undefined' ? { ...DEFAULT_FILL_HEX } : load()

export function fillHex(f: WeekFill): string {
  return current[f]
}

// '' = 기본색으로
export function setFillHex(f: WeekFill, hex: string) {
  current = { ...current, [f]: hex ? hex.toUpperCase() : DEFAULT_FILL_HEX[f] }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // 기억 못 해도 지금 화면엔 반영
  }
}

// 지금 정한 색을 늘 돌려주는 표(FILL_HEX.plan처럼 쓴다)
export const FILL_HEX = {
  get plan() {
    return current.plan
  },
  get actual() {
    return current.actual
  },
} as Record<WeekFill, string>

// 화면에 보이는 색(디자인 시스템 v2): 기본 회색 · 분홍이면 화면에서만 청회색 · 옅은 분홍 막대로 보인다.
// 시트 저장 · 엑셀 받기 · 시트 다시 읽기는 FILL_HEX(시트 색) 그대로. 칠하기 색을 직접 바꿨으면 그 색을 그대로 보인다.
const VIEW_DEFAULT: Record<WeekFill, string> = { plan: 'C8CFDC', actual: 'E8D0D5' }
export function viewFillHex(f: WeekFill): string {
  return current[f] === DEFAULT_FILL_HEX[f] ? VIEW_DEFAULT[f] : current[f]
}

// 시트 칸 색(진한 노랑 등)을 화면에서만 옅게: 흰색에 22%만 섞는다(시트에는 원래 색으로 저장)
export function softHex(hex: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
  const mix = (c: number) => Math.round(255 - (255 - c) * 0.22)
  return [n(0), n(2), n(4)]
    .map((c) => mix(c).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

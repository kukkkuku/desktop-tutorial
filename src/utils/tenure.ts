// 입사일 / 현 직급 발령일로부터 근속·직급체류를 계산한다.
// calcYearsSince = 연도만 비교해 지난 해수(월·일은 보지 않음). 근속 N년, 승진 체류연한 판단에 쓴다.
// 예) 2024년 발령 → 2026년에는 2년 지남 = 3년차(calcYearOrdinal). 2024-12 발령도 2026-01이면 2년.
export function calcYearsSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const start = new Date(dateStr)
  if (Number.isNaN(start.getTime())) return null
  return Math.max(0, new Date().getFullYear() - start.getFullYear())
}

// 화면에 보이는 "n년차"는 만이 아니라 해(연도) 기준으로 센다: 발령 연도가 1년차.
// 예) 2024년 발령 → 2026년에 3년차, 2026년 발령 → 2026년에 1년차.
export function calcYearOrdinal(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const y = Number(String(dateStr).slice(0, 4))
  if (!Number.isFinite(y) || y < 1900) return null
  return Math.max(1, new Date().getFullYear() - y + 1)
}

export function formatServiceYears(years: number | null): string {
  if (years === null) return '-'
  return years === 0 ? '1년 미만' : `근속 ${years}년`
}

// ordinal = calcYearOrdinal(발령일) -- 해 기준 연차
export function formatLevelTenureLabel(level: string, ordinal: number | null): string {
  if (!level) return '-'
  if (ordinal === null) return level
  return `${level} ${ordinal}년차`
}

// 근속년월: 입사일부터 오늘까지 만으로 지난 년·개월
export function calcServiceYearMonth(hireDate: string | null | undefined): { years: number; months: number } | null {
  if (!hireDate) return null
  const start = new Date(hireDate)
  if (Number.isNaN(start.getTime())) return null
  const now = new Date()
  let total = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (now.getDate() < start.getDate()) total -= 1
  total = Math.max(0, total)
  return { years: Math.floor(total / 12), months: total % 12 }
}

// 창립기념일 기준 근속년수: 가장 최근에 지난 창립기념일(MM-DD) 시점까지 만으로 채운 해 수.
// 예) 입사 2025-01-10, 창립기념일 03-15, 오늘 2026-09-25 → 2026-03-15 기준 1년 2개월 → 1년.
export function countFoundingAnniversaries(hireDate: string | null | undefined, foundingDay: string | null | undefined): number | null {
  if (!hireDate || !foundingDay || !/^\d{2}-\d{2}$/.test(foundingDay)) return null
  const hire = String(hireDate).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hire)) return null
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const thisYear = `${today.getFullYear()}-${foundingDay}`
  const last = thisYear <= todayIso ? thisYear : `${today.getFullYear() - 1}-${foundingDay}`
  if (last <= hire) return 0
  let years = Number(last.slice(0, 4)) - Number(hire.slice(0, 4))
  if (last.slice(5) < hire.slice(5)) years -= 1
  return Math.max(0, years)
}

// 예전에 브라우저에만 기억하던 창립기념일(MM-DD). 지금은 팀 데이터(memberTable.foundingDay)에 저장하고, 이 값은 옮겨 오는 데만 쓴다.
const FOUNDING_KEY = 'company.foundingDay'
export function readFoundingDay(): string | null {
  try {
    const v = localStorage.getItem(FOUNDING_KEY)
    return v && /^\d{2}-\d{2}$/.test(v) ? v : null
  } catch {
    return null
  }
}
export function writeFoundingDay(v: string | null) {
  try {
    if (v) localStorage.setItem(FOUNDING_KEY, v)
    else localStorage.removeItem(FOUNDING_KEY)
  } catch {
    // 기억 못 해도 지금 화면에는 반영
  }
}

// 입사일 / 현 직급 발령일로부터 근속연차·직급체류연차를 자동 계산한다.
// "n년차"는 발령일로부터 만으로 지난 해수를 그대로 쓴다 (예: 2023.04.01 발령,
// 오늘 2026.08.16 기준 만 3년 경과 → "3년차").
export function calcYearsSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const start = new Date(dateStr)
  if (Number.isNaN(start.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  const beforeAnniversary =
    now.getMonth() < start.getMonth() || (now.getMonth() === start.getMonth() && now.getDate() < start.getDate())
  if (beforeAnniversary) years -= 1
  return Math.max(0, years)
}

export function formatServiceYears(years: number | null): string {
  if (years === null) return '-'
  return years === 0 ? '1년 미만' : `근속 ${years}년`
}

export function formatLevelTenureLabel(level: string, years: number | null): string {
  if (!level) return '-'
  if (years === null) return level
  return years === 0 ? `${level} 1년차 미만` : `${level} ${years}년차`
}

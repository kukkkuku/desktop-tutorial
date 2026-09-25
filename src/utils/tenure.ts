// 입사일 / 현 직급 발령일로부터 근속·직급체류를 계산한다.
// calcYearsSince = 만으로 지난 해수(근속 N년, 승진 체류연한 판단에 씀).
// 화면의 "n년차"는 calcYearOrdinal(해 기준)을 쓴다.
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

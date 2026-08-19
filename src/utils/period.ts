// 평가기간을 구조화된 값(연도 + 주기 + 기간코드)으로 다루기 위한 유틸.
// 화면에는 사람이 읽는 라벨(예: "상반기")을 보여주지만, 데이터 연결에는 항상
// evaluationPeriodCode(예: "H1")처럼 안정적인 코드를 쓴다.
import type { EvaluationCycle, WorkspaceMeta } from '../types'

export const CYCLE_LABELS: Record<EvaluationCycle, string> = {
  half: '반기',
  quarter: '분기',
  month: '월',
  custom: '사용자 정의',
}

export interface PeriodOption {
  code: string
  label: string
}

// 반기/분기/월은 코드가 고정돼 있어 선택지를 미리 계산해둘 수 있다. 사용자
// 정의는 팀이 그때그때 새로 만드는 라벨이라 목록을 미리 만들 수 없다.
export function periodOptionsForCycle(cycle: EvaluationCycle): PeriodOption[] {
  switch (cycle) {
    case 'half':
      return [
        { code: 'H1', label: '상반기' },
        { code: 'H2', label: '하반기' },
      ]
    case 'quarter':
      return [1, 2, 3, 4].map((q) => ({ code: `Q${q}`, label: `${q}분기` }))
    case 'month':
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        return { code: `M${String(m).padStart(2, '0')}`, label: `${m}월` }
      })
    case 'custom':
      return []
  }
}

// 사용자 정의 기간 라벨로부터 안정적인 code를 만든다 -- 같은 라벨을 다시
// 입력해도 같은 code가 나오도록 라벨을 슬러그화한다(중복 생성 방지 조합
// teamName+year+cycle+code가 실제로 작동하려면 필요).
export function customPeriodCode(label: string): string {
  const slug = label
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
  return `CUSTOM-${slug || 'PERIOD'}`
}

export function periodLabelForCode(cycle: EvaluationCycle, code: string, fallback: string): string {
  const opt = periodOptionsForCycle(cycle).find((o) => o.code === code)
  return opt?.label ?? fallback
}

export function findWorkspace(
  workspaces: WorkspaceMeta[],
  teamName: string,
  evaluationYear: number,
  evaluationCycle: EvaluationCycle,
  evaluationPeriodCode: string,
): WorkspaceMeta | null {
  return (
    workspaces.find(
      (w) =>
        w.teamName === teamName &&
        w.evaluationYear === evaluationYear &&
        w.evaluationCycle === evaluationCycle &&
        w.evaluationPeriodCode === evaluationPeriodCode,
    ) ?? null
  )
}

// 기존 워크스페이스가 자유 텍스트로 저장했던 periodName(예: "2026 상반기",
// "2026Q3", "3분기")에서 구조화된 값을 최대한 추론한다. 추론이 안 되면 그
// 평가만의 사용자 정의 기간으로 안전하게 fallback한다(데이터 손실 없음).
export function inferStructuredPeriod(
  periodName: string,
  createdAt: string,
): { evaluationYear: number; evaluationCycle: EvaluationCycle; evaluationPeriodCode: string } {
  const yearMatch = periodName.match(/(19|20)\d{2}/)
  const fallbackYear = new Date(createdAt).getFullYear() || new Date().getFullYear()
  const evaluationYear = yearMatch ? Number(yearMatch[0]) : fallbackYear

  if (/상반기|H1/i.test(periodName)) return { evaluationYear, evaluationCycle: 'half', evaluationPeriodCode: 'H1' }
  if (/하반기|H2/i.test(periodName)) return { evaluationYear, evaluationCycle: 'half', evaluationPeriodCode: 'H2' }

  const quarterMatch = periodName.match(/([1-4])\s*분기|Q([1-4])/i)
  if (quarterMatch) {
    const q = quarterMatch[1] ?? quarterMatch[2]
    return { evaluationYear, evaluationCycle: 'quarter', evaluationPeriodCode: `Q${q}` }
  }

  const monthMatch = periodName.match(/(1[0-2]|[1-9])\s*월/)
  if (monthMatch) {
    const m = Number(monthMatch[1])
    return { evaluationYear, evaluationCycle: 'month', evaluationPeriodCode: `M${String(m).padStart(2, '0')}` }
  }

  return { evaluationYear, evaluationCycle: 'custom', evaluationPeriodCode: customPeriodCode(periodName || '평가') }
}

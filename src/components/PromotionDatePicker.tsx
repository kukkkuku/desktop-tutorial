import YearPicker from './YearPicker'

// 승진심사 시기 -- 연도(YearPicker, 10년 단위 연대 그리드)와 월(select)을
// 나란히 두 칸으로 둔다. 새 평가 프로젝트 만들기(EvaluationPeriodPicker)의
// "연도 + 기간" 레이아웃과 같은 규칙(연도 왼쪽 / 하위 선택 오른쪽)이라
// 앱 안에서 연/월을 고르는 곳은 전부 같은 자리 배치, 같은 팝오버 스타일을
// 쓴다.
export default function PromotionDatePicker({
  year,
  month,
  onChange,
}: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <YearPicker year={year} onChange={(y) => onChange(y, month)} />
      {/* 승급심사는 4월 정기(직전 5개년) / 9월 특별(그해 상반기 포함 5개년) 두 가지 */}
      <select
        value={month >= 7 ? 9 : 4}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="h-8 rounded-control border border-hairline px-2.5 text-[13px] text-label"
        title="4월 정기심사: 직전 5개년 · 9월 특별심사: 그해 상반기 포함 5개년"
      >
        <option value={4}>4월 정기</option>
        <option value={9}>9월 특별</option>
      </select>
    </div>
  )
}

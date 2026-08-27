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
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-black hover:bg-gray-50"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>
    </div>
  )
}

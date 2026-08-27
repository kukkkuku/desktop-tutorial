// 팀원 순서에 따라 순환하는 색상 — 면담 탭의 팀원 선택 알약, 캘린더 점, 범례,
// 결과 페이지의 순위 막대/기여도 막대가 모두 같은 색상 기준을 공유하도록 한 곳에
// 모아둔다. dot(진한 점 색) / pastel(막대 배경) / pastelText(막대 위 글자)는 같은
// 인덱스끼리 짝을 이룬다.
const MEMBER_DOT_COLORS = ['#EB6100', '#22C55E', '#3B82F6', '#A855F7', '#EAB308', '#EC4899', '#14B8A6', '#F97316']
const MEMBER_PASTEL_COLORS = ['#FEE8D3', '#DCFCE7', '#DBEAFE', '#F3E8FF', '#FEF9C3', '#FCE7F3', '#CCFBF1', '#FFEDD5']
const MEMBER_PASTEL_TEXT = ['#C2561A', '#15803D', '#2563EB', '#7E22CE', '#A16207', '#BE185D', '#0F766E', '#C2410C']

export function colorForIndex(index: number): string {
  return MEMBER_DOT_COLORS[index % MEMBER_DOT_COLORS.length]
}

export function pastelForIndex(index: number): string {
  return MEMBER_PASTEL_COLORS[index % MEMBER_PASTEL_COLORS.length]
}

export function pastelTextForIndex(index: number): string {
  return MEMBER_PASTEL_TEXT[index % MEMBER_PASTEL_TEXT.length]
}

// 팀원 순서에 따라 순환하는 색상 — 면담 탭의 팀원 선택 알약, 캘린더 점, 범례가
// 모두 같은 색상 기준을 공유하도록 한 곳에 모아둔다.
const MEMBER_DOT_COLORS = ['#EB6100', '#22C55E', '#3B82F6', '#A855F7', '#EAB308', '#EC4899', '#14B8A6', '#F97316']

export function colorForIndex(index: number): string {
  return MEMBER_DOT_COLORS[index % MEMBER_DOT_COLORS.length]
}

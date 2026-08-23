// 면담 분위기 아이콘 -- 기존 OS 기본 이모지(😄🙂😐 등) 대신 작은 손그림 톤의
// 단순 얼굴 아이콘으로 통일해서 보여준다. 저장되는 값(note.mood)은 그대로
// 기존 이모지 문자열이라 예전 데이터와 호환된다 -- 이 컴포넌트는 그 문자를
// 받아 매칭되는 작은 SVG만 대신 그려주는 표시 전용 레이어다.
const MOOD_ICON_PATHS: Record<string, { eyes: string; mouth: string; extra?: string; extraColor?: string }> = {
  // 아주 좋음 -- 감은 눈 웃음 + 볼터치
  '😄': { eyes: 'M8 9c1-1.2 2-1.2 3 0M13 9c1-1.2 2-1.2 3 0', mouth: 'M8.5 13.5c1.2 1.6 5.8 1.6 7 0', extra: 'M6.5 12.5h.01M17.5 12.5h.01', extraColor: '#f9a8d4' },
  // 좋음 -- 점눈 + 완만한 미소
  '😊': { eyes: 'M9 9.5h.01M15 9.5h.01', mouth: 'M9 13c1 1.2 5 1.2 6 0' },
  // 약간 좋음 -- 점눈 + 살짝 미소
  '🙂': { eyes: 'M9 9.5h.01M15 9.5h.01', mouth: 'M9.5 13.2c1 .7 3 .7 5 0' },
  // 보통 -- 대시눈 + 일자 입
  '😐': { eyes: 'M8 9.5h2M14 9.5h2', mouth: 'M9 13.5h6' },
  // 약간 걱정됨 -- 점눈 + 살짝 처진 입
  '😕': { eyes: 'M9 9.5h.01M15 9.5h.01', mouth: 'M9.5 14c1-.7 3-.7 5 0' },
  // 걱정됨 -- 치켜뜬 눈 + 물결 입
  '😟': { eyes: 'M8 10c.6-.8 1.4-.8 2 0M14 10c.6-.8 1.4-.8 2 0', mouth: 'M9 14c.7-.6 1.3-.6 2 0s1.3.6 2 0 1.3-.6 2 0' },
  // 힘듦 -- 살짝 감긴 눈 + 큰 처진 입
  '😣': { eyes: 'M8 9.8c.6-.5 1.4-.5 2 0M14 9.8c.6-.5 1.4-.5 2 0', mouth: 'M9 14.5c1-1.2 5-1.2 6 0' },
  // 많이 지침 -- 반쯤 감긴 눈 + 땀
  '😩': { eyes: 'M8 10h2M14 10h2', mouth: 'M9 14.5c1-1.4 5-1.4 6 0', extra: 'M17 8.5c.8.8.8 1.7 0 2.3', extraColor: '#7dd3fc' },
  // 매우 힘듦 -- 감은 눈 + 눈물
  '😢': { eyes: 'M8 9.8c.6-.5 1.4-.5 2 0M14 9.8c.6-.5 1.4-.5 2 0', mouth: 'M9 15c1-1.4 5-1.4 6 0', extra: 'M9 11v3M15 11v3', extraColor: '#7dd3fc' },
}

interface MoodIconProps {
  emoji: string
  className?: string
}

export default function MoodIcon({ emoji, className = 'h-4 w-4' }: MoodIconProps) {
  const paths = MOOD_ICON_PATHS[emoji]
  if (!paths) return <span className={className}>{emoji}</span>
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="11.5" r="8.5" stroke="currentColor" strokeWidth={1.4} className="text-gray-300" />
      <path d={paths.eyes} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" className="text-gray-700" />
      <path d={paths.mouth} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="text-gray-700" />
      {paths.extra && <path d={paths.extra} stroke={paths.extraColor} strokeWidth={1.4} strokeLinecap="round" />}
    </svg>
  )
}

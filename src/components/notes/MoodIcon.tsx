// 면담 분위기 아이콘 -- Figma mood-scale-row(56:9) 참고, 6단계(슬픔/화남/보통/
// 좋음/매우 좋음/물음표)로 재구성했다. 원본 Figma 파일은 "Sad" 옵션이 배경색만
// 다를 뿐 "Great"와 같은 웃는 얼굴 아이콘을 그대로 재사용한 상태였다 -- 여기서는
// Sad를 눈물이 있는 별도 얼굴로 새로 그리고, 6단계 전부 색상이 겹치지 않게 했다.
export interface MoodOption {
  value: string
  label: string
}

export const MOOD_OPTIONS: MoodOption[] = [
  { value: 'sad', label: '슬픔' },
  { value: 'bad', label: '화남' },
  { value: 'okay', label: '보통' },
  { value: 'good', label: '좋음' },
  { value: 'great', label: '매우 좋음' },
  { value: 'question', label: '물음표' },
]

const MOOD_COLORS: Record<string, { bg: string; fg: string }> = {
  sad: { bg: '#EFF6FF', fg: '#2563EB' },
  bad: { bg: '#FEF2F2', fg: '#DC2626' },
  okay: { bg: '#FFFBEB', fg: '#D97706' },
  good: { bg: '#F0FDF4', fg: '#16A34A' },
  great: { bg: '#F5F3FF', fg: '#7C3AED' },
  question: { bg: '#F3F4F6', fg: '#6B7280' },
}

// 이전 9단계 이모지 데이터와의 호환 -- 예전에 저장된 note.mood 값을 새 6단계
// 중 가장 가까운 단계로 매핑해서 보여준다.
const LEGACY_EMOJI_MAP: Record<string, string> = {
  '😄': 'great',
  '😊': 'good',
  '🙂': 'good',
  '😐': 'okay',
  '😕': 'okay',
  '😟': 'bad',
  '😣': 'bad',
  '😩': 'bad',
  '😢': 'sad',
}

function renderFace(key: string, fg: string) {
  switch (key) {
    case 'sad':
      return (
        <g stroke={fg} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M8.6 9.8h.01M15.4 9.8h.01" />
          <path d="M8.6 11.6v1.6M15.4 11.6v1.6" />
          <path d="M8.6 16.8c1.3-1.7 5.5-1.7 6.8 0" />
        </g>
      )
    case 'bad':
      return (
        <g stroke={fg} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M7.7 9.3l2.3 1M16.3 9.3l-2.3 1" />
          <path d="M8.6 11.8h.01M15.4 11.8h.01" />
          <path d="M8.5 16c1.3-1.6 5.3-1.6 6.6 0" />
        </g>
      )
    case 'okay':
      return (
        <g stroke={fg} strokeWidth={1.6} strokeLinecap="round" fill="none">
          <path d="M8.3 10.6h2M13.7 10.6h2" />
          <path d="M8.5 15h7" />
        </g>
      )
    case 'good':
      return (
        <g stroke={fg} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M9 10.6h.01M15 10.6h.01" />
          <path d="M8.5 14c1.2 1.4 5.8 1.4 7 0" />
        </g>
      )
    case 'great':
      return (
        <g stroke={fg} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M7.8 10.6c.9-1 1.9-1 2.8 0M13.4 10.6c.9-1 1.9-1 2.8 0" />
          <path d="M8 14c1.5 1.8 6.5 1.8 8 0" />
          <path d="M17.6 7.4v1.8M16.7 8.3h1.8" />
        </g>
      )
    case 'question':
      return (
        <g stroke={fg} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M9.6 9.7a2.4 2.4 0 1 1 3.4 2.2c-.9.5-1.4 1-1.4 2.1" />
          <path d="M12 16.3h.01" />
        </g>
      )
    default:
      return null
  }
}

interface MoodIconProps {
  mood: string
  className?: string
}

export default function MoodIcon({ mood, className = 'h-8 w-8' }: MoodIconProps) {
  const key = MOOD_COLORS[mood] ? mood : LEGACY_EMOJI_MAP[mood]
  const colors = key ? MOOD_COLORS[key] : undefined
  if (!colors || !key) return <span className={className}>{mood}</span>

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10.7" fill={colors.bg} stroke={colors.fg} strokeWidth={1.4} />
      {renderFace(key, colors.fg)}
    </svg>
  )
}

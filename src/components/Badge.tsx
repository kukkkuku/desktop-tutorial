// 상태를 표시하는 모든 곳(평가 상태, 승진 가능, 면담 예정 등)이 공유하는 단일
// Badge 컴포넌트. 화면마다 배지를 새로 만들지 않도록, height/padding/radius/
// typography는 항상 고정하고 색상 강도(tone)만 바꿔서 쓴다.
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'navy'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  accent: 'bg-gray-100 text-black',
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-red-50 text-red-600',
  navy: 'bg-promo/10 text-promo',
}

interface BadgeProps {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}

export default function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-bold leading-none ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'grade-s' | 'grade-a' | 'grade-b' | 'grade-c' | 'grade-d'

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'border-gray-200 bg-gray-50 text-gray-600',
  accent: 'border-orange-200 bg-orange-50 text-accent',
  success: 'border-green-200 bg-green-50 text-success',
  danger: 'border-red-200 bg-red-50 text-danger',
  'grade-s': 'border-violet-200 bg-violet-50 text-violet-700',
  'grade-a': 'border-blue-200 bg-blue-50 text-blue-700',
  'grade-b': 'border-green-200 bg-green-50 text-green-700',
  'grade-c': 'border-amber-200 bg-amber-50 text-amber-700',
  'grade-d': 'border-red-200 bg-red-50 text-red-700',
}

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

export default function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return <span className={`ui-badge ${TONE_STYLES[tone]} ${className}`}>{children}</span>
}

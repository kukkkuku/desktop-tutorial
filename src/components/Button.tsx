// 앱 전체가 공유하는 버튼(디자인 시스템 v2). 주요 액션은 primary 하나, 나머지는 secondary,
// 툴바처럼 가벼운 곳은 ghost, 되돌리기 어려운 삭제만 danger. 크기는 md(기본 32px)·sm(28px).
// 화면에서 버튼 색·모양을 따로 만들지 않는다(docs/DESIGN-SYSTEM.md).
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // 주요 액션 = 파란 그라데이션 알약 + 번지는 빛(디자인 시스템 v3)
  primary: 'bg-gradient-to-b from-[#2E8BFF] to-[#0A66F0] text-white shadow-glow hover:brightness-105 active:brightness-95',
  secondary: 'bg-white/90 text-label shadow-control hover:bg-white active:bg-[#F1F5FA]',
  ghost: 'text-label-2 hover:bg-white/70 hover:text-label active:bg-white',
  danger: 'bg-danger text-white shadow-[0_8px_18px_-8px_rgba(220,38,38,0.6)] hover:brightness-95',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-[length:calc(14px*var(--ui-fs,1))] gap-1',
  md: 'h-9 px-4 text-[length:calc(14px*var(--ui-fs,1))] gap-1.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export default function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}

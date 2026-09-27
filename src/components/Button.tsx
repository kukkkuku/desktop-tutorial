// 앱 전체가 공유하는 버튼(디자인 시스템 v2). 주요 액션은 primary 하나, 나머지는 secondary,
// 툴바처럼 가벼운 곳은 ghost, 되돌리기 어려운 삭제만 danger. 크기는 md(기본 32px)·sm(28px).
// 화면에서 버튼 색·모양을 따로 만들지 않는다(docs/DESIGN-SYSTEM.md).
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // 주요 액션 = 검정 알약(디자인 시스템 v2)
  primary: 'bg-ink text-white shadow-[0_1px_2px_rgba(24,24,27,0.2),inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-[#27272A] active:bg-black',
  secondary: 'bg-white text-label shadow-control hover:bg-[#FAFAFA] active:bg-[#F4F4F5]',
  ghost: 'text-label-2 hover:bg-black/[0.045] hover:text-label active:bg-black/[0.07]',
  danger: 'bg-danger text-white shadow-[0_1px_2px_rgba(220,38,38,0.25)] hover:brightness-95',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1',
  md: 'h-8 px-3 text-[13px] gap-1.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export default function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}

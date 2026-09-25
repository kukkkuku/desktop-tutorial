// 앱 전체가 공유하는 버튼(macOS 스타일). 주요 액션은 primary 하나, 나머지는 secondary,
// 툴바처럼 가벼운 곳은 ghost, 되돌리기 어려운 삭제만 danger. 크기는 md(기본 32px)·sm(28px).
// 화면에서 버튼 색·모양을 따로 만들지 않는다(docs/DESIGN-SYSTEM.md).
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,0.25),0_0_0_0.5px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.12)] hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'bg-white text-label shadow-control hover:bg-[#FAFAFA] active:bg-[#F0F0F2]',
  ghost: 'text-label-2 hover:bg-black/[0.05] hover:text-label active:bg-black/[0.08]',
  danger:
    'bg-danger text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,0.25),0_0_0_0.5px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.12)] hover:brightness-95',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1',
  md: 'h-8 px-3.5 text-[13px] gap-1.5',
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

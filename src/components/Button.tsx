// 앱 전체가 공유하는 버튼(디자인 시스템 v2). 주요 액션은 primary 하나, 나머지는 secondary,
// 툴바처럼 가벼운 곳은 ghost, 되돌리기 어려운 삭제만 danger. 크기는 md(기본 32px)·sm(28px).
// 화면에서 버튼 색·모양을 따로 만들지 않는다(docs/DESIGN-SYSTEM.md).
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // 주요 액션: 모양은 테마(src/theme.css --btn-primary-*)가 정한다(검정 · 오렌지 단색 · 파란 그라데이션 등)
  primary: '[background:var(--btn-primary-bg)] text-[color:var(--btn-primary-fg)] shadow-glow hover:[background:var(--btn-primary-hover)]',
  secondary: 'bg-white text-label shadow-control hover:bg-[#FAFAFA] active:bg-[#F4F4F5]',
  ghost: 'text-label-2 hover:bg-black/[0.045] hover:text-label active:bg-black/[0.07]',
  danger: 'bg-danger text-white shadow-[0_1px_2px_rgba(220,38,38,0.3)] hover:brightness-95',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-[length:calc(14px*var(--ui-fs,1))] gap-1',
  md: 'h-8 px-3.5 text-[length:calc(14px*var(--ui-fs,1))] gap-1.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export default function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--r-btn)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}

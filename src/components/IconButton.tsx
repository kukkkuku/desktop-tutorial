// 아이콘만 있는 버튼(수정/삭제/닫기/되돌리기 등). macOS 툴바처럼 평소엔 아이콘만,
// 마우스를 올리면 옅은 회색 바탕. 아이콘은 lucide-react + ui/icon.ts의 크기 규칙.
import type { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'danger'
}

const TONE: Record<'default' | 'danger', string> = {
  default: 'hover:text-label',
  danger: 'hover:text-danger',
}

export default function IconButton({ tone = 'default', className = '', ...rest }: IconButtonProps) {
  return (
    <button
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-control px-1 text-label-2 transition-colors hover:bg-black/[0.05] active:bg-black/[0.08] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${TONE[tone]} ${className}`}
      {...rest}
    />
  )
}

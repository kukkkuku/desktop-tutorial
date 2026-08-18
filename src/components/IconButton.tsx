// 아이콘 하나만 있는 버튼(수정/삭제/닫기/이전·다음 등)이 화면마다 테두리 박스,
// 회색 배경 박스 등 제각각의 장식을 두르지 않도록 통일한다. 박스 없이 아이콘만
// 두고, hover 시 색만 바뀐다.
import type { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'danger'
}

const TONE_HOVER: Record<'default' | 'danger', string> = {
  default: 'hover:text-accent',
  danger: 'hover:text-danger',
}

export default function IconButton({ tone = 'default', className = '', ...rest }: IconButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center p-1 text-gray-400 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TONE_HOVER[tone]} ${className}`}
      {...rest}
    />
  )
}

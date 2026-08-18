// 앱 전체가 공유하는 버튼 스타일. Primary(주요 액션)/Secondary(보조 액션) 두 가지만
// 쓰고, 삭제 확인처럼 되돌리기 어려운 액션에만 예외적으로 Danger를 쓴다. 그 외의
// 색(파란색, 남색 등)으로 버튼을 만들지 않는다 -- 화면마다 버튼 색이 제각각이 되는
// 것을 막기 위해 이 컴포넌트 하나로 통일한다.
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  secondary: 'border border-gray-300 text-black hover:bg-gray-50',
  danger: 'bg-danger text-white hover:opacity-90',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export default function Button({ variant = 'secondary', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}

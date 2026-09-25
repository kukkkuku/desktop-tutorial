import { House } from 'lucide-react'
import { useAppMode } from '../state/AppMode'
import { icSm } from './ui/icon'

// 어느 화면에서든 메인(성과관리 / 과제 입력 고르기)으로 돌아가는 버튼
export default function HomeButton({ className = '' }: { className?: string }) {
  const { setMode } = useAppMode()
  return (
    <button
      onClick={() => setMode('home')}
      title="메인으로"
      aria-label="메인으로"
      className={`flex h-8 items-center gap-1.5 rounded-control px-2 text-[13px] font-medium text-label-2 transition-colors hover:bg-black/[0.05] hover:text-label ${className}`}
    >
      <House {...icSm} />
      메인
    </button>
  )
}

import { ChevronDown, ChevronUp } from 'lucide-react'
import IconButton from './IconButton'
import { icSm } from './ui/icon'

// 영역별 접기/펼치기 공용 버튼 -- 화면마다 "접기/펼치기" 텍스트 링크가
// 제각각이던 걸 하나의 아이콘 버튼으로 통일한다. 접는 동작(펼쳐진 상태에서
// 누르는 버튼)은 아래 화살표, 펴는 동작(접힌 상태에서 누르는 버튼)은 위
// 화살표를 쓴다. 항상 영역 헤더의 우측 끝에 배치한다.
interface CollapseToggleButtonProps {
  collapsed: boolean
  onClick: () => void
  label: string
  className?: string
}

export default function CollapseToggleButton({ collapsed, onClick, label, className = '' }: CollapseToggleButtonProps) {
  return (
    <IconButton
      type="button"
      onClick={onClick}
      title={collapsed ? `${label} 펼치기` : `${label} 접기`}
      aria-label={collapsed ? `${label} 펼치기` : `${label} 접기`}
      className={`shrink-0 text-label-3 ${className}`}
    >
      {collapsed ? <ChevronUp {...icSm} /> : <ChevronDown {...icSm} />}
    </IconButton>
  )
}

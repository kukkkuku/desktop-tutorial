// 영역별 접기/펼치기 공용 버튼 -- 화면마다 "접기/펼치기" 텍스트 링크가
// 제각각이던 걸 하나의 아이콘 버튼으로 통일한다. 접는 동작(펼쳐진 상태에서
// 누르는 버튼)은 아래 화살표, 펴는 동작(접힌 상태에서 누르는 버튼)은 위
// 화살표를 쓴다. 항상 영역 헤더의 우측 끝에 배치한다.
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

interface CollapseToggleButtonProps {
  collapsed: boolean
  onClick: () => void
  label: string
  className?: string
}

export default function CollapseToggleButton({ collapsed, onClick, label, className = '' }: CollapseToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? `${label} 펼치기` : `${label} 접기`}
      aria-label={collapsed ? `${label} 펼치기` : `${label} 접기`}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-black ${className}`}
    >
      {collapsed ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
    </button>
  )
}

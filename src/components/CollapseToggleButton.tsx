// 영역별 접기/펼치기 공용 버튼 -- 운영체제 창 조절 버튼과 같은 아이콘
// 문법을 쓴다: 펼쳐진 상태는 최소화(─) 아이콘을 눌러 접고, 접힌 상태는
// 복원(□) 아이콘을 눌러 편다. 화면마다 "접기/펼치기" 텍스트 링크가
// 제각각이던 걸 하나의 아이콘 버튼으로 통일한다.
function MinimizeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <line x1="5" y1="19" x2="19" y2="19" />
    </svg>
  )
}

function RestoreIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
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
      {collapsed ? <RestoreIcon className="h-3 w-3" /> : <MinimizeIcon className="h-3 w-3" />}
    </button>
  )
}

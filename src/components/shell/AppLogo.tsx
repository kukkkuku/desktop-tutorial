// 앱 로고(public/favicon.svg와 같은 그림): 밝은 둥근 판 + 오렌지 원 + 진척 링.
// 한 화면에 여러 개 그려도 그라데이션 id가 겹치지 않게 useId를 쓴다.
import { useId } from 'react'

export default function AppLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFBF7" />
          <stop offset="1" stopColor="#F7EADF" />
        </linearGradient>
        <linearGradient id={`d${id}`} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#FF9A5C" />
          <stop offset="1" stopColor="#E85A0C" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#t${id})`} />
      <circle cx="256" cy="246" r="202" fill={`url(#d${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="30" strokeLinecap="round">
        <circle cx="256" cy="246" r="112" strokeOpacity=".32" />
        <path d="M256 134 A112 112 0 1 1 150 282" />
      </g>
      <circle cx="256" cy="246" r="18" fill="#fff" />
    </svg>
  )
}

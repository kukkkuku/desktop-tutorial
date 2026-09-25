// macOS 세그먼트 컨트롤. 화면 안의 탭·보기 전환·방식 고르기는 모두 이것으로.
import type { ReactNode } from 'react'

interface Props<K extends string> {
  items: { key: K; label: ReactNode; title?: string }[]
  value: K
  onChange: (key: K) => void
  className?: string
}

export default function Segmented<K extends string>({ items, value, onChange, className = '' }: Props<K>) {
  return (
    <div className={`mac-seg ${className}`} role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={value === it.key}
          title={it.title}
          onClick={() => onChange(it.key)}
          className={`mac-seg-item ${value === it.key ? 'mac-seg-item-on' : ''}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

// 화면 안의 하위 탭(과제별 | 팀원별, 팀원 | 피어리뷰 등). 글자 크기는 같고, 선택된 탭만 진한 글자 + 아래 검은 선.
// 탭 줄 아래에는 옅은 구분선이 가로로 이어진다(디자인 시스템 v2).
import type { ReactNode } from 'react'

interface Props<K extends string> {
  items: { key: K; label: ReactNode; title?: string }[]
  value: K
  onChange: (key: K) => void
  className?: string
}

export default function UnderlineTabs<K extends string>({ items, value, onChange, className = '' }: Props<K>) {
  return (
    <div className={`flex items-end gap-5 border-b border-separator ${className}`} role="tablist">
      {items.map((it) => {
        const on = value === it.key
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            title={it.title}
            onClick={() => onChange(it.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[14px] transition-colors ${
              on ? 'border-ink font-medium text-label' : 'border-transparent text-label-2 hover:text-label'
            }`}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

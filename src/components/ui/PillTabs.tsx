// 앱 전체 탭의 공통 모양 -- 과제 입력 그룹(L1) 탭과 똑같다(모양을 따로 바꾸지 않는다):
// 회색 띠 위에서, 폭이 모자라면 탭이 함께 줄며 이름은 말줄임(…), 고른 탭은 이름이 전부 보이고 흰 알약으로 도드라진다.
// 나머지 탭 사이에는 가는 구분선.
import type { ReactNode } from 'react'

export interface PillTabItem<K extends string> {
  key: K
  label: ReactNode
  badge?: ReactNode // 이름 옆 개수 등
  title?: string
}

interface Props<K extends string> {
  items: PillTabItem<K>[]
  value: K
  onChange: (key: K) => void
  className?: string
  fit?: boolean // true = 탭 폭만큼만 차지(기본: 가로를 꽉 채움)
}

export default function PillTabs<K extends string>({ items, value, onChange, className = '', fit = false }: Props<K>) {
  const onIdx = items.findIndex((it) => it.key === value)
  return (
    <div
      role="tablist"
      className={`flex h-[38px] min-w-0 items-center gap-0.5 overflow-hidden rounded-[10px] px-2 [background:var(--tabbar-bg,rgb(0_0_0/0.04))] ${fit ? 'w-fit max-w-full' : 'w-full'} ${className}`}
    >
      {items.map((it, i) => {
        const on = i === onIdx
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            title={it.title ?? (typeof it.label === 'string' ? it.label : undefined)}
            onClick={() => onChange(it.key)}
            className={`relative flex h-[26px] cursor-pointer select-none items-center gap-1.5 rounded-[10px] px-[11px] text-[length:calc(13px*var(--ui-fs,1))] transition-colors ${
              on
                ? 'l1-tab-on flex-none font-semibold text-label'
                : `min-w-[44px] max-w-[240px] flex-[0_1_auto] font-medium text-label-2 hover:bg-black/[0.06] hover:text-label ${i + 1 === onIdx ? '' : 'l1-tab-sep'}`
            }`}
          >
            <span className="min-w-0 truncate">{it.label}</span>
            {it.badge !== undefined && it.badge !== null && it.badge !== false && (
              <span className="shrink-0 text-[length:calc(12px*var(--ui-fs,1))] font-medium tabular-nums text-label-3">{it.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

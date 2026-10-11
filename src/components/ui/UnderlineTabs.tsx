// 화면 안의 하위 탭(과제별 | 팀원별, 팀원 | 피어리뷰 등). 이제 앱 공통 탭 모양(PillTabs)을 쓴다.
import type { ReactNode } from 'react'
import PillTabs from './PillTabs'

interface Props<K extends string> {
  items: { key: K; label: ReactNode; title?: string }[]
  value: K
  onChange: (key: K) => void
  className?: string
}

export default function UnderlineTabs<K extends string>({ items, value, onChange, className = '' }: Props<K>) {
  return <PillTabs items={items} value={value} onChange={onChange} className={className} fit />
}

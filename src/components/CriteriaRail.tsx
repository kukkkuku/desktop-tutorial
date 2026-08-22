import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import CriteriaConfiguration from './CriteriaConfiguration'

type CriteriaKey = keyof Criteria
type IconName = 'star' | 'briefcase' | 'trophy' | 'percent' | 'user' | 'users'

const ITEMS: Array<{ key: CriteriaKey; label: string; icon: IconName }> = [
  { key: 'taskGradeWeight', label: '과제 중요도', icon: 'star' },
  { key: 'workloadWeight', label: '업무량', icon: 'briefcase' },
  { key: 'performanceGradeWeight', label: '과제 성과등급', icon: 'trophy' },
  { key: 'contributionWeight', label: '기여도', icon: 'percent' },
  { key: 'personalGradeWeight', label: '개인 수행등급', icon: 'user' },
  { key: 'peerReviewWeight', label: '피어리뷰', icon: 'users' },
]

function CriteriaIcon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...common}>
    {name === 'star' && <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />}
    {name === 'briefcase' && <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>}
    {name === 'trophy' && <><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM10 16h4M12 13v3M8 20h8" /><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4" /></>}
    {name === 'percent' && <><path d="m6 19 12-14" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></>}
    {name === 'user' && <><circle cx="12" cy="8" r="3" /><path d="M5 21c.5-4.7 2.8-7 7-7s6.5 2.3 7 7" /></>}
    {name === 'users' && <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 21c.4-4.7 2.6-7 6.5-7s6.1 2.3 6.5 7M15 15c3.6-.6 5.8 1.4 6.2 5" /></>}
  </svg>
}

export default function CriteriaRail({ collapsed, onExpand, onCollapse }: { collapsed: boolean; onExpand: () => void; onCollapse: () => void }) {
  const { state, dispatch } = useAppState()

  function toggle(key: CriteriaKey) {
    dispatch({ type: 'SET_CRITERIA', payload: { [key]: state.criteria[key] > 0 ? 0 : 100 } })
  }

  if (!collapsed) {
    return <aside className="min-w-0 overflow-y-auto bg-white px-4" aria-label="평가기준 도구"><CriteriaConfiguration onCollapse={onCollapse} /></aside>
  }

  return (
    <aside className="flex flex-col items-center gap-2 bg-white py-3" aria-label="간단 평가기준 도구">
      <button type="button" onClick={onExpand} className="ui-button ui-button-ghost ui-button-sm h-9 w-9 px-0" title="평가기준 확장" aria-label="평가기준 확장"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg></button>
      <div className="h-px w-7 bg-gray-200" />
      {ITEMS.map((item) => {
        const enabled = state.criteria[item.key] > 0
        return <button key={item.key} type="button" role="switch" aria-checked={enabled} onClick={() => toggle(item.key)} title={`${item.label} ${enabled ? '사용 중' : '미사용'}`} className={`flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${enabled ? 'border-orange-300 bg-orange-50 text-accent' : 'border-gray-200 bg-white text-gray-400 hover:text-gray-700'}`}><CriteriaIcon name={item.icon} /><span className="sr-only">{item.label} {enabled ? '끄기' : '켜기'}</span></button>
      })}
    </aside>
  )
}

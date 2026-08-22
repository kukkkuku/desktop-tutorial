import { useState, type CSSProperties } from 'react'
import { useAppState } from '../state/AppContext'
import type { Criteria } from '../types'
import { blendByWeight } from '../utils/calculations'
import ConfirmDialog from './ConfirmDialog'

type CriteriaKey = keyof Criteria

const DEFAULT_CRITERIA: Criteria = {
  performanceGradeWeight: 100,
  taskGradeWeight: 100,
  workloadWeight: 100,
  personalGradeWeight: 0,
  contributionWeight: 100,
  peerReviewWeight: 0,
  gradeSPercent: 10,
  gradeAPercent: 20,
  gradeBPercent: 40,
  gradeCPercent: 20,
  gradeDPercent: 10,
}

function Criterion({ label, weightKey, values }: { label: string; weightKey: CriteriaKey; values: (weight: number) => string }) {
  const { state, dispatch } = useAppState()
  const weight = state.criteria[weightKey]
  const active = weight > 0
  const update = (value: number) => dispatch({ type: 'SET_CRITERIA', payload: { [weightKey]: value } })

  return <div className="rounded-md border border-gray-200 px-3 py-2.5">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[13px] font-semibold text-gray-950">{label}{active && <span className="ml-2 tabular-nums text-accent">{weight}%</span>}</p>
      <button type="button" role="switch" aria-checked={active} onClick={() => update(active ? 0 : 100)} title="클릭해서 활성/비활성 전환" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />{active ? '활성' : '비활성'}
      </button>
    </div>
    {active && <input aria-label={`${label} 반영 비율`} type="range" min={5} max={100} step={5} value={weight} onChange={(event) => update(Number(event.target.value))} className="ui-range mt-1.5 w-full" style={{ '--range-progress': `${((weight - 5) / 95) * 100}%` } as CSSProperties} />}
    <p className="mt-0.5 text-xs leading-4 text-gray-600">{values(weight)}</p>
  </div>
}

export default function CriteriaConfiguration({ onCollapse }: { onCollapse?: () => void }) {
  const { state, dispatch } = useAppState()
  const [resetOpen, setResetOpen] = useState(false)
  const distribution = [
    ['S', 'gradeSPercent'],
    ['A', 'gradeAPercent'],
    ['B', 'gradeBPercent'],
    ['C', 'gradeCPercent'],
    ['D', 'gradeDPercent'],
  ] as const

  function updateDistribution(key: typeof distribution[number][1], nextValue: number) {
    const value = Math.max(0, Math.min(100, Number.isFinite(nextValue) ? nextValue : 0))
    const balanceKey = key === 'gradeDPercent' ? 'gradeBPercent' : 'gradeDPercent'
    const otherTotal = distribution.reduce((sum, [, itemKey]) => itemKey === key || itemKey === balanceKey ? sum : sum + state.criteria[itemKey], 0)
    const balanced = Math.max(0, 100 - otherTotal - value)
    dispatch({ type: 'SET_CRITERIA', payload: { [key]: value, [balanceKey]: balanced } })
  }
  return <div className="space-y-3 py-3">
    <div className="flex items-center gap-2">{onCollapse && <button type="button" onClick={onCollapse} title="평가기준 접기" aria-label="평가기준 접기" className="ui-button ui-button-ghost ui-button-sm h-8 w-8 shrink-0 px-0"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m13 17-5-5 5-5M19 17l-5-5 5-5" /></svg></button>}<h2 className="text-base font-semibold text-gray-950">기준 설정</h2><p className="text-xs text-gray-500">현재 프로젝트에 즉시 반영</p><button type="button" onClick={() => setResetOpen(true)} title="기준 설정 초기화" aria-label="기준 설정 초기화" className="ui-button ui-button-ghost ui-button-sm ml-auto h-8 w-8 shrink-0 px-0"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M5.5 15a7 7 0 0 0 11.8 2.3L20 14M4 10l2.7-3.3A7 7 0 0 1 18.5 9"/></svg></button></div>
    <section><h3 className="text-xs font-semibold text-gray-500">과제 평가 기준</h3><div className="mt-2 space-y-2">
      <Criterion label="과제 중요도" weightKey="taskGradeWeight" values={(w) => w ? `중점 ${blendByWeight(100,130,w).toFixed(0)} / 핵심 ${blendByWeight(100,110,w).toFixed(0)} / 일반 100 / 지원 ${blendByWeight(100,80,w).toFixed(0)}` : '모든 과제 중요도 계수 1.0 적용'} />
      <Criterion label="업무량" weightKey="workloadWeight" values={(w) => w ? `대 ${blendByWeight(1,1.2,w).toFixed(2)} / 중 1.00 / 소 ${blendByWeight(1,.8,w).toFixed(2)}배` : '모든 과제 업무량 계수 1.0 적용'} />
      <Criterion label="과제 성과등급" weightKey="performanceGradeWeight" values={(w) => w ? `S 100 / A ${blendByWeight(100,90,w).toFixed(0)} / B ${blendByWeight(100,80,w).toFixed(0)} / C ${blendByWeight(100,70,w).toFixed(0)} / D ${blendByWeight(100,60,w).toFixed(0)}` : '모든 과제 성과점수 100 적용'} />
    </div></section>
    <section><h3 className="text-xs font-semibold text-gray-500">팀원 평가 기준</h3><div className="mt-2 space-y-2">
      <Criterion label="기여도" weightKey="contributionWeight" values={(w) => w ? `매트릭스 입력값 ${w}% 반영` : '참여 팀원에게 과제 점수 균등 배분'} />
      <Criterion label="개인 수행등급" weightKey="personalGradeWeight" values={(w) => w ? `개인 수행계수 ${w}% 반영` : '개인 수행계수 미반영'} />
      <Criterion label="피어리뷰" weightKey="peerReviewWeight" values={(w) => w ? `피어 평균 수행등급 계수 ${w}% 반영` : '피어 추천 및 근거 숨김'} />
    </div></section>
    <section className="border-y border-gray-200 py-2.5"><h3 className="text-sm font-semibold text-gray-800">최종 고과 배분</h3><p className="mt-0.5 text-xs leading-4 text-gray-500">성과점수 순위에 따라 상대평가하며 동점자는 같은 고과로 표시합니다.</p><div className="mt-2 grid grid-cols-5 gap-1.5">{distribution.map(([grade, key]) => <label key={key} className="text-center text-xs font-semibold text-gray-700"><span>{grade}</span><span className="mt-1 flex items-center rounded-md border border-gray-300 px-1"><input type="number" min={0} max={100} value={state.criteria[key]} onChange={(event) => updateDistribution(key, Number(event.target.value))} className="h-7 min-w-0 w-full bg-transparent text-right tabular-nums outline-none"/><span className="text-gray-400">%</span></span></label>)}</div><p className="mt-1 text-right text-xs font-medium text-green-700">합계 100%</p></section>
    <ConfirmDialog open={resetOpen} title="기준 설정 초기화" message="현재 평가 프로젝트의 모든 기준 설정을 기본값으로 초기화합니다. 계속하시겠습니까?" confirmLabel="초기화" onCancel={() => setResetOpen(false)} onConfirm={() => { dispatch({ type: 'SET_CRITERIA', payload: DEFAULT_CRITERIA }); setResetOpen(false) }} />
  </div>
}

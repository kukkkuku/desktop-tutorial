import type { Importance, Workload } from '../types'

export const IMPORTANCE_COLORS: Record<Importance, string> = {
  // 과제관리 표의 분류 뱃지와 같은 색
  과제: 'text-violet-800 bg-violet-100',
  일상: 'text-stone-600 bg-stone-100',
  중점: 'text-orange-600 bg-orange-50',
  핵심: 'text-blue-600 bg-blue-50',
  일반: 'text-slate-700 bg-slate-100',
  지원: 'text-slate-500 bg-slate-50',
}

export const WORKLOAD_COLORS: Record<Workload, string> = {
  대: 'text-red-600 bg-red-50',
  중: 'text-yellow-600 bg-yellow-50',
  소: 'text-green-600 bg-green-50',
}

import type { Importance, Workload } from '../types'

export const IMPORTANCE_COLORS: Record<Importance, string> = {
  과제: 'text-white bg-[#14161A]',
  일상: 'text-gray-500 bg-gray-50',
  중점: 'text-orange-600 bg-orange-50',
  핵심: 'text-blue-600 bg-blue-50',
  일반: 'text-gray-600 bg-gray-100',
  지원: 'text-slate-500 bg-slate-50',
}

export const WORKLOAD_COLORS: Record<Workload, string> = {
  대: 'text-red-600 bg-red-50',
  중: 'text-yellow-600 bg-yellow-50',
  소: 'text-green-600 bg-green-50',
}

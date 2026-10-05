import { createLucideIcon } from 'lucide-react'

// 아이콘은 lucide-react 한 벌만 쓴다(선 굵기·크기 통일). 화면에서 <svg>를 직접 그리지 않는다.
// 사용: import { Plus } from 'lucide-react'; <Plus {...ic} />
export const ic = { size: 16, strokeWidth: 1.75 } as const
export const icSm = { size: 14, strokeWidth: 1.75 } as const
export const icLg = { size: 18, strokeWidth: 1.75 } as const

// 설치된 lucide-react(0.460)에 아직 없는 lucide 아이콘 -- lucide 원본 경로 그대로(lucide-static 1.52) 같은 방식으로 만든다
// 목록 접기(오른쪽 꺾쇠가 안으로) / 펴기(밖으로)
export const ListChevronsDownUp = createLucideIcon('list-chevrons-down-up', [
  ['path', { d: 'M3 5h8', key: 'a' }],
  ['path', { d: 'M3 12h8', key: 'b' }],
  ['path', { d: 'M3 19h8', key: 'c' }],
  ['path', { d: 'm15 5 3 3 3-3', key: 'd' }],
  ['path', { d: 'm15 19 3-3 3 3', key: 'e' }],
])
export const ListChevronsUpDown = createLucideIcon('list-chevrons-up-down', [
  ['path', { d: 'M3 5h8', key: 'a' }],
  ['path', { d: 'M3 12h8', key: 'b' }],
  ['path', { d: 'M3 19h8', key: 'c' }],
  ['path', { d: 'm15 8 3-3 3 3', key: 'd' }],
  ['path', { d: 'm15 16 3 3 3-3', key: 'e' }],
])

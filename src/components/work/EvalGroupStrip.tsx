// 표 위의 평가과제 묶음 줄: 이 L2에 있는 묶음을 칩으로 보여 주고, 이름을 누르면 그 자리에서
// 이름을 바꾸고(묶음 전체), ×로 묶음을 푼다. 이미 내보낸 묶음은 바꿀 수 없다.

import type { WorkBoard, WorkItem } from '../../types'
import { CHIP_BASE } from '../grid/DataGrid'
import { evalGroupOf } from '../../utils/workBoard'

interface Props {
  board: WorkBoard
  groupItems: WorkItem[]
  exportedIds: Set<string>
  renaming: string | null
  onStartRename: (name: string) => void
  onRename: (from: string, to: string) => void
  onUngroup: (name: string) => void
  tone: (name: string) => string
}

export default function EvalGroupStrip({ board, groupItems, exportedIds, renaming, onStartRename, onRename, onUngroup, tone }: Props) {
  const names = Array.from(new Set(groupItems.map(evalGroupOf).filter(Boolean)))
  if (names.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 font-semibold text-gray-500">평가과제 묶음</span>
      {names.map((name) => {
        const all = board.items.filter((i) => evalGroupOf(i) === name)
        const done = all.every((i) => exportedIds.has(i.id))
        if (renaming === name)
          return (
            <input
              key={name}
              autoFocus
              defaultValue={name}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => onRename(name, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') onRename(name, name)
              }}
              className="h-7 w-72 rounded-md border border-accent px-2 text-xs outline-none"
            />
          )
        return (
          <span key={name} className={`${CHIP_BASE} ${tone(name)} gap-1 pr-1`}>
            <button
              disabled={done}
              onClick={() => onStartRename(name)}
              title={done ? '이미 평가과제로 내보낸 묶음입니다' : '눌러서 이름 바꾸기'}
              className="max-w-[320px] truncate disabled:cursor-default"
            >
              {name}
            </button>
            <span className="opacity-60 tabular-nums">{all.length}건</span>
            {done ? (
              <span className="rounded bg-white/60 px-1 text-[10px] font-bold">내보냄</span>
            ) : (
              <button onClick={() => onUngroup(name)} title="묶음 풀기" className="rounded px-1 opacity-60 hover:bg-black/10 hover:opacity-100">
                ×
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

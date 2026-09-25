// 과제(L3) 한 줄의 모든 입력 항목 -- 시트의 L3 오른쪽 열(속성·분류·상태·담당자·날짜·단계 메모·비고·URL…)을
// 시트 머리글 그대로 보여 주고 입력한다. 주차 일정은 표에서 칠하고, 여기서는 요약만 보여 준다.
import { ExternalLink, RotateCcw, Trash2, X } from 'lucide-react'
import Button from '../Button'
import IconButton from '../IconButton'
import { ic, icSm } from '../ui/icon'
import type { WeekColumn } from '../../types'
import type { CellState, FieldDef, ProgressRow } from '../../utils/progressBoard'
import { planRange } from '../../utils/progressBoard'

function weekText(key: string | null, weekCols: WeekColumn[]) {
  const w = key ? weekCols.find((x) => x.key === key) : null
  return w ? `${w.month}월 ${w.week}주` : '-'
}

export default function RowPanel({
  row,
  fields,
  value,
  edited,
  optionsOf,
  cells,
  weekCols,
  l2Choices,
  onChange,
  onChangeL2,
  onRevert,
  onDelete,
  onClose,
}: {
  row: ProgressRow
  fields: FieldDef[]
  value: (id: string) => string
  edited: Set<string>
  optionsOf: (f: FieldDef) => string[]
  cells: Record<string, CellState>
  weekCols: WeekColumn[]
  l2Choices?: { l2: string; label: string }[] // 새 과제만: 넣을 L2
  onChange: (id: string, v: string) => void
  onChangeL2?: (l2: string) => void
  onRevert?: () => void
  onDelete?: () => void
  onClose: () => void
}) {
  const pr = planRange(cells, weekCols)
  const nameField = fields.find((f) => f.id === 'name')
  const rest = fields.filter((f) => f.id !== 'name')

  function input(f: FieldDef) {
    const v = value(f.id)
    const ring = edited.has(f.id) ? 'ring-2 ring-orange-300' : ''
    const base = `w-full rounded-control border border-hairline bg-white px-2.5 text-[13px] text-label ${ring}`
    const listId = `opts-${f.id}`
    if (f.kind === 'memo')
      return <textarea value={v} onChange={(e) => onChange(f.id, e.target.value)} rows={3} className={`${base} resize-y py-1.5`} />
    if (f.kind === 'date')
      return (
        <input
          type="date"
          value={/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''}
          onChange={(e) => onChange(f.id, e.target.value)}
          title={v && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? `시트 값: ${v}` : undefined}
          className={`${base} h-8`}
        />
      )
    const opts = optionsOf(f)
    return (
      <span className="flex items-center gap-1">
        <input value={v} onChange={(e) => onChange(f.id, e.target.value)} list={opts.length ? listId : undefined} className={`${base} h-8`} />
        {opts.length > 0 && (
          <datalist id={listId}>
            {opts.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
        {f.kind === 'link' && /^https?:\/\//.test(v) && (
          <a href={v} target="_blank" rel="noreferrer" className="shrink-0 text-label-2 hover:text-accent" title="링크 열기">
            <ExternalLink {...icSm} />
          </a>
        )}
      </span>
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[460px] flex-col border-l border-separator bg-white shadow-dialog">
      <div className="flex items-start justify-between gap-2 border-b border-separator px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-[12px] text-label-2">
            {row.l1} › {row.l2}
            {row.isNew && <span className="ml-1.5 rounded-[3px] bg-accent px-1 text-[10px] font-bold text-white">새 과제</span>}
          </p>
          <p className="mt-0.5 truncate text-[17px] font-bold text-label">{value('name') || '(이름을 입력하세요)'}</p>
        </div>
        <IconButton onClick={onClose} aria-label="닫기">
          <X {...ic} />
        </IconButton>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {l2Choices && onChangeL2 && (
          <label className="block">
            <span className="text-[12px] font-medium text-label-2">L2 (넣을 곳)</span>
            <select value={row.l2} onChange={(e) => onChangeL2(e.target.value)} className="mt-1 h-8 w-full rounded-control border border-hairline bg-white px-2 text-[13px]">
              {l2Choices.map((c) => (
                <option key={c.l2} value={c.l2}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {nameField && (
          <label className="block">
            <span className="text-[12px] font-medium text-label-2">{nameField.label} 과제명</span>
            <div className="mt-1">{input(nameField)}</div>
          </label>
        )}

        <div className="rounded-card bg-[#F7F7F9] px-3 py-2 text-[12px] text-label-2">
          <p className="font-medium text-label">일정 (표에서 칠하기)</p>
          <p className="mt-0.5">
            계획 {weekText(pr.planStart, weekCols)} ~ {weekText(pr.planEnd, weekCols)} · 실적 {weekText(pr.started, weekCols)} ~ {weekText(pr.done, weekCols)}
          </p>
        </div>

        {rest.map((f) => (
          <label key={f.id} className="block">
            <span className="flex items-center gap-1 text-[12px] font-medium text-label-2">
              {f.label}
              {edited.has(f.id) && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" title="고쳤지만 아직 저장 안 함" />}
            </span>
            <div className="mt-1">{input(f)}</div>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-separator px-5 py-3">
        <span>
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger">
              <Trash2 {...icSm} />
              새 과제 지우기
            </Button>
          )}
          {onRevert && edited.size > 0 && (
            <Button variant="ghost" size="sm" onClick={onRevert}>
              <RotateCcw {...icSm} />이 과제 고친 내용 되돌리기
            </Button>
          )}
        </span>
        <Button variant="primary" size="sm" onClick={onClose}>
          완료
        </Button>
      </div>
    </div>
  )
}

// 칸 서식 막대(구글시트처럼): 굵게 · 글자색 · 채우기 색 · 글자 크기 · 가로 정렬 · 서식 지우기.
// 고른 칸(여러 칸이면 범위 전체)에 한 번에 적용한다. 값은 저장할 때 시트 칸 서식으로 쓴다.
import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Baseline, Bold, PaintBucket, RemoveFormatting } from 'lucide-react'
import type { CellAlign, CellFmt } from '../../utils/sheetSources'
import ColorPalette from './ColorPalette'

const SIZES = [8, 9, 10, 11, 12, 14, 18]

export default function FormatBar({
  fmt,
  bg,
  disabled,
  count,
  sheetColors,
  onFmt,
  onBg,
  onClear,
}: {
  fmt: CellFmt // 기준 칸(처음 고른 칸)의 서식
  bg: string
  disabled?: boolean
  count: number // 고른 칸 수(0이면 꺼 둠)
  sheetColors?: string[]
  onFmt: (patch: CellFmt) => void // 준 항목만 바꾼다(undefined 값 = 기본으로)
  onBg: (hex: string) => void
  onClear: () => void // 글자 서식 · 칸 색 모두 기본으로
}) {
  const [pop, setPop] = useState<'color' | 'bg' | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setPop(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [pop])
  const off = disabled || count === 0
  const btn = (on?: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-[6px] disabled:opacity-35 ${on ? 'bg-accent-soft text-accent' : 'text-label-2 hover:bg-black/[0.06]'}`
  const ic = { size: 16, strokeWidth: 1.9 }
  // 버튼을 눌러도 칸 선택(입력창 초점)이 풀리지 않게
  const keep = (e: React.MouseEvent) => !(e.target as HTMLElement).closest('select,input') && e.preventDefault()
  const align = (a: CellAlign) => onFmt({ a: fmt.a === a ? undefined : a })
  return (
    <div
      ref={ref}
      className="relative flex items-center gap-0.5 rounded-control border border-hairline bg-white px-1 py-0.5"
      title={off ? '칸을 고르면 서식을 바꿀 수 있습니다(끌거나 Shift로 여러 칸)' : undefined}
      onMouseDown={keep}
    >
      <button disabled={off} onClick={() => onFmt({ b: fmt.b ? undefined : true })} className={btn(fmt.b)} title="굵게 (⌘/Ctrl+B)" aria-label="굵게">
        <Bold {...ic} />
      </button>
      <button disabled={off} onClick={() => setPop(pop === 'color' ? null : 'color')} className={btn(pop === 'color')} title="글자 색" aria-label="글자 색">
        <span className="flex flex-col items-center leading-none">
          <Baseline size={15} strokeWidth={1.9} />
          <span className="mt-[1px] h-[3px] w-4 rounded-sm" style={{ background: `#${fmt.c ?? '000000'}` }} />
        </span>
      </button>
      <button disabled={off} onClick={() => setPop(pop === 'bg' ? null : 'bg')} className={btn(pop === 'bg')} title="칸 색" aria-label="칸 색">
        <span className="flex flex-col items-center leading-none">
          <PaintBucket size={14} strokeWidth={1.9} />
          <span className="mt-[1px] h-[3px] w-4 rounded-sm ring-1 ring-inset ring-black/10" style={{ background: bg ? `#${bg}` : '#FFFFFF' }} />
        </span>
      </button>
      <select
        disabled={off}
        value={fmt.s ?? ''}
        onChange={(e) => onFmt({ s: e.target.value ? Number(e.target.value) : undefined })}
        title="글자 크기(pt)"
        aria-label="글자 크기"
        className="h-7 w-[58px] rounded-[6px] border-0 bg-none px-1.5 text-center text-[12px] text-label hover:bg-black/[0.06] disabled:opacity-35"
      >
        <option value="">기본</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span className="mx-0.5 h-4 border-l border-separator" />
      {(
        [
          ['left', AlignLeft, '왼쪽 정렬'],
          ['center', AlignCenter, '가운데 정렬'],
          ['right', AlignRight, '오른쪽 정렬'],
        ] as const
      ).map(([a, Icon, label]) => (
        <button key={a} disabled={off} onClick={() => align(a)} className={btn(fmt.a === a)} title={label} aria-label={label}>
          <Icon {...ic} />
        </button>
      ))}
      <span className="mx-0.5 h-4 border-l border-separator" />
      <button disabled={off} onClick={onClear} className={btn()} title="서식 지우기(글자 서식 · 칸 색)" aria-label="서식 지우기">
        <RemoveFormatting {...ic} />
      </button>
      {count > 1 && !off && <span className="px-1 text-[11px] text-label-3">{count}칸</span>}
      {pop && !off && (
        <div className="mac-pop absolute left-0 top-full z-50 mt-1 w-[268px] px-3 py-2">
          <p className="mb-1 text-[12px] font-semibold text-label-2">{pop === 'color' ? '글자 색' : '칸 색'}</p>
          <ColorPalette
            current={pop === 'color' ? (fmt.c ?? '') : bg}
            sheetColors={sheetColors}
            onPick={(hex) => {
              if (pop === 'color') onFmt({ c: hex && hex !== '000000' ? hex : undefined })
              else onBg(hex)
              setPop(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

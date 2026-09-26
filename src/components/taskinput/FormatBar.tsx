// 칸 서식 막대(입력 중에만): 글자색 · 글자 크기 · 굵게 · 가로 정렬 · 완료(✓).
// 고른 칸(여러 칸이면 범위 전체)에 한 번에 적용한다. 값은 저장할 때 시트 칸 서식으로 쓴다.
// 칸 색 · 서식 지우기는 우클릭 메뉴에 있다.
import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Check } from 'lucide-react'
import type { CellAlign, CellFmt } from '../../utils/sheetSources'
import ColorPalette from './ColorPalette'

const BASE_SIZE = 10 // 시트 기본 글자 크기(pt)

export default function FormatBar({
  fmt,
  disabled,
  count,
  sheetColors,
  onFmt,
  onDone,
}: {
  fmt: CellFmt // 기준 칸(처음 고른 칸)의 서식
  disabled?: boolean
  count: number // 고른 칸 수(0이면 꺼 둠)
  sheetColors?: string[]
  onFmt: (patch: CellFmt) => void // 준 항목만 바꾼다(undefined 값 = 기본으로)
  onDone: () => void // ✓: 칸 선택 끝내기
}) {
  const [pop, setPop] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setPop(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [pop])
  const off = disabled || count === 0
  const size = fmt.s ?? BASE_SIZE
  const setSize = (n: number) => {
    if (!Number.isFinite(n)) return
    const v = Math.max(6, Math.min(36, Math.round(n)))
    onFmt({ s: v === BASE_SIZE ? undefined : v })
  }
  const align: CellAlign = fmt.a ?? 'left'
  const setAlign = (a: CellAlign) => onFmt({ a: a === 'left' ? undefined : a })
  // 버튼을 눌러도 칸 선택(입력창 초점)이 풀리지 않게
  const keep = (e: React.MouseEvent) => !(e.target as HTMLElement).closest('input') && e.preventDefault()
  const ic = { size: 17, strokeWidth: 2 }
  return (
    <div
      ref={ref}
      className={`relative flex items-center gap-1.5 rounded-[12px] bg-white px-2 py-1 shadow-[0_1px_4px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] ${off ? 'opacity-45' : ''}`}
      title={off ? '칸을 고르면 서식을 바꿀 수 있습니다(끌거나 Shift로 여러 칸)' : undefined}
      onMouseDown={keep}
    >
      {/* 글자 색 */}
      <button
        disabled={off}
        onClick={() => setPop(!pop)}
        className="h-6 w-6 rounded-[6px] ring-1 ring-inset ring-black/15 disabled:cursor-default"
        style={{ background: `#${fmt.c ?? '1D1D1F'}` }}
        title="글자 색"
        aria-label="글자 색"
      />
      {/* 글자 크기(pt) */}
      <input
        type="number"
        disabled={off}
        min={6}
        max={36}
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
        title="글자 크기(pt)"
        aria-label="글자 크기"
        className="h-7 w-[58px] rounded-[7px] border border-hairline bg-white pl-2 pr-0.5 text-[13px] tabular-nums text-label"
      />
      {/* 굵게 */}
      <button
        disabled={off}
        onClick={() => onFmt({ b: fmt.b ? undefined : true })}
        className={`flex h-7 w-7 items-center justify-center rounded-[7px] ${fmt.b ? 'bg-[#1D1D1F] text-white' : 'text-label-2 hover:bg-black/[0.06]'}`}
        title="굵게 (⌘/Ctrl+B)"
        aria-label="굵게"
        aria-pressed={!!fmt.b}
      >
        <Bold size={15} strokeWidth={2.6} />
      </button>
      {/* 가로 정렬: 한 묶음 */}
      <span className="flex overflow-hidden rounded-[7px] border border-hairline">
        {(
          [
            ['left', AlignLeft, '왼쪽 정렬'],
            ['center', AlignCenter, '가운데 정렬'],
            ['right', AlignRight, '오른쪽 정렬'],
          ] as const
        ).map(([a, Icon, label], i) => (
          <button
            key={a}
            disabled={off}
            onClick={() => setAlign(a)}
            className={`flex h-7 w-8 items-center justify-center ${i ? 'border-l border-hairline' : ''} ${
              align === a && !off ? 'bg-[#1D1D1F] text-white' : 'text-label-2 hover:bg-black/[0.06]'
            }`}
            title={label}
            aria-label={label}
            aria-pressed={align === a}
          >
            <Icon {...ic} />
          </button>
        ))}
      </span>
      <span className="mx-0.5 h-5 border-l border-separator" />
      {/* 완료: 칸 선택 끝내기 */}
      <button
        disabled={off}
        onClick={onDone}
        className="flex h-7 w-7 items-center justify-center rounded-[7px] text-label-2 hover:bg-black/[0.06]"
        title="완료(칸 선택 끝내기)"
        aria-label="완료"
      >
        <Check size={16} strokeWidth={2.4} />
      </button>
      {pop && !off && (
        <div className="mac-pop absolute left-0 top-full z-50 mt-1.5 w-[268px] px-3 py-2">
          <p className="mb-1 text-[12px] font-semibold text-label-2">글자 색</p>
          <ColorPalette
            current={fmt.c ?? ''}
            sheetColors={sheetColors}
            onPick={(hex) => {
              onFmt({ c: hex && hex !== '000000' ? hex : undefined })
              setPop(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

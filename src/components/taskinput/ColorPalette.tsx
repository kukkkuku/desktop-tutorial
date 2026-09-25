// 구글시트의 채우기 색 팔레트와 같은 모양: 재설정 · 기본 색 10×8 · 테마 · 맞춤(+ 직접 고르기 · 스포이트)
import { useEffect, useRef, useState } from 'react'
import { Check, PaintBucket, Pipette, Plus } from 'lucide-react'

// 구글시트 기본 팔레트(회색 줄, 원색 줄, 옅은 3단계, 짙은 3단계)
const GRID: string[][] = [
  ['000000', '434343', '666666', '999999', 'B7B7B7', 'CCCCCC', 'D9D9D9', 'EFEFEF', 'F3F3F3', 'FFFFFF'],
  ['980000', 'FF0000', 'FF9900', 'FFFF00', '00FF00', '00FFFF', '4A86E8', '0000FF', '9900FF', 'FF00FF'],
  ['E6B8AF', 'F4CCCC', 'FCE5CD', 'FFF2CC', 'D9EAD3', 'D0E0E3', 'C9DAF8', 'CFE2F3', 'D9D2E9', 'EAD1DC'],
  ['DD7E6B', 'EA9999', 'F9CB9C', 'FFE599', 'B6D7A8', 'A2C4C9', 'A4C2F4', '9FC5E8', 'B4A7D6', 'D5A6BD'],
  ['CC4125', 'E06666', 'F6B26B', 'FFD966', '93C47D', '76A5AF', '6D9EEB', '6FA8DC', '8E7CC3', 'C27BA0'],
  ['A61C00', 'CC0000', 'E69138', 'F1C232', '6AA84F', '45818E', '3C78D8', '3D85C6', '674EA7', 'A64D79'],
  ['85200C', '990000', 'B45F06', 'BF9000', '38761D', '134F5C', '1155CC', '0B5394', '351C75', '741B47'],
  ['5B0F00', '660000', '783F04', '7F6000', '274E13', '0C343D', '1C4587', '073763', '20124D', '4C1130'],
]
// 구글시트 기본 테마 색
const THEME = ['000000', 'FFFFFF', '4285F4', 'EA4335', 'FBBC04', '34A853', 'FF6D01', '46BDC6']

const CUSTOM_KEY = 'progress-board:custom-colors'
function readCustom(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && /^[0-9A-F]{6}$/.test(x)) : []
  } catch {
    return []
  }
}
function saveCustom(list: string[]) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
  } catch {
    // 기억 못 해도 이번엔 쓴다
  }
}

function isLight(hex: string) {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return r * 0.299 + g * 0.587 + b * 0.114 > 160
}

function Swatch({ hex, on, onPick }: { hex: string; on: boolean; onPick: (hex: string) => void }) {
  return (
    <button
      onClick={() => onPick(hex)}
      title={`#${hex}`}
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-full transition-transform hover:scale-125 ${hex === 'FFFFFF' || hex === 'F3F3F3' || hex === 'EFEFEF' ? 'ring-1 ring-inset ring-black/15' : ''}`}
      style={{ background: `#${hex}` }}
    >
      {on && <Check size={12} strokeWidth={3} className={isLight(hex) ? 'text-black' : 'text-white'} />}
    </button>
  )
}

export default function ColorPalette({
  current,
  sheetColors = [],
  onPick,
}: {
  current: string // 지금 색(RRGGBB) · '' = 없음
  sheetColors?: string[] // 이 시트에서 이미 쓰는 색(맞춤 줄에 먼저 보여 줌)
  onPick: (hex: string) => void // '' = 재설정
}) {
  const [custom, setCustom] = useState<string[]>(readCustom)
  const inputRef = useRef<HTMLInputElement>(null)
  const cur = current.toUpperCase()
  function addCustom(hex: string) {
    const h = hex.replace('#', '').toUpperCase()
    if (!/^[0-9A-F]{6}$/.test(h)) return
    const next = [h, ...custom.filter((x) => x !== h)].slice(0, 20)
    setCustom(next)
    saveCustom(next)
    onPick(h)
  }
  async function eyedrop() {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!ED) return
    try {
      const r = await new ED().open()
      addCustom(r.sRGBHex)
    } catch {
      // 취소
    }
  }
  const mine = Array.from(new Set([...sheetColors.map((x) => x.toUpperCase()), ...custom])).filter((x) => !GRID.flat().includes(x) && !THEME.includes(x))
  // 색 고르기 창은 움직이는 동안 input이 계속 불리므로, 다 고른 뒤(change) 한 번만 반영한다.
  const addRef = useRef(addCustom)
  addRef.current = addCustom
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onChange = () => addRef.current(el.value)
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [])
  const hasEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <div className="w-[236px] text-[13px]">
      <button onClick={() => onPick('')} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left font-medium text-label hover:bg-black/[0.05]">
        <PaintBucket size={16} strokeWidth={1.75} className="text-label-2" />
        재설정
      </button>
      <div className="mt-1.5 space-y-[5px]">
        {GRID.map((row, i) => (
          <div key={i} className={`flex justify-between ${i === 1 ? 'pb-1.5' : ''}`}>
            {row.map((hex) => (
              <Swatch key={hex} hex={hex} on={cur === hex} onPick={onPick} />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] font-semibold text-label-2">테마</p>
      <div className="mt-1.5 flex gap-[5px]">
        {THEME.map((hex) => (
          <Swatch key={hex} hex={hex} on={cur === hex} onPick={onPick} />
        ))}
      </div>
      <div className="mac-menu-sep my-2.5" />
      <p className="text-[12px] font-semibold text-label-2">맞춤</p>
      {mine.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-[5px]">
          {mine.map((hex) => (
            <Swatch key={hex} hex={hex} on={cur === hex} onPick={onPick} />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          title="색 직접 고르기"
          aria-label="색 직접 고르기"
          className="flex h-6 w-6 items-center justify-center rounded-full text-label-2 ring-1 ring-inset ring-black/25 hover:bg-black/[0.05]"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
        {hasEyedropper && (
          <button
            onClick={eyedrop}
            title="화면에서 색 따오기(스포이트)"
            aria-label="스포이트"
            className="flex h-6 w-6 items-center justify-center rounded text-label-2 hover:bg-black/[0.05]"
          >
            <Pipette size={15} strokeWidth={1.75} />
          </button>
        )}
        <input ref={inputRef} type="color" className="sr-only" defaultValue={cur ? `#${cur}` : '#FFFF00'} />
      </div>
    </div>
  )
}

// 앱 드롭다운. 기본 <select>는 운영체제 목록(맥에서는 까만 팝업)으로 떠서 앱과 모양이 달라,
// 같은 쓰임새(<option> 자식 · value · onChange(e.target.value))로 앱 메뉴(.mac-pop)를 띄운다.
//   <Select value={v} onChange={(e) => setV(e.target.value)} className="h-8 px-2.5 text-[length:calc(14px*var(--ui-fs,1))]">
//     <option value="a">가</option> …
//   </Select>
// 목록: 흰 팝오버 · 고른 값 ✓ · 마우스를 올리면 #EFEFEF · ↑↓ Enter Esc
import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'

interface Opt {
  value: string
  label: ReactNode
  disabled: boolean
}
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean }

function optionsOf(children: ReactNode): Opt[] {
  const out: Opt[] = []
  Children.toArray(children).forEach((c) => {
    if (!isValidElement(c)) return
    const el = c as ReactElement<OptionProps & { children?: ReactNode }>
    if (el.type === 'option') {
      const v = el.props.value ?? (typeof el.props.children === 'string' ? el.props.children : '')
      out.push({ value: String(v), label: el.props.children, disabled: !!el.props.disabled })
    } else if (el.props.children) out.push(...optionsOf(el.props.children))
  })
  return out
}

export interface SelectProps {
  value?: string | number | null
  onChange?: (e: { target: { value: string } }) => void
  children?: ReactNode
  className?: string
  disabled?: boolean
  title?: string
  'aria-label'?: string
  id?: string
}

export default function Select({ value, onChange, children, className = '', disabled, title, 'aria-label': ariaLabel, id }: SelectProps) {
  const options = optionsOf(children)
  const cur = String(value ?? '')
  const selected = options.find((o) => o.value === cur) ?? options[0]
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; up: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function place() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const want = Math.min(320, options.length * 30 + 12)
    const up = r.bottom + want > window.innerHeight - 8 && r.top > want
    setPos({ left: Math.min(r.left, window.innerWidth - Math.max(r.width, 160) - 8), top: up ? r.top - 4 : r.bottom + 4, minWidth: r.width, up })
  }
  function openMenu() {
    if (disabled || !options.length) return
    place()
    setHi(
      Math.max(
        0,
        options.findIndex((o) => o.value === cur),
      ),
    )
    setOpen(true)
  }
  function pick(o: Opt) {
    if (o.disabled) return
    setOpen(false)
    btnRef.current?.focus()
    if (o.value !== cur) onChange?.({ target: { value: o.value } })
  }

  useLayoutEffect(() => {
    if (open) menuRef.current?.querySelector('[data-hi="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, hi])
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    const away = (e: Event) => !menuRef.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', out)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    return () => {
      window.removeEventListener('mousedown', out)
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', away)
    }
  }, [open])

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return
    const step = (d: number) => {
      let i = hi
      for (let k = 0; k < options.length; k++) {
        i = (i + d + options.length) % options.length
        if (!options[i].disabled) break
      }
      setHi(i)
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[hi]) pick(options[hi])
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
        className={`mac-select ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            onKeyDown={onKey}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              minWidth: Math.max(pos.minWidth, 120),
              transform: pos.up ? 'translateY(-100%)' : undefined,
            }}
            className="mac-pop z-[70] max-h-[320px] overflow-y-auto py-1"
          >
            {options.map((o, i) => {
              const on = o.value === cur
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-hi={i === hi}
                  disabled={o.disabled}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o)}
                  className={`mac-menu-item whitespace-nowrap ${i === hi && !o.disabled ? 'bg-[#EFEFEF]' : ''} ${on ? 'font-semibold' : ''}`}
                >
                  <Check size={14} strokeWidth={2.2} className={`shrink-0 ${on ? '' : 'invisible'}`} />
                  {o.label}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}

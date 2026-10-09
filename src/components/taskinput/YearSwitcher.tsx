// 실적관리 연도 고르기 -- 성과관리 머리글의 프로젝트(팀 · 평가기간) 고르기와 같은 모양.
// 한 해의 실적관리(추진현황 · 진척률)를 고른다. 시트의 「YYYY 추진현황」 탭이 그 해다.
// 올해는 입력, 지난 연도는 보기 전용.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Folder, Plus, Trash2 } from 'lucide-react'
import Spinner from '../Spinner'
import SheetsIcon from '../SheetsIcon'
import { ic, icSm } from '../ui/icon'

// 「2026 추진현황」 → 「2026 실적관리」(연도를 못 찾으면 탭 이름 그대로)
// 「2026 추진현황_9월」처럼 뒤에 붙은 말은 괄호로(같은 연도의 복사본 탭 구분)
function yearLabel(tab: string): string {
  const t = tab.replace(/^local:/, '')
  const y = t.match(/(20\d{2})/)?.[1]
  if (!y) return t
  const rest = t
    .split('추진현황')[1]
    ?.replace(/^[\s_\-·]+/, '')
    .trim()
  if (!rest) return `${y} 실적관리`
  return /[(（]/.test(rest) ? `${y} 실적관리 ${rest}` : `${y} 실적관리 (${rest})`
}

export default function YearSwitcher({
  title,
  tabs,
  editableTitle,
  loading,
  disabled,
  onPick,
  localTabs = [],
  onCreate,
  editableFrom,
  connectedTitle,
  footer,
  onDeleteLocal,
  onOpenMenu,
  sheetLabel,
}: {
  title: string // 지금 보는 탭
  tabs: string[] // 같은 파일의 추진현황 탭들(최근 연도부터)
  editableTitle: string // 입력할 수 있는 올해 탭
  loading?: boolean
  disabled?: boolean
  onPick: (title: string) => void
  localTabs?: string[] // 이 화면에서 만든 연도(이 브라우저에 저장 · 입력 가능)
  onCreate?: () => void // + 새 연도 만들기
  editableFrom?: number // 이 연도부터는 입력 가능(지난 연도만 보기 전용)
  connectedTitle?: string // 구글시트와 연결된(입력하는) 연도 탭
  footer?: React.ReactNode // 메뉴 아래: 연결된 시트 열기 · 바꾸기 등
  onDeleteLocal?: (id: string) => void // 이 브라우저에서 만든 연도 지우기
  onOpenMenu?: () => void // 메뉴를 열 때(시트 탭 목록 다시 읽기)
  sheetLabel?: string // 버튼에 보일 이름(연결된 시트 › 탭). 없으면 「2026 실적관리」식 연도 이름
}) {
  const pastYear = (t: string) => (editableFrom ? Number(t.match(/(20\d{2})/)?.[1] ?? 0) < editableFrom : t !== editableTitle)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const isLocal = localTabs.includes(title)
  const readOnly = title !== editableTitle && !isLocal
  const all = [...localTabs.map((t) => ({ t, local: true })), ...tabs.filter((t) => !localTabs.includes(t)).map((t) => ({ t, local: false }))].sort(
    (a, b) => Number(b.t.match(/(20\d{2})/)?.[1] ?? 0) - Number(a.t.match(/(20\d{2})/)?.[1] ?? 0),
  )
  // 같은 연도의 탭(원본 · 엑셀 복사본)은 한 줄로 묶는다. 어느 탭을 입력할지는 「구글시트」 메뉴에서 고른다.
  const yearKey = (t: string) => t.match(/(20\d{2})/)?.[1] ?? t
  const rows: { key: string; label: string; tabs: string[]; local: boolean }[] = []
  for (const { t, local } of all) {
    const k = `${local ? 'L' : 'S'}${yearKey(t)}`
    const hit = rows.find((r) => r.key === k)
    if (hit) hit.tabs.push(t)
    else rows.push({ key: k, label: yearLabel(t).replace(/ \(.*$/, ''), tabs: [t], local })
  }
  const repOf = (tabs: string[]) =>
    tabs.includes(title) ? title : connectedTitle && tabs.includes(connectedTitle) ? connectedTitle : [...tabs].sort((a, b) => a.length - b.length)[0]
  const canPick = (rows.length > 1 || !!onCreate) && !disabled

  useEffect(() => {
    if (!open) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left })
    function down(e: PointerEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!canPick) return
          if (!open) onOpenMenu?.()
          setOpen(!open)
        }}
        title={canPick ? `연도 고르기 · 지난 연도는 보기 전용 (시트 탭: ${title})` : `시트 탭: ${title}`}
        className={`-ml-1.5 flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-1.5 text-[length:calc(14px*var(--ui-fs,1))] font-medium text-label-2 transition-colors hover:text-label ${
          canPick ? 'hover:bg-black/[0.05]' : 'cursor-default'
        } ${open ? 'bg-black/[0.05]' : ''}`}
      >
        {sheetLabel ? (
          <SheetsIcon className="h-4 w-3.5 shrink-0" />
        ) : (
          <Folder size={14} strokeWidth={1.8} className={`shrink-0 ${readOnly ? 'text-warning' : 'text-accent'}`} />
        )}
        <span className="whitespace-nowrap">{sheetLabel ?? yearLabel(title)}</span>
        {readOnly && <span className="mac-badge bg-warning-soft text-warning">보기 전용</span>}
        {isLocal && (
          <span
            className="mac-badge bg-accent-soft text-[length:calc(12px*var(--ui-fs,1))] text-accent"
            title="이 화면에서 만든 연도 · 이 브라우저에 저장(관리자가 구글시트로 만들 수 있음)"
          >
            이 브라우저
          </span>
        )}
        {loading ? (
          <Spinner className="h-3.5 w-3.5 text-label-3" />
        ) : (
          canPick && <ChevronDown {...ic} className={`shrink-0 text-label-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left }} className="mac-pop z-50 w-max min-w-[300px] max-w-[440px] overflow-hidden py-1">
            <p className="px-3.5 pb-1 pt-1 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label-3">실적관리 연도</p>
            {rows.map((r) => {
              const rep = repOf(r.tabs)
              const selected = r.tabs.includes(title)
              const edit = connectedTitle !== undefined && !r.local && r.tabs.includes(connectedTitle)
              return (
                <div
                  key={r.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!selected) onPick(rep)
                    setOpen(false)
                  }}
                  className={`mac-menu-item group/yr whitespace-nowrap ${selected ? 'font-semibold' : ''}`}
                >
                  <Check {...icSm} className={`shrink-0 ${selected ? '' : 'invisible'}`} />
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap pl-3 text-[length:calc(12px*var(--ui-fs,1))] font-normal text-label-3">
                    {r.local ? (
                      <>
                        <span className="text-accent">이 브라우저</span>
                        {onDeleteLocal && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpen(false)
                              onDeleteLocal(rep)
                            }}
                            title="이 브라우저에서 만든 연도 지우기"
                            aria-label={`${r.label} 지우기`}
                            className="flex h-5 w-5 items-center justify-center rounded text-label-3 hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 size={13} strokeWidth={2} />
                          </button>
                        )}
                      </>
                    ) : edit ? (
                      <span className="flex items-center gap-1 font-semibold text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        입력 중
                      </span>
                    ) : pastYear(rep) ? (
                      '보기 전용'
                    ) : null}
                  </span>
                </div>
              )
            })}
            {onCreate && (
              <>
                {rows.length > 0 && <div className="mac-menu-sep" />}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onCreate()
                  }}
                  className="mac-menu-item text-accent"
                >
                  <Plus {...icSm} className="shrink-0" />새 연도 만들기
                </button>
              </>
            )}
            {footer && (
              <>
                <div className="mac-menu-sep" />
                <div onClick={() => setOpen(false)}>{footer}</div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

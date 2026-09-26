// 실적관리 연도 고르기 -- 성과관리 머리글의 프로젝트(팀 · 평가기간) 고르기와 같은 모양.
// 한 해의 실적관리(추진현황 · 진척률)를 고른다. 시트의 「YYYY 추진현황」 탭이 그 해다.
// 올해는 입력, 지난 연도는 보기 전용.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Folder, Plus, Trash2 } from 'lucide-react'
import Spinner from '../Spinner'
import { ic, icLg, icSm } from '../ui/icon'

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
  return rest ? `${y} 실적관리 (${rest})` : `${y} 실적관리`
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
  onConnect,
  footer,
  onDeleteLocal,
  onOpenMenu,
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
  onConnect?: (title: string) => void // 이 연도 탭을 연결(입력)하기 -- 관리자
  footer?: React.ReactNode // 메뉴 아래: 연결된 시트 열기 · 바꾸기 등
  onDeleteLocal?: (id: string) => void // 이 브라우저에서 만든 연도 지우기
  onOpenMenu?: () => void // 메뉴를 열 때(시트 탭 목록 다시 읽기)
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
  const canPick = (all.length > 1 || !!onCreate) && !disabled

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
        className={`flex h-8 shrink-0 items-center gap-2 rounded-control px-2 text-[17px] font-semibold text-label transition-colors ${
          canPick ? 'hover:bg-black/[0.05]' : 'cursor-default'
        } ${open ? 'bg-black/[0.05]' : ''}`}
      >
        <Folder {...icLg} className={`shrink-0 ${readOnly ? 'text-orange-500' : 'text-accent'}`} />
        <span className="whitespace-nowrap">{yearLabel(title)}</span>
        {readOnly && <span className="mac-badge bg-orange-100 text-[11px] text-orange-700">보기 전용</span>}
        {isLocal && (
          <span
            className="mac-badge bg-accent-soft text-[11px] text-accent"
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
          <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left }} className="mac-pop z-50 w-[300px] overflow-hidden py-1">
            <p className="px-3.5 pb-1 pt-1 text-[13px] font-semibold text-label-3">실적관리 연도</p>
            {all.map(({ t, local }) => {
              const selected = t === title
              return (
                <div
                  key={`${local}-${t}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!selected) onPick(t)
                    setOpen(false)
                  }}
                  className={`mac-menu-item group/yr ${selected ? 'font-semibold' : ''}`}
                >
                  <Check {...icSm} className={`shrink-0 ${selected ? '' : 'invisible'}`} />
                  {yearLabel(t)}
                  {local ? (
                    <span className="ml-auto flex items-center gap-1.5 text-[11px] font-normal text-accent">
                      이 브라우저
                      {onDeleteLocal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(false)
                            onDeleteLocal(t)
                          }}
                          title="이 브라우저에서 만든 연도 지우기"
                          aria-label={`${yearLabel(t)} 지우기`}
                          className="flex h-5 w-5 items-center justify-center rounded text-label-3 hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      )}
                    </span>
                  ) : connectedTitle !== undefined ? (
                    t === connectedTitle ? (
                      <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        연결됨 · 편집
                      </span>
                    ) : (
                      <span className="ml-auto flex items-center gap-1.5 text-[11px] font-normal text-label-3">
                        보기 전용
                        {onConnect && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpen(false)
                              onConnect(t)
                            }}
                            title={`「${t}」 탭을 연결해 입력합니다(지금 입력하던 연도는 그대로 남아 다시 고를 수 있음)`}
                            className="rounded-full border border-accent/40 px-2 py-[1px] font-semibold text-accent hover:bg-accent hover:text-white"
                          >
                            연결하기
                          </button>
                        )}
                      </span>
                    )
                  ) : (
                    t !== editableTitle && pastYear(t) && <span className="ml-auto text-[11px] text-label-3">보기 전용</span>
                  )}
                </div>
              )
            })}
            {onCreate && (
              <>
                {all.length > 0 && <div className="mac-menu-sep" />}
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

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, StickyNote } from 'lucide-react'
import Button from './Button'
import { ic } from './ui/icon'

// 개인수행등급 근거 메모 -- 평가 매트릭스에서 등급 옆 아이콘을 눌러 간단히
// 입력/저장하고(editable), 팀원 성장 관리의 과제별 성과에서는 같은 아이콘으로
// 읽기 전용 표시한다(readOnly). 내용이 있으면 노란 메모지, 없으면 회색 연필
// 아이콘 -- 한눈에 근거가 채워졌는지 알 수 있게.
interface GradeNoteButtonProps {
  note: string | undefined
  label: string
  onSave?: (note: string) => void
  // 넓은 영역에서 근거가 있으면 아이콘 옆에 짧은 미리보기 텍스트를 보여준다
  // (예: 12). 좁은 영역이거나 생략하면 아이콘만 보인다 -- 클릭하면 어느
  // 쪽이든 팝오버로 전체 내용을 보여준다.
  previewChars?: number
}

export default function GradeNoteButton({ note, label, onSave, previewChars }: GradeNoteButtonProps) {
  const editable = !!onSave
  const hasNote = !!note?.trim()
  const preview =
    hasNote && previewChars ? (note!.trim().length > previewChars ? `${note!.trim().slice(0, previewChars)}…` : note!.trim()) : null
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [draft, setDraft] = useState(note ?? '')

  useEffect(() => {
    if (!open) return
    setDraft(note ?? '')
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 280) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const popoverRef = useRef<HTMLDivElement>(null)

  function handleSave() {
    onSave?.(draft.trim())
    setOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={hasNote ? `근거: ${note}` : editable ? '근거 메모 입력' : '근거 메모 없음'}
        className={`inline-flex shrink-0 items-center gap-1 rounded-control px-1 py-1 hover:bg-black/[0.05] ${
          hasNote ? 'text-warning hover:text-warning' : 'text-label-3 hover:text-label-2'
        }`}
      >
        {hasNote ? <StickyNote {...ic} className="shrink-0" /> : <Pencil {...ic} className="shrink-0" />}
        {preview && <span className="text-[11px] font-normal normal-case text-warning">{preview}</span>}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="mac-pop z-50 w-72 p-3"
          >
            <p className="truncate text-xs font-semibold text-label-2">{label}</p>
            {editable ? (
              <>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  placeholder="이 등급을 준 근거를 입력하세요"
                  className="mt-1.5 w-full rounded-control border border-hairline px-2.5 py-1.5 text-[13px] text-label"
                />
                <div className="mt-2 flex justify-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                    취소
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleSave}>
                    저장
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-label">{note?.trim() || '입력된 근거가 없습니다.'}</p>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// 개인수행등급 근거 메모 -- 평가 매트릭스에서 등급 옆 아이콘을 눌러 간단히
// 입력/저장하고(editable), 팀원 성장 관리의 과제별 성과에서는 같은 아이콘으로
// 읽기 전용 표시한다(readOnly). 내용이 있으면 노란 메모지, 없으면 회색 연필
// 아이콘 -- 한눈에 근거가 채워졌는지 알 수 있게.
interface GradeNoteButtonProps {
  note: string | undefined
  label: string
  onSave?: (note: string) => void
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function MemoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2H5Z" opacity={0.25} />
      <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2H5Zm9 16.5V16a1 1 0 0 1 1-1h3.5L14 19.5Z" />
    </svg>
  )
}

export default function GradeNoteButton({ note, label, onSave }: GradeNoteButtonProps) {
  const editable = !!onSave
  const hasNote = !!note?.trim()
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
        className={`inline-flex shrink-0 items-center justify-center rounded p-1 ${
          hasNote ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-gray-500'
        }`}
      >
        {hasNote ? <MemoIcon className="h-4 w-4" /> : <PencilIcon className="h-4 w-4" />}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-50 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
          >
            <p className="truncate text-xs font-semibold text-gray-500">{label}</p>
            {editable ? (
              <>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  placeholder="이 등급을 준 근거를 입력하세요"
                  className="mt-1.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                />
                <div className="mt-2 flex justify-end gap-1.5">
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-black hover:bg-gray-100"
                  >
                    취소
                  </button>
                  <button onClick={handleSave} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">
                    저장
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-black">{note?.trim() || '입력된 근거가 없습니다.'}</p>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

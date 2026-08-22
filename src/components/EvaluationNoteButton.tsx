import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function EvaluationNoteButton({ note, label, onSave }: { note?: string; label: string; onSave: (note: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const hasNote = Boolean(note?.trim())

  useEffect(() => { if (open) setDraft(note ?? '') }, [note, open])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { const target = event.target as Node; if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const rect = open ? buttonRef.current?.getBoundingClientRect() : null
  return <><button ref={buttonRef} type="button" onClick={() => setOpen((value) => !value)} title={hasNote ? '평가 근거 확인·수정' : '평가 근거 입력'} className={`flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 ${hasNote ? 'text-accent' : 'text-gray-400'}`}>
    {hasNote ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="m4 20 4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20ZM13 6l4 4"/></svg>}
    <span className="sr-only">{label}</span>
  </button>{open && rect && createPortal(<div ref={panelRef} style={{ position: 'fixed', top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 300) }} className="z-[60] w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"><p className="truncate text-xs font-semibold text-gray-600">{label}</p><textarea autoFocus rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="평가 근거를 입력하세요" className="ui-field mt-2 h-auto w-full resize-y py-2"/><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="ui-button ui-button-ghost ui-button-sm">취소</button><button type="button" onClick={() => { onSave(draft.trim()); setOpen(false) }} className="ui-button ui-button-primary ui-button-sm">저장</button></div></div>, document.body)}</>
}

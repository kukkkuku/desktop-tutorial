// 머리글의 사용 매뉴얼 아이콘. 누르면 지금 영역의 매뉴얼을 지금 화면에 맞는 장으로 오른쪽 패널에 연다.
//   area: 'tasks' = 과제 입력 매뉴얼, 'perf' = 성과관리 매뉴얼, 없으면 두 매뉴얼 고르기
//   chapter: 매뉴얼 안 장 id(public/manual/*.html의 section id)
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, ExternalLink, X } from 'lucide-react'

export type ManualArea = 'tasks' | 'perf'

// 매뉴얼 html은 파일 이름이 안 바뀌어 브라우저가 옛 판을 쥐고 있을 수 있다 -- 앱을 열 때마다 새로 받게
const LOADED = Date.now().toString(36)

export function manualUrl(area?: ManualArea, chapter?: string) {
  const file = area === 'tasks' ? 'tasks.html' : area === 'perf' ? 'perf.html' : 'index.html'
  return `${import.meta.env.BASE_URL}manual/${file}?v=${LOADED}${chapter ? `#${chapter}` : ''}`
}

export function ManualPanel({ area, chapter, onClose }: { area?: ManualArea; chapter?: string; onClose: () => void }) {
  const url = manualUrl(area, chapter)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/15" onMouseDown={onClose}>
      <div
        data-keep-sel
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-[min(760px,94vw)] flex-col bg-white shadow-[-8px_0_32px_rgba(0,0,0,0.14)]"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-separator px-3">
          <BookOpen size={16} strokeWidth={1.9} className="text-label-2" />
          <span className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">
            {area === 'tasks' ? '과제 입력 매뉴얼' : area === 'perf' ? '과제관리 매뉴얼' : '사용 매뉴얼'}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 rounded-control px-2 py-1 text-[length:calc(13px*var(--ui-fs,1))] text-label-2 hover:bg-black/[0.05] hover:text-label"
          >
            <ExternalLink size={13} strokeWidth={1.9} />새 창으로
          </a>
          <button
            onClick={onClose}
            aria-label="매뉴얼 닫기"
            title="닫기 (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label"
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>
        <iframe key={url} src={url} title="사용 매뉴얼" className="min-h-0 w-full flex-1 border-0" />
      </div>
    </div>,
    document.body,
  )
}

export default function ManualLink({ area, chapter }: { area?: ManualArea; chapter?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={area === 'tasks' ? '과제 입력 매뉴얼(지금 화면)' : area === 'perf' ? '과제관리 매뉴얼(지금 화면)' : '사용 매뉴얼'}
        aria-label="사용 매뉴얼"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label"
      >
        <BookOpen size={16} strokeWidth={1.9} />
      </button>
      {open && <ManualPanel area={area} chapter={chapter} onClose={() => setOpen(false)} />}
    </>
  )
}

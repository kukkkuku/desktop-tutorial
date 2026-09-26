// 머리글의 사용 매뉴얼 아이콘(새 창으로 /manual/)
import { BookOpen } from 'lucide-react'

export default function ManualLink() {
  return (
    <a
      href={`${import.meta.env.BASE_URL}manual/index.html`}
      target="_blank"
      rel="noreferrer"
      title="사용 매뉴얼(새 창)"
      aria-label="사용 매뉴얼"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-label-2 hover:bg-black/[0.05] hover:text-label"
    >
      <BookOpen size={16} strokeWidth={1.9} />
    </a>
  )
}

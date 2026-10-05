// 관리 › 권한 설정 맨 위 한 줄(예전 「권한 시트」 탭): 앱의 역할 · 팀원 명단 · 실적관리 시트 연결이 저장되는 시트.
//   관리 화면에서 바꾸면 여기에 저장되고(시트를 직접 고칠 일은 없음) 바꾼 내용은 시트의 「변경 기록」 탭에 남는다.
//   공유: 관리자 · 팀장만 편집자(팀원을 추가하면 이 시트에 적으므로). 팀원은 공유하지 않는다(명단이 보이지 않게).
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Copy, ExternalLink, FileSpreadsheet } from 'lucide-react'
import Button from '../Button'
import { icSm } from '../ui/icon'
import { accessSheetUrl, isPendingEmail, LOG_TAB, type AccessData } from '../../utils/accessSheet'
import { withGoogleAccount } from '../../utils/googleDrive'

export default function AccessSheetStrip({ data, me }: { data: AccessData; me: string }) {
  const url = accessSheetUrl()
  const managers = data.users.filter((u) => u.role !== 'member' && u.email !== me && !isPendingEmail(u.email))
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(managers.map((u) => u.email).join(', '))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 복사가 막히면 위 목록을 직접 골라 복사한다(전체 선택됨)
    }
  }
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div ref={boxRef} className="relative flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-card border border-separator bg-subtle px-4 py-2 text-[length:calc(13.5px*var(--ui-fs,1))]">
      <FileSpreadsheet size={17} strokeWidth={1.7} className="shrink-0 text-emerald-700" />
      <span className="min-w-0">
        <b className="font-semibold text-label">권한 시트</b> <span className="text-label">{data.title || ''}</span>
        <span className="text-label-3"> · {data.users.length}명 저장 · 바꾼 내용은 시트의 「{LOG_TAB}」 탭에</span>
      </span>
      {url && (
        <a href={withGoogleAccount(url)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-label-2 hover:text-accent">
          <ExternalLink {...icSm} />
          시트 열기
        </a>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="관리자 · 팀장에게 권한 시트를 편집자로 공유"
        className={`ml-auto flex h-7 items-center gap-1 rounded-control border bg-white px-2.5 ${open ? 'border-accent text-accent' : 'border-hairline text-label hover:bg-black/[0.03]'}`}
      >
        관리자 · 팀장 {managers.length}명 편집자 공유
        <ChevronDown size={13} strokeWidth={2} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="mac-pop absolute right-2 top-[calc(100%+6px)] z-30 w-[min(460px,calc(100vw-48px))] p-4">
          <p className="text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-label">
            관리자 · 팀장 {managers.length}명에게 권한 시트를 <span className="text-accent">편집자</span>로 공유
          </p>
          <p className="mt-1 text-[length:calc(13px*var(--ui-fs,1))] leading-relaxed text-label-2">
            역할을 읽고 팀원을 추가 · 초대하려면 필요합니다. 팀원에게는 공유하지 않습니다(명단이 보이지 않게). 역할을 팀장으로 바꾼 사람이 생기면 여기서 다시 공유하세요.
          </p>
          {managers.length > 0 ? (
            <p className="mt-2.5 select-all break-all rounded-control bg-subtle px-3 py-2 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">{managers.map((u) => u.email).join(', ')}</p>
          ) : (
            <p className="mt-2.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">공유할 관리자 · 팀장이 아직 없습니다.</p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => void copy()} disabled={!managers.length}>
              <Copy {...icSm} />
              {copied ? '복사했습니다' : `Gmail ${managers.length}개 복사`}
            </Button>
            {url && (
              <a
                href={withGoogleAccount(url)}
                target="_blank"
                rel="noreferrer"
                className="flex h-7 items-center gap-1 rounded-control bg-ink px-3 text-[length:calc(13.5px*var(--ui-fs,1))] font-medium text-white hover:bg-black"
              >
                시트 열어서 공유
                <ExternalLink {...icSm} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

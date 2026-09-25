// 면담용지 출력 -- 왼쪽에 A4 미리보기, 오른쪽에 출력할 항목을 고른다.
// 인쇄는 숨긴 iframe에 이 페이지들과 앱 스타일시트를 옮겨 브라우저 인쇄 창을 연다
// (PDF로 저장도 인쇄 창에서 고르면 된다).
import { useRef, useState } from 'react'
import { Columns2, Minus, Plus, Rows2, X } from 'lucide-react'
import type { MeetingNote } from '../../types'
import type { MeetingInsight } from '../../utils/meetingInsights'
import Button from '../Button'
import IconButton from '../IconButton'
import { ic, icSm } from '../ui/icon'

export interface MeetingPaperDraft {
  comment: string
  strengths: string
  improvements: string
  nextExperience: string
  careerGoal: string
}

type OptKey = 'basic' | 'date' | 'perf' | 'insights' | 'questions' | 'basis' | 'last' | 'growth' | 'draft' | 'notes'
const OPTIONS: { key: OptKey; label: string; on: boolean }[] = [
  { key: 'basic', label: '팀원 기본정보', on: true },
  { key: 'date', label: '면담일', on: true },
  { key: 'perf', label: '현재 성과 요약', on: true },
  { key: 'insights', label: '핵심 인사이트', on: true },
  { key: 'questions', label: '추천 면담 질문', on: true },
  { key: 'basis', label: '인사이트 근거', on: false },
  { key: 'last', label: '지난 면담 요약', on: true },
  { key: 'growth', label: '육성 포인트 작성란', on: false },
  { key: 'draft', label: '작성 중인 면담 내용 포함', on: false },
  { key: 'notes', label: '면담 내용 영역', on: true },
]

const dotted = (d: string) => d.replace(/-/g, '. ')
// 손으로 적는 줄 -- 넉넉히 그려 두고 남는 높이만큼만 보이게 자른다(축소 미리보기에서도 줄이 빠지지 않게 실선으로).
function Ruled({ className = '' }: { className?: string }) {
  return (
    <div className={`overflow-hidden ${className}`}>
      {Array.from({ length: 32 }, (_, i) => (
        <div key={i} className="h-9 border-b border-[#D1D1D6]" />
      ))}
    </div>
  )
}

export default function MeetingPaperModal({
  name,
  basicInfo,
  initialDate,
  perfLines,
  insights,
  lastMeeting,
  draft,
  onClose,
}: {
  name: string
  basicInfo: string // 예: "대리 · 2년차"
  initialDate: string
  perfLines: { title: string; tasks: string[] }
  insights: MeetingInsight[]
  lastMeeting: MeetingNote | null
  draft: MeetingPaperDraft
  onClose: () => void
}) {
  const [date, setDate] = useState(initialDate)
  const [blankDate, setBlankDate] = useState(false)
  const [opts, setOpts] = useState<Record<OptKey, boolean>>(() => Object.fromEntries(OPTIONS.map((o) => [o.key, o.on])) as Record<OptKey, boolean>)
  const [extraPages, setExtraPages] = useState(0)
  const [twoUp, setTwoUp] = useState(false)
  const pagesRef = useRef<HTMLDivElement>(null)
  const total = 1 + extraPages
  const hasDraft = !!(draft.comment.trim() || draft.strengths.trim() || draft.improvements.trim() || draft.nextExperience.trim() || draft.careerGoal.trim())

  const header = (
    <div className="flex items-end justify-between border-b-2 border-label pb-4">
      <div>
        <p className="text-[28px] font-bold leading-tight text-label">{name}</p>
        {opts.basic && basicInfo && <p className="mt-1 text-[12px] text-label-2">{basicInfo}</p>}
      </div>
      {opts.date && <p className="text-[12px] text-label-2">면담일 {blankDate ? '______ . ____ . ____' : dotted(date)}</p>}
    </div>
  )
  const footer = (i: number) => <p className="absolute bottom-10 right-14 text-[10px] text-label-3">{`${i} / ${total}`}</p>
  const section = (title: string) => <p className="mb-2 mt-6 border-b border-separator pb-2 text-[13px] font-semibold text-label">{title}</p>

  const pageCls = 'paper-page relative flex h-[1123px] w-[794px] shrink-0 flex-col bg-white px-14 pb-20 pt-14 text-label shadow-[0_1px_4px_rgba(0,0,0,0.12)]'
  const showInsights = (opts.insights || opts.questions) && insights.length > 0

  const pageList: React.ReactNode[] = [
    <div key="p1" className={pageCls}>
      {header}
      {opts.perf && (
        <div className="border-b border-separator py-4">
          <p className="text-[13px] font-semibold">{perfLines.title}</p>
          {perfLines.tasks.length > 0 && <p className="mt-1 text-[11px] leading-relaxed text-label-2">{perfLines.tasks.join(' · ')}</p>}
        </div>
      )}
      {showInsights && (
        <ol className="mt-5 space-y-3">
          {insights.map((s, i) => (
            <li key={s.id} className="text-[12px] leading-relaxed">
              {opts.insights && (
                <p className="font-semibold">
                  {i + 1}. {s.title}
                </p>
              )}
              {opts.questions && (
                <p className="text-label-2">
                  {!opts.insights && `${i + 1}. `}질문 · {s.question}
                </p>
              )}
              {opts.basis && <p className="text-[11px] text-label-3">근거 · {s.basis}</p>}
            </li>
          ))}
        </ol>
      )}
      {opts.last && lastMeeting && (
        <>
          {section(`지난 면담 요약 (${dotted(lastMeeting.date)})`)}
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-label-2">{lastMeeting.comment}</p>
        </>
      )}
      {opts.growth && (
        <>
          {section('육성 포인트')}
          <div className="grid grid-cols-[88px_1fr] gap-y-0 text-[12px]">
            {[
              ['강점', draft.strengths],
              ['보완 필요', draft.improvements],
              ['다음 도전 경험', draft.nextExperience],
              ['Career Goal', draft.careerGoal],
            ].map(([label, v]) => (
              <div key={label} className="contents">
                <span className="border-b border-separator py-2.5 text-label-2">{label}</span>
                <span className="border-b border-separator py-2.5">{opts.draft ? v : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {opts.notes && (
        <>
          {section('면담 내용')}
          {opts.draft && draft.comment.trim() && <p className="mb-2 whitespace-pre-wrap text-[12px] leading-relaxed">{draft.comment}</p>}
          <Ruled className="min-h-[108px] flex-1 basis-0" />
        </>
      )}
      {footer(1)}
    </div>,
    ...Array.from({ length: extraPages }, (_, k) => (
      <div key={`p${k + 2}`} className={pageCls}>
        {header}
        {section('면담 내용')}
        <Ruled className="flex-1 basis-0" />
        {footer(k + 2)}
      </div>
    )),
  ]

  function print() {
    const src = pagesRef.current
    if (!src) return
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument!
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((n) => n.outerHTML)
      .join('')
    doc.open()
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${name} 면담용지</title>${styles}<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}.paper-page{box-shadow:none!important;break-after:page;page-break-after:always}.paper-page:last-child{break-after:auto;page-break-after:auto}</style></head><body>${src.innerHTML}</body></html>`,
    )
    doc.close()
    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[]
    let fired = false
    const go = () => {
      if (fired) return
      fired = true
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 1000)
    }
    let pending = links.length
    if (pending === 0) setTimeout(go, 50)
    links.forEach((l) =>
      l.addEventListener('load', () => {
        pending -= 1
        if (pending === 0) go()
      }),
    )
    setTimeout(go, 1500)
  }

  const scale = twoUp ? 0.6 : 0.78

  return (
    <div className="fixed inset-0 z-50 flex bg-[#DADDE3]" onMouseDown={onClose}>
      <div className="flex min-w-0 flex-1 overflow-auto p-8" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`m-auto flex gap-4 ${twoUp ? 'flex-row flex-wrap justify-center' : 'flex-col items-center'}`}>
          {/* 미리보기는 축소해서 보여 주고, 인쇄는 아래 원본 크기 페이지(pagesRef)를 쓴다. */}
          {pageList.map((page, i) => (
            <div key={i} style={{ width: 794 * scale, height: 1123 * scale }} className="shrink-0 overflow-hidden">
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{page}</div>
            </div>
          ))}
        </div>
        <div ref={pagesRef} className="hidden">
          {pageList}
        </div>
      </div>

      <aside className="flex w-[340px] shrink-0 flex-col bg-[#DADDE3] px-6 py-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-baseline gap-2 text-[17px] font-bold text-label">
            면담용지 출력하기 <span className="text-[12px] font-normal text-label-2">출력할 항목만 선택</span>
          </h3>
          <IconButton onClick={onClose} aria-label="닫기">
            <X {...ic} />
          </IconButton>
        </div>

        <p className="mt-6 text-[13px] font-semibold text-label">면담일</p>
        <input
          type="date"
          value={date}
          disabled={blankDate}
          onChange={(e) => setDate(e.target.value || initialDate)}
          className="mt-2 h-10 rounded-control border border-hairline bg-white px-3 text-[14px] disabled:opacity-50"
        />
        <label className="mt-2 flex items-center gap-2 text-[13px] text-label">
          <input type="checkbox" checked={blankDate} onChange={(e) => setBlankDate(e.target.checked)} />빈 날짜로 출력
        </label>

        <div className="my-5 h-px bg-black/[0.08]" />
        <p className="text-[13px] font-semibold text-label">출력 항목</p>
        <div className="mt-2 space-y-2">
          {OPTIONS.map((o) => (
            <label key={o.key} className={`flex items-center gap-2 text-[13px] ${o.key === 'draft' && !hasDraft ? 'text-label-3' : 'text-label'}`}>
              <input type="checkbox" checked={opts[o.key]} onChange={(e) => setOpts((cur) => ({ ...cur, [o.key]: e.target.checked }))} />
              {o.label}
              {o.key === 'draft' && !hasDraft && <span className="text-[11px]">(작성 중인 내용 없음)</span>}
            </label>
          ))}
        </div>

        <div className="my-5 h-px bg-black/[0.08]" />
        <p className="text-[13px] font-semibold text-label">빈 면담 페이지</p>
        <p className="mt-0.5 text-[12px] text-label-2">메모 공간이 더 필요하면 추가하세요.</p>
        <div className="mt-2 flex h-10 items-stretch overflow-hidden rounded-control border border-hairline bg-white">
          <button
            onClick={() => setExtraPages((n) => Math.max(0, n - 1))}
            disabled={extraPages === 0}
            className="w-10 text-label-2 hover:bg-black/[0.04] disabled:opacity-30"
            aria-label="한 장 빼기"
          >
            <Minus {...icSm} className="mx-auto" />
          </button>
          <span className="flex flex-1 items-center justify-center border-x border-hairline text-[13px] font-semibold">{extraPages}장 추가</span>
          <button onClick={() => setExtraPages((n) => Math.min(10, n + 1))} className="w-10 text-label-2 hover:bg-black/[0.04]" aria-label="한 장 더하기">
            <Plus {...icSm} className="mx-auto" />
          </button>
        </div>
        {total > 1 && (
          <div className="mt-2 flex justify-end gap-1">
            <IconButton
              onClick={() => setTwoUp(false)}
              title="한 장씩 보기"
              aria-label="한 장씩 보기"
              className={!twoUp ? 'bg-white text-accent ring-1 ring-accent' : ''}
            >
              <Rows2 {...ic} />
            </IconButton>
            <IconButton
              onClick={() => setTwoUp(true)}
              title="나란히 보기"
              aria-label="나란히 보기"
              className={twoUp ? 'bg-white text-accent ring-1 ring-accent' : ''}
            >
              <Columns2 {...ic} />
            </IconButton>
          </div>
        )}

        <div className="mt-auto flex gap-2 pt-6">
          <Button variant="secondary" onClick={onClose} className="h-11 px-6">
            취소
          </Button>
          <Button variant="primary" onClick={print} className="h-11 flex-1">
            인쇄
          </Button>
        </div>
      </aside>
    </div>
  )
}

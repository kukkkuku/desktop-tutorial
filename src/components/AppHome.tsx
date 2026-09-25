// 메인 -- 팀장용 "성과관리"와 팀원도 쓰는 "과제 입력"을 나눠 들어간다.
import { ChartColumn, ChevronRight, ClipboardList } from 'lucide-react'
import { useAppMode, type AppMode } from '../state/AppMode'
import { IS_PREVIEW } from '../utils/previewMode'

const ENTRIES: { mode: AppMode; title: string; desc: string; items: string[]; Icon: typeof ChartColumn }[] = [
  {
    mode: 'tasks',
    title: '과제 입력',
    desc: '구글시트 추진현황을 L1별 일정표로 보고, 주차별 진행을 입력합니다.',
    items: ['추진현황', '진척률'],
    Icon: ClipboardList,
  },
  {
    mode: 'perf',
    title: '성과관리',
    desc: '과제관리부터 평가·결과·면담까지 팀장이 쓰는 평가 도구입니다.',
    items: ['과제관리', '팀원관리', '평가하기', '평가결과', '면담'],
    Icon: ChartColumn,
  },
]

export default function AppHome() {
  const { setMode } = useAppMode()
  return (
    <div className="min-h-screen bg-[#F7F7F9]">
      <div className="mx-auto flex max-w-4xl flex-col px-6 py-16 sm:py-24">
        <p className="flex items-center gap-2 text-[13px] font-medium text-label-2">
          디자인연구소
          {IS_PREVIEW && <span className="mac-badge bg-orange-100 text-orange-700">미리보기</span>}
        </p>
        <h1 className="mt-1 text-[28px] font-bold text-label">무엇을 하시겠어요?</h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {ENTRIES.map(({ mode, title, desc, items, Icon }) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              className="group flex flex-col rounded-[14px] border border-separator bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-label/30 hover:shadow-md"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-label text-white">
                <Icon size={22} strokeWidth={1.75} />
              </span>
              <span className="mt-5 flex items-center gap-1 text-[20px] font-bold text-label">
                {title}
                <ChevronRight size={20} strokeWidth={2} className="text-label-3 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1.5 text-[14px] leading-relaxed text-label-2">{desc}</span>
              <span className="mt-5 flex flex-wrap gap-1.5">
                {items.map((it) => (
                  <span key={it} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[12px] font-medium text-label-2">
                    {it}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

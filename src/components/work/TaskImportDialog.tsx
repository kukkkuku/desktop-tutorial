// 과제관리 › 가져오기: 추진현황에서 / 구글시트에서(관리자) / 엑셀 파일에서(관리자) 필요한 그룹(L2)만 골라 과제리스트로.
// 예전 「빠른 시작」의 가져오기 탭들을 과제관리 「가져오기 ▾」 메뉴 한 곳으로 옮겼다. 실제 동작은 SheetImportPanel 그대로.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import IconButton from '../IconButton'
import { ic } from '../ui/icon'
import { readProgressSource } from '../../utils/progressImport'
import SheetImportPanel from './SheetImportPanel'

export type TaskImportSource = 'progress' | 'sheet' | 'xlsx'

const TITLE: Record<TaskImportSource, { title: string }> = {
  progress: { title: '추진현황에서 과제 가져오기' },
  sheet: { title: '구글시트에서 과제 가져오기' },
  xlsx: { title: '엑셀 파일에서 과제 가져오기' },
}

export default function TaskImportDialog({
  source,
  initialUrl,
  onClose,
  onDone,
}: {
  source: TaskImportSource
  initialUrl?: string | null
  onClose: () => void
  onDone: () => void
}) {
  // 과제 입력 › 추진현황에 불러온 데이터(이 브라우저) -- 창을 여는 동안 한 번 읽는다
  const progress = useMemo(() => (source === 'progress' ? readProgressSource() : null), [source])
  // 목록을 불러오면 L2가 한 줄에 들어가도록 창을 넓힌다(크기 전환은 부드럽게)
  const [loaded, setLoaded] = useState(false)
  const [tabsWidth, setTabsWidth] = useState(0)
  // 고르는 중(목록이 뜬 뒤)이 아니면 -- 아직 불러온 추진현황이 없을 때 · 가져오기를 마쳐 결과만 남았을 때 --
  // 창을 내용 높이 · 좁은 폭으로 스르르 줄인다(내용 끝을 재서 높이로 쓴다: 화면 칸은 min-h-full이라 창만큼 늘어나 있다)
  const [done, setDone] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [fitH, setFitH] = useState(0)
  const compact = !loaded || done
  useLayoutEffect(() => {
    const root = bodyRef.current?.firstElementChild as HTMLElement | null
    if (!root || !compact) return
    const measure = () => {
      const top = root.getBoundingClientRect().top
      const kids = Array.from(root.children)
      const bottom = kids.length ? Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) : top
      setFitH(Math.ceil(bottom - top) + 48)
    }
    measure()
    const ro = new ResizeObserver(measure)
    Array.from(root.children).forEach((k) => ro.observe(k))
    const mo = new MutationObserver(() => {
      ro.disconnect()
      Array.from(root.children).forEach((k) => ro.observe(k))
      measure()
    })
    mo.observe(root, { childList: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [compact])
  const t = TITLE[source]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div
        className="flex max-w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-dialog transition-[width,height] duration-300 ease-out"
        style={
          compact && fitH
            ? { width: 'min(900px, calc(100vw - 2rem))', height: `min(${fitH}px, 86vh)` }
            : loaded
              ? { width: `min(${Math.max(1180, tabsWidth + 74)}px, calc(100vw - 2rem))`, height: 'min(900px, 92vh)' }
              : { width: 'min(900px, calc(100vw - 2rem))', height: 'min(760px, 86vh)' }
        }
      >
        {/* 제목 · 설명은 가져오기 화면(SheetImportPanel)이 그린다 -- 여기는 닫기만 */}
        <div className="relative">
          <IconButton onClick={onClose} aria-label={`${t.title} 닫기`} title="닫기" className="absolute right-4 top-4 z-10">
            <X {...ic} />
          </IconButton>
        </div>
        <div ref={bodyRef} className="flex flex-1 flex-col overflow-y-auto p-6">
          <SheetImportPanel
            source={source}
            progress={progress}
            initialUrl={initialUrl ?? undefined}
            onCancel={onClose}
            onDone={onDone}
            onLoadedChange={setLoaded}
            onNaturalWidth={setTabsWidth}
            onResultChange={setDone}
          />
        </div>
      </div>
    </div>
  )
}

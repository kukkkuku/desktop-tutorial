// 과제관리 › 가져오기: 추진현황에서 / 구글시트에서(관리자) / 엑셀 파일에서(관리자) 필요한 그룹(L2)만 골라 과제리스트로.
// 예전 「빠른 시작」의 가져오기 탭들을 과제관리 「가져오기 ▾」 메뉴 한 곳으로 옮겼다. 실제 동작은 SheetImportPanel 그대로.
import { useMemo, useState } from 'react'
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
  const t = TITLE[source]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div
        className="flex max-w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-dialog transition-[width,height] duration-300 ease-out"
        style={
          loaded
            ? { width: `min(${Math.max(1180, tabsWidth + 74)}px, calc(100vw - 2rem))`, height: 'min(900px, 92vh)' }
            : { width: 'min(1180px, calc(100vw - 2rem))', height: 'min(760px, 86vh)' }
        }
      >
        {/* 제목 · 설명은 가져오기 화면(SheetImportPanel)이 그린다 -- 여기는 닫기만 */}
        <div className="relative">
          <IconButton onClick={onClose} aria-label={`${t.title} 닫기`} title="닫기" className="absolute right-4 top-4 z-10">
            <X {...ic} />
          </IconButton>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          <SheetImportPanel
            source={source}
            progress={progress}
            initialUrl={initialUrl ?? undefined}
            onCancel={onClose}
            onDone={onDone}
            onLoadedChange={setLoaded}
            onNaturalWidth={setTabsWidth}
          />
        </div>
      </div>
    </div>
  )
}

// 성과관리 메뉴 이동은 왼쪽 사이드바(shell/Sidebar)로 옮겼다. 여기에는 메뉴 종류와 저장 상태 표시만 남긴다.
import { useAppState } from '../state/AppContext'
import type { PerfStage } from '../state/AppMode'
import Spinner from './Spinner'

export type Stage = PerfStage

// 사이드바 "데이터 백업" 옆 저장 상태: 드라이브 저장이 진행 중 · 실패면 그것을, 아니면 이 브라우저 저장
export function SaveBadge({
  saveStatus = 'idle',
  hasSavedCurrentPeriod,
}: {
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  hasSavedCurrentPeriod: boolean
}) {
  const { localSave } = useAppState()
  if (saveStatus === 'saving' || localSave === 'saving')
    return (
      <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-accent" title="저장 중">
        <Spinner className="h-3 w-3" />
        저장 중
      </span>
    )
  if (saveStatus === 'error' || localSave === 'error')
    return (
      <span className="mac-badge shrink-0 bg-danger-soft text-danger" title="저장하지 못했습니다. 데이터 백업에서 다시 저장하세요.">
        저장 실패
      </span>
    )
  if (localSave === 'saved' || saveStatus === 'saved' || hasSavedCurrentPeriod)
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-label-3" title="이 브라우저에 저장됨">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        저장됨
      </span>
    )
  return null
}

// 과제 입력 -- 팀원도 쓰는 화면. 추진현황(일정표) / 진척률 두 메뉴는 왼쪽 사이드바(위 메뉴 모양이면 머리 줄)에 있다.
import { useAppMode } from '../../state/AppMode'
import AppShell, { PageHeader } from '../shell/AppShell'
import ProgressBoard, { PROGRESS_ACTIONS_SLOT, PROGRESS_MENU_SLOT } from './ProgressBoard'

export default function TaskInputApp() {
  const { taskMenu } = useAppMode()
  return (
    <AppShell
      header={
        <PageHeader
          area="과제 입력"
          // 추진현황 연도 고르기 -- 추진현황 화면이 채운다
          chooser={<span id={PROGRESS_MENU_SLOT} className="flex" />}
          title={taskMenu === 'rate' ? '진척률' : '추진현황'}
          // 파일 메뉴(⋯) -- 추진현황 화면이 채운다
          actions={<span id={PROGRESS_ACTIONS_SLOT} className="flex" />}
        />
      }
    >
      <main className="w-full min-w-0 flex-1 px-6 pb-8 pt-5 lg:px-8">
        {/* 추진현황 · 진척률은 같은 연도 · 같은 고친 내용을 쓴다(연도 고르기도 같이) */}
        <ProgressBoard view={taskMenu === 'rate' ? 'rate' : 'progress'} />
      </main>
    </AppShell>
  )
}

// 과제 입력 -- 팀원도 쓰는 화면. 추진현황(일정표) / 진척률 / 피어리뷰(요청이 열렸을 때 입력) 메뉴.
import { useState } from 'react'
import { CalendarRange, ChevronDown, Gauge, Users } from 'lucide-react'
import GoogleAccountMenu from '../GoogleAccountMenu'
import { useGoogleAccount } from '../../hooks/useGoogleAccount'
import AreaSwitch from '../AreaSwitch'
import { icSm } from '../ui/icon'
import { IS_PREVIEW } from '../../utils/previewMode'
import ProgressBoard, { PROGRESS_MENU_SLOT } from './ProgressBoard'
import PeerReviewInput from './PeerReviewInput'

type Menu = 'progress' | 'rate' | 'peer'
const MENUS: { key: Menu; label: string; Icon: typeof Gauge }[] = [
  { key: 'progress', label: '추진현황', Icon: CalendarRange },
  { key: 'rate', label: '진척률', Icon: Gauge },
  { key: 'peer', label: '피어리뷰', Icon: Users },
]

export default function TaskInputApp() {
  const [menu, setMenu] = useState<Menu>('progress')
  // 맨 위 오른쪽 로그인 정보(성과관리 화면과 같은 모양)
  const { accountEmail, isAdminUser, refreshAccount, handleLogout } = useGoogleAccount()
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-separator bg-[#FBFBFD]/85 backdrop-blur-xl">
        <div className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <AreaSwitch className="-ml-1" />
          <span className="hidden h-5 w-px bg-separator sm:inline-block" />
          {/* 추진현황 연도(성과관리의 프로젝트 고르기와 같은 모양) -- 추진현황 화면이 채운다 */}
          <span id={PROGRESS_MENU_SLOT} className="flex" />
          {IS_PREVIEW && <span className="mac-badge bg-orange-100 text-orange-700">미리보기</span>}
          <nav className="ml-2 flex items-center gap-1" role="tablist">
            {MENUS.map(({ key, label, Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={menu === key}
                onClick={() => setMenu(key)}
                className={`flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                  menu === key ? 'bg-label text-white' : 'text-label hover:bg-black/[0.05]'
                }`}
              >
                <Icon {...icSm} />
                {label}
              </button>
            ))}
          </nav>
          {accountEmail && (
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <GoogleAccountMenu
                className="flex items-center gap-1.5 rounded-control px-2 py-1 text-[13px] text-label hover:bg-black/[0.05]"
                onAccountChange={refreshAccount}
              >
                {accountEmail}
                {isAdminUser && <span className="mac-badge bg-accent-soft text-accent">관리자</span>}
                <ChevronDown {...icSm} className="text-label-3" />
              </GoogleAccountMenu>
              <button onClick={handleLogout} className="rounded-control px-2 py-1 text-[13px] text-label-2 hover:bg-black/[0.05] hover:text-label">
                로그아웃
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {/* 추진현황 · 진척률은 같은 연도 · 같은 고친 내용을 쓴다(연도 고르기도 같이) */}
        {/* 피어리뷰 화면에서는 표를 숨기기만 한다(고친 내용 · 연도 고르기 유지) */}
        <div className={menu === 'peer' ? 'hidden' : undefined}>
          <ProgressBoard view={menu === 'rate' ? 'rate' : 'progress'} />
        </div>
        {menu === 'peer' && <PeerReviewInput />}
      </main>
    </div>
  )
}

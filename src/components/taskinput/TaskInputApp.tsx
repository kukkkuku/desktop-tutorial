// 과제 입력 -- 팀원도 쓰는 화면. 추진현황(일정표) / 진척률 두 메뉴.
import { useState } from 'react'
import { CalendarRange, Gauge } from 'lucide-react'
import HomeButton from '../HomeButton'
import { icSm } from '../ui/icon'
import { IS_PREVIEW } from '../../utils/previewMode'
import ProgressBoard from './ProgressBoard'

type Menu = 'progress' | 'rate'
const MENUS: { key: Menu; label: string; Icon: typeof Gauge }[] = [
  { key: 'progress', label: '추진현황', Icon: CalendarRange },
  { key: 'rate', label: '진척률', Icon: Gauge },
]

export default function TaskInputApp() {
  const [menu, setMenu] = useState<Menu>('progress')
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-separator bg-[#FBFBFD]/85 backdrop-blur-xl">
        <div className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <HomeButton />
          <span className="h-5 w-px bg-separator" />
          <span className="text-[15px] font-bold text-label">과제 입력</span>
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
        </div>
      </header>
      <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {menu === 'progress' && <ProgressBoard />}
        {menu === 'rate' && (
          <div className="mx-auto mt-10 max-w-xl rounded-[14px] border border-dashed border-separator p-8 text-center">
            <h2 className="text-[17px] font-bold text-label">진척률은 준비 중입니다</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-label-2">
              시트 「진척률」 탭의 업무계획·착수·완료 칸을 추진현황에서 어떻게 셀지 정한 뒤 만듭니다.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

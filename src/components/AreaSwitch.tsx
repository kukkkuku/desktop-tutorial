// 머리글 맨 왼쪽: 홈(대문) 버튼 + 영역 전환 -- 어느 화면에서든 한 번에 홈 · 과제 입력 ↔ 성과관리로 오간다.
// 팀원 계정에는 성과관리가 없어 홈 버튼만 보인다.
// 다른 영역으로 가면 그 영역에서 마지막에 보던 자리(성과관리는 열어 둔 프로젝트)로 돌아가고,
// 이미 성과관리 안에서 "성과관리"를 누르면 프로젝트 목록으로 간다.
import { ChartColumn, ClipboardList, House } from 'lucide-react'
import { useAppMode, type AppMode } from '../state/AppMode'
import { useWorkspaces } from '../state/WorkspaceContext'
import { icSm } from './ui/icon'
import { useGoogleAccount } from '../hooks/useGoogleAccount'

const AREAS: { mode: AppMode; label: string; title: string; Icon: typeof ChartColumn }[] = [
  { mode: 'tasks', label: '과제 입력', title: '과제 입력 · 추진현황 · 진척률 (연구소 공용)', Icon: ClipboardList },
  { mode: 'perf', label: '성과관리', title: '성과관리 · 팀 · 평가기간 프로젝트 (팀장)', Icon: ChartColumn },
]

export default function AreaSwitch({ className = '' }: { className?: string }) {
  const { mode, setMode } = useAppMode()
  const { currentWorkspaceId, exitToLanding } = useWorkspaces()
  // 팀원 계정에는 성과관리(팀장 영역)를 보여 주지 않는다
  const { canPerf } = useGoogleAccount()
  return (
    <nav className={`flex shrink-0 items-center gap-1 ${className}`} aria-label="영역">
      <button
        onClick={() => mode !== 'home' && setMode('home')}
        aria-current={mode === 'home' ? 'page' : undefined}
        title="홈"
        aria-label="홈"
        className={`flex h-8 w-8 items-center justify-center rounded-[9px] transition-colors ${mode === 'home' ? 'bg-label text-white' : 'text-label-2 hover:bg-black/[0.05] hover:text-label'}`}
      >
        <House size={17} strokeWidth={2} />
      </button>
      {canPerf && (
        <span className="flex items-center rounded-[9px] bg-black/[0.05] p-0.5">
          {AREAS.map(({ mode: m, label, title, Icon }) => {
            const on = mode === m
            return (
              <button
                key={m}
                onClick={() => {
                  if (on && m === 'perf' && currentWorkspaceId) exitToLanding()
                  else if (!on) setMode(m)
                }}
                aria-current={on ? 'page' : undefined}
                title={on && m === 'perf' && currentWorkspaceId ? '프로젝트 목록으로' : title}
                className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-semibold transition-colors ${
                  on ? 'bg-white text-label shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-label-2 hover:text-label'
                }`}
              >
                <Icon {...icSm} />
                {label}
              </button>
            )
          })}
        </span>
      )}
    </nav>
  )
}

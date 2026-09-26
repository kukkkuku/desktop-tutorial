// 앱 대문(홈). 로그인하면 먼저 여기서 어디로 갈지 고른다.
//   과제 입력(연구소 공용): 지금 연도 · 연결된 시트 · 저장 안 한 고침
//   성과관리(팀장만): 최근 프로젝트로 바로 들어가기 · 프로젝트 목록
// 머리글 맨 왼쪽 홈 버튼으로 언제든 돌아온다.
import ManualLink from './ManualLink'
import { useMemo } from 'react'
import { ArrowRight, ChartColumn, ChevronDown, ClipboardList } from 'lucide-react'
import { useAppMode } from '../state/AppMode'
import { useWorkspaces } from '../state/WorkspaceContext'
import { useGoogleAccount } from '../hooks/useGoogleAccount'
import GoogleAccountMenu from './GoogleAccountMenu'
import AreaSwitch from './AreaSwitch'
import Button from './Button'
import { icSm } from './ui/icon'
import { IS_PREVIEW } from '../utils/previewMode'
import { ROLE_LABEL } from '../utils/roles'
import { TASK_INPUT_SHEET_URL, isProtectedSheet, loadProgress, loadShelf, readLinkedSheet } from '../utils/progressBoard'
import { parseSheetUrl } from '../utils/sheetSources'

const yearName = (t: string) => t.replace(/추진현황/, '실적관리')

function taskSummary() {
  const { data, drafts } = loadProgress()
  const shelf = loadShelf()
  const link = readLinkedSheet() ?? TASK_INPUT_SHEET_URL
  const id = parseSheetUrl(link)?.spreadsheetId
  const pending =
    Object.keys(drafts.edits ?? {}).length +
    (drafts.newRows?.length ?? 0) +
    (drafts.deleted?.length ?? 0) +
    (drafts.moves?.length ?? 0) +
    (drafts.merges?.length ?? 0) +
    (drafts.newCols?.length ?? 0) +
    (drafts.delCols?.length ?? 0) +
    Object.keys(drafts.l2Renames ?? {}).length
  const localYears = Object.keys(shelf).filter((k) => k.startsWith('local:')).length + (data?.local ? 1 : 0)
  return {
    year: data ? yearName(data.tabTitle) : null,
    where: data ? (data.local ? '이 브라우저' : (data.fileTitle ?? '구글시트')) : null,
    tasks: data ? data.rows.length : 0,
    pending,
    localYears,
    sheet: isProtectedSheet(id) ? '운영 팀 시트(읽기 전용)' : link === TASK_INPUT_SHEET_URL ? '테스트 시트' : '연결된 시트',
  }
}

export default function HomePage() {
  const { setMode } = useAppMode()
  const { workspaces, selectWorkspace, exitToLanding } = useWorkspaces()
  const { accountEmail, role, canPerf, refreshAccount, handleLogout } = useGoogleAccount()
  const t = useMemo(taskSummary, [])
  const recent = useMemo(() => [...workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4), [workspaces])

  const card =
    'group flex flex-col rounded-[16px] border border-separator bg-white p-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]'
  return (
    <div className="flex min-h-screen flex-col bg-window">
      <header className="sticky top-0 z-40 border-b border-separator bg-[#FBFBFD]/85 backdrop-blur-xl">
        <div className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <AreaSwitch className="-ml-1" />
          {IS_PREVIEW && <span className="mac-badge bg-orange-100 text-orange-700">미리보기</span>}
          {accountEmail && (
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <GoogleAccountMenu
                className="flex items-center gap-1.5 rounded-control px-2 py-1 text-[13px] text-label hover:bg-black/[0.05]"
                onAccountChange={refreshAccount}
              >
                {accountEmail}
                <span className={`mac-badge ${role === 'member' ? 'bg-black/[0.05] text-label-2' : 'bg-accent-soft text-accent'}`}>{ROLE_LABEL[role]}</span>
                <ChevronDown {...icSm} className="text-label-3" />
              </GoogleAccountMenu>
              <ManualLink />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                로그아웃
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <h1 className="text-[26px] font-bold tracking-tight text-label">무엇을 할까요?</h1>
        <p className="mt-1 text-[14px] text-label-2">
          {accountEmail ? `${accountEmail} · ${ROLE_LABEL[role]}` : '구글 로그인 없이 쓰는 중'} · 위쪽 홈 버튼으로 언제든 이 화면으로, 책 아이콘으로 사용
          매뉴얼을 엽니다.
        </p>

        <div className={`mt-8 grid gap-5 ${canPerf ? 'sm:grid-cols-2' : 'max-w-[460px]'}`}>
          {/* 과제 입력 */}
          <button onClick={() => setMode('tasks')} className={card}>
            <span className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-accent-soft text-accent">
                <ClipboardList size={21} strokeWidth={1.9} />
              </span>
              <span>
                <span className="block text-[17px] font-bold text-label">과제 입력</span>
                <span className="block text-[12.5px] text-label-2">추진현황 · 진척률 · 연구소 공용</span>
              </span>
            </span>
            <dl className="mt-5 space-y-1.5 text-[13px]">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-label-3">지금 연도</dt>
                <dd className="text-label">{t.year ? `${t.year} · ${t.where} · 과제 ${t.tasks}건` : '아직 불러오지 않음'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-label-3">시트</dt>
                <dd className="text-label">{t.sheet}</dd>
              </div>
              {t.pending > 0 && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-label-3">고친 내용</dt>
                  <dd className="font-medium text-orange-600">저장 안 한 고침 {t.pending}건</dd>
                </div>
              )}
              {t.localYears > 0 && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-label-3">이 브라우저</dt>
                  <dd className="text-label">여기서 만든 연도 {t.localYears}개</dd>
                </div>
              )}
            </dl>
            <span className="mt-auto flex items-center gap-1 pt-5 text-[13px] font-semibold text-accent">
              {t.year ? '이어서 입력하기' : '시작하기'}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

          {/* 성과관리(팀장) */}
          {canPerf && (
            <div className={card}>
              <button
                onClick={() => {
                  exitToLanding()
                  setMode('perf')
                }}
                className="flex items-center gap-2.5 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#EEF7EE] text-[#2E7D32]">
                  <ChartColumn size={21} strokeWidth={1.9} />
                </span>
                <span>
                  <span className="block text-[17px] font-bold text-label">성과관리</span>
                  <span className="block text-[12.5px] text-label-2">팀 · 평가기간 · 피어리뷰 · 면담 (팀장)</span>
                </span>
              </button>
              <div className="mt-5 space-y-1">
                {recent.length === 0 && <p className="text-[13px] text-label-3">아직 프로젝트가 없습니다.</p>}
                {recent.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      selectWorkspace(w.id)
                      setMode('perf')
                    }}
                    className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left text-[13px] text-label hover:bg-black/[0.04]"
                  >
                    <span className="truncate">
                      <span className="font-semibold">{w.teamName}</span> {w.evaluationYear} {w.periodName}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-label-3">{w.updatedAt.slice(5, 10).replace('-', '/')}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  exitToLanding()
                  setMode('perf')
                }}
                className="mt-auto flex items-center gap-1 pt-5 text-[13px] font-semibold text-accent"
              >
                {recent.length ? '프로젝트 목록' : '팀 만들기'}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

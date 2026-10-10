// 앱 대문(홈). 로그인하면 먼저 여기서 어디로 갈지 고른다.
//   과제 입력(연구소 공용): 지금 연도 · 연결된 시트 · 저장 안 한 고침
//   성과관리(팀장만): 최근 프로젝트로 바로 들어가기 · 프로젝트 목록
// 머리글 맨 왼쪽 홈 버튼으로 언제든 돌아온다.
import { ManualPanel, type ManualArea } from './ManualLink'
import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, ChartColumn, ClipboardList, FileSpreadsheet } from 'lucide-react'
import { useAppMode } from '../state/AppMode'
import { mmdd, useWorkspaces } from '../state/WorkspaceContext'
import { useGoogleAccount } from '../hooks/useGoogleAccount'
import AppShell, { PageHeader } from './shell/AppShell'
import { ROLE_LABEL } from '../utils/roles'
import { TASK_INPUT_SHEET_URL, isProtectedSheet, loadProgress, loadShelf } from '../utils/progressBoard'
import { sharedSheetFor } from '../utils/accessSheet'
import { getConnectedEmail } from '../utils/googleDrive'
import { parseSheetUrl } from '../utils/sheetSources'

const yearName = (t: string) => t.replace(/추진현황/, '실적관리')

function taskSummary() {
  const { data, drafts } = loadProgress()
  const shelf = loadShelf()
  const link = sharedSheetFor(getConnectedEmail())?.url ?? TASK_INPUT_SHEET_URL
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
    readOnly: isProtectedSheet(id),
  }
}

export default function HomePage() {
  const { setMode, setTaskMenu } = useAppMode()
  const { workspaces, selectWorkspace, exitToLanding } = useWorkspaces()
  const { accountEmail, role, canPerf } = useGoogleAccount()
  const t = useMemo(taskSummary, [])
  const [manual, setManual] = useState<ManualArea | null>(null)
  // 카드 오른쪽 위: 그 영역 매뉴얼(준비할 데이터부터)
  const manualBtn = (area: ManualArea) => (
    <button
      onClick={(e) => {
        e.stopPropagation()
        setManual(area)
      }}
      title={area === 'tasks' ? '과제 입력 매뉴얼 -- 구글시트 연결부터' : '과제관리 매뉴얼 -- 준비할 데이터부터'}
      className="absolute right-4 top-4 z-10 flex h-7 items-center gap-1 rounded-[8px] bg-white px-2.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2 shadow-control hover:text-label"
    >
      <BookOpen size={13} strokeWidth={1.9} />
      매뉴얼
    </button>
  )
  const recent = useMemo(() => [...workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4), [workspaces])

  const card =
    'group flex flex-col rounded-[14px] bg-white p-6 text-left shadow-card transition-shadow hover:shadow-[0_0_0_1px_rgba(24,24,27,0.08),0_8px_24px_-8px_rgba(24,24,27,0.16)]'
  return (
    <AppShell header={<PageHeader title="홈" />}>
      <main className="w-full max-w-5xl flex-1 px-6 pb-10 pt-6 lg:px-8">
        <h2 className="text-[length:calc(24px*var(--ui-fs,1))] font-semibold tracking-[-0.02em] text-label">무엇을 할까요?</h2>
        <p className="mt-1 text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
          {accountEmail ? `${accountEmail} · ${ROLE_LABEL[role]}` : '구글 로그인 없이 쓰는 중'} · 처음이면 카드의 매뉴얼에서 준비할 데이터부터 보세요.
        </p>

        <div className={`mt-8 grid gap-5 ${canPerf ? 'sm:grid-cols-2' : 'max-w-[460px]'}`}>
          {/* 과제 입력 */}
          <div className="relative flex">
            {manualBtn('tasks')}
            {/* 「이어서 입력하기」 = 입력 화면(추진현황)으로 -- 마지막에 진척률을 봤어도 */}
            <button
              onClick={() => {
                setTaskMenu('progress')
                setMode('tasks')
              }}
              className={`${card} w-full`}
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-accent-soft text-accent">
                  <ClipboardList size={21} strokeWidth={1.9} />
                </span>
                <span>
                  <span className="block text-[length:calc(17px*var(--ui-fs,1))] font-bold text-label">과제 입력</span>
                  <span className="block text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">추진현황 · 진척률 · 연구소 공용</span>
                </span>
              </span>
              {/* 지금 입력하는 연도 · 과제 수 / 그 연도가 있는 곳(구글시트 파일 · 이 브라우저) -- 항목 이름 없이 두 줄로 */}
              <div className="mt-5 space-y-1 text-[length:calc(14px*var(--ui-fs,1))]">
                {t.year ? (
                  <>
                    <p className="font-semibold text-label">
                      {t.year} <span className="font-normal text-label-2">· 과제 {t.tasks}건</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-label-2">
                      <FileSpreadsheet size={14} strokeWidth={1.8} className="shrink-0 text-emerald-700" />
                      <span className="truncate">{t.where}</span>
                      {t.readOnly && <span className="shrink-0 rounded bg-black/[0.05] px-1.5 text-[length:calc(12px*var(--ui-fs,1))] text-label-2">읽기 전용</span>}
                    </p>
                  </>
                ) : (
                  <p className="text-label-2">아직 불러오지 않음</p>
                )}
                {t.pending > 0 && <p className="font-medium text-orange-600">저장 안 한 변경 {t.pending}건</p>}
                {t.localYears > 0 && <p className="text-label-3">이 브라우저에서 만든 연도 {t.localYears}개</p>}
              </div>
              <span className="mt-auto flex items-center gap-1 pt-5 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-accent">
                {t.year ? '이어서 입력하기' : '시작하기'}
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          </div>

          {/* 성과관리(팀장) */}
          {canPerf && (
            <div className={`${card} relative`}>
              {manualBtn('perf')}
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
                  <span className="block text-[length:calc(17px*var(--ui-fs,1))] font-bold text-label">성과관리</span>
                  <span className="block text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">팀 · 평가기간 · 피어리뷰 · 면담 (팀장)</span>
                </span>
              </button>
              <div className="mt-5 space-y-1">
                {recent.length === 0 && <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-3">아직 평가가 없습니다.</p>}
                {recent.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      selectWorkspace(w.id)
                      setMode('perf')
                    }}
                    className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left text-[length:calc(14px*var(--ui-fs,1))] text-label hover:bg-black/[0.04]"
                  >
                    <span className="truncate">
                      <span className="font-semibold">{w.teamName}</span> {w.evaluationYear} {w.periodName}
                    </span>
                    <span className="shrink-0 text-[length:calc(12.5px*var(--ui-fs,1))] text-label-3">{mmdd(w.updatedAt, '/')}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  exitToLanding()
                  setMode('perf')
                }}
                className="mt-auto flex items-center gap-1 pt-5 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-accent"
              >
                {recent.length ? '평가 목록' : '팀 만들기'}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>

      </main>
      {manual && <ManualPanel area={manual} chapter={manual === 'tasks' ? 'sheet' : 'prep'} onClose={() => setManual(null)} />}
    </AppShell>
  )
}

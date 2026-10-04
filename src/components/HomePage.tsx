// 앱 대문(홈). 로그인하면 먼저 여기서 어디로 갈지 고른다.
//   과제 입력(연구소 공용): 지금 연도 · 연결된 시트 · 저장 안 한 고침
//   성과관리(팀장만): 최근 프로젝트로 바로 들어가기 · 프로젝트 목록
// 머리글 맨 왼쪽 홈 버튼으로 언제든 돌아온다.
import { ManualPanel, type ManualArea } from './ManualLink'
import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, ChartColumn, ClipboardList, FileSpreadsheet, FolderPlus, Send, UsersRound, X } from 'lucide-react'
import { useAppMode } from '../state/AppMode'
import { mmdd, useWorkspaces } from '../state/WorkspaceContext'
import { useGoogleAccount } from '../hooks/useGoogleAccount'
import AppShell, { PageHeader } from './shell/AppShell'
import { ROLE_LABEL } from '../utils/roles'
import { TASK_INPUT_SHEET_URL, isProtectedSheet, loadProgress, loadShelf, readLinkedSheet } from '../utils/progressBoard'
import { parseSheetUrl } from '../utils/sheetSources'
import { isPendingEmail, readAccessCache } from '../utils/accessSheet'
import { getConnectedEmail } from '../utils/googleDrive'
import { setLandingIntent } from './WorkspaceLanding'
import TeamAccountsPanel from './TeamAccountsPanel'

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
    readOnly: isProtectedSheet(id),
  }
}

export default function HomePage() {
  const { setMode, setPerfStage } = useAppMode()
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
      title={area === 'tasks' ? '과제 입력 매뉴얼 -- 구글시트 연결부터' : '성과관리 매뉴얼 -- 준비할 데이터부터'}
      className="absolute right-4 top-4 z-10 flex h-7 items-center gap-1 rounded-[8px] bg-white px-2.5 text-[length:calc(13px*var(--ui-fs,1))] font-medium text-label-2 shadow-control hover:text-label"
    >
      <BookOpen size={13} strokeWidth={1.9} />
      매뉴얼
    </button>
  )
  // 우리 팀: 팀 이름(최근 평가의 팀 · 없으면 권한 시트의 내 팀) · 팀원 수 · 초대 안 보낸 사람
  const team = useMemo(() => {
    const me = (getConnectedEmail() ?? accountEmail ?? '').toLowerCase()
    const access = readAccessCache()
    const latest = [...workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const myTeam = access?.users.find((u) => u.email === me)?.team ?? ''
    const name = latest?.teamName || myTeam
    const members = (access?.users ?? []).filter((u) => u.role === 'member' && (u.team ? u.team === name || u.team === myTeam : u.addedBy === me))
    return {
      name,
      latest,
      members: members.length,
      notInvited: members.filter((u) => !u.invitedAt && !isPendingEmail(u.email)).length,
      noMail: members.filter((u) => isPendingEmail(u.email)).length,
      known: !!access,
    }
  }, [workspaces, accountEmail])
  const [inviteOpen, setInviteOpen] = useState(false)
  const goLanding = (intent: 'team' | 'eval') => {
    setLandingIntent(intent, team.name)
    exitToLanding()
    setMode('perf')
  }
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
            <button onClick={() => setMode('tasks')} className={`${card} w-full`}>
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

        {/* 우리 팀(팀장): 팀 만들기 · 평가 만들기 · 팀원 초대는 늘 여기 -- 접히거나 사라지지 않는다 */}
        {canPerf && (
          <section className="mt-8">
            <h3 className="flex items-baseline gap-2 text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">
              우리 팀
              <span className="font-normal text-label-2">{team.name || '아직 팀이 없습니다'}</span>
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    key: 'team',
                    Icon: UsersRound,
                    title: '팀 만들기',
                    sub: team.name ? `지금 팀: ${team.name}` : '팀 이름을 정하고 첫 평가를 만듭니다',
                    onClick: () => goLanding('team'),
                  },
                  {
                    key: 'eval',
                    Icon: FolderPlus,
                    title: '평가 만들기',
                    sub: team.latest ? `최근: ${team.latest.teamName} · ${team.latest.evaluationYear} ${team.latest.periodName}` : team.name ? `${team.name}의 첫 평가` : '팀을 먼저 만듭니다',
                    onClick: () => goLanding('eval'),
                  },
                  {
                    key: 'invite',
                    Icon: Send,
                    title: '팀원 초대',
                    sub: !team.known
                      ? '팀원 추가 · 초대 메일 · 시트 공유'
                      : `팀원 ${team.members}명${team.notInvited ? ` · 초대 안 보냄 ${team.notInvited}명` : ''}${team.noMail ? ` · Gmail 없음 ${team.noMail}명` : ''}`,
                    // 평가가 있으면 그 평가의 팀원관리 표(추가 · Gmail · 초대가 한 곳), 없으면 바로 창으로
                    onClick: () => {
                      if (!team.latest) return setInviteOpen(true)
                      selectWorkspace(team.latest.id)
                      setPerfStage('members')
                      setMode('perf')
                    },
                  },
                ] as const
              ).map(({ key, Icon, title, sub, onClick }) => (
                <button
                  key={key}
                  onClick={onClick}
                  className="group flex items-center gap-3 rounded-[12px] bg-white px-4 py-3.5 text-left shadow-card transition-shadow hover:shadow-[0_0_0_1px_rgba(24,24,27,0.08),0_8px_24px_-8px_rgba(24,24,27,0.16)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                    <Icon size={18} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">{title}</span>
                    <span className="block truncate text-[length:calc(13px*var(--ui-fs,1))] text-label-2">{sub}</span>
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-label-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
      {inviteOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-10" onMouseDown={(e) => e.target === e.currentTarget && setInviteOpen(false)}>
          <div className="w-full max-w-6xl rounded-[16px] bg-canvas p-6 shadow-pop">
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-[length:calc(17px*var(--ui-fs,1))] font-semibold text-label">팀원 초대</h3>
              <span className="text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">평가를 만들면 성과관리 › 팀원관리 표에서 이어서 관리합니다</span>
              <button onClick={() => setInviteOpen(false)} aria-label="닫기" className="ml-auto flex h-8 w-8 items-center justify-center rounded-[8px] text-label-2 hover:bg-black/[0.06]">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <TeamAccountsPanel />
          </div>
        </div>
      )}
      {manual && <ManualPanel area={manual} chapter={manual === 'tasks' ? 'sheet' : 'prep'} onClose={() => setManual(null)} />}
    </AppShell>
  )
}

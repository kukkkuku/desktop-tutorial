import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { EvaluationGrade } from '../../types'
import {
  calcAllTaskScores,
  calcMemberResults,
  getContribution,
  getEffectiveContributionPercent,
} from '../../utils/calculations'
import { appraisalRecordGrade, auxScoreSum, calcPromotionReadiness, findPromotionCriteria } from '../../utils/promotion'
import { calcYearsSince, formatLevelTenureLabel } from '../../utils/tenure'
import { IMPORTANCE_COLORS } from '../../utils/badgeColors'
import TrendSparkline from './TrendSparkline'
import PromotionSimulationPanel from './PromotionSimulationPanel'
import MemberPerformanceHistoryPanel from '../member-detail/MemberPerformanceHistoryPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'
import MeetingForm from './MeetingForm'
import GradeNoteButton from '../GradeNoteButton'
import Badge from '../Badge'

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <rect x="9" y="1" width="6" height="4" rx="1" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="13" y2="15" />
    </svg>
  )
}

// 최근 성과 / 성장 시뮬레이션 카드 공용 래퍼 -- 3등분 컬럼에서 각자 고정된
// 자기 칸을 가지므로 더 이상 접었다 펼 필요가 없다(예전엔 면담하기와 폭을
// 다퉈서 아코디언으로 눌러뒀었다). 제목 + 상태 배지만 통일해서 보여준다.
function SectionCard({
  title,
  headerBadge,
  children,
}: {
  title: string
  headerBadge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
      <span className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-black">{title}</h3>
        {headerBadge}
      </span>
      <div className="mt-3">{children}</div>
    </div>
  )
}

interface MemberGrowthDetailProps {
  memberId: string
  prepRequest?: { memberId: string; token: number } | null
}

// 팀원 성장 관리 상세 -- 상단 팀원 탭에서 선택한 팀원의 통합 화면. 상단
// 요약이 전체 폭을 가로지르고, 그 아래는 3등분: 최근 성과 / 성장 시뮬레이션 /
// 면담(면담 인사이트 + 면담일지). 우측 면담 일정(캘린더)은 NotesStage가
// 별도 컬럼으로 붙여준다 -- 이 컴포넌트는 건드리지 않는다.
export default function MemberGrowthDetail({ memberId, prepRequest }: MemberGrowthDetailProps) {
  const { state, dispatch } = useAppState()
  const { profile, addPersonalNote, deletePersonalNote } = useTeamProfile()
  const { workspaces, currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periods = workspaces.filter((w) => w.teamName === teamName)
  const member = state.members.find((m) => m.id === memberId)

  const [insightsOpen, setInsightsOpen] = useState(true)
  const [recentExpanded, setRecentExpanded] = useState(false)
  const [pastPeriodsOpen, setPastPeriodsOpen] = useState(false)
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [noteFormOpen, setNoteFormOpen] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const noteRootRef = useRef<HTMLDivElement>(null)

  // 팀원을 전환하면 이전 팀원에서 열어둔 메모 입력창이 그대로 남지 않도록 닫는다.
  useEffect(() => {
    setNoteFormOpen(false)
    setNoteInput('')
  }, [memberId])

  // 메모 팝오버 바깥을 클릭하면 닫는다 -- 리스트/폼이 페이지에 계속 자리를
  // 차지하지 않고 필요할 때만 떠 있어야 해서(플로팅), 다른 곳을 클릭하면
  // 자동으로 접힌다.
  useEffect(() => {
    if (!noteFormOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (noteRootRef.current && !noteRootRef.current.contains(e.target as Node)) {
        setNoteFormOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [noteFormOpen])

  if (!member) {
    return <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">팀원을 찾을 수 없습니다.</p>
  }

  const activeCount = state.members.filter((m) => m.active).length

  const memberResults = calcMemberResults(state.members, state.tasks, state.contributions, state.criteria, state.peerReviews)
  const resultIdx = memberResults.findIndex((r) => r.member.id === memberId)
  const memberResult = resultIdx >= 0 ? memberResults[resultIdx] : undefined
  const rank = resultIdx >= 0 ? resultIdx + 1 : null

  const appraisals = profile.hrAppraisals.filter((r) => r.memberId === memberId).sort((a, b) => a.year - b.year)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const readiness = calcPromotionReadiness(member.level, appraisals, profile.promotionCriteria, profile.gradeScores, auxScoreSum(member.auxScores), levelTenureYears)

  // Summary Bar의 승진 관련 항목(현재 점수/승진 기준/필요 점수 갭) --
  // PromotionSimulationPanel과 같은 계산을 여기서 독립적으로 다시 구해 쓴다
  // (코드베이스 컨벤션: prop으로 내려받지 않고 각자 재계산).
  const promotionCriteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const currentWeightedScore = readiness?.weightedScore ?? 0
  const scoreGap = promotionCriteria ? Math.round((currentWeightedScore - promotionCriteria.requiredScore) * 10) / 10 : null

  // 승급일 -- 네이티브 <input type="month">의 브라우저별 달력 팝업이 복잡해
  // 보인다는 피드백이 있어, 연도 입력칸 + 월 드롭다운으로 직접 구성한다.
  const [reviewDateYear, reviewDateMonth = '01'] = (member.promotionReviewDate ?? '').split('-')
  const updatePromotionReviewYear = (value: string) => {
    if (!value) {
      dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: null } })
      return
    }
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${value}-${reviewDateMonth || '01'}` } })
  }
  const updatePromotionReviewMonth = (value: string) => {
    const year = reviewDateYear || String(new Date().getFullYear())
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${year}-${value}` } })
  }

  // 고과 추이는 워크스페이스별 계산 성과가 아니라 공식 인사평가 이력(연도별
  // 업적/역량 등급)이 이전 성과 기준이다 -- 승진심사/승진자격 기준과 같은
  // 데이터 소스를 쓴다.
  const trendPoints = appraisals
    .map((r) => {
      const grade = appraisalRecordGrade(r, profile.gradeScores)
      return grade ? { period: String(r.year), grade } : null
    })
    .filter((p): p is { period: string; grade: EvaluationGrade } => p !== null)

  const todayStr = new Date().toISOString().slice(0, 10)
  const lastMeetingDate =
    state.meetingNotes
      .filter((n) => n.memberId === memberId && n.date <= todayStr)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null

  const taskScores = calcAllTaskScores(state.tasks, state.criteria)
  const currentTasks = taskScores
    .map(({ task, score }) => {
      const contribution = getContribution(state.contributions, task.id, memberId)
      if (!contribution || contribution.contributionPercent <= 0) return null
      const effectivePercent = getEffectiveContributionPercent(state.contributions, task.id, memberId, state.criteria.contributionWeight)
      return {
        task,
        contributionPercent: contribution.contributionPercent,
        personalGrade: contribution.personalPerformanceGrade,
        personalGradeNote: contribution.personalGradeNote,
        personalScore: score * (effectivePercent / 100),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.personalScore - a.personalScore)

  const visibleTasks = recentExpanded ? currentTasks : currentTasks.slice(0, 2)

  const personalNotes = profile.personalNotes.filter((n) => n.memberId === memberId)

  // 면담 인사이트 -- 빈 코멘트 칸만 보고 팀장이 매번 질문을 새로 생각해야
  // 하는 문제를 줄이려고, 등급·참여 과제 기준으로 짧은 코칭 멘트를 미리
  // 만들어둔다. 통계 예측이 아니라 규칙 기반 문장 생성이다. 개인 메모로
  // 남긴 개인 상황도 면담에서 놓치지 않도록 맨 앞에 그대로 얹는다.
  const meetingInsights: string[] = personalNotes.map((n) => n.content)
  if (memberResult) {
    if (memberResult.grade === 'S' || memberResult.grade === 'A') {
      meetingInsights.push(`${memberResult.grade} 고과를 유지한 강점과 다음 단계 목표를 확인해 보세요.`)
    } else if (memberResult.grade === 'C' || memberResult.grade === 'D') {
      meetingInsights.push(`${memberResult.grade} 고과의 원인을 함께 점검하고 개선 계획을 논의해 보세요.`)
    } else {
      meetingInsights.push(`이번 고과(${memberResult.grade})를 바탕으로 강점과 보완점을 균형 있게 짚어보세요.`)
    }
  }
  if (currentTasks.length > 0) {
    const names = currentTasks.slice(0, 2).map((t) => t.task.name)
    meetingInsights.push(`${names.join(', ')}${currentTasks.length > 2 ? ' 등' : ''}에서 맡은 역할과 기여를 구체적으로 확인해 보세요.`)
  }
  meetingInsights.push('다음 평가기간에 강화할 역량과 팀장이 지원할 사항을 합의해 보세요.')

  return (
    <div className="flex min-h-full flex-col">
      {/* 상단 프로필 요약 -- 라벨 붙은 박스를 여러 개 늘어놓지 않고, 사람이
          읽는 문장 두 줄(현재 성과 / 승진심사)로 묶는다. 승진 기준이 없는
          팀원은 그 문장에서 "승진 기준 미설정"만 짧게 보여주고 나머지
          칸(대시로 채워지던 4개)은 아예 렌더링하지 않는다. */}
      <div className="border-b border-gray-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-lg font-bold text-black">{member.name}</p>
            <p className="text-xs text-gray-400">
              {[member.role, formatLevelTenureLabel(member.level, levelTenureYears)].filter(Boolean).join(' · ') || '-'}
            </p>
          </div>

          {/* 개인 메모 -- 대학원 재학, 육아, 휴가 계획처럼 성과 데이터로는
              안 잡히지만 면담 전에 챙겨야 할 개인 상황을 남겨둔다. 칩을
              헤더에 바로 늘어놓으면 메모가 많아질 때 줄바꿈되며 아래로
              밀려 내려가 보기 나빠서, 버튼 하나로 접어두고 눌렀을 때만
              떠오르는 플로팅 팝오버로 뺐다. 등록하면 면담 인사이트에도
              그대로 반영된다. */}
          <div ref={noteRootRef} className="relative shrink-0">
            <button
              onClick={() => setNoteFormOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                noteFormOpen || personalNotes.length > 0
                  ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                  : 'border-dashed border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              <NoteIcon className="h-3.5 w-3.5 shrink-0" />
              메모{personalNotes.length > 0 && ` ${personalNotes.length}`}
            </button>

            {noteFormOpen && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-violet-100 bg-white p-3 shadow-lg">
                {personalNotes.length > 0 && (
                  <div className="mb-2 flex flex-col gap-1.5">
                    {personalNotes.map((note) => (
                      <div key={note.id} className="group flex items-start gap-1.5 rounded-md bg-violet-50 px-2.5 py-1.5 text-[12px] text-violet-800">
                        <span className="flex-1 whitespace-pre-wrap break-words">{note.content}</span>
                        <button
                          onClick={() => deletePersonalNote(note.id)}
                          className="shrink-0 leading-none text-violet-300 hover:text-violet-600"
                          aria-label="메모 삭제"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!noteInput.trim()) return
                    addPersonalNote(memberId, noteInput)
                    setNoteInput('')
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    autoFocus
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="예: 대학원 재학 중, 육아휴직 복귀 예정"
                    className="w-full min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-[12px] text-black focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                  <button
                    type="submit"
                    disabled={!noteInput.trim()}
                    className="shrink-0 rounded-md bg-violet-100 px-2.5 py-1.5 text-[12px] font-semibold text-violet-700 hover:bg-violet-200 disabled:opacity-40"
                  >
                    추가
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* 숫자 여러 개를 박스로 나열하지 않고, 사람이 말하듯 한 줄로
            읽히게 문장형으로 묶는다 -- 승진 기준이 없는 팀원은 그 문장
            자체를 안 보여줘서(대시로 채운 빈 칸 4개 대신) 화면이 더
            가벼워진다. */}
        <p className="mt-1.5 text-sm text-gray-600">
          {memberResult ? (
            <>
              합계 <span className="font-bold text-black">{memberResult.cumulativeScore.toFixed(1)}점 ({memberResult.grade})</span>
            </>
          ) : (
            <span className="text-gray-300">합계 -</span>
          )}
          {' · '}
          등급 <span className="font-semibold text-black">{rank ? `${rank}위 / ${activeCount}명` : '-'}</span>
          {' · '}
          최근 면담 <span className="font-semibold text-black">{lastMeetingDate ?? '없음'}</span>
          {' · '}
          <span className="inline-flex items-center gap-1.5 align-middle">
            고과 추이(5년) <TrendSparkline points={trendPoints} width={90} />
          </span>
        </p>

        <p className="mt-1.5 text-sm text-gray-600">
          승진심사 시기{' '}
          <span className="inline-flex items-center gap-1 font-semibold text-black">
            <input
              type="number"
              value={reviewDateYear}
              onChange={(e) => updatePromotionReviewYear(e.target.value)}
              placeholder="연도"
              className="w-12 rounded border-0 bg-transparent p-0 text-sm font-semibold text-black focus:outline-none focus:ring-1 focus:ring-accent"
            />
            년
            <select
              value={reviewDateMonth}
              onChange={(e) => updatePromotionReviewMonth(e.target.value)}
              className="rounded border-0 bg-transparent p-0 text-sm font-semibold text-black focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                <option key={m} value={m}>
                  {Number(m)}월
                </option>
              ))}
            </select>
          </span>
          {promotionCriteria ? (
            <>
              {' · '}
              <span className="font-semibold text-black">{promotionCriteria.toLevel}</span> 승격 기준{' '}
              <span className="font-semibold text-black">{promotionCriteria.requiredScore.toFixed(1)}점</span>
              {' (현재 '}
              <span className="font-semibold text-black">{currentWeightedScore.toFixed(1)}점</span>
              {', '}
              <span className={scoreGap !== null && scoreGap >= 0 ? 'font-semibold text-success' : 'font-semibold text-accent'}>
                {scoreGap === null ? '-' : `${scoreGap >= 0 ? '+' : ''}${scoreGap.toFixed(1)}점`}
              </span>
              {')'}
            </>
          ) : (
            <span className="text-gray-400"> · 승진 기준 미설정</span>
          )}
        </p>
      </div>

      {/* 최근 성과 / 성장 시뮬레이션 / 면담을 동일 비중 3등분 컬럼으로 나란히
          놓는다 -- 면담이 팀장의 주요 액션이지만, 그 자료가 되는 두 컬럼도
          각자 온전한 폭을 가져야 표(최근 성과)와 시뮬레이션이 눌리지 않는다.
          lg 미만에서는 위아래로 쌓는다. */}
      <div className="flex-1 p-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <SectionCard title="최근 성과">
            {currentTasks.length === 0 ? (
              <p className="text-[13px] text-gray-400">이번 기간 참여한 과제가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-400">
                      <th className="py-2 pr-3 font-semibold">프로젝트</th>
                      <th className="px-3 py-2 font-semibold">중요도</th>
                      <th className="px-3 py-2 font-semibold">기여도</th>
                      <th className="px-3 py-2 font-semibold">개인 등급</th>
                      <th className="pl-3 py-2 text-right font-semibold">개인 점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map(({ task, contributionPercent, personalGrade, personalGradeNote, personalScore }) => (
                      <tr key={task.id} className="border-b border-gray-100 text-black last:border-0">
                        <td className="py-2.5 pr-3 font-medium">{task.name}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPORTANCE_COLORS[task.importance]}`}>{task.importance}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{contributionPercent}%</td>
                        <td className="px-3 py-2.5 text-gray-600">
                          <div className="flex items-center gap-1">
                            <span>{personalGrade}</span>
                            <GradeNoteButton note={personalGradeNote} label={task.name} />
                          </div>
                        </td>
                        <td className="pl-3 py-2.5 text-right font-mono font-semibold">{personalScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => setPastPeriodsOpen((v) => !v)} className="text-xs font-medium text-gray-400 hover:text-accent">
                {pastPeriodsOpen ? '− 지난 평가기간 성과 접기' : '지난 평가기간 성과 보기 →'}
              </button>
              {currentTasks.length > 2 && (
                <button onClick={() => setRecentExpanded((v) => !v)} className="text-xs font-medium text-gray-500 hover:text-accent">
                  {recentExpanded ? '접기' : '더보기'} {recentExpanded ? '˄' : '>'}
                </button>
              )}
            </div>
            {pastPeriodsOpen && (
              <div className="mt-3 border-t border-dashed border-gray-200 pt-3">
                <MemberPerformanceHistoryPanel memberId={memberId} periods={periods} />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="성장 시뮬레이션"
            headerBadge={
              promotionCriteria && (
                <Badge tone={scoreGap !== null && scoreGap >= 0 ? 'accent' : 'neutral'}>
                  {scoreGap !== null && scoreGap >= 0 ? '승진 가능' : '기준 미달'}
                </Badge>
              )
            }
          >
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700"
              >
                <UploadIcon className="h-3.5 w-3.5" /> 엑셀로 가져오기
              </button>
            </div>
            <PromotionSimulationPanel member={member} onOpenCriteria={() => setCriteriaManagerOpen(true)} />
          </SectionCard>

          {/* 면담 -- 면담 인사이트(접고 펼 수 있음) + 면담일지가 한 컬럼에
              같이 들어간다. */}
          <div>
            {meetingInsights.length > 0 && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-blue-50/40">
                <button
                  onClick={() => setInsightsOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
                >
                  <span className="text-xs font-bold text-accent">면담 인사이트</span>
                  <span className="shrink-0 text-gray-400">{insightsOpen ? '˄' : '˅'}</span>
                </button>
                {insightsOpen && (
                  <ul className="space-y-0.5 px-4 pb-3">
                    {meetingInsights.map((line, i) => (
                      <li key={i} className="text-[13px] text-gray-700">
                        · {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <MeetingForm member={member} focusToken={prepRequest?.token ?? null} />
          </div>
        </div>
      </div>

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

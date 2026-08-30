import { useState } from 'react'
import type { PeerReview } from '../types'
import {
  GRADE_COLORS,
  PERFORMANCE_SCORE,
  scoreToGrade,
  type PeerAlignmentRow,
} from '../utils/calculations'
import Button from './Button'

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

// 판정별 한 줄 요약 -- 카드에서 가장 먼저 읽히는 문장이라, 숫자가 아니라
// "그래서 무슨 뜻인지"를 쓴다.
const VERDICT_TEXT: Record<PeerAlignmentRow['verdict'], string> = {
  'no-reviews': '받은 리뷰가 없어 동료 의견을 확인할 수 없습니다',
  aligned: '팀장님 평가와 동료 의견이 일치합니다',
  'peers-higher': '동료들이 팀장님보다 높게 봅니다',
  'peers-lower': '동료들이 팀장님보다 낮게 봅니다',
}

const VERDICT_STYLE: Record<PeerAlignmentRow['verdict'], string> = {
  'no-reviews': 'bg-gray-100 text-gray-500',
  aligned: 'bg-green-50 text-green-700',
  'peers-higher': 'bg-blue-50 text-blue-700',
  'peers-lower': 'bg-orange-50 text-orange-700',
}

function GradeChip({ grade }: { grade: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${GRADE_COLORS[grade as 'S']}`}>{grade}</span>
}

interface PeerAlignmentCardsProps {
  rows: PeerAlignmentRow[]
  // 근거 팝업에서 원본 리뷰를 보여주기 위해 필요하다.
  peerReviews: PeerReview[]
  taskNameById: Map<string, string>
  onDeleteReview: (review: PeerReview) => void
}

// 팀원별로 "동료가 어떻게 평가했고, 그게 팀장 판단과 같은가"를 한 카드로
// 정리한다. 원본 리뷰(누가 몇 %로 무슨 등급을 줬는지)는 카드에 늘어놓지 않고
// "근거 보기" 팝업으로 뺀다 -- 매번 볼 것이 아니라, 갈리는 지점을 확인할 때만
// 필요한 자료다.
export default function PeerAlignmentCards({ rows, peerReviews, taskNameById, onDeleteReview }: PeerAlignmentCardsProps) {
  const [detailRow, setDetailRow] = useState<PeerAlignmentRow | null>(null)

  const diverging = rows.filter((r) => r.verdict === 'peers-higher' || r.verdict === 'peers-lower')

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-bold text-black">팀원별 동료 평가</h4>
        <span className="text-xs text-gray-400">팀장님 평가와 갈리는 팀원 {diverging.length}명</span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const top = row.divergentTasks[0]
          return (
            <div key={row.member.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-black">{row.member.name}</span>
                {row.member.level && <span className="text-xs text-gray-400">{row.member.level}</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[row.verdict]}`}>
                  {VERDICT_TEXT[row.verdict]}
                </span>
                <span className="ml-auto text-xs text-gray-400">
                  리뷰 {row.reviewCount}건 · 동료 {row.reviewerCount}명
                </span>
              </div>

              {row.verdict !== 'no-reviews' && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">팀장</span>
                    {row.leadScore !== null ? (
                      <>
                        <GradeChip grade={scoreToGrade(row.leadScore)} />
                        <span className="text-xs text-gray-400">{row.leadScore.toFixed(0)}점</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">아직 없음</span>
                    )}
                  </span>
                  <span className="text-gray-300">↔</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">동료</span>
                    {row.peerScore !== null && (
                      <>
                        <GradeChip grade={scoreToGrade(row.peerScore)} />
                        <span className="text-xs text-gray-400">{row.peerScore.toFixed(0)}점</span>
                      </>
                    )}
                  </span>
                  {row.gap !== null && Math.abs(row.gap) >= 1 && (
                    <span className={`text-xs font-semibold ${row.gap > 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                      {row.gap > 0 ? '+' : ''}
                      {row.gap.toFixed(0)}점
                    </span>
                  )}
                  {/* 동료끼리도 두 등급 이상 갈리면 평균 자체를 믿기 어렵다. */}
                  {row.peerSpread >= 20 && (
                    <span className="rounded bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                      동료 간 의견도 {(row.peerSpread / 10).toFixed(0)}등급 차이
                    </span>
                  )}
                </div>
              )}

              {top && (
                <p className="mt-2 text-[13px] text-gray-600">
                  갈리는 지점 · <span className="font-medium text-black">{top.task.name}</span> — 팀장{' '}
                  {top.leadGrade}, 동료 {top.peerGrades.join('·')}
                </p>
              )}

              {row.contributionGap !== null && Math.abs(row.contributionGap) >= 10 && (
                <p className="mt-1.5 text-[13px] text-gray-600">
                  기여도 · 팀장 배분보다 동료가{' '}
                  <span className="font-medium text-black">
                    평균 {Math.abs(row.contributionGap).toFixed(0)}%p {row.contributionGap > 0 ? '높게' : '낮게'}
                  </span>{' '}
                  봅니다
                </p>
              )}

              {row.reviewCount > 0 && (
                <button
                  onClick={() => setDetailRow(row)}
                  className="mt-2.5 text-xs font-medium text-accent hover:underline"
                >
                  근거 보기 ({row.reviewCount}건)
                </button>
              )}
            </div>
          )
        })}
      </div>

      {detailRow && (
        <EvidenceDialog
          row={detailRow}
          peerReviews={peerReviews.filter((r) => r.targetMemberId === detailRow.member.id)}
          taskNameById={taskNameById}
          onDeleteReview={onDeleteReview}
          onClose={() => setDetailRow(null)}
        />
      )}
    </div>
  )
}

// 원본 리뷰 -- 카드에서 "근거 보기"를 눌렀을 때만 연다.
function EvidenceDialog({
  row,
  peerReviews,
  taskNameById,
  onDeleteReview,
  onClose,
}: {
  row: PeerAlignmentRow
  peerReviews: PeerReview[]
  taskNameById: Map<string, string>
  onDeleteReview: (review: PeerReview) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-black">{row.member.name} · 동료 리뷰 근거</h3>
            <p className="mt-0.5 text-[13px] text-gray-500">{VERDICT_TEXT[row.verdict]}</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-black">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* 과제별로 팀장 등급과 동료 등급을 나란히 놓는다 -- 이 팝업을 여는
              이유가 "어느 과제에서 갈렸나"를 확인하는 것이기 때문. */}
          {row.tasks
            .filter((t) => t.peerGrades.length > 0 || t.leadGrade)
            .map((t) => {
              const reviews = peerReviews.filter((r) => r.taskId === t.task.id)
              return (
                <div key={t.task.id} className="mb-4 rounded-lg border border-gray-200">
                  <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                    <span className="text-sm font-semibold text-black">{t.task.name}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
                      팀장 {t.leadGrade ? <GradeChip grade={t.leadGrade} /> : '—'}
                      <span className="text-gray-300">↔</span>
                      동료 {t.peerAvgScore !== null ? <GradeChip grade={scoreToGrade(t.peerAvgScore)} /> : '—'}
                      {t.gap !== null && Math.abs(t.gap) >= 1 && (
                        <span className={t.gap > 0 ? 'text-blue-600' : 'text-orange-600'}>
                          {t.gap > 0 ? '+' : ''}
                          {t.gap.toFixed(0)}
                        </span>
                      )}
                    </span>
                  </div>
                  {reviews.length === 0 ? (
                    <p className="px-4 py-2.5 text-xs text-gray-400">이 과제에는 동료 리뷰가 없습니다.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {reviews.map((r) => (
                        <li key={r.id} className="px-4 py-2.5 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-black">{r.reviewerName || '(작성자 미상)'}</span>
                            {typeof r.contributionPercent === 'number' && (
                              <span className="text-xs text-gray-400">기여도 {r.contributionPercent}%</span>
                            )}
                            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[r.grade]}`}>
                              {r.grade}
                            </span>
                            <span className="text-xs text-gray-300">{PERFORMANCE_SCORE[r.grade]}점</span>
                            <button
                              onClick={() => onDeleteReview(r)}
                              className="text-xs text-gray-400 hover:text-danger"
                            >
                              삭제
                            </button>
                          </div>
                          {r.comment && <p className="mt-1 text-[13px] text-gray-600">"{r.comment}"</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          {/* 과제 연결이 없는 예전 데이터 */}
          {peerReviews.filter((r) => !r.taskId).length > 0 && (
            <div className="rounded-lg border border-gray-200">
              <p className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-black">
                과제 미상 (예전 데이터)
              </p>
              <ul className="divide-y divide-gray-100">
                {peerReviews
                  .filter((r) => !r.taskId)
                  .map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="font-medium text-black">{r.reviewerName || '(작성자 미상)'}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[r.grade]}`}>
                        {r.grade}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {taskNameById.size === 0 && <p className="text-sm text-gray-400">과제가 없습니다.</p>}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-3">
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  )
}

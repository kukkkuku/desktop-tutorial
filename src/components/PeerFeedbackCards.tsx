import { useState } from 'react'
import type { PeerReview } from '../types'
import {
  GRADE_COLORS,
  PERFORMANCE_SCORE,
  type PeerAgreement,
  type PeerFeedbackRow,
  type PeerStanding,
} from '../utils/calculations'
import { summarizeTaskReviews } from '../utils/peerInsights'
import Button from './Button'

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

// 카드에서 가장 먼저 읽히는 문장 -- 숫자가 아니라 "팀 안에서 어디쯤인지"를
// 쓴다. 평균 82점은 그 자체로 잘한 건지 알 수 없지만 "팀에서 가장 높다"는
// 바로 판단에 쓰인다.
const STANDING_TEXT: Record<PeerStanding, string> = {
  none: '받은 리뷰가 없습니다',
  top: '팀에서 가장 높게 평가받습니다',
  above: '팀 평균보다 높게 평가받습니다',
  average: '팀 평균 수준으로 평가받습니다',
  below: '팀 평균보다 낮게 평가받습니다',
  bottom: '팀에서 가장 낮게 평가받습니다',
}

const STANDING_STYLE: Record<PeerStanding, string> = {
  none: 'bg-gray-100 text-gray-500',
  top: 'bg-blue-50 text-blue-700',
  above: 'bg-blue-50 text-blue-700',
  average: 'bg-gray-100 text-gray-600',
  below: 'bg-orange-50 text-orange-700',
  bottom: 'bg-orange-50 text-orange-700',
}

// 근거를 얼마나 믿을 수 있는지. 갈리는 평가는 평균을 믿기 어려우니
// 팀장이 원문을 직접 봐야 한다는 신호다.
function agreementText(agreement: PeerAgreement, reviewerCount: number): string | null {
  if (agreement === 'unanimous') return `동료 ${reviewerCount}명 의견 일치`
  if (agreement === 'mostly') return '한 등급 안에서 일치'
  if (agreement === 'split') return '동료 간 평가 갈림'
  return null
}

function GradeChip({ grade, className = '' }: { grade: string; className?: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${GRADE_COLORS[grade as 'S']} ${className}`}>
      {grade}
    </span>
  )
}

interface PeerAlignmentCardsProps {
  rows: PeerFeedbackRow[]
  peerReviews: PeerReview[]
  onDeleteReview: (review: PeerReview) => void
}

// 팀원별로 "동료들이 이 사람을 어떻게 봤나"를 한 카드로 정리한다. 팀장이
// 스스로 판단할 근거를 주는 것이 목적이므로, 팀장에게 무엇을 입력하라고
// 요구하지 않는다. 원본 리뷰는 "근거 보기" 팝업에만 둔다.
export default function PeerAlignmentCards({ rows, peerReviews, onDeleteReview }: PeerAlignmentCardsProps) {
  const [detailRow, setDetailRow] = useState<PeerFeedbackRow | null>(null)
  const noReviews = rows.filter((r) => r.reviewCount === 0)

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-bold text-black">동료가 본 팀원</h4>
        <span className="text-xs text-gray-400">동료 평가가 높은 순</span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const agreement = agreementText(row.agreement, row.reviewerCount)
          const topComment = row.comments[0]
          return (
            <div key={row.member.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-black">{row.member.name}</span>
                {row.member.level && <span className="text-xs text-gray-400">{row.member.level}</span>}
                {row.grade && <GradeChip grade={row.grade} />}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STANDING_STYLE[row.standing]}`}>
                  {STANDING_TEXT[row.standing]}
                </span>
                {row.rank !== null && row.rankTotal > 1 && (
                  <span className="text-xs text-gray-400">
                    {row.rankTotal}명 중 {row.rank}위
                  </span>
                )}
                {row.reviewCount > 0 && (
                  <span className="ml-auto text-xs text-gray-400">
                    동료 {row.reviewerCount}명 · 과제 {row.taskCount}개
                  </span>
                )}
              </div>

              {row.reviewCount > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {/* 등급 분포 -- 평균 한 값보다 "S 3명, B 1명"이 훨씬 많은 걸
                      말해준다. 몰려 있으면 믿을 만하고, 퍼져 있으면 아니다. */}
                  <span className="flex items-center gap-1">
                    {row.gradeCounts.map(({ grade, count }) => (
                      <span key={grade} className="flex items-center gap-0.5">
                        <GradeChip grade={grade} />
                        <span className="text-xs text-gray-400">{count}</span>
                      </span>
                    ))}
                  </span>
                  {agreement && (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        row.agreement === 'split' ? 'bg-yellow-50 text-yellow-700' : 'text-gray-500'
                      }`}
                    >
                      {agreement}
                    </span>
                  )}
                </div>
              )}

              {/* 같은 사람이라도 과제마다 평이 갈리면 그게 핵심 정보다 --
                  "이 사람은 A다"보다 "이 일에는 강하고 저 일에는 약하다"가
                  면담에서 쓸 수 있는 말이다. */}
              {row.bestTask && row.worstTask && (
                <p className="mt-2 text-[13px] text-gray-600">
                  과제별로 갈립니다 · <span className="font-medium text-black">{row.bestTask.task.name}</span>{' '}
                  {row.bestTask.grades.join('·')} ↔ <span className="font-medium text-black">{row.worstTask.task.name}</span>{' '}
                  {row.worstTask.grades.join('·')}
                </p>
              )}

              {topComment && (
                <p className="mt-2 text-[13px] text-gray-600">
                  "{topComment.comment}"{' '}
                  <span className="text-gray-400">
                    — {topComment.reviewerName}
                    {row.comments.length > 1 && ` 외 ${row.comments.length - 1}건`}
                  </span>
                </p>
              )}

              {/* 기여도는 "동료가 본 몫"과 "지금 배분된 값"을 나란히 놓기만
                  한다. 배분값을 팀장이 직접 넣었는지는 데이터로 구분할 수 없어
                  (migrate에서 isAutoDistributed가 false로 떨어진다) 사람에게
                  귀속시키지 않는다. */}
              {row.peerContributionPercent !== null && (
                <p className="mt-1.5 text-[13px] text-gray-600">
                  동료가 본 기여도 평균{' '}
                  <span className="font-medium text-black">{row.peerContributionPercent.toFixed(0)}%</span>
                  {row.currentContributionPercent !== null &&
                    Math.abs(row.peerContributionPercent - row.currentContributionPercent) >= 10 && (
                      <span className="text-gray-500">
                        {' '}
                        · 현재 배분 {row.currentContributionPercent.toFixed(0)}%와{' '}
                        {Math.abs(row.peerContributionPercent - row.currentContributionPercent).toFixed(0)}%p 차이
                      </span>
                    )}
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

      {noReviews.length > 0 && (
        <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-500">
          아직 리뷰를 받지 못한 팀원 {noReviews.length}명 ·{' '}
          <span className="font-medium text-gray-700">{noReviews.map((r) => r.member.name).join(', ')}</span>
        </p>
      )}

      {detailRow && (
        <EvidenceDialog
          row={detailRow}
          peerReviews={peerReviews.filter((r) => r.targetMemberId === detailRow.member.id)}
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
  onDeleteReview,
  onClose,
}: {
  row: PeerFeedbackRow
  peerReviews: PeerReview[]
  onDeleteReview: (review: PeerReview) => void
  onClose: () => void
}) {
  const orphans = peerReviews.filter((r) => !r.taskId)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-black">{row.member.name} · 동료 리뷰 원문</h3>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {STANDING_TEXT[row.standing]} · 동료 {row.reviewerCount}명 · 리뷰 {row.reviewCount}건
            </p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-black">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {row.tasks.map((t) => {
            const reviews = peerReviews.filter((r) => r.taskId === t.task.id)
            const summary = summarizeTaskReviews(reviews)
            return (
              <div key={t.task.id} className="mb-4 rounded-lg border border-gray-200">
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                  <span className="text-sm font-semibold text-black">{t.task.name}</span>
                  <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                    {t.grades.map((g, i) => (
                      <GradeChip key={i} grade={g} />
                    ))}
                    {t.peerContributionPercent !== null && (
                      <span className="ml-1.5">기여도 {t.peerContributionPercent.toFixed(0)}%</span>
                    )}
                  </span>
                </div>

                {/* 표를 읽지 않아도 되도록, 이 과제에서 볼 것을 먼저 문장으로
                    말한다. 해당하는 상황이 없으면 문장을 만들지 않는다. */}
                {(summary.gradeLine || summary.contributionLine) && (
                  <div className="space-y-1 border-b border-gray-100 px-4 py-3">
                    {summary.gradeLine && <p className="text-[13px] text-black">{summary.gradeLine}</p>}
                    {summary.outlierComment && (
                      <p className="text-[13px] text-gray-600">
                        {summary.outlierComment.reviewerName}의 근거는 "{summary.outlierComment.comment}"
                        {summary.outlierComment.unique && ' \u2014 다른 리뷰어는 언급하지 않은 지점입니다.'}
                      </p>
                    )}
                    {summary.contributionLine && (
                      <p
                        className={`text-[13px] ${
                          Math.abs(summary.contributionSumGap) >= 2 ? 'text-orange-700' : 'text-gray-600'
                        }`}
                      >
                        {summary.contributionLine}
                      </p>
                    )}
                  </div>
                )}

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
                        <button onClick={() => onDeleteReview(r)} className="text-xs text-gray-400 hover:text-danger">
                          삭제
                        </button>
                      </div>
                      {r.comment && <p className="mt-1 text-[13px] text-gray-600">"{r.comment}"</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {orphans.length > 0 && (
            <div className="rounded-lg border border-gray-200">
              <p className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-black">
                과제 미상 (예전 데이터)
              </p>
              <ul className="divide-y divide-gray-100">
                {orphans.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="font-medium text-black">{r.reviewerName || '(작성자 미상)'}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[r.grade]}`}>
                      {r.grade}
                    </span>
                    <button onClick={() => onDeleteReview(r)} className="text-xs text-gray-400 hover:text-danger">
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

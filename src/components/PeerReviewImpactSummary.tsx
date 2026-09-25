import { ArrowRight } from 'lucide-react'
import { GRADE_COLORS, type PeerReviewImpact } from '../utils/calculations'
import { icSm } from './ui/icon'

// 이 화면 맨 위에 두는 요약 밴드. 리뷰 목록(로우데이터)을 읽기 전에 "그래서
// 피어리뷰가 이번 평가를 바꿨는가"를 먼저 답한다.
//
// 등급이 바뀐 사람이 헤드라인인 이유: 개인 계수(+3.2% 같은 값)는 전원이 비슷하게
// 받으면 팀 평균도 같이 올라가 아무것도 안 바뀐다. 팀장이 확인해야 할 것은
// "피어리뷰 때문에 결재할 등급이 달라진 사람이 누구인가" 하나다.
export default function PeerReviewImpactSummary({ impact }: { impact: PeerReviewImpact }) {
  if (impact.reviewCount === 0) return null

  const noReviews = impact.membersWithoutReviews
  // 등급은 그대로여도 팀 평균 대비 비율이 가장 많이 움직인 사람은 짚어준다 --
  // "아무 영향 없음"과 "경계선에 가까워졌음"은 다르다.
  const biggestShift = [...impact.rows]
    .filter((r) => r.gradeWith === r.gradeWithout)
    .sort((a, b) => Math.abs(b.ratioDeltaPercent) - Math.abs(a.ratioDeltaPercent))[0]

  return (
    <div className="mac-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-[13px] font-semibold text-label">피어리뷰가 평가에 미친 영향</h4>
        <span className="text-xs text-label-3">
          리뷰 {impact.reviewCount}건 · 반영 비율 {impact.weightPercent}%
        </span>
      </div>

      {/* 반영 비율이 0이면 계수가 전원 1.0이라 애초에 아무것도 못 바꾼다.
          "바뀐 사람 없음"으로만 두면 리뷰 내용이 서로 비슷해서 그런 줄로
          오해하므로, 원인을 그대로 말해준다. */}
      {impact.weightPercent === 0 ? (
        <p className="mt-2 text-[15px] text-label">
          피어리뷰 <span className="font-semibold text-danger">반영 비율이 0%</span>라 이 리뷰들은 평가 점수에 전혀
          반영되지 않습니다.
          <span className="text-label-2"> 반영하려면 좌측 평가 기준에서 피어리뷰 비율을 올리세요.</span>
        </p>
      ) : impact.changed.length > 0 ? (
        <>
          <p className="mt-2 text-[15px] text-label">
            피어리뷰로 최종 고과가 바뀐 팀원 <span className="font-semibold text-accent">{impact.changed.length}명</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {impact.changed.map((r) => {
              const up = r.ratioWith > r.ratioWithout
              return (
                <li
                  key={r.member.id}
                  className="flex items-center gap-1.5 rounded-control border border-separator px-2.5 py-1.5 text-[13px]"
                >
                  <span className="font-medium text-label">{r.member.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${GRADE_COLORS[r.gradeWithout]}`}>
                    {r.gradeWithout}
                  </span>
                  <ArrowRight {...icSm} className={up ? 'text-success' : 'text-danger'} />
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${GRADE_COLORS[r.gradeWith]}`}>
                    {r.gradeWith}
                  </span>
                  <span className="text-xs text-label-3">
                    {r.ratioDeltaPercent >= 0 ? '+' : ''}
                    {r.ratioDeltaPercent.toFixed(1)}%
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-label">
          피어리뷰로 <span className="font-semibold">최종 고과가 바뀐 팀원은 없습니다.</span>
          {biggestShift && Math.abs(biggestShift.ratioDeltaPercent) >= 0.05 && (
            <span className="text-label-2">
              {' '}
              가장 많이 움직인 건 {biggestShift.member.name}({biggestShift.ratioDeltaPercent >= 0 ? '+' : ''}
              {biggestShift.ratioDeltaPercent.toFixed(1)}%)이지만 {biggestShift.gradeWith} 등급 안에 머뭅니다.
            </span>
          )}
        </p>
      )}

      {noReviews.length > 0 && (
        <p className="mt-2 rounded-control bg-warning/10 px-3 py-2 text-[13px] text-warning">
          받은 리뷰가 없어 동료 의견이 반영되지 않은 팀원 {noReviews.length}명 ·{' '}
          <span className="font-medium">{noReviews.map((m) => m.name).join(', ')}</span>
        </p>
      )}
    </div>
  )
}

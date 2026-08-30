import { GRADE_COLORS, type PeerReviewImpact } from '../utils/calculations'

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-sm font-bold text-black">피어리뷰가 평가에 미친 영향</h4>
        <span className="text-xs text-gray-400">
          리뷰 {impact.reviewCount}건 · 반영 비율 {impact.weightPercent}%
        </span>
      </div>

      {/* 반영 비율이 0이면 계수가 전원 1.0이라 애초에 아무것도 못 바꾼다.
          "바뀐 사람 없음"으로만 두면 리뷰 내용이 서로 비슷해서 그런 줄로
          오해하므로, 원인을 그대로 말해준다. */}
      {impact.weightPercent === 0 ? (
        <p className="mt-2 text-[15px] text-black">
          피어리뷰 <span className="font-bold text-danger">반영 비율이 0%</span>라 이 리뷰들은 평가 점수에 전혀
          반영되지 않습니다.
          <span className="text-gray-500"> 반영하려면 좌측 평가 기준에서 피어리뷰 비율을 올리세요.</span>
        </p>
      ) : impact.changed.length > 0 ? (
        <>
          <p className="mt-2 text-[15px] text-black">
            피어리뷰로 최종 고과가 바뀐 팀원 <span className="font-bold text-accent">{impact.changed.length}명</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {impact.changed.map((r) => {
              const up = r.ratioWith > r.ratioWithout
              return (
                <li
                  key={r.member.id}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
                >
                  <span className="font-medium text-black">{r.member.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${GRADE_COLORS[r.gradeWithout]}`}>
                    {r.gradeWithout}
                  </span>
                  <ArrowRightIcon className={`h-3.5 w-3.5 ${up ? 'text-success' : 'text-danger'}`} />
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${GRADE_COLORS[r.gradeWith]}`}>
                    {r.gradeWith}
                  </span>
                  <span className="text-xs text-gray-400">
                    {r.ratioDeltaPercent >= 0 ? '+' : ''}
                    {r.ratioDeltaPercent.toFixed(1)}%
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-black">
          피어리뷰로 <span className="font-bold">최종 고과가 바뀐 팀원은 없습니다.</span>
          {biggestShift && Math.abs(biggestShift.ratioDeltaPercent) >= 0.05 && (
            <span className="text-gray-500">
              {' '}
              가장 많이 움직인 건 {biggestShift.member.name}({biggestShift.ratioDeltaPercent >= 0 ? '+' : ''}
              {biggestShift.ratioDeltaPercent.toFixed(1)}%)이지만 {biggestShift.gradeWith} 등급 안에 머뭅니다.
            </span>
          )}
        </p>
      )}

      {noReviews.length > 0 && (
        <p className="mt-2 rounded-md bg-orange-50 px-3 py-2 text-[13px] text-orange-700">
          받은 리뷰가 없어 동료 의견이 반영되지 않은 팀원 {noReviews.length}명 ·{' '}
          <span className="font-medium">{noReviews.map((m) => m.name).join(', ')}</span>
        </p>
      )}
    </div>
  )
}

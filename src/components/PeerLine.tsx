// 받은 피어리뷰가 점수에 어떻게 들어갔는지 한 줄로: "피어 88점 · ×0.94"(반영) / "피어 88점 · 미반영".
import type { peerSummaryOf } from '../utils/calculations'

export default function PeerLine({ summary }: { summary: ReturnType<typeof peerSummaryOf> }) {
  if (!summary) return <span className="block text-[11px] font-normal text-label-3">피어 없음</span>
  const { avgScore, count, factor, applied } = summary
  return (
    <span
      className="block text-[11px] font-normal text-label-2"
      title={
        applied
          ? `받은 피어리뷰 ${count}건 평균 ${avgScore.toFixed(1)}점 → 성과점수 × ${factor.toFixed(2)}`
          : `받은 피어리뷰 ${count}건 평균 ${avgScore.toFixed(1)}점 -- 기준 설정에서 피어리뷰를 켜면 점수에 반영됩니다`
      }
    >
      피어 <span className="tabular-nums text-label">{avgScore.toFixed(0)}점</span>
      {' · '}
      {applied ? <span className="tabular-nums font-semibold text-accent">×{factor.toFixed(2)}</span> : <span className="text-label-3">미반영</span>}
    </span>
  )
}

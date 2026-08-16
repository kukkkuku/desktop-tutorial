import type { PromotionReadiness } from '../utils/promotion'

// 결과/팀원 목록 등 기존 화면에 얹는 아주 작은 상태 배지. 승진점수 자체(예: "92%")를
// 노출하지 않고 "임박했다"는 상태만 알려준다 — 성과점수/승진점수 혼동 방지 원칙에 따라
// 원본 숫자를 반복 노출하지 않기 위함.
export default function PromotionBadge({ readiness }: { readiness: PromotionReadiness | null | undefined }) {
  if (!readiness || readiness.progressPercent < 90) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-promo/10 px-2 py-0.5 text-[11px] font-bold text-promo">
      승진 임박
    </span>
  )
}

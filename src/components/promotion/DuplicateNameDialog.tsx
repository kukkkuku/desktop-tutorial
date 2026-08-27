import { useState } from 'react'
import type { PromotionImportMatch } from '../../utils/promotionImport'
import type { PromotionManualPicks } from '../../hooks/useApplyPromotionHistory'
import Button from '../Button'

interface DuplicateNameDialogProps {
  // 동명이인 행만 담긴 배열. picks의 키는 이 배열의 인덱스이고, 호출부도
  // 같은 배열에만 적용하므로 이미 자동 반영된 행과 섞이지 않는다.
  matches: PromotionImportMatch[]
  onConfirm: (picks: PromotionManualPicks) => void
  onSkip: () => void
}

// 인사평가 이력은 이름만 맞으면 화면 없이 바로 반영되지만, 같은 이름의
// 팀원이 둘 이상이면 어느 쪽인지 앱이 정할 수 없다. 그때만 이 창을 띄워
// 해당 이름들에 대해서만 고르게 한다 -- 나머지 행은 이미 반영된 상태다.
export default function DuplicateNameDialog({ matches, onConfirm, onSkip }: DuplicateNameDialogProps) {
  const [picks, setPicks] = useState<PromotionManualPicks>({})
  const pickedCount = matches.filter((_, i) => picks[i]).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-black">같은 이름의 팀원이 있습니다</h3>
        <p className="mt-1 text-[13px] text-gray-500">
          아래 이름은 팀에 같은 이름이 여러 명이라 인사평가 이력을 자동으로 연결하지 못했습니다.
          어느 팀원인지 골라주세요. 고르지 않으면 해당 이름만 건너뜁니다.
        </p>

        <ul className="mt-4 space-y-2">
          {matches.map(({ sheet, candidates }, index) => {
            return (
              <li key={index} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-black">{sheet.name}</span>
                <span className="shrink-0 text-xs text-gray-400">{sheet.years.length}개 연도</span>
                <select
                  value={picks[index] ?? ''}
                  onChange={(e) => setPicks((p) => ({ ...p, [index]: e.target.value }))}
                  className="shrink-0 rounded-md border border-accent px-1.5 py-1 text-xs text-black"
                >
                  <option value="">{candidates.length}명 중 선택</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role || c.level || '역할 미지정'})
                    </option>
                  ))}
                </select>
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onSkip}>
            건너뛰기
          </Button>
          <Button variant="primary" onClick={() => onConfirm(picks)} disabled={pickedCount === 0}>
            {pickedCount > 0 ? `${pickedCount}명 적용` : '적용'}
          </Button>
        </div>
      </div>
    </div>
  )
}

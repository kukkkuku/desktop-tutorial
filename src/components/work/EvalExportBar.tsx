// 체크한 L3를 평가과제로 내보내는 아래쪽 막대. 묶음 = 평가과제 1개, 묶이지 않은 L3 = 1개씩.
// 분류가 섞였거나 빈 단위는 과제등급을 여기서 골라야 내보낼 수 있다(앱이 대신 고르지 않음).

import type { Importance } from '../../types'
import { IMPORTANCE_OPTIONS } from '../../types'
import type { ExportUnit } from '../../utils/evalExport'
import Button from '../Button'

interface Props {
  units: ExportUnit[]
  grades: Record<string, Importance>
  onGrade: (key: string, grade: Importance) => void
  canExport: boolean
  onExport: () => void
  onClear: () => void
}

export default function EvalExportBar({ units, grades, onGrade, canExport, onExport, onClear }: Props) {
  const l3 = units.reduce((n, u) => n + u.items.length, 0)
  const need = units.filter((u) => !u.grade)
  return (
    <div className="sticky bottom-4 z-30 mx-auto mt-2 max-w-4xl rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(17,19,24,.14)]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-black">
          평가과제 {units.length}개 <span className="font-normal text-gray-500">(L3 {l3}건)</span>
        </span>
        <span className="text-xs text-gray-500">묶음은 1개로, 나머지는 L3마다 1개씩 만듭니다. 성과등급은 평가과제 탭에서 매깁니다.</span>
        <span className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={onClear} className="px-3 py-1.5 text-xs">
            선택 해제
          </Button>
          <Button variant="primary" onClick={onExport} disabled={!canExport} className="px-3 py-1.5 text-xs">
            평가과제로 내보내기
          </Button>
        </span>
      </div>
      {need.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <p className="text-xs text-orange-700">과제등급을 골라 주세요 -- {need.length}개는 분류가 섞였거나 비어 있어 정할 수 없습니다.</p>
          <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
            {need.map((u) => (
              <li key={u.key} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="shrink-0 text-xs text-gray-400">{u.mixed ? '분류 섞임' : '분류 없음'}</span>
                <select
                  value={grades[u.key] ?? ''}
                  onChange={(e) => onGrade(u.key, e.target.value as Importance)}
                  className="h-7 rounded-md border border-gray-300 px-1.5 text-xs"
                >
                  <option value="">과제등급</option>
                  {IMPORTANCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

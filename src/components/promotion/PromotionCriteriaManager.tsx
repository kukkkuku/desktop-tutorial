import { useState } from 'react'
import type { EvaluationGrade } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { useResizableColumns } from '../../hooks/useResizableColumns'
import ResizableTh from '../table/ResizableTh'

const CRITERIA_COLUMNS = {
  fromLevel: 100,
  toLevel: 100,
  tenure: 110,
  requiredScore: 130,
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

// 성과평가 기준(CriteriaPanel)과는 완전히 분리된, 승진 기준 전용 관리 화면.
// 데이터>팀원 서브탭에서 진입한다 — 새로운 상위 메뉴를 만들지 않기 위함.
export default function PromotionCriteriaManager({ onClose }: { onClose: () => void }) {
  const { profile, setPromotionCriteria, setGradeScores } = useTeamProfile()
  const cols = useResizableColumns(CRITERIA_COLUMNS)
  const [criteria, setCriteria] = useState(profile.promotionCriteria)
  const [gradeScores, setLocalGradeScores] = useState(profile.gradeScores)

  function updateCriteriaField(index: number, field: 'tenureYears' | 'requiredScore', value: number) {
    setCriteria((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function handleSave() {
    setPromotionCriteria(criteria)
    setGradeScores(gradeScores)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">승진 기준 관리</h3>
            <p className="mt-1 text-[13px] text-gray-500">
              성과평가 기준(기준 설정)과는 별개인 승진 제도 기준입니다. 첨부된 승진 제도 자료를 기준으로 합니다.
            </p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          <h4 className="text-sm font-semibold text-black">직급별 승진자격기준</h4>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="table-fixed text-left text-sm" style={{ width: cols.totalWidth }}>
              <thead className="bg-[#F3F4F6] text-black">
                <tr>
                  {(
                    [
                      ['fromLevel', '현재직급'],
                      ['toLevel', '다음직급'],
                      ['tenure', '체류연한'],
                      ['requiredScore', '승진자격점수'],
                    ] as const
                  ).map(([key, label]) => (
                    <ResizableTh key={key} width={cols.widths[key]} onResizeStart={cols.startResize(key)} onResizeMove={cols.onResizeMove} onResizeEnd={cols.onResizeEnd} className="px-3 py-2 font-semibold">
                      {label}
                    </ResizableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {criteria.map((row, i) => (
                  <tr key={`${row.fromLevel}-${row.toLevel}`} className="border-t border-gray-200 text-black">
                    <td className="px-3 py-2 font-medium">{row.fromLevel}</td>
                    <td className="px-3 py-2">{row.toLevel}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={row.tenureYears}
                        onChange={(e) => updateCriteriaField(i, 'tenureYears', Number(e.target.value))}
                        className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                      />
                      년
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={row.requiredScore}
                        onChange={(e) => updateCriteriaField(i, 'requiredScore', Number(e.target.value))}
                        className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                      />
                      점
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5">
          <h4 className="text-sm font-semibold text-black">평가 등급 점수</h4>
          <p className="mt-0.5 text-[13px] text-gray-500">인사평가 등급을 승진점수로 환산할 때 쓰는 등급별 점수입니다.</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {PERFORMANCE_GRADE_OPTIONS.map((grade) => (
              <div key={grade}>
                <label className="block text-center text-xs font-semibold text-gray-500">{grade}</label>
                <input
                  type="number"
                  min={0}
                  value={gradeScores[grade]}
                  onChange={(e) =>
                    setLocalGradeScores((prev: Record<EvaluationGrade, number>) => ({ ...prev, [grade]: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-center text-sm text-black"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-100">
            취소
          </button>
          <button onClick={handleSave} className="rounded-md bg-promo px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

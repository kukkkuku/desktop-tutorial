import { useState } from 'react'
import type { EvaluationGrade } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { YEAR_WEIGHTS_BY_TENURE } from '../../utils/promotion'
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

// 성과평가 기준(CriteriaPanel)과는 완전히 분리된, 승진 기준 전용 화면. 예전엔
// "기준 보기"(조회 전용, 뱃지 나열)와 "승진 기준 관리"(수정용, 표)가 같은
// 내용을 서로 다른 레이아웃으로 두 번 보여줘서 헷갈렸다 -- 하나의 모달로
// 합치고, 보기/수정 모드 토글로 전환한다. 연차별 가중치는 고정 상수라
// 어느 모드에서든 참고용으로만 보여준다(편집 대상 아님).
export default function PromotionCriteriaManager({
  onClose,
  initialMode = 'view',
}: {
  onClose: () => void
  initialMode?: 'view' | 'edit'
}) {
  const { profile, setPromotionCriteria, setGradeScores } = useTeamProfile()
  const cols = useResizableColumns(CRITERIA_COLUMNS)
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode)
  const [criteria, setCriteria] = useState(profile.promotionCriteria)
  const [gradeScores, setLocalGradeScores] = useState(profile.gradeScores)

  function updateCriteriaField(index: number, field: 'tenureYears' | 'requiredScore', value: number) {
    setCriteria((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function handleSave() {
    setPromotionCriteria(criteria)
    setGradeScores(gradeScores)
    setMode('view')
  }

  function handleCancelEdit() {
    setCriteria(profile.promotionCriteria)
    setLocalGradeScores(profile.gradeScores)
    setMode('view')
  }

  const isEdit = mode === 'edit'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">승진 기준</h3>
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
            <table className="table-fixed text-left text-sm" style={{ width: '100%', minWidth: cols.totalWidth - cols.widths.requiredScore }}>
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
                    <ResizableTh
                      key={key}
                      width={key === 'requiredScore' ? undefined : cols.widths[key]}
                      onResizeStart={cols.startResize(key)}
                      onResizeMove={cols.onResizeMove}
                      onResizeEnd={cols.onResizeEnd}
                      className="px-3 py-2 font-semibold"
                    >
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
                      {isEdit ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            value={row.tenureYears}
                            onChange={(e) => updateCriteriaField(i, 'tenureYears', Number(e.target.value))}
                            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                          />
                          년
                        </>
                      ) : (
                        `${row.tenureYears}년`
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            value={row.requiredScore}
                            onChange={(e) => updateCriteriaField(i, 'requiredScore', Number(e.target.value))}
                            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                          />
                          점
                        </>
                      ) : (
                        `${row.requiredScore}점`
                      )}
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
          {isEdit ? (
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
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
              {PERFORMANCE_GRADE_OPTIONS.map((grade) => (
                <span key={grade} className="rounded bg-gray-100 px-2 py-1 font-mono text-gray-600">
                  {grade} {gradeScores[grade]}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <h4 className="text-sm font-semibold text-black">연차별 가중치</h4>
          <p className="mt-0.5 text-[13px] text-gray-500">최근 연도일수록 크게 반영되는 고정 참고값입니다(수정 대상 아님).</p>
          <div className="mt-2 space-y-1 text-[13px] text-gray-600">
            {Object.entries(YEAR_WEIGHTS_BY_TENURE).map(([years, weights]) => (
              <p key={years}>
                <span className="text-gray-400">{years}년:</span> {weights.map((w) => `${(w * 100).toFixed(0)}%`).join(' / ')}
              </p>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {isEdit ? (
            <>
              <button onClick={handleCancelEdit} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-100">
                취소
              </button>
              <button onClick={handleSave} className="rounded-md bg-promo px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                저장
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-black hover:bg-gray-100">
                닫기
              </button>
              <button onClick={() => setMode('edit')} className="rounded-md bg-promo px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                수정하기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

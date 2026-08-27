import { useState } from 'react'
import type { EvaluationGrade } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { YEAR_WEIGHTS_BY_TENURE } from '../../utils/promotion'
import { useResizableColumns } from '../../hooks/useResizableColumns'
import ResizableTh from '../table/ResizableTh'
import Button from '../Button'
import IconButton from '../IconButton'

const CRITERIA_COLUMNS = {
  fromLevel: 100,
  toLevel: 100,
  tenure: 110,
  requiredScore: 130,
}

// 체류년수별 가중치 표(YEAR_WEIGHTS_BY_TENURE)가 실제로 어떤 승진 트랙에
// 쓰이는지 -- 정기승진은 그 직급의 표준 체류년수를, 발탁승진(조기승진)은
// 한 단계 짧은 체류년수의 가중치 표를 그대로 가져다 쓴다. 첨부 자료의
// "가중치기준" 표 비고 칸 그대로다.
const TENURE_APPLIES_TO: Record<string, string> = {
  '3': '사원(정기), 대리(발탁)',
  '4': '대리(정기), 과장·차장(발탁)',
  '5': '과장·차장(정기)',
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
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">승진 기준</h3>
            <p className="mt-1 text-[13px] text-gray-500">
              성과평가 기준(기준 설정)과는 별개인 승진 제도 기준입니다. 첨부된 승진 제도 자료를 기준으로 합니다.
            </p>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <CloseIcon className="h-5 w-5" />
          </IconButton>
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
          <p className="mt-0.5 text-[13px] text-gray-500">
            인사평가 등급을 승진점수로 환산할 때 쓰는 등급별 점수입니다. <strong className="text-black">역량 등급은 이 점수의 2배</strong>로
            반영됩니다(업적(상)·업적(하)는 그대로, 역량만 ×2 — 인사평가 히스토리의 "역량 (×2)" 컬럼과 같은 계산입니다).
          </p>
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
            <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#F3F4F6] text-black">
                  <tr>
                    <th className="px-3 py-2 font-semibold">구분</th>
                    {PERFORMANCE_GRADE_OPTIONS.map((grade) => (
                      <th key={grade} className="px-3 py-2 text-center font-semibold">
                        {grade}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-200 text-black">
                    <td className="px-3 py-2 font-medium">업적(상/하)</td>
                    {PERFORMANCE_GRADE_OPTIONS.map((grade) => (
                      <td key={grade} className="px-3 py-2 text-center font-mono text-gray-600">
                        {gradeScores[grade].toFixed(1)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-200 text-black">
                    <td className="px-3 py-2 font-medium">역량 (×2)</td>
                    {PERFORMANCE_GRADE_OPTIONS.map((grade) => (
                      <td key={grade} className="px-3 py-2 text-center font-mono font-semibold text-accent">
                        {(gradeScores[grade] * 2).toFixed(1)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5">
          <h4 className="text-sm font-semibold text-black">연차별 가중치</h4>
          <p className="mt-0.5 text-[13px] text-gray-500">
            체류년수(정기/발탁 승진 트랙)에 따라 최근 연도일수록 크게 반영되는 고정 참고값입니다(수정 대상 아님).
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F3F4F6] text-black">
                <tr>
                  <th className="px-3 py-2 font-semibold">체류년수</th>
                  {['최근 1년차', '2년차', '3년차', '4년차', '5년차'].map((label) => (
                    <th key={label} className="px-3 py-2 text-center font-semibold">
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-semibold">적용 대상</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(YEAR_WEIGHTS_BY_TENURE).map(([years, weights]) => (
                  <tr key={years} className="border-t border-gray-200 text-black">
                    <td className="px-3 py-2 font-medium">{years}년</td>
                    {Array.from({ length: 5 }, (_, i) => weights[i]).map((w, i) => (
                      <td key={i} className="px-3 py-2 text-center font-mono text-gray-600">
                        {w !== undefined ? `${(w * 100).toFixed(0)}%` : '-'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-gray-500">{TENURE_APPLIES_TO[years] ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {isEdit ? (
            <>
              <Button variant="secondary" onClick={handleCancelEdit}>
                취소
              </Button>
              <Button variant="primary" onClick={handleSave}>
                저장
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                닫기
              </Button>
              <Button variant="primary" onClick={() => setMode('edit')}>
                수정하기
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

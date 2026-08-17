import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { EvaluationGrade, HRAppraisalRecord, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { findPromotionCriteria, gradeScore, resolveReviewYear, trendArrow, yearGradeSum } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import { useResizableColumns } from '../../hooks/useResizableColumns'
import ConfirmDialog from '../ConfirmDialog'
import ResizableTh from '../table/ResizableTh'

const APPRAISAL_COLUMNS = {
  year: 64,
  first: 96,
  second: 96,
  competency: 96,
  total: 72,
  manage: 120,
}

const GRADE_BADGE: Record<EvaluationGrade, string> = {
  S: 'text-blue-600 bg-blue-50',
  A: 'text-green-600 bg-green-50',
  B: 'text-yellow-600 bg-yellow-50',
  C: 'text-orange-600 bg-orange-50',
  D: 'text-red-600 bg-red-50',
}

interface DraftGrades {
  firstHalfGrade: EvaluationGrade | ''
  secondHalfGrade: EvaluationGrade | ''
  competencyGrade: EvaluationGrade | ''
}

const EMPTY_DRAFT: DraftGrades = { firstHalfGrade: '', secondHalfGrade: '', competencyGrade: '' }

// 등급 + 환산 점수를 한 칸에 같이 보여준다 -- 등급 보기/점수 보기를 오갈 필요
// 없이 항상 둘 다 눈에 들어오게 한다.
// multiplier -- 역량 등급은 승진점수 산정 시 2배로 가중된다(promotion.ts의
// yearGradeSum 그대로). 옆 숫자를 원점수 그대로 보여주면 실제 합계 계산에
//쓰이는 값과 달라 보여서 혼란스러웠다 -- 역량 컬럼만 multiplier={2}로
// 넘겨서 실제로 합계에 반영되는 점수를 그대로 보여준다.
function GradeScoreCell({
  grade,
  gradeScores,
  multiplier = 1,
}: {
  grade: EvaluationGrade | ''
  gradeScores: Record<EvaluationGrade, number>
  multiplier?: number
}) {
  if (!grade) return <span className="text-gray-300">-</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_BADGE[grade]}`}>{grade}</span>
      <span className="font-mono text-xs text-gray-500">{(gradeScores[grade] * multiplier).toFixed(1)}</span>
    </span>
  )
}

// 등급을 고르는 즉시 환산 점수가 옆에 따라온다 -- 등급 선택과 점수 계산을
// 분리된 화면(등급 보기/점수 보기 토글)으로 두지 않는다.
function InlineGradeSelect({
  value,
  onChange,
  gradeScores,
  multiplier = 1,
}: {
  value: EvaluationGrade | ''
  onChange: (v: EvaluationGrade | '') => void
  gradeScores: Record<EvaluationGrade, number>
  multiplier?: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as EvaluationGrade | '')}
        className="w-16 rounded-md border border-gray-300 px-1.5 py-1 text-sm text-black"
      >
        <option value="">-</option>
        {PERFORMANCE_GRADE_OPTIONS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <span className="font-mono text-xs text-gray-500">{value ? (gradeScores[value] * multiplier).toFixed(1) : '-'}</span>
    </div>
  )
}

// 회사 공식 인사평가 원장 -- 승진 시뮬레이션(PromotionSimulationPanel)의
// 재료가 되는 원본 기록. 승급심사 예정년도를 기준으로 최근 5개년을 기본
// 행으로 보여준다(기록이 없는 해도 빈 행 + "입력"). 그보다 오래된(또는
// 범위 밖의) 기록은 "더보기"를 눌러야 나온다. 수정/입력 모두 그 행에서
// 바로 인풋이 열리는 인라인 편집이다(다른 테이블 메뉴와 같은 방식).
export default function HRAppraisalHistoryPanel({ member }: { member: TeamMember }) {
  const { dispatch } = useAppState()
  const { profile, upsertAppraisal, deleteAppraisal } = useTeamProfile()
  const cols = useResizableColumns(APPRAISAL_COLUMNS)
  const records = profile.hrAppraisals
    .filter((r) => r.memberId === member.id)
    .sort((a, b) => a.year - b.year)

  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const reviewYear = resolveReviewYear(member.promotionReviewDate, criteria, levelTenureYears)
  const recentYears = Array.from({ length: 5 }, (_, i) => reviewYear - 1 - i)
  const recentYearSet = new Set(recentYears)
  const extraYears = Array.from(new Set(records.map((r) => r.year).filter((y) => !recentYearSet.has(y)))).sort((a, b) => b - a)

  const [editingYear, setEditingYear] = useState<number | null>(null)
  const [draft, setDraft] = useState<DraftGrades>(EMPTY_DRAFT)
  const [deleting, setDeleting] = useState<HRAppraisalRecord | null>(null)
  const [showAll, setShowAll] = useState(false)

  const displayYears = [...recentYears, ...(showAll ? extraYears : [])]
  const windowTotal = recentYears.reduce((sum, y) => {
    const r = records.find((rec) => rec.year === y)
    return sum + (r ? yearGradeSum(r, profile.gradeScores) : 0)
  }, 0)

  // 승급심사 예정년도를 이 설명 문구에서 바로 수정할 수 있게 한다 -- 상단
  // 요약바의 "승급일"(월 단위)과 같은 member.promotionReviewDate를 쓰므로
  // 어느 쪽에서 바꾸든 서로 반영된다. 월 값은 기존 값을 유지하고(없으면 1월)
  // 연도만 바꾼다.
  function changeReviewYear(year: number) {
    if (!Number.isFinite(year)) return
    const month = member.promotionReviewDate?.slice(5, 7) || '01'
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${year}-${month}` } })
  }

  function startEdit(year: number, record?: HRAppraisalRecord) {
    setEditingYear(year)
    setDraft(
      record
        ? { firstHalfGrade: record.firstHalfGrade, secondHalfGrade: record.secondHalfGrade, competencyGrade: record.competencyGrade }
        : EMPTY_DRAFT,
    )
  }

  function saveEdit(year: number, existingId?: string) {
    upsertAppraisal({
      id: existingId ?? uuidv4(),
      memberId: member.id,
      year,
      firstHalfGrade: draft.firstHalfGrade,
      secondHalfGrade: draft.secondHalfGrade,
      competencyGrade: draft.competencyGrade,
    })
    setEditingYear(null)
  }

  const draftTotal =
    gradeScore(draft.firstHalfGrade, profile.gradeScores) +
    gradeScore(draft.secondHalfGrade, profile.gradeScores) +
    gradeScore(draft.competencyGrade, profile.gradeScores) * 2
  const hasDraftGrade = draft.firstHalfGrade || draft.secondHalfGrade || draft.competencyGrade

  const achievementTrend = trendArrow(records.slice(-3).flatMap((r) => [r.firstHalfGrade, r.secondHalfGrade]))
  const competencyTrend = trendArrow(records.slice(-3).map((r) => r.competencyGrade))

  return (
    <div>
      <h4 className="text-sm font-bold text-black">인사평가 히스토리</h4>
      <p className="mt-0.5 text-[13px] text-gray-500">
        <input
          type="number"
          value={reviewYear}
          onChange={(e) => changeReviewYear(Number(e.target.value))}
          className="mx-0.5 w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-[13px] text-black"
        />
        년 승급심사 기준, {recentYears[recentYears.length - 1]}~{recentYears[0]}년 데이터를 보여줍니다.
      </p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
        <table className="table-fixed text-left text-sm" style={{ width: '100%', minWidth: cols.totalWidth }}>
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              {(
                [
                  ['year', '연도'],
                  ['first', '업적(상)'],
                  ['second', '업적(하)'],
                  ['competency', '역량 (×2)'],
                  ['total', '합계'],
                  ['manage', ''],
                ] as const
              ).map(([key, label]) => (
                <ResizableTh
                  key={key}
                  width={cols.widths[key]}
                  resizable={key !== 'manage'}
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
            {displayYears.map((year) => {
              const r = records.find((rec) => rec.year === year)
              const isEditing = editingYear === year

              if (isEditing) {
                return (
                  <tr key={`edit-${year}`} className="border-t border-gray-200 bg-orange-50/30 text-black">
                    <td className="px-3 py-2 font-medium">{year}</td>
                    <td className="px-3 py-2">
                      <InlineGradeSelect
                        value={draft.firstHalfGrade}
                        onChange={(v) => setDraft((d) => ({ ...d, firstHalfGrade: v }))}
                        gradeScores={profile.gradeScores}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineGradeSelect
                        value={draft.secondHalfGrade}
                        onChange={(v) => setDraft((d) => ({ ...d, secondHalfGrade: v }))}
                        gradeScores={profile.gradeScores}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineGradeSelect
                        value={draft.competencyGrade}
                        onChange={(v) => setDraft((d) => ({ ...d, competencyGrade: v }))}
                        gradeScores={profile.gradeScores}
                        multiplier={2}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">{hasDraftGrade ? draftTotal.toFixed(1) : '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => saveEdit(year, r?.id)} className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90">
                          저장
                        </button>
                        <button onClick={() => setEditingYear(null)} className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">
                          취소
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }

              if (!r) {
                return (
                  <tr key={`empty-${year}`} className="border-t border-gray-200 text-gray-300">
                    <td className="px-3 py-2 font-medium text-gray-400">{year}</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <button
                          onClick={() => startEdit(year)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          입력
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={r.id} className="border-t border-gray-200 text-black">
                  <td className="px-3 py-2 font-medium">{r.year}</td>
                  <td className="px-3 py-2">
                    <GradeScoreCell grade={r.firstHalfGrade} gradeScores={profile.gradeScores} />
                  </td>
                  <td className="px-3 py-2">
                    <GradeScoreCell grade={r.secondHalfGrade} gradeScores={profile.gradeScores} />
                  </td>
                  <td className="px-3 py-2">
                    <GradeScoreCell grade={r.competencyGrade} gradeScores={profile.gradeScores} multiplier={2} />
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold">{yearGradeSum(r, profile.gradeScores).toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => startEdit(year, r)} className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">
                        수정
                      </button>
                      <button onClick={() => setDeleting(r)} className="rounded-md border border-danger px-2 py-1 text-xs text-danger hover:bg-red-50">
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-black">
              <td className="px-3 py-2 font-semibold" colSpan={4}>
                최근 5개년 총합
              </td>
              <td className="px-3 py-2 font-mono font-bold">{windowTotal.toFixed(1)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {extraYears.length > 0 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-medium text-gray-400 hover:text-accent">
          {showAll ? '− 이전 기록 접기' : `이전 기록 ${extraYears.length}개 더보기 →`}
        </button>
      )}

      {records.length > 0 && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-black">
          <span className="text-gray-500">업적</span> {achievementTrend} &nbsp;&nbsp;
          <span className="text-gray-500">역량</span> {competencyTrend}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="인사평가 기록 삭제"
        message={`${deleting?.year}년 인사평가 기록을 삭제하시겠습니까?`}
        onConfirm={() => {
          if (deleting) deleteAppraisal(deleting.id)
          setDeleting(null)
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

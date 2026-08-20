import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { EvaluationGrade, HRAppraisalRecord, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { findPromotionCriteria, gradeScore, resolveReviewYear, trendArrow } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import ConfirmDialog from '../ConfirmDialog'

const COL_WIDTH = 104

interface DraftGrades {
  firstHalfGrade: EvaluationGrade | ''
  secondHalfGrade: EvaluationGrade | ''
  competencyGrade: EvaluationGrade | ''
}

const EMPTY_DRAFT: DraftGrades = { firstHalfGrade: '', secondHalfGrade: '', competencyGrade: '' }

function HalfCell({ grade, label, gradeScores }: { grade: EvaluationGrade | ''; label: string; gradeScores: Record<EvaluationGrade, number> }) {
  if (!grade) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 border-r border-gray-100 py-2 last:border-r-0">
        <p className="text-base text-gray-300">-</p>
        <p className="text-[11px] text-gray-400">{label}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 border-r border-gray-100 py-2 last:border-r-0">
      <p className="text-base font-extrabold text-black">{grade}</p>
      <p className="text-[11px] text-gray-400">{gradeScore(grade, gradeScores).toFixed(1)}</p>
    </div>
  )
}

function CompetencyCell({ grade, gradeScores }: { grade: EvaluationGrade | ''; gradeScores: Record<EvaluationGrade, number> }) {
  if (!grade) {
    return (
      <>
        <p className="text-base text-gray-300">-</p>
        <p className="text-[11px] text-gray-400">역량</p>
      </>
    )
  }
  return (
    <>
      <p className="text-base font-extrabold text-black">{grade}</p>
      <p className="text-[11px] text-gray-400">{(gradeScore(grade, gradeScores) * 2).toFixed(1)}</p>
    </>
  )
}

// 등급을 고르는 즉시 환산 점수가 옆에 따라온다 -- 컬럼 폭(104px) 안에 두 개를
// 나란히 넣어야 하는 반기 편집칸이라 select 자체는 최대한 좁게 잡는다.
function CompactGradeSelect({
  value,
  onChange,
  className,
}: {
  value: EvaluationGrade | ''
  onChange: (v: EvaluationGrade | '') => void
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as EvaluationGrade | '')}
      className={`rounded border border-gray-300 py-0.5 text-center text-xs text-black ${className ?? 'w-11'}`}
    >
      <option value="">-</option>
      {PERFORMANCE_GRADE_OPTIONS.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  )
}

// 회사 공식 인사평가 원장 -- 승진 시뮬레이션(PromotionSimulationPanel)의
// 재료가 되는 원본 기록. 승급심사 예정년도를 기준으로 최근 5개년을 컬럼으로
// 나란히 보여준다(Figma의 performance-review-table 그대로: 연도를 컬럼으로
// 눕히고, 맨 오른쪽에 강조색 총합 컬럼을 붙인다). 기록이 없는 해도 빈
// 컬럼 + "입력"으로 보여준다. 그보다 오래된(범위 밖) 기록은 "더보기"를
// 눌러야 나온다. 수정/입력 모두 그 컬럼에서 바로 인풋이 열리는 인라인
// 편집이다.
export default function HRAppraisalHistoryPanel({ member }: { member: TeamMember }) {
  const { dispatch } = useAppState()
  const { profile, upsertAppraisal, deleteAppraisal } = useTeamProfile()
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
  const achievementTotal = recentYears.reduce((sum, y) => {
    const r = records.find((rec) => rec.year === y)
    return sum + (r ? gradeScore(r.firstHalfGrade, profile.gradeScores) + gradeScore(r.secondHalfGrade, profile.gradeScores) : 0)
  }, 0)
  const competencyTotal = recentYears.reduce((sum, y) => {
    const r = records.find((rec) => rec.year === y)
    return sum + (r ? gradeScore(r.competencyGrade, profile.gradeScores) * 2 : 0)
  }, 0)
  const windowTotal = achievementTotal + competencyTotal

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

      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {/* 헤더 -- 연도 컬럼 + 총합 */}
        <div className="flex min-w-max">
          <div className="flex">
            {displayYears.map((y) => (
              <div key={y} style={{ width: COL_WIDTH }} className="flex h-9 shrink-0 items-center justify-center border-r border-b border-gray-100 text-sm font-semibold text-gray-500">
                {y}
              </div>
            ))}
            <div style={{ width: COL_WIDTH }} className="flex h-9 shrink-0 flex-col items-center justify-center border-b border-gray-200 bg-yellow-50 py-1 text-orange-600">
              <span className="text-sm font-bold">총합</span>
              <span className="font-mono text-xs font-bold">{windowTotal.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* 업적(상/하) */}
        <div className="flex min-w-max">
          {displayYears.map((y) => {
            const r = records.find((rec) => rec.year === y)
            const isEditing = editingYear === y
            return (
              <div key={y} style={{ width: COL_WIDTH }} className="flex shrink-0 border-r border-b border-gray-100">
                {isEditing ? (
                  <div className="flex flex-1 items-center justify-center gap-1 py-2">
                    <CompactGradeSelect value={draft.firstHalfGrade} onChange={(v) => setDraft((d) => ({ ...d, firstHalfGrade: v }))} />
                    <CompactGradeSelect value={draft.secondHalfGrade} onChange={(v) => setDraft((d) => ({ ...d, secondHalfGrade: v }))} />
                  </div>
                ) : (
                  <>
                    <HalfCell grade={r?.firstHalfGrade ?? ''} label="상" gradeScores={profile.gradeScores} />
                    <HalfCell grade={r?.secondHalfGrade ?? ''} label="하" gradeScores={profile.gradeScores} />
                  </>
                )}
              </div>
            )
          })}
          <div style={{ width: COL_WIDTH }} className="flex shrink-0 flex-col items-center justify-center gap-1 border-b border-gray-200 bg-yellow-50 py-2">
            <p className="text-base font-bold text-black">{achievementTotal.toFixed(1)}</p>
            <p className="text-[11px] text-gray-400">업적</p>
          </div>
        </div>

        {/* 역량 (×2) */}
        <div className="flex min-w-max">
          {displayYears.map((y) => {
            const r = records.find((rec) => rec.year === y)
            const isEditing = editingYear === y
            return (
              <div key={y} style={{ width: COL_WIDTH }} className="flex shrink-0 flex-col items-center justify-center gap-1 border-r border-b border-gray-100 py-2">
                {isEditing ? (
                  <CompactGradeSelect value={draft.competencyGrade} onChange={(v) => setDraft((d) => ({ ...d, competencyGrade: v }))} className="w-16" />
                ) : (
                  <CompetencyCell grade={r?.competencyGrade ?? ''} gradeScores={profile.gradeScores} />
                )}
              </div>
            )
          })}
          <div style={{ width: COL_WIDTH }} className="flex shrink-0 flex-col items-center justify-center gap-1 border-b border-gray-200 bg-yellow-50 py-2">
            <p className="text-base font-bold text-black">{competencyTotal.toFixed(1)}</p>
            <p className="text-[11px] text-gray-400">역량 (×2)</p>
          </div>
        </div>

        {/* 관리 -- 입력 / 수정·삭제 / 저장·취소 */}
        <div className="flex min-w-max">
          {displayYears.map((y) => {
            const r = records.find((rec) => rec.year === y)
            const isEditing = editingYear === y
            return (
              <div key={y} style={{ width: COL_WIDTH }} className="flex shrink-0 items-center justify-center gap-1 border-r border-gray-100 py-1.5">
                {isEditing ? (
                  <>
                    <button onClick={() => saveEdit(y, r?.id)} title="저장" aria-label="저장" className="rounded px-1.5 py-0.5 text-xs font-semibold text-accent hover:bg-blue-50">
                      저장
                    </button>
                    <button onClick={() => setEditingYear(null)} title="취소" aria-label="취소" className="rounded px-1.5 py-0.5 text-xs font-medium text-gray-400 hover:bg-gray-50">
                      취소
                    </button>
                  </>
                ) : r ? (
                  <>
                    <button onClick={() => startEdit(y, r)} title="수정" aria-label="수정" className="rounded px-1.5 py-0.5 text-xs font-medium text-gray-400 hover:bg-gray-50 hover:text-black">
                      수정
                    </button>
                    <button onClick={() => setDeleting(r)} title="삭제" aria-label="삭제" className="rounded px-1.5 py-0.5 text-xs font-medium text-gray-400 hover:bg-red-50 hover:text-red-600">
                      삭제
                    </button>
                  </>
                ) : (
                  <button onClick={() => startEdit(y)} className="rounded px-1.5 py-0.5 text-xs font-semibold text-accent hover:bg-blue-50">
                    입력
                  </button>
                )}
              </div>
            )
          })}
          <div style={{ width: COL_WIDTH }} className="shrink-0 bg-yellow-50" />
        </div>
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

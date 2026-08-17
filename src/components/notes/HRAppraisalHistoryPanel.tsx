import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { EvaluationGrade, HRAppraisalRecord, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { findPromotionCriteria, resolveReviewYear, trendArrow } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import { useResizableColumns } from '../../hooks/useResizableColumns'
import ConfirmDialog from '../ConfirmDialog'
import ResizableTh from '../table/ResizableTh'

const APPRAISAL_COLUMNS = {
  year: 90,
  first: 100,
  second: 100,
  competency: 90,
  manage: 130,
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

function InlineGradeSelect({ value, onChange }: { value: EvaluationGrade | ''; onChange: (v: EvaluationGrade | '') => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as EvaluationGrade | '')}
      className="w-full rounded-md border border-gray-300 px-1.5 py-1 text-sm text-black"
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
// 재료가 되는 원본 기록. 승급심사 예정년도를 기준으로 최근 5개년을 항상
// 행으로 보여준다(기록이 없는 해도 빈 행 + "입력"). 수정/입력 모두 그 행에서
// 바로 인풋이 열리는 인라인 편집이다(다른 테이블 메뉴와 같은 방식).
export default function HRAppraisalHistoryPanel({ member }: { member: TeamMember }) {
  const { profile, upsertAppraisal, deleteAppraisal } = useTeamProfile()
  const cols = useResizableColumns(APPRAISAL_COLUMNS)
  const records = profile.hrAppraisals
    .filter((r) => r.memberId === member.id)
    .sort((a, b) => a.year - b.year)

  // 승급심사 예정년도 기준 최근 5개년은 항상 행으로 보여준다 -- 기록이 없는 해도
  // 빈 행 + 입력 버튼으로 표시해서 팀장이 예측 입력을 채워 넣기 쉽게 한다. 5년보다
  // 더 오래된 기록도 있으면 그대로 이어서 보여준다.
  const criteria = findPromotionCriteria(member.level, profile.promotionCriteria)
  const levelTenureYears = calcYearsSince(member.currentLevelSince)
  const reviewYear = resolveReviewYear(member.promotionReviewDate, criteria, levelTenureYears)
  const recentYears = Array.from({ length: 5 }, (_, i) => reviewYear - 1 - i)
  const displayYears = Array.from(new Set([...recentYears, ...records.map((r) => r.year)])).sort((a, b) => b - a)

  const [editingYear, setEditingYear] = useState<number | null>(null)
  const [draft, setDraft] = useState<DraftGrades>(EMPTY_DRAFT)
  const [deleting, setDeleting] = useState<HRAppraisalRecord | null>(null)
  const [view, setView] = useState<'grade' | 'score'>('grade')

  // 등급 보기: 등급 배지. 점수 보기: 승진 계산에 쓰는 등급점수(S=5..D=1) 숫자.
  function renderCell(grade: EvaluationGrade | '') {
    if (!grade) return <span className="text-gray-300">-</span>
    if (view === 'score') return <span className="font-mono font-semibold text-gray-700">{profile.gradeScores[grade].toFixed(1)}</span>
    return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_BADGE[grade]}`}>{grade}</span>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-black">공식 인사평가 이력</h4>
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs">
          <button
            onClick={() => setView('grade')}
            className={`px-2.5 py-1 font-medium ${view === 'grade' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            등급 보기
          </button>
          <button
            onClick={() => setView('score')}
            className={`px-2.5 py-1 font-medium ${view === 'score' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            점수 보기
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-[13px] text-gray-500">
        앱이 계산하는 성과평가 결과와는 별개인, 회사 공식 인사평가 기록입니다. 승급심사 예정년도({reviewYear}년) 기준 최근 5개년을 보여줍니다.
      </p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
        <table className="table-fixed text-left text-sm" style={{ width: '100%', minWidth: cols.totalWidth - cols.widths.competency }}>
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              {(
                [
                  ['year', '연도'],
                  ['first', '업적(상)'],
                  ['second', '업적(하)'],
                  ['competency', '역량'],
                  ['manage', ''],
                ] as const
              ).map(([key, label]) => (
                <ResizableTh
                  key={key}
                  width={key === 'competency' ? undefined : cols.widths[key]}
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
                      <InlineGradeSelect value={draft.firstHalfGrade} onChange={(v) => setDraft((d) => ({ ...d, firstHalfGrade: v }))} />
                    </td>
                    <td className="px-3 py-2">
                      <InlineGradeSelect value={draft.secondHalfGrade} onChange={(v) => setDraft((d) => ({ ...d, secondHalfGrade: v }))} />
                    </td>
                    <td className="px-3 py-2">
                      <InlineGradeSelect value={draft.competencyGrade} onChange={(v) => setDraft((d) => ({ ...d, competencyGrade: v }))} />
                    </td>
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
                  <td className="px-3 py-2">{renderCell(r.firstHalfGrade)}</td>
                  <td className="px-3 py-2">{renderCell(r.secondHalfGrade)}</td>
                  <td className="px-3 py-2">{renderCell(r.competencyGrade)}</td>
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
        </table>
      </div>

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

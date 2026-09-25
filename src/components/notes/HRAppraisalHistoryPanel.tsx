import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Check, ChevronDown, ChevronUp, Pencil, Trash2, X } from 'lucide-react'
import type { EvaluationGrade, HRAppraisalRecord, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { findPromotionCriteria, gradeScore, resolveReviewYear, trendArrow, yearGradeSum } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import { useResizableColumns } from '../../hooks/useResizableColumns'
import ConfirmDialog from '../ConfirmDialog'
import ResizableTh from '../table/ResizableTh'
import Button from '../Button'
import IconButton from '../IconButton'
import { ic, icSm } from '../ui/icon'

const APPRAISAL_COLUMNS = {
  year: 56,
  first: 82,
  second: 82,
  competency: 82,
  total: 64,
  manage: 90,
}

const GRADE_BADGE: Record<EvaluationGrade, string> = {
  S: 'text-accent bg-accent-soft',
  A: 'text-success bg-success/[0.08]',
  B: 'text-label-2 bg-black/[0.05]',
  C: 'text-warning bg-warning/10',
  D: 'text-danger bg-danger/[0.06]',
}

interface DraftGrades {
  firstHalfGrade: EvaluationGrade | ''
  secondHalfGrade: EvaluationGrade | ''
  competencyGrade: EvaluationGrade | ''
}

const EMPTY_DRAFT: DraftGrades = { firstHalfGrade: '', secondHalfGrade: '', competencyGrade: '' }

// 보조지표 -- 승진서열화점수에 그대로 합산되는 입력값(직책/상벌/체류/교육).
// 인사평가 히스토리 표(최근 5개년 총합)의 재료 중 하나라, 그 총합 바로
// 아래에 둔다.
const AUX_KEYS = [
  { key: 'position', label: '직책' },
  { key: 'reward', label: '상벌' },
  { key: 'tenure', label: '체류' },
  { key: 'education', label: '교육' },
] as const
type AuxKey = (typeof AUX_KEYS)[number]['key']

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
  if (!grade) return <span className="text-label-3">-</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`mac-badge ${GRADE_BADGE[grade]}`}>{grade}</span>
      <span className="text-[13px] tabular-nums text-label-2">{(gradeScores[grade] * multiplier).toFixed(1)}</span>
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
        className="h-8 rounded-control border border-hairline px-2.5 text-[13px] w-16 text-label"
      >
        <option value="">-</option>
        {PERFORMANCE_GRADE_OPTIONS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <span className="text-[13px] tabular-nums text-label-2">{value ? (gradeScores[value] * multiplier).toFixed(1) : '-'}</span>
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

  const auxSum = (member.auxScores?.position ?? 0) + (member.auxScores?.reward ?? 0) + (member.auxScores?.tenure ?? 0) + (member.auxScores?.education ?? 0)
  function setAux(key: AuxKey, value: string) {
    const n = value === '' ? 0 : Number(value)
    if (!Number.isFinite(n)) return
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, auxScores: { ...member.auxScores, [key]: n } } })
  }

  return (
    <div>
      <p className="text-[13px] text-label-2">
        <input
          type="number"
          value={reviewYear}
          onChange={(e) => changeReviewYear(Number(e.target.value))}
          className="h-8 rounded-control border border-hairline px-2.5 text-[13px] mx-0.5 w-14 text-center text-label"
        />
        년 승급심사 기준, {recentYears[recentYears.length - 1]}~{recentYears[0]}년 데이터를 보여줍니다.
      </p>

      <div className="mt-3 overflow-x-auto rounded-card border border-separator">
        <table className="table-fixed text-left text-[13px]" style={{ width: '100%', minWidth: cols.totalWidth }}>
          <thead className="bg-[#F7F7F9] text-label-2">
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
                  <tr key={`edit-${year}`} className="border-t border-separator bg-accent-soft/40 text-label">
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
                    <td className="px-3 py-2 font-semibold tabular-nums">{hasDraftGrade ? draftTotal.toFixed(1) : '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconButton onClick={() => saveEdit(year, r?.id)} title="저장" aria-label="저장">
                          <Check {...ic} />
                        </IconButton>
                        <IconButton onClick={() => setEditingYear(null)} title="취소" aria-label="취소" tone="danger">
                          <X {...ic} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                )
              }

              if (!r) {
                return (
                  <tr key={`empty-${year}`} className="border-t border-separator text-label-3">
                    <td className="px-3 py-2 font-medium text-label-3">{year}</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={() => startEdit(year)}>
                          입력
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={r.id} className="border-t border-separator text-label">
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
                  <td className="px-3 py-2 font-semibold tabular-nums">{yearGradeSum(r, profile.gradeScores).toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconButton onClick={() => startEdit(year, r)} title="수정" aria-label="수정">
                        <Pencil {...ic} />
                      </IconButton>
                      <span className="h-4 w-px bg-black/[0.08]" />
                      <IconButton onClick={() => setDeleting(r)} title="삭제" aria-label="삭제" tone="danger">
                        <Trash2 {...ic} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-separator bg-[#F7F7F9] text-label">
              <td className="px-3 py-2 font-semibold" colSpan={4}>
                최근 5개년 총합
              </td>
              <td className="px-3 py-2 font-semibold tabular-nums">{windowTotal.toFixed(1)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-separator bg-[#F7F7F9] px-3 py-2.5">
        <p className="shrink-0 text-[13px] font-semibold text-label">보조지표</p>
        {AUX_KEYS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1.5 text-[13px] text-label-2">
            {label}
            <input
              type="number"
              value={member.auxScores?.[key] ?? ''}
              onChange={(e) => setAux(key, e.target.value)}
              placeholder="0"
              className="h-8 rounded-control border border-hairline px-2.5 text-[13px] w-16 text-label"
            />
          </label>
        ))}
        <span className="ml-auto shrink-0 text-[13px] text-label-2">합계 {auxSum}점</span>
      </div>

      {extraYears.length > 0 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 flex items-center gap-1 text-[13px] font-medium text-label-2 hover:text-accent">
          {showAll ? <ChevronUp {...icSm} /> : <ChevronDown {...icSm} />}
          {showAll ? '이전 기록 접기' : `이전 기록 ${extraYears.length}개 더보기`}
        </button>
      )}

      {records.length > 0 && (
        <div className="mt-2 rounded-card bg-[#F7F7F9] px-3 py-2 text-[13px] text-label">
          <span className="text-label-2">업적</span> {achievementTrend} &nbsp;&nbsp;
          <span className="text-label-2">역량</span> {competencyTrend}
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

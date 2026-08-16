import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { EvaluationGrade, HRAppraisalRecord, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useTeamProfile } from '../../state/TeamContext'
import { trendArrow } from '../../utils/promotion'
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

interface FormValues {
  year: string
  firstHalfGrade: EvaluationGrade | ''
  secondHalfGrade: EvaluationGrade | ''
  competencyGrade: EvaluationGrade | ''
}

const EMPTY_FORM: FormValues = { year: String(new Date().getFullYear()), firstHalfGrade: '', secondHalfGrade: '', competencyGrade: '' }

function GradeSelect({
  value,
  onChange,
  label,
}: {
  value: EvaluationGrade | ''
  onChange: (v: EvaluationGrade | '') => void
  label: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as EvaluationGrade | '')}
        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
      >
        <option value="">-</option>
        {PERFORMANCE_GRADE_OPTIONS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  )
}

// 회사 공식 인사평가 원장 -- 승진 시뮬레이션(PromotionSimulationPanel)의
// 재료가 되는 원본 기록. "과거 성과 보기"에서 보조적으로 열람/수정한다.
export default function HRAppraisalHistoryPanel({ member }: { member: TeamMember }) {
  const { profile, upsertAppraisal, deleteAppraisal } = useTeamProfile()
  const cols = useResizableColumns(APPRAISAL_COLUMNS)
  const records = profile.hrAppraisals
    .filter((r) => r.memberId === member.id)
    .sort((a, b) => a.year - b.year)

  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<HRAppraisalRecord | null>(null)

  function resetForm() {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditingId(null)
  }

  function startEdit(record: HRAppraisalRecord) {
    setEditingId(record.id)
    setForm({
      year: String(record.year),
      firstHalfGrade: record.firstHalfGrade,
      secondHalfGrade: record.secondHalfGrade,
      competencyGrade: record.competencyGrade,
    })
    setFormError('')
  }

  function handleSave() {
    const year = Number(form.year)
    if (!Number.isFinite(year) || year < 2000) {
      setFormError('연도를 올바르게 입력하세요.')
      return
    }
    if (!editingId && records.some((r) => r.year === year)) {
      setFormError(`${year}년 기록이 이미 있습니다. 목록에서 수정하세요.`)
      return
    }
    upsertAppraisal({
      id: editingId ?? uuidv4(),
      memberId: member.id,
      year,
      firstHalfGrade: form.firstHalfGrade,
      secondHalfGrade: form.secondHalfGrade,
      competencyGrade: form.competencyGrade,
    })
    resetForm()
  }

  const achievementTrend = trendArrow(records.slice(-3).flatMap((r) => [r.firstHalfGrade, r.secondHalfGrade]))
  const competencyTrend = trendArrow(records.slice(-3).map((r) => r.competencyGrade))

  return (
    <div>
      <h4 className="text-sm font-bold text-black">공식 인사평가 이력</h4>
      <p className="mt-0.5 text-[13px] text-gray-500">앱이 계산하는 성과평가 결과와는 별개인, 회사 공식 인사평가 기록입니다.</p>

      {records.length === 0 ? (
        <p className="mt-3 rounded-md bg-gray-50 px-4 py-4 text-center text-[13px] text-gray-500">아직 등록된 인사평가 기록이 없습니다.</p>
      ) : (
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
              {[...records].reverse().map((r) => (
                <tr key={r.id} className="border-t border-gray-200 text-black">
                  <td className="px-3 py-2 font-medium">{r.year}</td>
                  <td className="px-3 py-2">
                    {r.firstHalfGrade ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_BADGE[r.firstHalfGrade]}`}>{r.firstHalfGrade}</span> : '-'}
                  </td>
                  <td className="px-3 py-2">
                    {r.secondHalfGrade ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_BADGE[r.secondHalfGrade]}`}>{r.secondHalfGrade}</span> : '-'}
                  </td>
                  <td className="px-3 py-2">
                    {r.competencyGrade ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_BADGE[r.competencyGrade]}`}>{r.competencyGrade}</span> : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => startEdit(r)} className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">
                        수정
                      </button>
                      <button onClick={() => setDeleting(r)} className="rounded-md border border-danger px-2 py-1 text-xs text-danger hover:bg-red-50">
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-black">
          <span className="text-gray-500">업적</span> {achievementTrend} &nbsp;&nbsp;
          <span className="text-gray-500">역량</span> {competencyTrend}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-5 sm:items-end">
        <div>
          <label className="block text-[11px] font-medium text-gray-400">연도</label>
          <input
            type="number"
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
          />
        </div>
        <GradeSelect label="업적(상)" value={form.firstHalfGrade} onChange={(v) => setForm((f) => ({ ...f, firstHalfGrade: v }))} />
        <GradeSelect label="업적(하)" value={form.secondHalfGrade} onChange={(v) => setForm((f) => ({ ...f, secondHalfGrade: v }))} />
        <GradeSelect label="역량" value={form.competencyGrade} onChange={(v) => setForm((f) => ({ ...f, competencyGrade: v }))} />
        <div className="flex gap-1.5">
          <button onClick={handleSave} className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            {editingId ? '저장' : '추가'}
          </button>
          {editingId && (
            <button onClick={resetForm} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100">
              취소
            </button>
          )}
        </div>
      </div>
      {formError && <p className="mt-1.5 text-xs text-danger">{formError}</p>}

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

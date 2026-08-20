import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { TeamMember } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { matchToMembers, parsePromotionHistoryWorkbook, type PromotionImportMatch } from '../../utils/promotionImport'
import { useResizableColumns } from '../../hooks/useResizableColumns'
import Spinner from '../Spinner'
import ResizableTh from '../table/ResizableTh'
import Button from '../Button'
import IconButton from '../IconButton'

const PREVIEW_COLUMNS = {
  sheet: 100,
  name: 110,
  match: 150,
  years: 100,
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

interface AppliedSummary {
  memberCount: number
  yearCount: number
  skipped: number
}

// 승진 시뮬레이션 Excel(시트당 팀원 1명, 연도별 업적·역량 등급)을 읽어 이름이
// 일치하는 기존 팀원에게 인사평가 이력을 바로 적용한다. 새 팀원을 만들지 않고,
// 적용 전 매칭 결과를 미리 보여준다.
export default function PromotionHistoryImportModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAppState()
  const { profile, upsertAppraisal } = useTeamProfile()
  const cols = useResizableColumns(PREVIEW_COLUMNS)
  const [matches, setMatches] = useState<PromotionImportMatch[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applyHireDate, setApplyHireDate] = useState(true)
  const [applied, setApplied] = useState<AppliedSummary | null>(null)
  const [dragActive, setDragActive] = useState(false)

  async function handleFile(file: File) {
    setLoading(true)
    setError('')
    setApplied(null)
    try {
      const buffer = await file.arrayBuffer()
      const sheets = parsePromotionHistoryWorkbook(buffer)
      if (sheets.length === 0) {
        setError('이 파일에서 팀원별 인사평가 데이터를 찾지 못했습니다. 승진 시뮬레이션 Excel 형식인지 확인하세요.')
        setMatches(null)
      } else {
        setMatches(matchToMembers(sheets, state.members))
        setFileName(file.name)
      }
    } catch {
      setError('파일을 읽는 중 문제가 발생했습니다.')
      setMatches(null)
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (!matches) return
    let memberCount = 0
    let yearCount = 0
    for (const { sheet, member } of matches) {
      if (!member) continue
      memberCount += 1
      for (const y of sheet.years) {
        const existing = profile.hrAppraisals.find((r) => r.memberId === member.id && r.year === y.year)
        upsertAppraisal({
          id: existing?.id ?? uuidv4(),
          memberId: member.id,
          year: y.year,
          firstHalfGrade: y.firstHalfGrade,
          secondHalfGrade: y.secondHalfGrade,
          competencyGrade: y.competencyGrade,
        })
        yearCount += 1
      }
      if (applyHireDate) {
        const patch: Partial<TeamMember> = {}
        if (sheet.hireDate && !member.hireDate) patch.hireDate = sheet.hireDate
        if (sheet.promotionReviewDate && !member.promotionReviewDate) patch.promotionReviewDate = sheet.promotionReviewDate
        if (sheet.auxScores && !member.auxScores) patch.auxScores = sheet.auxScores
        if (Object.keys(patch).length > 0) dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, ...patch } })
      }
    }
    setApplied({ memberCount, yearCount, skipped: matches.length - memberCount })
  }

  const matchedCount = matches?.filter((m) => m.member).length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">인사평가 이력 엑셀로 가져오기</h3>
            <p className="mt-1 text-[13px] text-gray-500">
              승진 시뮬레이션 Excel의 팀원별 연도별 평가등급(업적 상/하, 역량)과 승급심사일, 보조지표를 읽어,
              이름이 일치하는 현재 팀원에게 바로 적용합니다.
            </p>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>

        {!matches && (
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragActive ? 'border-accent bg-gray-100' : 'border-gray-300 hover:border-accent'
            }`}
          >
            {loading ? (
              <Spinner className="h-6 w-6 text-accent" />
            ) : (
              <>
                <span className="text-sm font-medium text-black">
                  {dragActive ? '여기에 놓아 업로드' : '클릭하거나 파일을 끌어다 놓으세요'}
                </span>
                <span className="text-xs text-gray-400">.xlsx</span>
              </>
            )}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {matches && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 text-[13px] text-gray-500">
              <span>{fileName}</span>
              <button
                onClick={() => {
                  setMatches(null)
                  setApplied(null)
                }}
                className="text-accent hover:underline"
              >
                다른 파일 선택
              </button>
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
              <table className="table-fixed text-left text-sm" style={{ width: '100%', minWidth: cols.totalWidth - cols.widths.match }}>
                <thead className="bg-[#F3F4F6] text-black">
                  <tr>
                    {(
                      [
                        ['sheet', '시트'],
                        ['name', '이름'],
                        ['match', '매칭'],
                        ['years', '연도 수'],
                      ] as const
                    ).map(([key, label]) => (
                      <ResizableTh
                        key={key}
                        width={key === 'match' ? undefined : cols.widths[key]}
                        resizable={key !== 'years'}
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
                  {matches.map(({ sheet, member }) => (
                    <tr key={sheet.sheetName} className="border-t border-gray-200 text-black">
                      <td className="px-3 py-2 text-gray-400">{sheet.sheetName}</td>
                      <td className="px-3 py-2 font-medium">{sheet.name}</td>
                      <td className="px-3 py-2">
                        {member ? (
                          <span className="text-success">{member.name}에 연결</span>
                        ) : (
                          <span className="text-gray-400">매칭되는 팀원 없음</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{sheet.years.length}개</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="mt-3 flex items-center gap-2 text-[13px] text-gray-600">
              <input
                type="checkbox"
                checked={applyHireDate}
                onChange={(e) => setApplyHireDate(e.target.checked)}
              />
              입사일 · 승급일 · 보조지표도 함께 적용 (팀원 상세정보에 해당 값이 비어있는 경우만)
            </label>

            {matchedCount === 0 ? (
              <p className="mt-3 text-[13px] text-gray-400">
                매칭되는 팀원이 없어 적용할 수 없습니다. 팀원 이름이 엑셀과 정확히 일치하는지 확인하세요.
              </p>
            ) : (
              <Button variant="primary" onClick={handleApply} className="mt-4 w-full py-2.5">
                {matchedCount}명에게 적용
              </Button>
            )}

            {applied && (
              <p className="mt-3 rounded-md bg-success/10 px-3 py-2.5 text-[13px] text-success">
                {applied.memberCount}명, {applied.yearCount}개 연도 기록을 적용했습니다.
                {applied.skipped > 0 && ` (매칭 안 된 ${applied.skipped}명은 건너뜀)`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

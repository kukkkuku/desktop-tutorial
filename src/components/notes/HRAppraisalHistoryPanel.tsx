import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { EvaluationGrade, HRAppraisalRecord, TeamMember } from '../../types'
import { PERFORMANCE_GRADE_OPTIONS } from '../../types'
import { useAppState } from '../../state/AppContext'
import { useTeamProfile } from '../../state/TeamContext'
import { YEAR_WEIGHTS_BY_TENURE, findPromotionCriteria, gradeScore, resolveReviewYear, trendArrow } from '../../utils/promotion'
import { calcYearsSince } from '../../utils/tenure'
import { icSm } from '../ui/icon'

const GRADE_TEXT: Record<EvaluationGrade, string> = {
  S: 'text-accent',
  A: 'text-success',
  B: 'text-label',
  C: 'text-warning',
  D: 'text-danger',
}

const GRADE_KEYS = [
  { key: 'firstHalfGrade', label: '업적(상)' },
  { key: 'secondHalfGrade', label: '업적(하)' },
  { key: 'competencyGrade', label: '역량' },
] as const
type GradeKey = (typeof GRADE_KEYS)[number]['key']

// 보조지표 -- 승진서열화점수에 그대로 합산되는 입력값(직책/상벌/체류/교육).
const AUX_KEYS = [
  { key: 'position', label: '직책' },
  { key: 'reward', label: '상벌' },
  { key: 'tenure', label: '체류' },
  { key: 'education', label: '교육' },
] as const
type AuxKey = (typeof AUX_KEYS)[number]['key']

// 회사 공식 인사평가 원장 -- 승진 시뮬레이션(PromotionSimulationPanel)의
// 재료가 되는 원본 기록. 승급심사 예정년도를 기준으로 최근 5개년을 기본
// 행으로 보여준다(기록이 없는 해도 빈 행 + "입력"). 그보다 오래된(또는
// 범위 밖의) 기록은 "더보기"를 눌러야 나온다. 수정/입력 모두 그 행에서
// 바로 인풋이 열리는 인라인 편집이다(다른 테이블 메뉴와 같은 방식).
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

  const [showAll, setShowAll] = useState(false)
  const auxSum = (member.auxScores?.position ?? 0) + (member.auxScores?.reward ?? 0) + (member.auxScores?.tenure ?? 0) + (member.auxScores?.education ?? 0)

  // 등급 칸을 고르면 바로 저장한다(입력→저장 버튼 없이). 세 칸이 모두 비면 그 해 기록을 지운다.
  function setGrade(year: number, key: GradeKey, value: EvaluationGrade | '') {
    const r = records.find((rec) => rec.year === year)
    const next: HRAppraisalRecord = {
      ...(r ?? { id: uuidv4(), memberId: member.id, year, firstHalfGrade: '', secondHalfGrade: '', competencyGrade: '' }),
      [key]: value,
    }
    if (!next.firstHalfGrade && !next.secondHalfGrade && !next.competencyGrade) {
      if (r) deleteAppraisal(r.id)
      return
    }
    upsertAppraisal(next)
  }

  // 가중합: 최근 연도부터 체류연한별 가중치(150%·125%…)를 곱한다. 등급이 없는 해는 0 --
  // 아직 없는 해는 팀장이 등급을 넣어 시뮬레이션한다. 상단 "최종 기대 점수"와 같은 계산.
  const weights = criteria ? YEAR_WEIGHTS_BY_TENURE[criteria.tenureYears] ?? YEAR_WEIGHTS_BY_TENURE[5] : []
  let achTotal = 0
  let compTotal = 0
  const rowInfo = new Map<number, { weight: number; weighted: number; empty: boolean }>()
  recentYears.forEach((year, i) => {
    const w = weights[i] ?? 0
    const r = records.find((rec) => rec.year === year)
    const a = r ? gradeScore(r.firstHalfGrade, profile.gradeScores) + gradeScore(r.secondHalfGrade, profile.gradeScores) : 0
    const c = r ? gradeScore(r.competencyGrade, profile.gradeScores) * 2 : 0
    achTotal += w * a
    compTotal += w * c
    rowInfo.set(year, { weight: w, weighted: w * (a + c), empty: !r })
  })
  const grandTotal = Math.round((achTotal + compTotal + auxSum) * 10) / 10
  const displayYears = [...recentYears, ...(showAll ? extraYears : [])]

  const achievementTrend = trendArrow(records.slice(-3).flatMap((r) => [r.firstHalfGrade, r.secondHalfGrade]))
  const competencyTrend = trendArrow(records.slice(-3).map((r) => r.competencyGrade))

  // 승급심사 연도 -- 상단 "승진심사"와 같은 member.promotionReviewDate(월은 유지).
  function changeReviewYear(year: number) {
    if (!Number.isFinite(year)) return
    const month = member.promotionReviewDate?.slice(5, 7) || '01'
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, promotionReviewDate: `${year}-${month}` } })
  }

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
          className="mx-0.5 h-8 w-16 rounded-control border border-hairline px-2 text-center text-[13px] text-label"
        />
        년 승급심사 기준, {recentYears[recentYears.length - 1]}~{recentYears[0]}년 5개년을 반영합니다. 아직 없는 해는 예상 등급을 넣어 보세요.
      </p>

      <div className="mt-3 overflow-x-auto rounded-card border border-separator">
        <table className="w-full min-w-[320px] table-fixed text-[13px]">
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            <col />
            <col />
            <col style={{ width: 58 }} />
          </colgroup>
          <thead className="bg-[#F7F7F9] text-xs font-semibold text-label-2">
            <tr>
              <th className="px-2 py-2 text-left">연도</th>
              <th className="px-1 py-2 text-center">업적(상)</th>
              <th className="px-1 py-2 text-center">업적(하)</th>
              <th className="px-1 py-2 text-center">역량 ×2</th>
              <th className="px-2 py-2 text-right">가중합</th>
            </tr>
          </thead>
          <tbody>
            {displayYears.map((year) => {
              const r = records.find((rec) => rec.year === year)
              const info = rowInfo.get(year)
              return (
                <tr key={year} className="border-t border-separator">
                  <td className="px-2 py-1.5">
                    <span className="font-semibold text-label">{year}</span>
                    {info && info.weight > 0 && <span className="block text-[11px] text-label-3">×{Math.round(info.weight * 100)}%</span>}
                  </td>
                  {GRADE_KEYS.map(({ key, label }) => (
                    <td key={key} className="px-1 py-1.5 text-center">
                      <select
                        aria-label={`${year} ${label}`}
                        value={r?.[key] ?? ''}
                        onChange={(e) => setGrade(year, key, e.target.value as EvaluationGrade | '')}
                        className={`h-8 w-full max-w-[64px] rounded-control border border-hairline !pl-2 !pr-5 text-center text-[13px] font-medium ${
                          r?.[key] ? GRADE_TEXT[r[key] as EvaluationGrade] : 'text-label-3'
                        }`}
                      >
                        <option value="">-</option>
                        {PERFORMANCE_GRADE_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {!info || info.weight === 0 || info.empty ? (
                      <span className="text-label-3">-</span>
                    ) : (
                      <span className="font-semibold text-label">{info.weighted.toFixed(1)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-separator bg-warning/10">
              <td className="px-2 py-2.5 font-semibold text-label">합계</td>
              <td colSpan={3} className="px-1 py-2.5 text-right text-xs text-label-2">
                성과 {achTotal.toFixed(1)} + 역량 {compTotal.toFixed(1)} + 보조 {auxSum.toFixed(1)}
              </td>
              <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-warning">{grandTotal.toFixed(1)}점</td>
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

    </div>
  )
}

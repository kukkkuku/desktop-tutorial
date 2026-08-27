import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { TeamMember } from '../types'
import { useAppState } from '../state/AppContext'
import { useTeamProfile } from '../state/TeamContext'
import type { PromotionImportMatch } from '../utils/promotionImport'

export interface PromotionHistoryApplyResult {
  memberCount: number
  yearCount: number
  // 이름이 아예 안 맞거나(후보 0명) 동명이인인데 아직 안 고른 행 수.
  skipped: number
}

// 동명이인이라 자동 연결이 안 된 행에서 사용자가 고른 팀원 id -- matches
// 배열의 인덱스로 키를 잡는다(같은 이름이 여러 블록일 수 있어 이름만으로는
// 구분이 안 된다).
export type PromotionManualPicks = Record<number, string>

export function resolveMatchedMember(
  match: PromotionImportMatch,
  index: number,
  picks: PromotionManualPicks,
): TeamMember | null {
  if (match.member) return match.member
  const pickedId = picks[index]
  return pickedId ? match.candidates.find((c) => c.id === pickedId) ?? null : null
}

// 인사평가 이력(승진 시뮬레이션 Excel / 이전 성과 표)을 실제 팀원 데이터에
// 반영하는 부분만 떼어낸 훅. 확인 화면을 거치는 경로(팀원 면담의 "지난 성과
// 엑셀파일 불러오기")와, 화면 없이 자동으로 적용하는 경로(빠른 시작의 전체
// 일괄 업로드)가 똑같은 로직을 써야 해서 컴포넌트 밖으로 뺐다.
export function useApplyPromotionHistory() {
  const { dispatch } = useAppState()
  const { profile, upsertAppraisal } = useTeamProfile()

  return useCallback(
    (
      matches: PromotionImportMatch[],
      picks: PromotionManualPicks,
      applyHireDate: boolean,
    ): PromotionHistoryApplyResult => {
      let memberCount = 0
      let yearCount = 0

      matches.forEach((match, index) => {
        const member = resolveMatchedMember(match, index, picks)
        if (!member) return
        memberCount += 1
        for (const y of match.sheet.years) {
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
          if (match.sheet.hireDate && !member.hireDate) patch.hireDate = match.sheet.hireDate
          if (match.sheet.promotionReviewDate && !member.promotionReviewDate) {
            patch.promotionReviewDate = match.sheet.promotionReviewDate
          }
          if (match.sheet.auxScores && !member.auxScores) patch.auxScores = match.sheet.auxScores
          if (Object.keys(patch).length > 0) dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, ...patch } })
        }
      })

      return { memberCount, yearCount, skipped: matches.length - memberCount }
    },
    [dispatch, profile, upsertAppraisal],
  )
}

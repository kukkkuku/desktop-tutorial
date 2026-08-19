import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { EvaluationGrade, HRAppraisalRecord, PersonalNote, PromotionCriteriaRow, TeamProfile } from '../types'
import { DEFAULT_GRADE_SCORES, DEFAULT_PROMOTION_CRITERIA } from '../utils/promotion'

const TEAM_PROFILE_PREFIX = 'ux-performance-evaluation-team-'

function teamProfileKey(teamName: string): string {
  return `${TEAM_PROFILE_PREFIX}${teamName}`
}

function defaultProfile(): TeamProfile {
  return {
    hrAppraisals: [],
    promotionCriteria: DEFAULT_PROMOTION_CRITERIA,
    gradeScores: { ...DEFAULT_GRADE_SCORES },
    personalNotes: [],
  }
}

function loadProfile(teamName: string): TeamProfile {
  try {
    const raw = localStorage.getItem(teamProfileKey(teamName))
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        hrAppraisals: Array.isArray(parsed.hrAppraisals) ? parsed.hrAppraisals : [],
        promotionCriteria:
          Array.isArray(parsed.promotionCriteria) && parsed.promotionCriteria.length > 0
            ? parsed.promotionCriteria
            : DEFAULT_PROMOTION_CRITERIA,
        gradeScores:
          parsed.gradeScores && typeof parsed.gradeScores === 'object'
            ? { ...DEFAULT_GRADE_SCORES, ...parsed.gradeScores }
            : { ...DEFAULT_GRADE_SCORES },
        personalNotes: Array.isArray(parsed.personalNotes) ? parsed.personalNotes : [],
      }
    }
  } catch {
    // fall through to default
  }
  return defaultProfile()
}

interface TeamContextValue {
  profile: TeamProfile
  upsertAppraisal: (record: HRAppraisalRecord) => void
  deleteAppraisal: (id: string) => void
  setPromotionCriteria: (rows: PromotionCriteriaRow[]) => void
  setGradeScores: (scores: Record<EvaluationGrade, number>) => void
  addPersonalNote: (memberId: string, content: string) => void
  deletePersonalNote: (id: string) => void
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined)

// 팀(teamName) 단위 저장소 — 인사평가 이력과 승진 기준은 평가기간(워크스페이스)이
// 바뀌어도 유지되어야 하는 데이터라 워크스페이스 상태(AppState)와 분리해 보관한다.
export function TeamProvider({ teamName, children }: { teamName: string; children: ReactNode }) {
  const [profile, setProfile] = useState<TeamProfile>(() => loadProfile(teamName))

  useEffect(() => {
    setProfile(loadProfile(teamName))
  }, [teamName])

  useEffect(() => {
    try {
      localStorage.setItem(teamProfileKey(teamName), JSON.stringify(profile))
    } catch {
      // Storage may be unavailable; keep running in-memory.
    }
  }, [profile, teamName])

  function upsertAppraisal(record: HRAppraisalRecord) {
    setProfile((p) => {
      const exists = p.hrAppraisals.some((r) => r.id === record.id)
      return {
        ...p,
        hrAppraisals: exists
          ? p.hrAppraisals.map((r) => (r.id === record.id ? record : r))
          : [...p.hrAppraisals, record],
      }
    })
  }

  function deleteAppraisal(id: string) {
    setProfile((p) => ({ ...p, hrAppraisals: p.hrAppraisals.filter((r) => r.id !== id) }))
  }

  function setPromotionCriteria(rows: PromotionCriteriaRow[]) {
    setProfile((p) => ({ ...p, promotionCriteria: rows }))
  }

  function setGradeScores(scores: Record<EvaluationGrade, number>) {
    setProfile((p) => ({ ...p, gradeScores: scores }))
  }

  function addPersonalNote(memberId: string, content: string) {
    if (!content.trim()) return
    const note: PersonalNote = { id: uuidv4(), memberId, content: content.trim(), createdAt: new Date().toISOString().slice(0, 10) }
    setProfile((p) => ({ ...p, personalNotes: [...p.personalNotes, note] }))
  }

  function deletePersonalNote(id: string) {
    setProfile((p) => ({ ...p, personalNotes: p.personalNotes.filter((n) => n.id !== id) }))
  }

  return (
    <TeamContext.Provider
      value={{ profile, upsertAppraisal, deleteAppraisal, setPromotionCriteria, setGradeScores, addPersonalNote, deletePersonalNote }}
    >
      {children}
    </TeamContext.Provider>
  )
}

export function useTeamProfile() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeamProfile must be used within TeamProvider')
  return ctx
}

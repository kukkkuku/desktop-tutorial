export type Importance = '중점' | '핵심' | '일반' | '지원'
export type PerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D'
export type Workload = '대' | '중' | '소'
export type EvaluationGrade = 'S' | 'A' | 'B' | 'C' | 'D'
export type Level = '사원' | '대리' | '과장' | '차장' | '부장'

export interface Task {
  id: string
  name: string
  importance: Importance
  performanceGrade: PerformanceGrade
  workload: Workload
  objective: string
  achievement: string
}

export interface TeamMember {
  id: string
  name: string
  active: boolean
  level: Level | ''
  yearsOfService: number | null
  role: string
  comment: string
  // 입사일 / 현 직급 발령일 — present, 근속연차·직급체류연차를 자동 계산하는 데 쓰인다.
  // 기존 데이터와의 호환을 위해 없으면 null, yearsOfService 수동값으로 대체 표시.
  hireDate?: string | null
  currentLevelSince?: string | null
  // 승급심사 예정월("YYYY-MM") — 자동 계산값(목표 승진 연도)과 별개로 팀장이
  // 직접 지정하는 실제 심사 일정. 미지정이면 null.
  promotionReviewDate?: string | null
}

export interface Contribution {
  taskId: string
  memberId: string
  contributionPercent: number
  personalPerformanceGrade: PerformanceGrade
  // true = still an auto equal-split value, safe to redistribute on the next ADD_MEMBER
  isAutoDistributed?: boolean
}

export interface MeetingActionItem {
  id: string
  content: string
  dueDate: string
  done: boolean
  // 담당자(선택) — 면담하기 화면에서 Action에 함께 지정할 수 있다.
  assignee?: string
}

export interface MeetingNote {
  id: string
  memberId: string
  date: string
  comment: string
  // 선택 입력 — 기본 면담 기록은 date+comment만으로 완결된다.
  keyPoints?: string
  nextCheckDate?: string
  actions?: MeetingActionItem[]
  // 구버전 필드(육성 포인트) — 새 화면에는 입력 UI가 없지만, 과거에 저장된
  // 데이터를 읽을 때 깨지지 않도록 타입만 유지한다.
  strengths?: string
  improvements?: string
  nextExperience?: string
  careerInterest?: string
}

export interface PeerReview {
  id: string
  reviewerName: string
  targetMemberId: string
  grade: PerformanceGrade
}

export interface Criteria {
  // Each is a 0-100 reflection ratio: 0 = no effect (neutral baseline), 100 = full effect.
  performanceGradeWeight: number
  taskGradeWeight: number
  workloadWeight: number
  personalGradeWeight: number
  peerReviewWeight: number
  // 0 = ignore each member's entered contribution % and split a task's score
  // equally among its participants; 100 = use the entered % as-is.
  contributionWeight: number
}

export interface AppState {
  tasks: Task[]
  members: TeamMember[]
  contributions: Contribution[]
  criteria: Criteria
  meetingNotes: MeetingNote[]
  peerReviews: PeerReview[]
}

export interface WorkspaceMeta {
  id: string
  teamName: string
  periodName: string
  createdAt: string
}

// 공식 인사평가 이력 — 앱이 계산하는 성과평가 점수와는 별도로 팀장이 직접 기록하는
// 회사 인사평가 결과(업적 상/하반기, 역량평가 등급). 팀 단위로 저장되어 평가기간(워크스페이스)이
// 바뀌어도 유지된다.
export interface HRAppraisalRecord {
  id: string
  memberId: string
  year: number
  firstHalfGrade: EvaluationGrade | ''
  secondHalfGrade: EvaluationGrade | ''
  competencyGrade: EvaluationGrade | ''
}

// 승진 기준 — 성과평가 기준(Criteria)과는 완전히 분리된 별도 개념.
// 현재직급 → 다음직급 승진에 필요한 직급체류연한과 승진자격점수.
export interface PromotionCriteriaRow {
  fromLevel: Level
  toLevel: Level
  tenureYears: number
  requiredScore: number
}

// 팀 단위(워크스페이스/평가기간을 넘나드는) 저장소 — 인사평가 이력과 승진 기준은
// 특정 평가기간에 종속되지 않는 데이터라 팀 이름 단위로 별도 보관한다.
export interface TeamProfile {
  hrAppraisals: HRAppraisalRecord[]
  promotionCriteria: PromotionCriteriaRow[]
  gradeScores: Record<EvaluationGrade, number>
}

export const IMPORTANCE_OPTIONS: Importance[] = ['중점', '핵심', '일반', '지원']
export const PERFORMANCE_GRADE_OPTIONS: PerformanceGrade[] = ['S', 'A', 'B', 'C', 'D']
export const WORKLOAD_OPTIONS: Workload[] = ['대', '중', '소']
export const LEVEL_OPTIONS: Level[] = ['사원', '대리', '과장', '차장', '부장']

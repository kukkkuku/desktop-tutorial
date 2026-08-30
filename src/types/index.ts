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
  // 승진 보조지표 점수 — 승진서열화점수에 그대로 합산된다(직책/상벌/체류/교육).
  // 미지정 항목은 0으로 취급.
  auxScores?: {
    position?: number
    reward?: number
    tenure?: number
    education?: number
  } | null
}

export interface Contribution {
  taskId: string
  memberId: string
  contributionPercent: number
  // 팀장이 평가하기 탭에서 직접 매기는 개인수행등급. null = 아직 안 매김.
  //
  // 예전에는 행이 생길 때 'B'가 자동으로 박혀서, 팀장이 앱을 한 번도 안 열어도
  // 전원이 B를 갖고 있었다. 그러면 "팀장은 B로 봤는데 동료는 S다" 같은, 팀장이
  // 한 적 없는 판단을 화면이 지어내게 된다. 미입력을 null로 두어 구분한다.
  // 점수 계산에서는 null을 중립(B와 같은 1.0배)으로 취급하므로 결과는 그대로다.
  personalPerformanceGrade: PerformanceGrade | null
  // 개인수행등급을 준 근거 메모 -- 평가 매트릭스에서 입력하면 팀원 성장
  // 관리의 과제별 성과에도 그대로 노출된다.
  personalGradeNote?: string
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
  // 말로 다 담기 애매한 그날의 분위기/컨디션을 이모지 한 개로 남긴다.
  // 기록이 쌓이면 목록만 훑어도 흐름이 보인다. 선택 입력.
  mood?: string
  // 선택 입력 — 기본 면담 기록은 date+comment만으로 완결된다.
  keyPoints?: string
  nextCheckDate?: string
  actions?: MeetingActionItem[]
  // 육성 포인트 — 면담일지의 강점/보완 필요/다음 도전 경험/Career Goal 입력값.
  strengths?: string
  improvements?: string
  nextExperience?: string
  careerInterest?: string
  // 이 기록을 만들 때 같은 계정의 Google 캘린더에도 종일 일정으로 등록했다면
  // 그 이벤트 id. 수정/삭제 시 캘린더 쪽 일정도 같이 맞추기 위해 들고 있다.
  calendarEventId?: string
}

export interface PeerReview {
  id: string
  // 이 리뷰가 어느 과제에 대한 건지. 새 화면(과제 단위 입력)에서 만든
  // 리뷰는 항상 채워진다. taskId가 없는 항목은 이 구조로 바뀌기 전(과제
  // 연결 없이 엑셀로 올렸던) 예전 데이터다 -- 점수 반영에는 그대로
  // 포함되지만, 과제별 화면에는 나타나지 않는다.
  taskId?: string
  // 작성자(리뷰어)가 실제 팀원이면 이 id가 채워진다. 과제 단위 입력은
  // 항상 참여자 목록에서 리뷰어를 고르므로 채워지고, reviewerName은
  // 그 팀원의 이름을 그대로 담아 표시용으로 함께 쓴다.
  reviewerMemberId?: string
  reviewerName: string
  targetMemberId: string
  // 리뷰어가 본 이 과제에서 대상자의 기여도(%). 과제의 기여도 자동배분
  // 기본값을 이 평균으로 채우는 데 쓰인다(팀장이 수정 가능). 예전 데이터는
  // 없을 수 있다.
  contributionPercent?: number
  grade: PerformanceGrade
  // 왜 이 기여도·등급을 줬는지 리뷰어가 남기는 짧은 근거. 등급만 덩그러니
  // 있으면 근거가 없다는 문제를 해결하기 위한 필드.
  comment?: string
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

// 성과평가 결과 화면의 진행 상태 — 팀원별로 추적한다. '평가중'이 기본값이고,
// 팀장이 검토를 마치면 '검토완료', 그 해의 공식 결과로 못박으면 '확정'으로 올린다.
export type EvaluationStatus = 'evaluating' | 'reviewed' | 'confirmed'

export interface AppState {
  tasks: Task[]
  members: TeamMember[]
  contributions: Contribution[]
  criteria: Criteria
  meetingNotes: MeetingNote[]
  peerReviews: PeerReview[]
  // memberId -> 상태. 없는 팀원은 'evaluating'으로 취급한다.
  evaluationStatus: Record<string, EvaluationStatus>
}

// 평가 주기 -- 팀이 성과평가를 반기/분기/월 단위로 쪼개는지, 아니면 그때그때
// 이름을 붙이는 사용자 정의 기간을 쓰는지.
export type EvaluationCycle = 'half' | 'quarter' | 'month' | 'custom'

// workspace가 곧 하나의 평가(evaluation)다. id가 evaluationId, teamName이
// evaluationId를 묶는 teamId 역할을 한다(이 앱은 팀 이름 자체가 안정적인
// 식별자라 별도 UUID teamId를 두지 않는다). evaluationYear/evaluationCycle/
// evaluationPeriodCode가 이 평가를 구조적으로 식별하는 값이고, periodName은
// 화면에 보여주는 라벨이다(예: "상반기"). 과제·팀원·기여도·피어리뷰·평가결과는
// 전부 이 id(workspaceStateKey)로 저장/조회되므로 이미 evaluationId 기준으로
// 완전히 분리되어 있다.
export interface WorkspaceMeta {
  id: string
  teamName: string
  periodName: string
  evaluationYear: number
  evaluationCycle: EvaluationCycle
  evaluationPeriodCode: string
  createdAt: string
  updatedAt: string
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

export type PersonalNoteColor = 'gray' | 'pink' | 'violet' | 'blue' | 'teal' | 'green' | 'orange'

// 면담 전에 참고할 개인 상황 메모(포스트잇) — 대학원 재학, 육아, 휴가 계획,
// 배우고 싶어하는 분야처럼 성과 데이터로는 안 잡히지만 면담에서 챙겨야 할
// 맥락. 평가기간이 바뀌어도 유지되어야 해서 TeamProfile에 팀원 단위로 쌓인다.
export interface PersonalNote {
  id: string
  memberId: string
  content: string
  createdAt: string
  // 칩 색상 -- 팀장이 직접 골라 구분할 수 있게 한다. 미지정(예전 데이터)이면
  // 기본색(violet)으로 표시.
  color?: PersonalNoteColor
}

// 팀 단위(워크스페이스/평가기간을 넘나드는) 저장소 — 인사평가 이력과 승진 기준은
// 특정 평가기간에 종속되지 않는 데이터라 팀 이름 단위로 별도 보관한다.
export interface TeamProfile {
  hrAppraisals: HRAppraisalRecord[]
  promotionCriteria: PromotionCriteriaRow[]
  gradeScores: Record<EvaluationGrade, number>
  personalNotes: PersonalNote[]
}

export const IMPORTANCE_OPTIONS: Importance[] = ['중점', '핵심', '일반', '지원']
export const PERFORMANCE_GRADE_OPTIONS: PerformanceGrade[] = ['S', 'A', 'B', 'C', 'D']
export const WORKLOAD_OPTIONS: Workload[] = ['대', '중', '소']
export const LEVEL_OPTIONS: Level[] = ['사원', '대리', '과장', '차장', '부장']

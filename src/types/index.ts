export type Importance = '중점' | '핵심' | '일반' | '지원'
export type PerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D'
export type Workload = '대' | '중' | '소'
export type EvaluationGrade = 'S' | 'A' | 'B' | 'C' | 'D'
export type Position = '팀장' | 'PM' | 'PL' | '팀원'
export type Level = '사원' | '대리' | '과장' | '차장'

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
  position: Position | ''
  level: Level | ''
  yearsOfService: number | null
  role: string
  comment: string
}

export interface Contribution {
  taskId: string
  memberId: string
  contributionPercent: number
  personalPerformanceGrade: PerformanceGrade
  // true = still an auto equal-split value, safe to redistribute on the next ADD_MEMBER
  isAutoDistributed?: boolean
}

export interface Criteria {
  usePerformanceGrade: boolean
  useImportance: boolean
  useWorkload: boolean
  usePersonalPerformanceGrade: boolean
}

export interface AppState {
  tasks: Task[]
  members: TeamMember[]
  contributions: Contribution[]
  criteria: Criteria
}

export const IMPORTANCE_OPTIONS: Importance[] = ['중점', '핵심', '일반', '지원']
export const PERFORMANCE_GRADE_OPTIONS: PerformanceGrade[] = ['S', 'A', 'B', 'C', 'D']
export const WORKLOAD_OPTIONS: Workload[] = ['대', '중', '소']
export const POSITION_OPTIONS: Position[] = ['팀장', 'PM', 'PL', '팀원']
export const LEVEL_OPTIONS: Level[] = ['사원', '대리', '과장', '차장']

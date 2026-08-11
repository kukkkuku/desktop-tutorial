export type Importance = '중점' | '핵심' | '일반' | '지원'
export type PerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D'
export type Workload = '대' | '중' | '소'
export type EvaluationGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface Task {
  id: string
  name: string
  importance: Importance
  performanceGrade: PerformanceGrade
  workload: Workload
  objective: string
}

export interface TeamMember {
  id: string
  name: string
  active: boolean
}

export interface Contribution {
  taskId: string
  memberId: string
  contributionRatio: number
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

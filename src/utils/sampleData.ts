import { v4 as uuidv4 } from 'uuid'
import type { AppState } from '../types'

export function createSampleData(): AppState {
  const taskCloudX = uuidv4()
  const taskDesignSystem = uuidv4()
  const taskOneClick = uuidv4()

  const memberKim = uuidv4()
  const memberLee = uuidv4()
  const memberSeo = uuidv4()

  return {
    tasks: [
      {
        id: taskCloudX,
        name: 'CloudX',
        importance: '중점',
        performanceGrade: 'A',
        workload: '대',
        objective: '클라우드 기반 신규 UX 플랫폼 구축',
        achievement: '베타 오픈 및 온보딩 전환율 22% 개선',
      },
      {
        id: taskDesignSystem,
        name: 'Design System',
        importance: '핵심',
        performanceGrade: 'S',
        workload: '중',
        objective: '전사 디자인 시스템 정립 및 컴포넌트 라이브러리 구축',
        achievement: '컴포넌트 84종 배포, 신규 화면 개발 공수 30% 절감',
      },
      {
        id: taskOneClick,
        name: 'OneClick',
        importance: '일반',
        performanceGrade: 'B',
        workload: '소',
        objective: '원클릭 결제 플로우 UX 개선',
        achievement: '결제 단계 5단계 → 2단계로 단축',
      },
    ],
    members: [
      {
        id: memberKim,
        name: '김기정',
        active: true,
        position: '팀장',
        level: '과장',
        yearsOfService: 7,
        role: '기획',
        comment: '',
      },
      {
        id: memberLee,
        name: '이혜원',
        active: true,
        position: 'PL',
        level: '대리',
        yearsOfService: 4,
        role: '디자인',
        comment: '',
      },
      {
        id: memberSeo,
        name: '서승우',
        active: true,
        position: '팀원',
        level: '사원',
        yearsOfService: 2,
        role: '개발',
        comment: '',
      },
    ],
    contributions: [
      { taskId: taskCloudX, memberId: memberKim, contributionPercent: 50, personalPerformanceGrade: 'A' },
      { taskId: taskCloudX, memberId: memberLee, contributionPercent: 30, personalPerformanceGrade: 'B' },
      { taskId: taskCloudX, memberId: memberSeo, contributionPercent: 20, personalPerformanceGrade: 'B' },

      { taskId: taskDesignSystem, memberId: memberKim, contributionPercent: 20, personalPerformanceGrade: 'B' },
      { taskId: taskDesignSystem, memberId: memberLee, contributionPercent: 50, personalPerformanceGrade: 'S' },
      { taskId: taskDesignSystem, memberId: memberSeo, contributionPercent: 30, personalPerformanceGrade: 'A' },

      { taskId: taskOneClick, memberId: memberKim, contributionPercent: 30, personalPerformanceGrade: 'B' },
      { taskId: taskOneClick, memberId: memberLee, contributionPercent: 30, personalPerformanceGrade: 'B' },
      { taskId: taskOneClick, memberId: memberSeo, contributionPercent: 40, personalPerformanceGrade: 'A' },
    ],
    criteria: {
      usePerformanceGrade: true,
      useImportance: true,
      useWorkload: true,
      usePersonalPerformanceGrade: false,
      usePeerReview: false,
    },
    meetingNotes: [],
    peerReviews: [],
  }
}

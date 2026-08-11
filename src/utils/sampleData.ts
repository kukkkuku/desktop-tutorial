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
      },
      {
        id: taskDesignSystem,
        name: 'Design System',
        importance: '핵심',
        performanceGrade: 'S',
        workload: '중',
        objective: '전사 디자인 시스템 정립 및 컴포넌트 라이브러리 구축',
      },
      {
        id: taskOneClick,
        name: 'OneClick',
        importance: '일반',
        performanceGrade: 'B',
        workload: '소',
        objective: '원클릭 결제 플로우 UX 개선',
      },
    ],
    members: [
      { id: memberKim, name: '김기정', active: true },
      { id: memberLee, name: '이혜원', active: true },
      { id: memberSeo, name: '서승우', active: true },
    ],
    contributions: [
      { taskId: taskCloudX, memberId: memberKim, contributionRatio: 0.5 },
      { taskId: taskCloudX, memberId: memberLee, contributionRatio: 0.3 },
      { taskId: taskCloudX, memberId: memberSeo, contributionRatio: 0.2 },

      { taskId: taskDesignSystem, memberId: memberKim, contributionRatio: 0.2 },
      { taskId: taskDesignSystem, memberId: memberLee, contributionRatio: 0.5 },
      { taskId: taskDesignSystem, memberId: memberSeo, contributionRatio: 0.3 },

      { taskId: taskOneClick, memberId: memberKim, contributionRatio: 0.3 },
      { taskId: taskOneClick, memberId: memberLee, contributionRatio: 0.3 },
      { taskId: taskOneClick, memberId: memberSeo, contributionRatio: 0.4 },
    ],
    criteria: {
      usePerformanceGrade: true,
      useImportance: true,
      useWorkload: true,
      usePersonalPerformanceGrade: false,
    },
  }
}

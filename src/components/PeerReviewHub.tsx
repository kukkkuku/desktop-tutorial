// 팀원관리 › 피어리뷰. 두 가지 방식 중 골라 쓴다 -- 둘 다 근거가 필수.
//   - 단순 순위: 과제와 상관없이 팀원 전체(본인 제외)에 1위부터 순위 + 근거 (RankPeerReview)
//   - 과제별: 참여한 과제마다 참여자 전원(본인 포함)을 순위 또는 기여도로 + 근거 (TaskPeerPanel)
import { useState } from 'react'
import RankPeerReview from './RankPeerReview'
import TaskPeerPanel from './TaskPeerPanel'
import { useAppState } from '../state/AppContext'

type Mode = 'simple' | 'task'

export default function PeerReviewHub() {
  const [mode, setMode] = useState<Mode>('simple')
  const weight = useAppState().state.criteria.peerReviewWeight
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
          {(
            [
              ['simple', '단순 순위'],
              ['task', '과제별'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`rounded-md px-4 py-1.5 font-medium ${mode === k ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {mode === 'simple'
            ? '팀원 전체(본인 제외)에게 1위부터 순위 + 근거'
            : '참여한 평가과제마다 참여자 전원(본인 포함)을 순위 또는 기여도로 + 근거'}
        </span>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${weight > 0 ? 'bg-blue-50 text-accent' : 'bg-gray-100 text-gray-500'}`}
          title="두 방식의 결과를 합쳐 점수에 반영합니다. 1위 = 100점(S급) … 꼴찌 = 60점(D급), 본인 평가 제외. 비율은 기준설정의 '피어리뷰'에서 바꿉니다."
        >
          {weight > 0 ? `점수 반영 ${weight}%` : '점수 반영 안 함 · 기준설정에서 켜기'}
        </span>
      </div>
      {mode === 'simple' ? <RankPeerReview /> : <TaskPeerPanel />}
    </div>
  )
}

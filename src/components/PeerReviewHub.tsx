// 팀원관리 › 피어리뷰. 두 가지 방식 중 골라 쓴다 -- 둘 다 근거가 필수.
//   - 단순 순위: 과제와 상관없이 팀원 전체(본인 제외)에 1위부터 순위 + 근거 (RankPeerReview)
//   - 과제별: 참여한 과제마다 참여자 전원(본인 포함)에게 순위 + 근거 (TaskPeerPanel)
import { useState } from 'react'
import RankPeerReview from './RankPeerReview'
import TaskPeerPanel from './TaskPeerPanel'
import { useAppState } from '../state/AppContext'
import Segmented from './ui/Segmented'

type Mode = 'simple' | 'task'

export default function PeerReviewHub() {
  const [mode, setMode] = useState<Mode>('simple')
  const weight = useAppState().state.criteria.peerReviewWeight
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          items={[
            { key: 'simple', label: '단순 순위' },
            { key: 'task', label: '과제별' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <span className="text-[13px] text-label-2">
          {mode === 'simple'
            ? '팀원 전체(본인 제외)에게 1위부터 순위 + 근거'
            : '참여한 평가과제마다 참여자 전원(본인 포함)에게 순위 + 근거 (기여도는 팀장이 평가하기에서)'}
        </span>
        <span
          className={`mac-badge ml-auto ${weight > 0 ? 'bg-accent-soft text-accent' : 'bg-black/[0.05] text-label-2'}`}
          title="두 방식의 결과를 합쳐 점수에 반영합니다. 1위 100 · 2위 90 · 3위 80 · 4위 70 · 5위 이하 60점(등급 S~D와 같은 척도), 본인 평가 제외. 비율은 기준설정의 '피어리뷰'에서 바꿉니다."
        >
          {weight > 0 ? `점수 반영 ${weight}%` : '점수 반영 안 함 · 기준설정에서 켜기'}
        </span>
      </div>
      {mode === 'simple' ? <RankPeerReview /> : <TaskPeerPanel />}
    </div>
  )
}

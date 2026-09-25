import { useEffect, useState } from 'react'
import TeamManagement from './TeamManagement'
import PeerReviewManagement from './PeerReviewManagement'
import PeerReviewHub from './PeerReviewHub'
import { useAppState } from '../state/AppContext'

type TeamSubTab = 'members' | 'rank' | 'peer'

export interface TeamSubTabRequest {
  subTab: TeamSubTab
  token: number
}

const SUB_TABS: { key: TeamSubTab; label: string }[] = [
  { key: 'members', label: '팀원' },
  { key: 'rank', label: '피어리뷰' },
  // 예전 방식(과제별 등급·기여도). 순위 방식과 따로 저장되고, 점수의 "피어리뷰 반영 비율"은
  // 이 데이터를 쓴다. 새로 쓰지 않으므로 예전 데이터가 있을 때만 탭을 보여 준다.
  { key: 'peer', label: '이전 피어리뷰(등급)' },
]

interface TeamStageProps {
  // 다른 화면(성장 관리의 "팀원 관리" 버튼 등)이 특정 서브탭을 열어달라고
  // 요청할 때 쓰는 진입점 -- token이 바뀔 때마다 그 서브탭으로 전환한다.
  subTabRequest?: TeamSubTabRequest | null
}

export default function TeamStage({ subTabRequest }: TeamStageProps) {
  const [sub, setSub] = useState<TeamSubTab>(subTabRequest?.subTab ?? 'members')
  const hasLegacyPeer = useAppState().state.peerReviews.length > 0
  const tabs = SUB_TABS.filter((t) => t.key !== 'peer' || hasLegacyPeer || sub === 'peer')

  useEffect(() => {
    if (!subTabRequest) return
    setSub(subTabRequest.subTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTabRequest?.token])

  return (
    <div>
      <div className="flex items-center border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSub(tab.key)}
            className={`border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
              sub === tab.key ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-black'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {sub === 'members' && <TeamManagement />}
        {sub === 'rank' && <PeerReviewHub />}
        {sub === 'peer' && <PeerReviewManagement />}
      </div>
    </div>
  )
}

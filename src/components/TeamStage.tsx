import { useEffect, useState } from 'react'
import TeamManagement from './TeamManagement'
import PeerReviewManagement from './PeerReviewManagement'

type TeamSubTab = 'members' | 'peer'

export interface TeamSubTabRequest {
  subTab: TeamSubTab
  token: number
}

const SUB_TABS: { key: TeamSubTab; label: string }[] = [
  { key: 'members', label: '팀원' },
  { key: 'peer', label: '피어리뷰' },
]

interface TeamStageProps {
  // 다른 화면(성장 관리의 "팀원 관리" 버튼 등)이 특정 서브탭을 열어달라고
  // 요청할 때 쓰는 진입점 -- token이 바뀔 때마다 그 서브탭으로 전환한다.
  subTabRequest?: TeamSubTabRequest | null
}

export default function TeamStage({ subTabRequest }: TeamStageProps) {
  const [sub, setSub] = useState<TeamSubTab>(subTabRequest?.subTab ?? 'members')

  useEffect(() => {
    if (!subTabRequest) return
    setSub(subTabRequest.subTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTabRequest?.token])

  return (
    <div>
      <div className="flex items-center border-b border-gray-200">
        {SUB_TABS.map((tab) => (
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
        {sub === 'peer' && <PeerReviewManagement />}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useAppState } from '../../state/AppContext'
import { colorForIndex } from '../../utils/memberColors'
import MeetingNotes from '../MeetingNotes'
import MemberHistoryStage from './MemberHistoryStage'
import MemberPromotionStage from './MemberPromotionStage'

export type NotesSubTab = 'record' | 'history' | 'promotion'

export interface NotesNavigationRequest {
  memberId: string
  subTab: NotesSubTab
  token: number
}

const SUB_TABS: { key: NotesSubTab; label: string }[] = [
  { key: 'record', label: '면담 기록' },
  { key: 'history', label: '성과 히스토리' },
  { key: 'promotion', label: '인사평가·승진 관리' },
]

interface NotesStageProps {
  notesRequest?: NotesNavigationRequest | null
}

// 면담 관련 모든 것(면담 기록·성과 히스토리·인사평가/승진 관리)을 한 곳에 모은
// 상위 화면. 데이터 스테이지의 과제/팀원/피어리뷰 서브탭과 같은 패턴이다.
// 팀원 선택은 여기서 한 번만 하고, 세 서브탭이 모두 같은 선택을 공유한다.
export default function NotesStage({ notesRequest }: NotesStageProps) {
  const { state } = useAppState()
  const { members } = state
  const [sub, setSub] = useState<NotesSubTab>('record')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const activeMemberId = selectedMemberId ?? members[0]?.id ?? null

  useEffect(() => {
    if (!notesRequest) return
    setSub(notesRequest.subTab)
    setSelectedMemberId(notesRequest.memberId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesRequest?.token])

  return (
    <div>
      <h2 className="text-xl font-bold text-black">팀원 성장 관리</h2>
      <p className="mt-1 text-sm text-gray-600">
        팀원을 선택한 뒤, 아래에서 면담 기록·성과 히스토리·인사평가와 승진 준비 상태를 확인하세요.
      </p>

      {members.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          등록된 팀원이 없습니다. 팀원 관리에서 먼저 팀원을 등록하세요.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2 px-1">
            {members.map((member, idx) => {
              const isActive = member.id === activeMemberId
              return (
                <button
                  key={member.id}
                  onClick={() => setSelectedMemberId(member.id)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive ? 'bg-accent text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: isActive ? '#fff' : colorForIndex(idx) }}
                  />
                  {member.name}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex border-b border-gray-200">
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
            {sub === 'record' && (
              <MeetingNotes
                selectedMemberId={activeMemberId}
                onSelectMember={setSelectedMemberId}
                prepRequest={notesRequest?.subTab === 'record' ? { memberId: notesRequest.memberId, token: notesRequest.token } : null}
              />
            )}
            {sub === 'history' && <MemberHistoryStage selectedMemberId={activeMemberId} />}
            {sub === 'promotion' && <MemberPromotionStage selectedMemberId={activeMemberId} />}
          </div>
        </>
      )}
    </div>
  )
}

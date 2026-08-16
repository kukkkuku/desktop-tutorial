import { useState } from 'react'
import { useAppState } from '../../state/AppContext'
import MemberAppraisalPromotionPanel from '../member-detail/MemberAppraisalPromotionPanel'
import PromotionCriteriaManager from '../promotion/PromotionCriteriaManager'
import PromotionHistoryImportModal from '../promotion/PromotionHistoryImportModal'

export default function MemberPromotionStage({ selectedMemberId }: { selectedMemberId: string | null }) {
  const { state } = useAppState()
  const [criteriaManagerOpen, setCriteriaManagerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const member = state.members.find((m) => m.id === selectedMemberId)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-black">
            {member ? `${member.name}의 인사평가·승진 관리` : '인사평가·승진 관리'}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            회사 공식 인사평가 이력을 기록하고 승진 준비도를 확인·시뮬레이션합니다. 좌측 기준 설정(성과평가 기준)과는
            별개입니다.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-50"
          >
            엑셀로 가져오기
          </button>
          <button
            onClick={() => setCriteriaManagerOpen(true)}
            className="rounded-md border border-promo/30 px-3 py-2 text-sm font-medium text-promo hover:bg-promo/5"
          >
            승진 기준 관리
          </button>
        </div>
      </div>

      {!member ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">팀원을 선택하세요.</p>
      ) : (
        <div className="mt-4 max-w-2xl">
          <MemberAppraisalPromotionPanel member={member} />
        </div>
      )}

      {criteriaManagerOpen && <PromotionCriteriaManager onClose={() => setCriteriaManagerOpen(false)} />}
      {importOpen && <PromotionHistoryImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import ConfirmDialog from './ConfirmDialog'

export default function SettingsPage() {
  const { dispatch } = useAppState()
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  function handleResetConfirm() {
    dispatch({ type: 'RESET_ALL' })
    setResetDialogOpen(false)
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-black">설정</h2>
      <p className="mt-1 text-sm text-gray-600">이 평가(기간)의 앱 설정입니다.</p>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-danger">위험 구역</h3>
        <div className="mt-2 flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-red-50 px-4 py-4">
          <div>
            <p className="font-medium text-black">전체 데이터 초기화</p>
            <p className="mt-0.5 text-sm text-gray-600">
              과제, 팀원, 평가 매트릭스 입력값을 모두 삭제하고 빈 상태로 되돌립니다. 되돌릴 수 없으니 필요하다면 먼저
              엑셀로 백업하세요.
            </p>
          </div>
          <button
            onClick={() => setResetDialogOpen(true)}
            className="shrink-0 rounded-md border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger hover:text-white"
          >
            초기화
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        title="전체 데이터 초기화"
        message="과제, 팀원, 평가 매트릭스 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?"
        onConfirm={handleResetConfirm}
        onCancel={() => setResetDialogOpen(false)}
      />
    </div>
  )
}

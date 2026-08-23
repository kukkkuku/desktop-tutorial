import { useState } from 'react'
import { useWorkspaces } from '../state/WorkspaceContext'
import Button from './Button'

interface ImportFromPreviousPanelProps {
  teamName: string
  currentWorkspaceId: string
  // 취소 버튼은 독립 다이얼로그(ImportFromPreviousDialog)에서만 필요하다 --
  // 빠른 시작 팝업의 탭으로 쓸 때는 탭을 바꾸거나 팝업을 닫으면 되므로
  // 별도 취소 버튼이 없다.
  onCancel?: () => void
}

// 이전 평가에서 팀원/과제를 지금 평가로 복사해온다. 평가 생성 시 자동으로
// 복사되던 예전 체크박스 대신, 생성 후 언제든 원할 때 쓰는 별도 액션이다.
// 독립 다이얼로그(ImportFromPreviousDialog)와 빠른 시작 팝업의 탭, 양쪽에서
// 그대로 재사용한다.
export default function ImportFromPreviousPanel({ teamName, currentWorkspaceId, onCancel }: ImportFromPreviousPanelProps) {
  const { workspaces, importFromWorkspace } = useWorkspaces()
  const sourceCandidates = workspaces
    .filter((w) => w.teamName === teamName && w.id !== currentWorkspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const [sourceId, setSourceId] = useState(sourceCandidates[0]?.id ?? '')
  // 팀원은 새 평가를 만들 때 이미 가장 최근 평가에서 자동으로 이어받으므로,
  // 이 패널은 기본적으로 "다른(더 예전) 기간에서 추가로 가져오기" 용도다.
  const [importMembers, setImportMembers] = useState(false)
  const [importTasks, setImportTasks] = useState(false)
  const [done, setDone] = useState(false)

  function handleImport() {
    if (!sourceId || (!importMembers && !importTasks)) return
    importFromWorkspace(currentWorkspaceId, sourceId, { members: importMembers, tasks: importTasks })
    setDone(true)
  }

  if (sourceCandidates.length === 0) {
    return <p className="mt-4 text-sm text-gray-500">가져올 수 있는 이전 평가가 없습니다.</p>
  }

  if (done) {
    return (
      <>
        <p className="mt-4 text-sm text-black">가져왔습니다. 화면을 새로고침하면 반영됩니다.</p>
        <Button variant="primary" onClick={() => window.location.reload()} className="mt-4 w-full">
          새로고침
        </Button>
      </>
    )
  }

  return (
    <>
      <div className="mt-4">
        <label className="block text-sm font-medium text-black">원본 평가</label>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
        >
          {sourceCandidates.map((w) => (
            <option key={w.id} value={w.id}>
              {w.evaluationYear} {w.periodName}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-xs text-gray-400">팀원 명단은 평가를 만들 때 "팀원 정보 복사" 옵션으로 이미 가져왔을 수 있습니다. 이 목록은 그 기간이 아닌 다른 기간에서 추가로 가져올 때 씁니다.</p>
      <div className="mt-2 space-y-1.5">
        <label className="flex items-center gap-2 text-sm text-black">
          <input
            type="checkbox"
            checked={importMembers}
            onChange={(e) => setImportMembers(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          />
          팀원 가져오기
        </label>
        <label className="flex items-center gap-2 text-sm text-black">
          <input
            type="checkbox"
            checked={importTasks}
            onChange={(e) => setImportTasks(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          />
          과제 가져오기 (과제명만, 등급·목표·성과는 새로 입력)
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button variant="primary" onClick={handleImport} disabled={!importMembers && !importTasks}>
          가져오기
        </Button>
      </div>
    </>
  )
}

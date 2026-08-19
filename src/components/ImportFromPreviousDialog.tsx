import { useState } from 'react'
import { useWorkspaces } from '../state/WorkspaceContext'
import Button from './Button'
import IconButton from './IconButton'

interface ImportFromPreviousDialogProps {
  teamName: string
  currentWorkspaceId: string
  onClose: () => void
}

// 이전 평가에서 팀원/과제를 지금 평가로 복사해온다. 평가 생성 시 자동으로
// 복사되던 예전 체크박스 대신, 생성 후 언제든 원할 때 쓰는 별도 액션이다.
export default function ImportFromPreviousDialog({ teamName, currentWorkspaceId, onClose }: ImportFromPreviousDialogProps) {
  const { workspaces, importFromWorkspace } = useWorkspaces()
  const sourceCandidates = workspaces
    .filter((w) => w.teamName === teamName && w.id !== currentWorkspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const [sourceId, setSourceId] = useState(sourceCandidates[0]?.id ?? '')
  const [importMembers, setImportMembers] = useState(true)
  const [importTasks, setImportTasks] = useState(false)
  const [done, setDone] = useState(false)

  function handleImport() {
    if (!sourceId || (!importMembers && !importTasks)) return
    importFromWorkspace(currentWorkspaceId, sourceId, { members: importMembers, tasks: importTasks })
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-black">이전 평가에서 가져오기</h3>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </IconButton>
        </div>

        {sourceCandidates.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">가져올 수 있는 이전 평가가 없습니다.</p>
        ) : done ? (
          <>
            <p className="mt-4 text-sm text-black">가져왔습니다. 화면을 새로고침하면 반영됩니다.</p>
            <Button variant="primary" onClick={() => window.location.reload()} className="mt-4 w-full">
              새로고침
            </Button>
          </>
        ) : (
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
            <div className="mt-3 space-y-1.5">
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
              <Button variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button variant="primary" onClick={handleImport} disabled={!importMembers && !importTasks}>
                가져오기
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

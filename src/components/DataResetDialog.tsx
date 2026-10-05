// 데이터 초기화(계정 메뉴 › 데이터 초기화…): 평가를 열지 않아도 어디서나. 이 계정의 모든 팀 · 평가 데이터를 지운다
// (계정별로 저장 키가 나뉘어 다른 계정 · 기기 데이터는 영향 없음). 되돌릴 수 없어 ① 백업부터 권한다.
import { errText } from '../utils/googleError'
import { useState } from 'react'
import { X } from 'lucide-react'
import { useWorkspaces } from '../state/WorkspaceContext'
import { downloadAllWorkspacesExcelZip } from '../utils/excel'
import { downloadLocalJsonBackup, loadAllWorkspaceEntries, wipeAllAppData } from '../utils/backup'
import { getConnectedEmail, trashAllAppDriveData } from '../utils/googleDrive'
import { clearTaskInputData } from '../utils/progressBoard'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import IconButton from './IconButton'
import Spinner from './Spinner'
import { ic } from './ui/icon'

// inline = 데이터 백업 창 안의 「데이터 초기화」 탭에 그대로 넣는다(별도 팝업 없이)
export default function DataResetDialog({ onClose, inline = false }: { onClose: () => void; inline?: boolean }) {
  const { workspaces } = useWorkspaces()
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null)
  const [resetMode, setResetMode] = useState<'local' | 'drive' | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [backupJson, setBackupJson] = useState(true)
  const [backupExcel, setBackupExcel] = useState(true)
  // 과제 입력(이 브라우저에 저장된 추진현황)도 같이 지우기
  const [clearTasks, setClearTasks] = useState(false)
  const isBusy = loadingLabel !== null
  const hasAnyWorkspaceData = workspaces.length > 0

  async function handleSelectedBackup() {
    if (backupJson) {
      setLoadingLabel('로컬 백업 파일 생성 중...')
      downloadLocalJsonBackup()
    }
    if (backupExcel) {
      setLoadingLabel('엑셀 백업 파일 생성 중...')
      await downloadAllWorkspacesExcelZip(loadAllWorkspaceEntries())
    }
    setLoadingLabel(null)
  }

  async function handleResetConfirm() {
    const mode = resetMode
    setResetMode(null)
    setResetError(null)
    if (mode === 'drive') {
      setLoadingLabel('Google Drive 데이터를 휴지통으로 옮기는 중...')
      try {
        await trashAllAppDriveData()
      } catch (err) {
        setLoadingLabel(null)
        setResetError(errText(err, 'Google Drive 데이터를 지우지 못했습니다. 이 브라우저 데이터는 그대로입니다.'))
        return
      }
    }
    if (clearTasks) clearTaskInputData()
    if (hasAnyWorkspaceData) wipeAllAppData()
    else window.location.reload()
  }

  const body = (
    <>
      <div className="space-y-3">
        <p className="text-[length:calc(14px*var(--ui-fs,1))] leading-relaxed text-label">
          <span className="font-semibold text-danger">전체 데이터 초기화</span> · 이 계정의 <b>모든 팀 · 평가 데이터</b>를 지웁니다. 먼저 백업하세요.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-danger/25 bg-danger/[0.04] px-4 py-3">
          <span className="text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">① 백업</span>
          <label className="flex items-center gap-1.5 text-[length:calc(14px*var(--ui-fs,1))] text-label" title="모든 팀 · 평가 · 과제 · 팀원 · 성장 · 면담 데이터">
            <input type="checkbox" checked={backupJson} onChange={(e) => setBackupJson(e.target.checked)} />
            JSON 원본
          </label>
          <label className="flex items-center gap-1.5 text-[length:calc(14px*var(--ui-fs,1))] text-label">
            <input type="checkbox" checked={backupExcel} onChange={(e) => setBackupExcel(e.target.checked)} />
            Excel 보관용
          </label>
          <Button variant="secondary" size="sm" onClick={handleSelectedBackup} disabled={isBusy || !hasAnyWorkspaceData || (!backupJson && !backupExcel)} className="ml-auto">
            선택 항목 백업
          </Button>
          {isBusy && (
            <span className="flex w-full items-center gap-1.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
              <Spinner className="h-3.5 w-3.5 text-accent" />
              {loadingLabel}
            </span>
          )}
        </div>

        <label className="flex items-start gap-2 rounded-card border border-separator px-4 py-2.5 text-[length:calc(14px*var(--ui-fs,1))] text-label">
          <input type="checkbox" className="mt-1" checked={clearTasks} onChange={(e) => setClearTasks(e.target.checked)} />
          <span>
            <span className="font-semibold">② 과제 입력 데이터도 같이 지우기</span>
            <span className="ml-1.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-2">
              이 브라우저의 추진현황 · 저장 안 한 고친 내용 · 만든 연도 · 진척률 수정값(구글시트는 그대로)
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col rounded-card border border-separator p-4">
            <p className="text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-label">③ 이 브라우저만 초기화</p>
            <p className="mt-1 flex-1 text-[length:calc(13px*var(--ui-fs,1))] leading-relaxed text-label-2">Google Drive에 저장한 데이터는 남아, 다시 연결하면 복원됩니다.</p>
            <Button variant="secondary" size="sm" onClick={() => setResetMode('local')} disabled={!hasAnyWorkspaceData && !clearTasks} className="mt-3 self-start">
              이 브라우저만 초기화
            </Button>
          </div>
          <div className="flex flex-col rounded-card border border-danger/30 p-4">
            <p className="text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-danger">③ Google Drive 포함 전체 초기화</p>
            <p className="mt-1 flex-1 text-[length:calc(13px*var(--ui-fs,1))] leading-relaxed text-label-2">
              Drive의 앱 전용 성장관리 데이터도 휴지통으로 옮깁니다(30일 안에 되살림 가능).
            </p>
            <Button variant="secondary" size="sm" onClick={() => setResetMode('drive')} disabled={!getConnectedEmail()} className="mt-3 self-start !text-danger">
              Drive 포함 전체 초기화
            </Button>
            {!getConnectedEmail() && <p className="mt-1.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">Google 계정이 연결돼 있어야 합니다.</p>}
            {resetError && <p className="mt-1.5 text-[length:calc(13px*var(--ui-fs,1))] text-danger">{resetError}</p>}
          </div>
        </div>
      </div>
    </>
  )
  const confirm = (
    <ConfirmDialog
      open={resetMode !== null}
      title={resetMode === 'drive' ? 'Google Drive 포함 전체 초기화' : '이 브라우저 데이터만 초기화'}
      message={
        (resetMode === 'drive'
          ? `이 브라우저의 팀 ${new Set(workspaces.map((w) => w.teamName)).size}개, 평가 ${workspaces.length}개 데이터를 지우고,\n${getConnectedEmail() ?? ''} 드라이브의 성장관리 폴더를 휴지통으로 옮깁니다.\n휴지통은 드라이브에서 30일 안에 되살릴 수 있습니다. 계속하시겠습니까?`
          : `이 브라우저의 팀 ${new Set(workspaces.map((w) => w.teamName)).size}개, 평가 ${workspaces.length}개 데이터를 지우고 처음 화면으로 돌아갑니다.\nGoogle Drive에 저장한 데이터는 남아 있어 다시 연결하면 복원할 수 있습니다. 계속하시겠습니까?`) +
        (clearTasks ? '\n\n과제 입력 데이터(이 브라우저에 저장된 추진현황 · 고친 내용 · 만든 연도)도 함께 지웁니다.' : '')
      }
      onConfirm={handleResetConfirm}
      onCancel={() => setResetMode(null)}
    />
  )

  if (inline) {
    return (
      <div>
        {body}
        {confirm}
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25" onClick={() => !isBusy && onClose()} />
      <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[12px] bg-white shadow-dialog">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[length:calc(15px*var(--ui-fs,1))] font-semibold text-label">데이터 초기화</h2>
          <IconButton onClick={onClose} aria-label="닫기" title="닫기">
            <X {...ic} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2">{body}</div>
      </div>
      {confirm}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import { buildFullSyncWorkbook, parseFullSyncWorkbook } from '../utils/excel'
import { downloadFullSyncFromDrive, isGoogleDriveConfigured, uploadFullSyncToDrive } from '../utils/googleDrive'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import Spinner from './Spinner'

function CloudSyncIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 14.5A4.5 4.5 0 0 1 6.5 6a5.5 5.5 0 0 1 10.6 1.7A4 4 0 0 1 17 15" />
      <path d="m9 17 3-3 3 3" />
      <path d="m9 20 3-3 3 3" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  )
}

type Busy = 'upload' | 'download' | null
type SyncKind = 'upload' | 'download'
interface LastSync {
  kind: SyncKind
  at: string
  webViewLink?: string
}

function lastSyncKey(workspaceId: string) {
  return `gsync-last-${workspaceId}`
}

function readLastSync(workspaceId: string): LastSync | null {
  try {
    const raw = localStorage.getItem(lastSyncKey(workspaceId))
    return raw ? (JSON.parse(raw) as LastSync) : null
  } catch {
    return null
  }
}

function writeLastSync(workspaceId: string, info: LastSync) {
  try {
    localStorage.setItem(lastSyncKey(workspaceId), JSON.stringify(info))
  } catch {
    // 저장 실패해도 메뉴 안내 문구가 안 뜰 뿐, 동기화 자체는 이미 끝난 상태다.
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 팀/평가기간 데이터를 다루는 화면(데이터·평가하기·결과·성장관리) 어디서나
// 같은 하나의 버튼으로 구글 드라이브에 통째로 올리고 내려받게 한다. 화면마다
// "엑셀 다운로드", "구글에 올리기" 버튼이 따로 있으면 헷갈리므로, 구글 동기화는
// 이 메뉴 하나로 모은다. 엑셀 다운로드(PC 저장)는 각 화면에 그대로 둔다 --
// 구글 로그인 없이도 쓰던 기존 흐름이라 건드리지 않는다.
export default function GoogleSyncMenu() {
  const { state, dispatch, workspaceId } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const configured = isGoogleDriveConfigured()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<LastSync | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // 메뉴를 열 때마다 이 평가의 마지막 동기화 기록을 다시 읽는다 -- 진행바가
  // 끝난 뒤 "된 건지 안 된 건지" 알 수 없다는 문제를 없애기 위해, 성공/실패
  // 여부와 마지막 시각을 항상 눈에 보이게 남겨둔다.
  useEffect(() => {
    if (open) setLastSync(readLastSync(workspaceId))
  }, [open, workspaceId])

  if (!configured) return null

  const workspaceLabel = currentWorkspace ? `${currentWorkspace.teamName}_${currentWorkspace.periodName}` : '평가데이터'

  async function handleUpload() {
    setError(null)
    setBusy('upload')
    try {
      const { workbook, filename } = buildFullSyncWorkbook(state, workspaceLabel)
      const buffer = await workbook.xlsx.writeBuffer()
      const { webViewLink } = await uploadFullSyncToDrive(workspaceId, buffer as ArrayBuffer, filename)
      const info: LastSync = { kind: 'upload', at: new Date().toISOString(), webViewLink }
      writeLastSync(workspaceId, info)
      setLastSync(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : '구글 드라이브 업로드에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function handleDownload() {
    setError(null)
    setBusy('download')
    try {
      const buffer = await downloadFullSyncFromDrive(workspaceId)
      const nextState = await parseFullSyncWorkbook(buffer)
      dispatch({ type: 'LOAD_STATE', payload: nextState })
      setConfirmOpen(false)
      const info: LastSync = { kind: 'download', at: new Date().toISOString() }
      writeLastSync(workspaceId, info)
      setLastSync(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : '구글 드라이브에서 불러오지 못했습니다.')
      setConfirmOpen(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5">
        <CloudSyncIcon className="h-4 w-4" /> Google 동기화
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-md border border-gray-200 bg-white p-3 shadow-md">
          <p className="text-xs font-semibold text-gray-500">
            {currentWorkspace ? `${currentWorkspace.teamName} · ${currentWorkspace.periodName}` : '현재 평가'}의 데이터
          </p>
          <p className="mt-1 text-xs text-gray-400">과제·팀원·기여도·평가기준·피어리뷰·면담기록을 모두 한 번에 동기화합니다.</p>

          <div className="mt-3 space-y-2">
            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5"
            >
              {busy === 'upload' && <Spinner className="h-3.5 w-3.5 text-white" />}
              {busy === 'upload' ? '업로드 중...' : '구글 드라이브에 업로드'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(true)}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5"
            >
              {busy === 'download' && <Spinner className="h-3.5 w-3.5" />}
              {busy === 'download' ? '불러오는 중...' : '구글 드라이브에서 불러오기'}
            </Button>
          </div>

          {error && <p className="mt-2 text-xs text-danger">{error}</p>}

          {!error && lastSync && (
            <div className="mt-3 flex items-start gap-1.5 rounded-md bg-green-50 px-2.5 py-2 text-xs text-green-700">
              <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p>
                  {fmtTime(lastSync.at)}에 {lastSync.kind === 'upload' ? '업로드' : '불러오기'} 완료
                </p>
                {lastSync.kind === 'upload' && lastSync.webViewLink && (
                  <a
                    href={lastSync.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2 hover:opacity-80"
                  >
                    시트에서 확인하기 →
                  </a>
                )}
              </div>
            </div>
          )}

          {!error && !lastSync && (
            <p className="mt-3 text-xs text-gray-400">아직 이 평가를 구글 드라이브에 동기화한 기록이 없습니다.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="구글 드라이브에서 불러오기"
        message="현재 화면에 입력된 모든 데이터가 구글 드라이브에 저장된 내용으로 바뀝니다. 계속할까요?"
        confirmLabel="불러오기"
        tone="danger"
        onConfirm={handleDownload}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

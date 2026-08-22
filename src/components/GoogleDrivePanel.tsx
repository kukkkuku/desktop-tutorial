import { useEffect, useRef, useState, type Dispatch } from 'react'
import { createPortal } from 'react-dom'
import type ExcelJS from 'exceljs'
import type { AppAction } from '../state/appReducer'
import type { AppState, WorkspaceMeta } from '../types'
import {
  connectDrive,
  fetchSyncPayload,
  getConnectedEmail,
  getPeriodFolderLink,
  hasExistingSave,
  isConnected,
  isGoogleDriveConfigured,
  listSavedPeriods,
  periodKey,
  saveAllToDrive,
  buildSyncPayload,
  type SaveAllResult,
  type SaveMode,
  type SavedPeriodSummary,
} from '../utils/googleDrive'
import Button from './Button'
import Spinner from './Spinner'

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  )
}

function DriveIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7.5 3h9L22 12l-4.5 8h-11L2 12z" />
      <path d="M7.5 3 12 12l-4.5 8M16.5 3 12 12l4.5 8M2 12h20" />
    </svg>
  )
}

const ACCOUNT_LINKS = [
  { label: '캘린더 이동', href: 'https://calendar.google.com/', Icon: CalendarIcon },
  { label: '구글메일 이동', href: 'https://mail.google.com/', Icon: MailIcon },
  { label: '구글 드라이브로 이동', href: 'https://drive.google.com/', Icon: DriveIcon },
] as const

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function lastSaveKey(workspaceId: string) {
  return `gdrive-last-save-${workspaceId}`
}

function readLastSave(workspaceId: string): (SaveAllResult & { at: string }) | null {
  try {
    const raw = localStorage.getItem(lastSaveKey(workspaceId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLastSave(workspaceId: string, result: SaveAllResult) {
  try {
    localStorage.setItem(lastSaveKey(workspaceId), JSON.stringify({ ...result, at: new Date().toISOString() }))
  } catch {
    // 저장 실패해도 방금 저장 자체는 이미 끝난 상태라 안내만 못 뜬다.
  }
}

interface GoogleDrivePanelProps {
  workspace: WorkspaceMeta
  state: AppState
  dispatch: Dispatch<AppAction>
  buildReportWorkbook: () => ExcelJS.Workbook
  buildSheetWorkbook: () => ExcelJS.Workbook
  // 연결(재연결 포함)에 성공했을 때 알려준다 -- 부모(DataManagerDrawer)가
  // 관리자 이메일 여부에 따라 보여주는 다른 탭을 다시 확인할 수 있도록.
  onConnected?: () => void
}

type Busy = 'connect' | 'checking' | 'saving' | 'listing' | 'restoring' | null

// "데이터 관리" 드로어의 Google Drive 탭 내용. 연결/저장/불러오기/파일보기를
// 이 안에서 모두 처리한다. 자체 트리거 버튼이나 팝업 창이 없는 순수
// 콘텐츠라, 드로어가 열려 있는 동안 항상 보인다.
export default function GoogleDrivePanel({ workspace, state, dispatch, buildReportWorkbook, buildSheetWorkbook, onConnected }: GoogleDrivePanelProps) {
  const configured = isGoogleDriveConfigured()
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  const [saveChoice, setSaveChoice] = useState<{ modifiedAt?: string } | null>(null)
  const [lastSave, setLastSave] = useState<(SaveAllResult & { at: string }) | null>(null)

  const [restoreList, setRestoreList] = useState<SavedPeriodSummary[] | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<SavedPeriodSummary | null>(null)

  const [folderLink, setFolderLink] = useState<string | null | undefined>(undefined)

  // 연결된 계정 칩을 누르면 (예전처럼 계정 상세정보 대신) 캘린더/Gmail/Drive로
  // 바로 넘어갈 수 있는 짧은 메뉴만 띄운다.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountBtnRef = useRef<HTMLButtonElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [accountMenuPos, setAccountMenuPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!accountMenuOpen) return
    const rect = accountBtnRef.current?.getBoundingClientRect()
    if (rect) setAccountMenuPos({ top: rect.bottom + 6, left: rect.left })
  }, [accountMenuOpen])

  useEffect(() => {
    if (!accountMenuOpen) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (accountBtnRef.current?.contains(target)) return
      if (accountMenuRef.current?.contains(target)) return
      setAccountMenuOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    setError(null)
    setSaveChoice(null)
    setRestoreList(null)
    setRestoreTarget(null)
    setFolderLink(undefined)
    setLastSave(readLastSave(workspace.id))
  }, [workspace.id])

  if (!configured) {
    return (
      <p className="px-1 py-6 text-center text-sm text-gray-400">
        Google Drive 연동이 설정되지 않았습니다. 관리자에게 설정을 요청해주세요.
      </p>
    )
  }

  async function withBusy(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    setError(null)
    setBusy(kind)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청을 처리하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  function handleConnect() {
    void withBusy('connect', async () => {
      await connectDrive()
      onConnected?.()
    })
  }

  function handleSaveClick() {
    void withBusy('checking', async () => {
      const { existing, modifiedTime } = await hasExistingSave(workspace)
      if (existing) setSaveChoice({ modifiedAt: modifiedTime })
      else await runSave('update')
    })
  }

  async function runSave(mode: SaveMode) {
    setSaveChoice(null)
    await withBusy('saving', async () => {
      const reportWb = buildReportWorkbook()
      const sheetWb = buildSheetWorkbook()
      const [xlsxBuffer, sheetBuffer] = await Promise.all([reportWb.xlsx.writeBuffer(), sheetWb.xlsx.writeBuffer()])
      const payload = buildSyncPayload(state, workspace)
      const result = await saveAllToDrive(workspace, xlsxBuffer as ArrayBuffer, sheetBuffer as ArrayBuffer, payload, mode)
      writeLastSave(workspace.id, result)
      setLastSave({ ...result, at: new Date().toISOString() })
    })
  }

  function handleListRestores() {
    void withBusy('listing', async () => {
      const list = await listSavedPeriods()
      setRestoreList(list)
    })
  }

  async function doRestore(target: SavedPeriodSummary, backupFirst: boolean) {
    await withBusy('restoring', async () => {
      if (backupFirst) await runSave('update')
      const payload = await fetchSyncPayload(target.fileId)
      dispatch({ type: 'LOAD_STATE', payload: payload.state })
      setRestoreTarget(null)
      setRestoreList(null)
    })
  }

  function handleShowFolder() {
    void withBusy('listing', async () => {
      const link = await getPeriodFolderLink(workspace)
      setFolderLink(link)
    })
  }

  return (
    <div>
      <p className="text-xs text-gray-500">
        {workspace.teamName} · {workspace.periodName}
      </p>

      {/* 연결 -- 어느 계정에 연결됐는지 이메일로 명확히 보여준다. */}
      <div className="mt-3 flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
        {isConnected() && getConnectedEmail() ? (
          <button
            ref={accountBtnRef}
            type="button"
            onClick={() => setAccountMenuOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-gray-700 hover:text-black"
          >
            {getConnectedEmail()}
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">연결됨</span>
          </button>
        ) : (
          <span className="text-sm text-gray-700">{isConnected() ? '내 Google 드라이브에 연결됨' : '아직 연결되지 않음'}</span>
        )}
        <Button variant="secondary" onClick={handleConnect} disabled={busy !== null} className="px-2.5 py-1 text-xs">
          {busy === 'connect' ? <Spinner className="h-3.5 w-3.5" /> : isConnected() ? '다시 연결' : 'Drive 연결'}
        </Button>
      </div>

      {accountMenuOpen &&
        accountMenuPos &&
        createPortal(
          <div
            ref={accountMenuRef}
            style={{ position: 'fixed', top: accountMenuPos.top, left: accountMenuPos.left }}
            className="z-50 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
          >
            {ACCOUNT_LINKS.map(({ label, href, Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-black"
              >
                <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                {label}
              </a>
            ))}
          </div>,
          document.body,
        )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {/* 전체 데이터 저장 */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-sm font-semibold text-black">전체 데이터 저장</p>
        <p className="mt-0.5 text-xs text-gray-500">Excel 결과, 원본 데이터(JSON), 보기용 Google 시트를 함께 저장합니다.</p>

        {saveChoice ? (
          <div className="mt-2 space-y-1.5 rounded-md border border-gray-200 p-2.5">
            <p className="text-xs text-gray-600">
              이미 저장된 데이터가 있습니다{saveChoice.modifiedAt ? ` (마지막 수정: ${fmtTime(saveChoice.modifiedAt)})` : ''}. 어떻게 저장할까요?
            </p>
            <div className="flex gap-1.5">
              <Button variant="primary" onClick={() => void runSave('update')} disabled={busy !== null} className="flex-1 px-2.5 py-1.5 text-xs">
                업데이트
              </Button>
              <Button variant="secondary" onClick={() => void runSave('new-version')} disabled={busy !== null} className="flex-1 px-2.5 py-1.5 text-xs">
                새 버전으로 저장
              </Button>
            </div>
            <button onClick={() => setSaveChoice(null)} className="text-xs text-gray-400 hover:text-black">
              취소
            </button>
          </div>
        ) : (
          <Button
            variant="primary"
            onClick={handleSaveClick}
            disabled={busy !== null}
            className="mt-2 flex w-full items-center justify-center gap-1.5 px-3 py-1.5"
          >
            {(busy === 'checking' || busy === 'saving') && <Spinner className="h-3.5 w-3.5 text-white" />}
            {busy === 'checking' ? '확인 중...' : busy === 'saving' ? '저장 중...' : '전체 데이터 저장'}
          </Button>
        )}

        {lastSave && !saveChoice && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md bg-green-50 px-2.5 py-2 text-xs text-green-700">
            <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-0.5">
              <p>{fmtTime(lastSave.at)}에 저장 완료</p>
              <div className="flex flex-wrap gap-x-3">
                <a href={lastSave.xlsxLink} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                  Excel
                </a>
                <a href={lastSave.sheetLink} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                  Google 시트
                </a>
                <a href={lastSave.folderLink} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                  폴더 열기
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drive에서 불러오기 */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-sm font-semibold text-black">Drive에서 불러오기</p>
        <p className="mt-0.5 text-xs text-gray-500">다른 기기에서 저장해둔 평가 데이터를 이 화면으로 불러옵니다.</p>

        {!restoreList && (
          <Button variant="secondary" onClick={handleListRestores} disabled={busy !== null} className="mt-2 w-full px-3 py-1.5">
            {busy === 'listing' ? <Spinner className="mx-auto h-3.5 w-3.5" /> : '저장된 평가 목록 보기'}
          </Button>
        )}

        {restoreList && restoreList.length === 0 && <p className="mt-2 text-xs text-gray-400">Drive에 저장된 평가가 아직 없습니다.</p>}

        {restoreList && restoreList.length > 0 && (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {restoreList.map((item) => (
              <li key={item.fileId} className="rounded-md border border-gray-200 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-black">
                      {item.teamName || '(팀명 없음)'} · {item.periodName || '(기간 없음)'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      저장일 {fmtTime(item.createdAt)} · 수정일 {fmtTime(item.modifiedAt)}
                      {item.periodKey === periodKey(workspace) ? ' · 현재 평가' : ''}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setRestoreTarget(item)} disabled={busy !== null} className="shrink-0 px-2 py-1 text-xs">
                    불러오기
                  </Button>
                </div>

                {restoreTarget?.fileId === item.fileId && (
                  <div className="mt-2 space-y-1.5 rounded-md border border-blue-100 bg-blue-50 p-2 text-xs text-gray-700">
                    <p>현재 화면의 데이터가 이 평가 데이터로 바뀝니다. 계속할까요?</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="primary" onClick={() => void doRestore(item, true)} disabled={busy !== null} className="px-2.5 py-1 text-xs">
                        {busy === 'restoring' && <Spinner className="mr-1 inline h-3 w-3" />}지금 데이터 백업 후 교체
                      </Button>
                      <Button variant="danger" onClick={() => void doRestore(item, false)} disabled={busy !== null} className="px-2.5 py-1 text-xs">
                        바로 교체
                      </Button>
                      <button onClick={() => setRestoreTarget(null)} className="text-gray-400 hover:text-black">
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 저장된 파일 보기 */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-sm font-semibold text-black">저장된 파일 보기</p>
        {folderLink === undefined && (
          <Button variant="secondary" onClick={handleShowFolder} disabled={busy !== null} className="mt-2 w-full px-3 py-1.5">
            이 평가의 Drive 폴더 확인
          </Button>
        )}
        {folderLink === null && <p className="mt-2 text-xs text-gray-400">아직 이 평가를 Drive에 저장한 적이 없습니다.</p>}
        {folderLink && (
          <a href={folderLink} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-medium text-accent underline underline-offset-2">
            Drive에서 폴더 열기 →
          </a>
        )}
      </div>
    </div>
  )
}

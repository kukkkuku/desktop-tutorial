// 구글 드라이브 저장 -- "성과평가 결과" 화면의 선택 기능이다. Google Identity
// Services(GIS)로 브라우저에서 바로 OAuth 토큰을 받고, Drive API v3에
// 올린다. 서버가 따로 필요 없어 이 정적 사이트 구조를 그대로 유지할 수 있다.
// 각 팀장이 자기 구글 계정으로 로그인하므로 팀장마다 자기 드라이브의
// "성장관리" 폴더에 자기 데이터만 쌓인다(공용 계정을 쓰지 않는다).
//
// 세 가지를 저장한다:
//   1) *_성과관리.xlsx    -- 사람이 보는 결과 리포트(기존 "Excel 다운로드"와 동일 내용)
//   2) *_성장관리_data.json -- 앱이 그대로 다시 읽어들일 수 있는 원본 데이터(source of truth)
//   3) *_성과관리_GoogleSheet -- 구글 시트로 변환한 보기용 사본(사람이 확인하기 편하도록)
// 이 중 실제 "불러오기(복원)"는 2) JSON만 사용한다. 구글 시트는 사람이 보는
// 용도일 뿐 앱이 다시 읽지 않는다(이번 단계에서는 앱→시트 단방향만 구현).
//
// 쓰려면 Google Cloud Console에서 OAuth 클라이언트 ID를 만들고
// VITE_GOOGLE_CLIENT_ID로 빌드 시 넣어줘야 한다(README 참고). 설정 안 돼
// 있으면 isGoogleDriveConfigured()가 false를 반환하고, 호출부는 버튼을
// 비활성 상태로만 보여주면 된다.

import type { AppState, EvaluationCycle, WorkspaceMeta } from '../types'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
// drive.file: 이 앱이 만들었거나 사용자가 직접 연 파일에만 접근한다(드라이브
// 전체를 훑어보는 권한이 아니다) -- 필요 최소 권한 원칙. userinfo.email은
// "지금 어느 계정에 연결됐는지"를 화면에 이메일로 명확히 보여주기 위한
// 것으로, 민감하지 않은 스코프다. calendar.events는 면담 일정을 이 계정의
// 구글 캘린더에도 등록하기 위한 것(googleCalendar.ts) -- 앱이 만든 일정만
// 만들고/고치고/지울 수 있고, 기존 캘린더 전체를 읽는 권한은 없다.
const DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events'
const APP_TAG = 'team-performance-evaluation'
const ROOT_FOLDER_NAME = '성장관리'

export function isGoogleDriveConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface GoogleTokenClient {
  requestAccessToken: () => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: GoogleTokenResponse) => void
          }) => GoogleTokenClient
        }
      }
    }
  }
}

let gisLoadPromise: Promise<void> | null = null

// 관리자 초대 메일(adminInvite.ts)도 같은 Google Identity Services 스크립트가
// 필요해서, 중복 로드하지 않도록 이 로더를 그대로 공유한다.
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다.'))
    document.head.appendChild(script)
  })
  return gisLoadPromise
}

// 같은 브라우저 세션에서는 매번 로그인 팝업을 띄우지 않도록 토큰을
// 만료 1분 전까지 재사용한다.
let cachedToken: { token: string; expiresAt: number } | null = null
// 지금 연결된 계정 이메일 -- "내 Google 드라이브에 연결됨"처럼 애매하게
// 두지 않고 실제 어느 계정인지 화면에 보여주기 위해 캐시해둔다.
let cachedEmail: string | null = null

export function isConnected(): boolean {
  return cachedToken !== null && cachedToken.expiresAt - 60_000 > Date.now()
}

export function getConnectedEmail(): string | null {
  return isConnected() ? cachedEmail : null
}

// 헤더의 "로그아웃" -- 캐시된 토큰/이메일만 지운다. 다음에 뭔가 Google API를
// 호출하면(연결 버튼이든 자동 로그인 게이트든) 새로 로그인 팝업을 띄운다.
export function disconnectDrive(): void {
  cachedToken = null
  cachedEmail = null
}

async function fetchConnectedEmail(accessToken: string): Promise<void> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return
    const data = (await res.json()) as { email?: string }
    cachedEmail = data.email ?? null
  } catch {
    cachedEmail = null
  }
}

function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error('Google Client ID가 설정되지 않았습니다.'))
      return
    }
    if (!window.google) {
      reject(new Error('Google 로그인 스크립트가 로드되지 않았습니다.'))
      return
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) reject(new Error(resp.error || '로그인이 취소되었습니다.'))
        else {
          cachedToken = { token: resp.access_token, expiresAt: Date.now() + (resp.expires_in ?? 3300) * 1000 }
          void fetchConnectedEmail(resp.access_token).finally(() => resolve(resp.access_token!))
        }
      },
    })
    tokenClient.requestAccessToken()
  })
}

// "Drive 연결" 버튼에서 명시적으로 호출한다. 로그인 팝업을 띄우고, 성공하면
// isConnected()가 true를 반환하게 된다.
export async function connectDrive(): Promise<void> {
  await loadGis()
  await requestAccessToken()
}

// googleCalendar.ts도 이 토큰을 그대로 재사용한다 -- 같은 로그인, scope만
// 위에서 함께 요청해둔 것.
export async function getAccessToken(): Promise<string> {
  await loadGis()
  if (isConnected()) return cachedToken!.token
  return requestAccessToken()
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google Drive 요청에 실패했습니다 (${res.status}). ${text}`)
  }
  return res
}

// ---------- 폴더 관리 ----------
// drive.file 스코프에서는 이 앱이 만든 파일/폴더만 보이므로, 이름으로
// 찾아서 있으면 재사용하고 없으면 새로 만든다 -- 다시 저장해도 "성장관리"
// 폴더가 중복 생성되지 않는다.

async function findFolderByName(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : ''
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    accessToken,
  )
  const data = (await res.json()) as { files?: { id: string }[] }
  return data.files && data.files.length > 0 ? data.files[0].id : null
}

async function createFolder(accessToken: string, name: string, parentId?: string, appProperties?: Record<string, string>): Promise<string> {
  const res = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
      appProperties,
    }),
  })
  const data = (await res.json()) as { id: string }
  return data.id
}

let rootFolderIdCache: string | null = null

async function ensureRootFolder(accessToken: string): Promise<string> {
  if (rootFolderIdCache) return rootFolderIdCache
  const existing = await findFolderByName(accessToken, ROOT_FOLDER_NAME)
  rootFolderIdCache = existing ?? (await createFolder(accessToken, ROOT_FOLDER_NAME))
  return rootFolderIdCache
}

function periodFolderName(workspace: WorkspaceMeta): string {
  return `${workspace.evaluationYear}_${workspace.periodName}`.replace(/[\\/:*?"<>|]/g, '_')
}

function sanitizeKeyPart(v: string | number): string {
  return String(v).replace(/[^\w가-힣.-]/g, '_')
}

// 같은 팀+평가기간을 가리키는 안정적인 식별자. workspace.id는 브라우저마다
// 새로 생성되는 임의 UUID라 기기마다 값이 달라진다 -- 그걸 그대로 드라이브
// 매칭 키로 쓰면 다른 기기에서 "2026년 상반기"를 새로 만들었을 때 기존
// 저장분을 못 찾고 매번 새 파일을 만들게 된다. 그래서 팀명·연도·주기·기간
// 코드처럼 내용으로 정해지는 값들을 합쳐 기기와 무관한 키로 쓴다.
export function periodKey(workspace: WorkspaceMeta): string {
  return [workspace.teamName, workspace.evaluationYear, workspace.evaluationCycle, workspace.evaluationPeriodCode]
    .map(sanitizeKeyPart)
    .join('__')
}

function teamKey(teamName: string): string {
  return sanitizeKeyPart(teamName)
}

// "성장관리" 바로 아래 팀 이름 폴더. 여러 팀을 같은 계정으로 관리해도
// 기간 폴더가 팀 구분 없이 뒤섞이지 않도록, 팀명을 appProperties에 심어
// 찾는다(폴더 이름을 바꿔도 다시 찾을 수 있게).
async function ensureTeamFolder(accessToken: string, rootId: string, teamName: string): Promise<string> {
  const key = teamKey(teamName)
  const q = `appProperties has { key='teamKey' and value='${key}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    accessToken,
  )
  const data = (await res.json()) as { files?: { id: string }[] }
  if (data.files && data.files.length > 0) return data.files[0].id

  return createFolder(accessToken, teamName.trim() || '팀', rootId, { app: APP_TAG, teamKey: key, kind: 'team-folder' })
}

// 팀+평가기간 단위 폴더("성장관리/{팀명}/{연도}_{기간}/"). periodKey를
// appProperties에 심어두고 그걸로 찾으므로, 다른 기기에서 같은 팀+기간을
// 열어도(로컬 workspace.id는 달라도) 항상 같은 폴더를 다시 찾아 재사용한다.
async function ensurePeriodFolder(accessToken: string, workspace: WorkspaceMeta): Promise<string> {
  const key = periodKey(workspace)
  const q = `appProperties has { key='periodKey' and value='${key}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    accessToken,
  )
  const data = (await res.json()) as { files?: { id: string }[] }
  if (data.files && data.files.length > 0) return data.files[0].id

  const rootId = await ensureRootFolder(accessToken)
  const teamId = await ensureTeamFolder(accessToken, rootId, workspace.teamName)
  return createFolder(accessToken, periodFolderName(workspace), teamId, { app: APP_TAG, periodKey: key, kind: 'period-folder' })
}

// ---------- 파일 업로드(생성/업서트) ----------

export type ArtifactKind = 'xlsx' | 'json' | 'sheet'

function buildMultipartBody(metadata: Record<string, unknown>, content: BlobPart, contentType: string): { body: Blob; boundary: string } {
  const boundary = 'perf-eval-drive-' + Date.now()
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  const filePartHeader = `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
  const closing = `\r\n--${boundary}--`
  return { body: new Blob([metadataPart, filePartHeader, content, closing]), boundary }
}

async function findArtifact(accessToken: string, key: string, kind: ArtifactKind): Promise<{ id: string; modifiedTime: string } | null> {
  const q = `appProperties has { key='periodKey' and value='${key}' } and appProperties has { key='kind' and value='${kind}' } and trashed=false`
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&spaces=drive`,
    accessToken,
  )
  const data = (await res.json()) as { files?: { id: string; modifiedTime: string }[] }
  return data.files && data.files.length > 0 ? data.files[0] : null
}

// 이미 저장한 적이 있는 평가인지(=업데이트/새 버전 선택지를 보여줘야 하는지)
// 확인한다. JSON 파일 존재 여부로 판단한다(세 파일은 항상 같이 저장되므로).
// 팀+기간이 같으면(로컬 workspace.id가 달라도) 같은 저장분으로 취급한다.
export async function hasExistingSave(workspace: WorkspaceMeta): Promise<{ existing: boolean; modifiedTime?: string }> {
  const accessToken = await getAccessToken()
  const found = await findArtifact(accessToken, periodKey(workspace), 'json')
  return found ? { existing: true, modifiedTime: found.modifiedTime } : { existing: false }
}

export type SaveMode = 'update' | 'new-version'

interface UploadArtifactParams {
  accessToken: string
  folderId: string
  periodKeyValue: string
  kind: ArtifactKind
  name: string
  content: BlobPart
  contentType: string
  convertToGoogleSheet?: boolean
  mode: SaveMode
  extraAppProperties?: Record<string, string>
}

async function uploadArtifact({ accessToken, folderId, periodKeyValue, kind, name, content, contentType, convertToGoogleSheet, mode, extraAppProperties }: UploadArtifactParams): Promise<{ id: string; webViewLink: string }> {
  const existing = mode === 'update' ? await findArtifact(accessToken, periodKeyValue, kind) : null

  if (existing) {
    const { body, boundary } = buildMultipartBody({ name }, content, contentType)
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,webViewLink`,
      accessToken,
      { method: 'PATCH', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    )
    const data = (await res.json()) as { id: string; webViewLink: string }
    return data
  }

  const finalName = mode === 'new-version' ? `${name}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}` : name
  const metadata: Record<string, unknown> = {
    name: finalName,
    parents: [folderId],
    appProperties: { app: APP_TAG, periodKey: periodKeyValue, kind, ...extraAppProperties },
  }
  if (convertToGoogleSheet) metadata.mimeType = 'application/vnd.google-apps.spreadsheet'
  const { body, boundary } = buildMultipartBody(metadata, content, contentType)
  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    accessToken,
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  )
  const data = (await res.json()) as { id: string; webViewLink: string }
  return data
}

// ---------- 원본 데이터(JSON) 저장 포맷 ----------
// 이 파일이 source of truth다. 앱은 이 파일만 다시 읽어 복원한다.

export interface DriveSyncPayload {
  version: 1
  savedAt: string
  workspaceId: string
  teamName: string
  periodName: string
  evaluationYear: number
  evaluationCycle: EvaluationCycle
  evaluationPeriodCode: string
  state: AppState
}

export function buildSyncPayload(state: AppState, workspace: WorkspaceMeta): DriveSyncPayload {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    workspaceId: workspace.id,
    teamName: workspace.teamName,
    periodName: workspace.periodName,
    evaluationYear: workspace.evaluationYear,
    evaluationCycle: workspace.evaluationCycle,
    evaluationPeriodCode: workspace.evaluationPeriodCode,
    state,
  }
}

// ---------- 전체 저장(엑셀 + JSON + 구글시트) ----------

export interface SaveAllResult {
  xlsxLink: string
  jsonLink: string
  sheetLink: string
  folderLink: string
}

export async function saveAllToDrive(
  workspace: WorkspaceMeta,
  xlsxBuffer: ArrayBuffer,
  sheetBuffer: ArrayBuffer,
  payload: DriveSyncPayload,
  mode: SaveMode,
): Promise<SaveAllResult> {
  const accessToken = await getAccessToken()
  const folderId = await ensurePeriodFolder(accessToken, workspace)
  const label = periodFolderName(workspace)
  const key = periodKey(workspace)
  // 목록(listSavedPeriods)에서 파일 내용을 내려받지 않고도 평가기간을 바로
  // 보여줄 수 있도록, 팀명/기간명을 JSON 파일의 appProperties에도 심어둔다.
  const listingProperties = { teamName: workspace.teamName, periodName: workspace.periodName }

  const [xlsx, json, sheet] = await Promise.all([
    uploadArtifact({
      accessToken,
      folderId,
      periodKeyValue: key,
      kind: 'xlsx',
      name: `${label}_성과관리.xlsx`,
      content: xlsxBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      mode,
    }),
    uploadArtifact({
      accessToken,
      folderId,
      periodKeyValue: key,
      kind: 'json',
      name: `${label}_성장관리_data.json`,
      content: JSON.stringify(payload),
      contentType: 'application/json',
      mode,
      extraAppProperties: listingProperties,
    }),
    uploadArtifact({
      accessToken,
      folderId,
      periodKeyValue: key,
      kind: 'sheet',
      name: `${label}_성과관리_GoogleSheet`,
      content: sheetBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      convertToGoogleSheet: true,
      mode,
    }),
  ])

  const folderRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`, accessToken)
  const folderData = (await folderRes.json()) as { webViewLink: string }

  return { xlsxLink: xlsx.webViewLink, jsonLink: json.webViewLink, sheetLink: sheet.webViewLink, folderLink: folderData.webViewLink }
}

// ---------- 불러오기(복원) ----------

export interface SavedPeriodSummary {
  fileId: string
  periodKey: string
  teamName: string
  periodName: string
  createdAt: string
  modifiedAt: string
}

// 이 구글 계정에 저장된 모든 평가기간의 JSON 원본을 나열한다(다른
// 기기에서 어떤 평가를 불러올지 고를 수 있도록 전체 목록을 보여준다). 새
// 기기/새 로컬 평가 프로젝트에서 이 목록으로 기존 평가를 골라 그 데이터를
// 그대로 가져올 수 있다.
export async function listSavedPeriods(): Promise<SavedPeriodSummary[]> {
  const accessToken = await getAccessToken()
  const q = `appProperties has { key='app' and value='${APP_TAG}' } and appProperties has { key='kind' and value='json' } and trashed=false`
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,appProperties,createdTime,modifiedTime)&orderBy=modifiedTime desc&spaces=drive&pageSize=100`,
    accessToken,
  )
  const data = (await res.json()) as {
    files?: { id: string; appProperties?: Record<string, string>; createdTime: string; modifiedTime: string }[]
  }
  return (data.files ?? []).map((f) => ({
    fileId: f.id,
    periodKey: f.appProperties?.periodKey ?? '',
    teamName: f.appProperties?.teamName ?? '',
    periodName: f.appProperties?.periodName ?? '',
    createdAt: f.createdTime,
    modifiedAt: f.modifiedTime,
  }))
}

export async function fetchSyncPayload(fileId: string): Promise<DriveSyncPayload> {
  const accessToken = await getAccessToken()
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, accessToken)
  const text = await res.text()
  const data = JSON.parse(text) as DriveSyncPayload
  if (!data || data.version !== 1 || !data.state) throw new Error('저장된 파일 형식을 알아볼 수 없습니다.')
  return data
}

// ---------- 마지막 저장 기록(로컬) ----------
// 평가기간(workspaceId)별로 최근 저장 결과를 브라우저에 남겨, 다시 열었을 때
// "언제 저장됐는지"를 보여주고(GoogleDrivePanel) 헤더의 "저장됨" 배지 여부도
// 판단한다(StageTabs). Drive 쪽 진짜 상태가 아니라 이 브라우저 기준 캐시다.

function lastSaveKey(workspaceId: string) {
  return `gdrive-last-save-${workspaceId}`
}

export function readLastSave(workspaceId: string): (SaveAllResult & { at: string }) | null {
  try {
    const raw = localStorage.getItem(lastSaveKey(workspaceId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeLastSave(workspaceId: string, result: SaveAllResult) {
  try {
    localStorage.setItem(lastSaveKey(workspaceId), JSON.stringify({ ...result, at: new Date().toISOString() }))
  } catch {
    // 저장 실패해도 방금 저장 자체는 이미 끝난 상태라 안내만 못 뜬다.
  }
}

// "저장된 파일 보기"에서 쓴다 -- 현재 평가의 기간 폴더 링크만 있으면
// 되므로 hasExistingSave보다 가벼운 조회.
export async function getPeriodFolderLink(workspace: WorkspaceMeta): Promise<string | null> {
  const accessToken = await getAccessToken()
  const key = periodKey(workspace)
  const q = `appProperties has { key='periodKey' and value='${key}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    accessToken,
  )
  const data = (await res.json()) as { files?: { id: string }[] }
  const folderId = data.files && data.files.length > 0 ? data.files[0].id : null
  if (!folderId) return null
  const folderRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`, accessToken)
  const folderData = (await folderRes.json()) as { webViewLink: string }
  return folderData.webViewLink
}

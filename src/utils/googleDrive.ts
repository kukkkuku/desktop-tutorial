// 구글 드라이브 업로드 -- 기존 xlsx 다운로드를 대체하는 게 아니라 그 옆에
// 두는 선택 기능이다. Google Identity Services(GIS)로 브라우저에서 바로
// OAuth 토큰을 받고, Drive API v3에 업로드하면서 구글 시트로 변환한다.
// 서버가 따로 필요 없어 이 정적 사이트 구조를 그대로 유지할 수 있다.
//
// 쓰려면 Google Cloud Console에서 OAuth 클라이언트 ID를 만들고
// VITE_GOOGLE_CLIENT_ID로 빌드 시 넣어줘야 한다(README 참고). 설정 안 돼
//있으면 isGoogleDriveConfigured()가 false를 반환하고, 호출부는 버튼을
// 비활성 상태로만 보여주면 된다.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

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

export function isGoogleDriveConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

let gisLoadPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
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
          resolve(resp.access_token)
        }
      },
    })
    tokenClient.requestAccessToken()
  })
}

// 같은 브라우저 세션에서는 매번 로그인 팝업을 띄우지 않도록 토큰을
// 만료 1분 전까지 재사용한다.
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  await loadGis()
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token
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

const APP_FOLDER_NAME = '팀 성과관리 데이터'

let folderIdCache: string | null = null

// drive.file 스코프에서는 이 앱이 만든 파일/폴더만 보이므로, 폴더 이름으로
// 검색해서 있으면 재사용하고 없으면 새로 만든다.
async function ensureAppFolder(accessToken: string): Promise<string> {
  if (folderIdCache) return folderIdCache
  const q = `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const listRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    accessToken,
  )
  const listData = (await listRes.json()) as { files?: { id: string }[] }
  if (listData.files && listData.files.length > 0) {
    folderIdCache = listData.files[0].id
    return folderIdCache
  }
  const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const createData = (await createRes.json()) as { id: string }
  folderIdCache = createData.id
  return folderIdCache
}

// workspaceId를 appProperties에 저장해두고 그걸로 찾는다. 파일 이름이
// 바뀌어도(사용자가 드라이브에서 이름을 고쳐도) 항상 같은 파일을 다시
// 찾아 덮어쓸 수 있다.
async function findSyncFile(accessToken: string, workspaceId: string): Promise<string | null> {
  const q = `appProperties has { key='workspaceId' and value='${workspaceId}' } and trashed=false`
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    accessToken,
  )
  const data = (await res.json()) as { files?: { id: string }[] }
  return data.files && data.files.length > 0 ? data.files[0].id : null
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  buffer: ArrayBuffer,
): { body: Blob; boundary: string } {
  const boundary = 'perf-eval-drive-upload-' + Date.now()
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  const filePartHeader = `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
  const closing = `\r\n--${boundary}--`
  return { body: new Blob([metadataPart, filePartHeader, buffer, closing]), boundary }
}

// xlsx 바이트를 구글 드라이브에 올리면서 구글 시트 형식으로 변환한다.
// 성공하면 방금 만든 시트의 웹 링크를 반환한다. (결과 리포트용 단발성 업로드)
export async function uploadWorkbookToDrive(buffer: ArrayBuffer, filename: string): Promise<{ webViewLink: string }> {
  const accessToken = await getAccessToken()
  const { body, boundary } = buildMultipartBody(
    { name: filename.replace(/\.xlsx$/i, ''), mimeType: 'application/vnd.google-apps.spreadsheet' },
    buffer,
  )
  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    accessToken,
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  )
  const data = (await res.json()) as { webViewLink: string }
  return { webViewLink: data.webViewLink }
}

// 팀/평가기간 전체 데이터(과제·팀원·기여도·평가기준·피어리뷰·면담기록·상태)를
// "팀 성과관리 데이터" 폴더 안에 구글 시트로 올린다. 같은 workspaceId로
// 이미 올린 파일이 있으면 그 파일을 덮어써서(업서트) 중복 파일이 쌓이지
// 않게 한다.
export async function uploadFullSyncToDrive(
  workspaceId: string,
  buffer: ArrayBuffer,
  filename: string,
): Promise<{ webViewLink: string }> {
  const accessToken = await getAccessToken()
  const folderId = await ensureAppFolder(accessToken)
  const existingFileId = await findSyncFile(accessToken, workspaceId)
  const name = filename.replace(/\.xlsx$/i, '')

  if (existingFileId) {
    const { body, boundary } = buildMultipartBody({ name }, buffer)
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,webViewLink`,
      accessToken,
      { method: 'PATCH', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    )
    const data = (await res.json()) as { webViewLink: string }
    return { webViewLink: data.webViewLink }
  }

  const { body, boundary } = buildMultipartBody(
    {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
      appProperties: { workspaceId, app: 'team-performance-evaluation' },
    },
    buffer,
  )
  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    accessToken,
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  )
  const data = (await res.json()) as { webViewLink: string }
  return { webViewLink: data.webViewLink }
}

// 이 workspaceId로 이미 올려둔 구글 시트가 있는지 확인한다. UI에서
// "불러오기" 버튼을 활성화할지 판단하는 데 쓴다.
export async function findFullSyncFileId(workspaceId: string): Promise<string | null> {
  const accessToken = await getAccessToken()
  return findSyncFile(accessToken, workspaceId)
}

// 구글 드라이브에 올려둔 전체 데이터 시트를 다시 xlsx로 받아온다(구글
// 시트 → xlsx export). 다른 기기에서 같은 데이터를 보고 싶을 때 쓴다.
export async function downloadFullSyncFromDrive(workspaceId: string): Promise<ArrayBuffer> {
  const accessToken = await getAccessToken()
  const fileId = await findSyncFile(accessToken, workspaceId)
  if (!fileId) throw new Error('이 평가에 대해 구글 드라이브에 업로드된 데이터가 없습니다. 먼저 업로드해주세요.')
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
    accessToken,
  )
  return res.arrayBuffer()
}

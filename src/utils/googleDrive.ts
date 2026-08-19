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
        else resolve(resp.access_token)
      },
    })
    tokenClient.requestAccessToken()
  })
}

// xlsx 바이트를 구글 드라이브에 올리면서 구글 시트 형식으로 변환한다.
// 성공하면 방금 만든 시트의 웹 링크를 반환한다.
export async function uploadWorkbookToDrive(buffer: ArrayBuffer, filename: string): Promise<{ webViewLink: string }> {
  await loadGis()
  const accessToken = await requestAccessToken()

  const metadata = {
    name: filename.replace(/\.xlsx$/i, ''),
    mimeType: 'application/vnd.google-apps.spreadsheet',
  }
  const boundary = 'perf-eval-drive-upload-' + Date.now()
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  const filePartHeader = `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
  const closing = `\r\n--${boundary}--`
  const body = new Blob([metadataPart, filePartHeader, buffer, closing])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`구글 드라이브 업로드에 실패했습니다 (${res.status}). ${text}`)
  }
  const data = (await res.json()) as { webViewLink: string }
  return { webViewLink: data.webViewLink }
}

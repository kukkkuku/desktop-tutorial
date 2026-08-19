/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 구글 드라이브 업로드(선택 기능)용 OAuth 클라이언트 ID. 비어 있으면 그
  // 버튼은 비활성 상태로만 보인다 -- 없어도 앱의 나머지는 그대로 동작한다.
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

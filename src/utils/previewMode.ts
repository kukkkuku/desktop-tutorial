// 미리보기 빌드(운영과 같은 주소 아래 /preview-next/ 등)에서만 값이 들어간다.
// 운영과 같은 origin이라 브라우저 저장소와 로그인한 구글 계정을 같이 쓰게
// 되므로, 미리보기는 저장 키·드라이브 폴더·캘린더 이름을 전부 따로 써서
// 운영 데이터를 읽거나 덮어쓰지 않게 한다. 운영 빌드에서는 빈 문자열이다.
export const PREVIEW_NAMESPACE: string = (import.meta.env.VITE_PREVIEW_NAMESPACE ?? '').trim()

export const IS_PREVIEW = PREVIEW_NAMESPACE !== ''

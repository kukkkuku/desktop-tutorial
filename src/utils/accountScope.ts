import { getConnectedEmail } from './googleDrive'

// 이 앱은 데이터를 서버가 아니라 브라우저(localStorage)에 저장하고, Google
// 로그인은 원래 "들어올 자격이 있는지"만 확인하는 문이었다. 그래서 로그인
// 자체는 계정마다 새로 해도 실제 데이터(팀/과제/팀원 등)는 계정과 무관하게
// 브라우저 하나에 공유돼 보이는 문제가 있었다. 저장 키마다 이 스코프를
// 네임스페이스로 붙여 계정별로 완전히 분리한다. 계정을 아직 모르는 순간
// (로그인 게이트를 통과하기 전, WorkspaceProvider가 가장 먼저 마운트될 때)
// 에는 ANONYMOUS_SCOPE를 쓰는데, 이 구간은 로그인 게이트가 화면을 가리고
// 있어 실제로 데이터를 읽거나 쓰는 일이 없다.
export const ANONYMOUS_SCOPE = '__anonymous__'

export function accountScope(): string {
  const email = getConnectedEmail()
  return email ? email.toLowerCase() : ANONYMOUS_SCOPE
}

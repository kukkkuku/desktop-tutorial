# 페이스(과제 · 성과관리) -- 작업 규칙과 인수인계

사내 디자인연구소용 웹앱. 「과제 입력」(추진현황 · 진척률, 구글시트 연동)과 「성과관리」(팀 · 평가 · 팀원관리 · 평가하기 · 결과 · 면담, 팀장/관리자용).
React 18 + TypeScript + Vite + Tailwind. 데이터는 브라우저(localStorage, 계정별 키) + 구글시트 · 구글 드라이브.

## 꼭 지킬 것

- **main은 건드리지 않는다.** 지금 쓰는 버전이 main에 있고, GitHub Pages가 main 푸시마다 자동 배포한다. main에 푸시하면 쓰는 사람들 화면이 바로 바뀐다.
- 작업 브랜치: `feature/redesign-2026-09-27`. 미리보기: https://kukkkuku.github.io/desktop-tutorial/preview-design/
- **푸시할 때마다** 미리보기 배포를 돌린다: GitHub Actions `deploy-pages.yml`을 `ref: main`으로 `run_workflow`(owner `kukkkuku`, repo `desktop-tutorial`). main의 워크플로가 이 브랜치를 `/preview-design/`에 빌드한다.
- **실제 데이터는 절대 커밋하지 않는다**: 실적관리 시트 내용, 인사카드, 사용자가 올린 엑셀, 팀장 · 팀원 실제 이메일. 스크린샷 · 예시는 가짜 데이터로.
- 인사 민감 항목(주민번호 · 연락처 · 주소 · 가족)은 읽지도 저장하지도 않는다.
- 사실을 지어내지 않는다(모르면 묻거나 「확인 못 함」이라고 보고).
- 사용자에게는 **한국어**로 보고한다. 쉬운 말로, 무엇이 바뀌었고 어디서 보이는지.
- 커밋 메시지는 한국어로 무엇을 바꿨는지. 끝에 세션이 알려 주는 Co-Authored-By · Claude-Session 줄.

## 배포할 때마다 같이 하는 일

1. `release-notes.json` 맨 위 항목(`items[0]`의 앞쪽)에 이번 변경을 한 줄씩 넣는다(앱의 「새 버전」 알림에 보임). 기존 줄을 덮어쓰지 않게 주의.
2. `docs/MANUAL-TODO.md` 끝에 매뉴얼에 반영할 내용을 `- [ ] …` 한 줄로 덧붙인다.
   **매뉴얼(`docs/manual-src/`, `public/manual/`)은 사용자가 「매뉴얼 수정하자」고 할 때만** 한 번에 고친다. 그 전에는 매뉴얼을 다시 만들지 않는다.
3. `npx tsc -b --noEmit` · `npm run build` 통과 확인 → 커밋 → `git push origin feature/redesign-2026-09-27` → 배포 실행.

## 권한 · 하지 않기로 한 것

- 구글 드라이브 **전체 권한(full scope) · 자동 공유는 넣지 않는다**(사용자가 수동 공유를 골랐다). 실적관리 시트 공유는 관리자가 손으로 하고, 앱에는 관리자가 표시한 「시트 권한」(편집자 · 뷰어 · 공유 대기)만 적는다.
- 드라이브 metadata 권한(실제 공유 상태 읽기)은 사용자가 명시적으로 원할 때만.

## 구조 메모

- 역할: 관리자(admin) · 팀장(leader) · 팀원(member). 역할 · 팀원 명단은 **권한 시트**(구글시트, 「사용자」 탭 A:I, I열 「시트 권한」) -- `src/utils/accessSheet.ts`, 화면용 훅 `src/hooks/useAccessData.ts`.
- 관리 메뉴(관리자만): `src/components/admin/AdminApp.tsx` -- 탭 팀장 | 팀원 | 실적관리 시트 | 권한 시트. 표는 `admin/MembersPanel.tsx`.
- 성과관리 첫 화면 = 평가 목록 `src/components/WorkspaceLanding.tsx`: 팀 탭 · ⋯(이름 바꾸기 · 삭제) · 「팀원 초대」 · 「+ 새 평가」. 팀은 평가가 없어도 저장된다(`WorkspaceContext`의 `teamNames/addTeam/renameTeam/removeTeam`, 키 `teamsKey`).
- **초대 메일 창은 하나**: `src/components/TeamInviteDialog.tsx`(평가 목록 · 팀원관리 · 관리 메뉴 공용). 메일 본문 HTML은 `src/utils/adminInvite.ts`의 `inviteHtml`(미리보기 = 실제 메일, `#invite-msg` 인사말만 그 자리에서 고침).
- 평가 안 팀원관리 표: `src/components/TeamManagement.tsx`(명단과의 동기화는 `src/utils/teamRoster.ts`).
- 추진현황 표: `src/components/taskinput/ScheduleTable.tsx`, 보드 · 타임라인 `BoardViews.tsx`, 화면 `ProgressBoard.tsx`.
- 구글 토큰은 탭마다 sessionStorage(`src/utils/tokenStore.ts`), 로그아웃 · 401이면 지운다. 뒤에서 하는 저장은 토큰이 있을 때만(`hasSheetsTokenNow()`), 없으면 버튼을 보여 준다(로그인 창을 마음대로 띄우지 않기).
- 공용 작은 창 틀: `src/components/ui/Modal.tsx`. 사이드바에서 여는 창은 `createPortal(…, document.body)`로(사이드바 안에 두면 본문 버튼이 비친다).
- Tailwind 클래스는 **글자 그대로** 쓴다(`text-[length:calc(14px*var(--ui-fs,1))]`처럼). 함수로 만든 클래스 이름은 빌드에 안 잡힌다.
- 디자인 기준: `docs/DESIGN-SYSTEM.md`. Figma 시안을 받으면 프로젝트 컴포넌트 · 토큰으로 옮긴다.

## 화면 확인(테스트) 방법

- 개발 서버: `VITE_GOOGLE_CLIENT_ID=fake-client npx vite --port 5175 --strictPort`(백그라운드, 긴 timeout).
- Playwright(`executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `playwright install` 하지 않기)로 띄워서 **가짜 구글**을 붙인다:
  - `window.google.accounts.oauth2.initTokenClient`를 가짜로 바꿔 바로 토큰을 돌려주고, sessionStorage `google-gate-passed=1`.
  - `https://sheets.googleapis.com/**` · `https://www.googleapis.com/oauth2/v3/userinfo` · `https://gmail.googleapis.com/**`를 route로 가짜 응답(시트 쓰기는 저장되지 않으니 요청 내용으로 확인).
  - 권한 시트 캐시는 localStorage `access-sheet-cache`에 가짜 사용자(예: `leader@example.com` 팀장)를 넣는다.
- 테스트 스크립트 · 가짜 시트 데이터는 저장소에 넣지 않는다(이전 세션의 것은 세션 임시 폴더에 있었고 실제 데이터가 섞여 있어 저장소에 넣지 않았다). 필요하면 **가짜 데이터로** 새로 만든다.
- 확인한 화면은 스크린샷으로 보고 고친 뒤 배포한다. 백그라운드 서버는 시간 제한에 꺼질 수 있다(다시 켜면 됨). `pkill -f` 같은 패턴으로 프로세스를 찾지 않는다(자기 셸까지 잡힘).

## 미뤄 둔 일(사용자가 「나중에」라고 한 것)

- 과제관리에서 줄 없는 평가과제를 「기타 업무」 탭에 자동으로 넣기.
- 「이 사람인가요?」 -- 이름이 비슷한 팀원 후보 보여 주기.
- 추진현황에 구글시트를 그대로 띄우는 보기(iframe) 검토.
- 매뉴얼 일괄 수정(`docs/MANUAL-TODO.md`에 쌓인 것) -- 사용자가 말할 때.

# 디자인 시스템 v2

앱 전체 UI를 하나의 규칙으로 맞춘다. 새 화면이나 수정은 **여기 있는 토큰·컴포넌트·클래스만** 쓴다.
색 코드(`#xxxxxx`)나 임의 그림자·모서리를 화면 코드에 직접 쓰지 않는다.

**방향**: 중성 회색 캔버스 위에 왼쪽 사이드바와 흰 콘텐츠 판. 색은 거의 쓰지 않고(검정 · 회색),
선택된 메뉴 아이콘 · 링크 · 포커스만 파랑, 상태는 옅은 바탕 배지로. 주요 버튼은 검정.
큰 페이지 제목 + 위치(브레드크럼) + 밑줄 탭, 목록은 회색 틀 안의 흰 카드 줄로 묶는다.

## 1. 토큰 (`tailwind.config.js`, `src/index.css`)

| 종류 | 이름 | 값 / 용도 |
|---|---|---|
| 강조 | `accent`, `accent-hover`, `accent-soft` | #2563EB · 선택된 메뉴 아이콘 · 링크 · 포커스 · 슬라이더 / #1D4ED8 / 옅은 바탕 #EEF3FE |
| 기본 버튼 | `ink` | #18181B · `Button variant="primary"` · 고른 탭 밑줄 · 까만 말풍선 |
| 상태 | `success`/`success-soft`, `warning`/`warning-soft`, `danger`/`danger-soft`, `info`/`info-soft` | 초록 · 주황 · 빨강 · 청록, 배지는 옅은 바탕(`-soft`) + 진한 글자 |
| 글자 | `text-label`, `text-label-2`, `text-label-3` | 본문 #18181B / 보조 #5F5F68 / 흐림 #A1A1AA |
| 바탕 | `bg-canvas`(=`bg-window`), `bg-surface`, `bg-subtle` | 앱 바탕 · 사이드바 #F4F4F5 / 흰 판 · 카드 / 묶음 틀 #F8F8F9 |
| 선 | `border-separator`, `border-hairline` | 구분선 rgba(24,24,27,.08) / 입력칸 테두리 .14 |
| 모서리 | `rounded-control`(8), `rounded-card`(12), `rounded-pop`(12), `rounded-panel`(16) | 버튼·입력 / 카드 / 팝오버 / 콘텐츠 판·옆 패널 |
| 그림자 | `shadow-control`, `shadow-card`, `shadow-pill`, `shadow-pop`, `shadow-dialog`, `shadow-focus` | 흰 알약(`pill`) = 사이드바에서 고른 항목 · 세그먼트 고른 칸 |
| 글꼴 | Pretendard(로컬 @fontsource) | 기본 14px, 최소 13px(`text-xs`=13px), 배지 11.5px, 페이지 제목 28px semibold |

- 표 hover·옅은 회색은 `bg-black/[0.03~0.05]`, 메뉴 hover는 `#F1F1F3`(`.mac-menu-item`).
- 파란 계열은 `accent`만. `bg-blue-50` · `text-blue-600` 같은 Tailwind 기본 파랑은 쓰지 않는다.
- 회색 글자는 `text-gray-*` 대신 `text-label-2`/`text-label-3`.

## 2. 아이콘

- **lucide-react 한 벌만.** `<svg>`를 직접 그리지 않는다(예외: 구글시트 로고 `SheetsIcon`, 차트).
- 크기 규칙은 `src/components/ui/icon.ts`: `ic`(16), `icSm`(14), `icLg`(18), 선 굵기 1.75.
  ```tsx
  import { Plus } from 'lucide-react'
  import { ic } from './ui/icon'
  <Plus {...ic} />
  ```
- 자주 쓰는 것: 추가 `Plus`, 삭제 `Trash2`, 닫기 `X`, 수정 `Pencil`, 다운로드 `Download`, 업로드 `Upload`,
  되돌리기 `Undo2`/`Redo2`, 새로고침 `RotateCw`, 펼침 `ChevronDown`/`ChevronRight`, 이전/다음 `ChevronLeft`/`ChevronRight`,
  달력 `Calendar`, 검색 `Search`, 설정 `Settings`/`SlidersHorizontal`, 사람 `User`/`Users`, 메모 `StickyNote`, 경고 `AlertTriangle`, 정보 `Info`, 확인 `Check`.

## 3. 컴포넌트

| 필요한 것 | 쓰는 것 |
|---|---|
| 버튼 | `Button` — `variant`: `primary`(검정 · 한 화면에 주요 액션 하나) / `secondary`(흰 바탕 + 옅은 테두리, 기본) / `ghost`(툴바) / `danger`(되돌리기 어려운 삭제). `size`: `md`(32px, 기본) / `sm`(28px) |
| 아이콘만 있는 버튼 | `IconButton` (`tone="danger"` 삭제) |
| 화면 안 탭(하위 화면) | `ui/UnderlineTabs` — 같은 글자 크기, 고른 탭만 진한 글자 + 검은 밑줄 |
| 보기 전환·방식 고르기 | `ui/Segmented` 또는 `.mac-seg` + `.mac-seg-item`(+`.mac-seg-item-on`) — 회색 트랙 + 흰 알약 |
| 드롭다운 | `ui/Select` — 쓰는 법은 `<select>`와 같음(`<option>` 자식 · `value` · `onChange(e.target.value)`). 목록은 운영체제 팝업(까만 목록) 대신 흰 `.mac-pop` 메뉴 · 고른 값 ✓ · 호버 `#EFEFEF` · ↑↓ Enter Esc. 단추 모양은 `.mac-select`(위아래 화살표 · 포커스 링), 크기만 클래스로(`h-8 px-2.5 text-[13px]`). 기본 `<select>`는 쓰지 않는다 |
| 입력칸 | 기본 `<input>`/`<textarea>` + `h-8 rounded-control border px-2.5 text-[13px]`. 포커스 링은 전역 |
| 날짜 | 표 안: DataGrid 날짜 칸(자동). 표 밖: `DatePicker`. 둘 다 `grid/DatePopup` 한 달력 |
| 체크박스 | 기본 `<input type="checkbox">` (`accent-color` 전역) |
| 팝오버·메뉴 | 컨테이너 `.mac-pop`, 항목 `.mac-menu-item`(마우스를 올리면 `#EFEFEF` · 삭제 `.mac-menu-item-danger`는 옅은 빨강), 구분선 `.mac-menu-sep` |
| 확인 창 | `ConfirmDialog` (macOS 알림 모양) |
| 구역 묶음 | `.mac-card`(흰 카드) · 목록 묶음은 `.ds-group` > `.ds-group-head`(회색 머리) + 흰 카드 줄 |
| 옆 패널 | 오른쪽에 떠 있는 흰 판(`rounded-panel shadow-pop`, 예: `CriteriaSheet`) — 닫기 ×, Esc |
| 말풍선 · 단축키 | `.ds-tip`(까만 말풍선), `.ds-kbd`(⌘K 같은 키) |
| 배지 | `.mac-badge`(모서리 6px · 옅은 테두리) + 색(`bg-success-soft text-success`, `bg-warning-soft text-warning`, `bg-accent-soft text-accent`, `bg-black/[0.05] text-label-2`) |
| 표(편집) | `grid/DataGrid` — 엑셀식 선택·복사/붙여넣기·행/열 추가·삭제·끌어 옮기기·되돌리기. 열이 정해진 표는 `fixedColumns`, 계산 칸은 `readOnly`, 펼침 내용은 `rowDetail`. 과제관리·평가과제·팀원 표가 모두 이것 |

## 4. 레이아웃

- 바탕: `shell/AppShell` = 회색 캔버스 + 왼쪽 `shell/Sidebar` + 오른쪽 흰 콘텐츠 판(`rounded-panel`, 위아래 · 오른쪽 8px 띄움).
- 사이드바(236px, 접으면 60px 아이콘만 · 이 브라우저에 기억): 로고 → 홈 → 「과제 입력」(추진현황 · 진척률) →
  「성과관리」(프로젝트 카드 · 프로젝트 목록 · 과제관리 · 팀원관리 · 평가하기 · 평가결과 · 면담 · 빠른 시작) →
  아래에 사용 매뉴얼 · 데이터 백업(저장 상태) · 계정(메뉴 안에 로그아웃). 항목은 `.ds-nav-item`, 고른 항목은 흰 알약(`.ds-nav-item-on`) + 파란 아이콘, 묶음 이름은 `.ds-nav-label`.
- 화면 머리: `PageHeader` = 위치(13px 흐린 글자, `/` 구분, 연도 · 프로젝트 고르기 같은 드롭다운을 넣을 수 있음) · 큰 제목 28px · 오른쪽 동작(예: 기준 설정) · 아래 밑줄 탭.
- 제목은 한 번만: 탭 아래 내용에서 같은 이름의 소제목(h3)을 다시 쓰지 않는다. 설명은 한 줄 `text-[13px] text-label-2`.
- 간격: 판 안 좌우 24~32px(`px-6 lg:px-8`), 구역 사이 `space-y-5`, 카드 안 `p-4`, 툴바 줄 높이 32px.

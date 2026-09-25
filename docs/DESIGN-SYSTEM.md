# 디자인 시스템 (macOS 스타일)

앱 전체 UI를 하나의 규칙으로 맞춘다. 새 화면이나 수정은 **여기 있는 토큰·컴포넌트·클래스만** 쓴다.
색 코드(`#xxxxxx`)나 임의 그림자·모서리를 화면 코드에 직접 쓰지 않는다.

## 1. 토큰 (`tailwind.config.js`, `src/index.css`)

| 종류 | 이름 | 값 / 용도 |
|---|---|---|
| 강조색 | `accent`, `accent-hover`, `accent-soft` | macOS 시스템 블루 #007AFF / 누름 #0066D6 / 옅은 바탕 #E8F1FF |
| 상태색 | `success`, `danger`, `warning` | #28A745 / #FF3B30 / #FF9500 |
| 글자 | `text-label`, `text-label-2`, `text-label-3` | 본문 #1D1D1F / 보조 #6E6E73 / 흐림 #AEAEB2 |
| 배경 | `bg-window`, `bg-surface`(흰색) | 창·툴바 #F5F5F7 |
| 선 | `border-separator`, `border-hairline` | 구분선 rgba(0,0,0,.1) / 컨트롤 테두리 |
| 모서리 | `rounded-control`(6), `rounded-card`(10), `rounded-pop`(10) | 버튼·입력 / 카드 / 팝오버 |
| 그림자 | `shadow-control`, `shadow-card`, `shadow-pop`, `shadow-dialog`, `shadow-focus` | |
| 글꼴 | 시스템 글꼴(-apple-system, Apple SD Gothic Neo) → Pretendard | 기본 13~14px, 최소 13px(`text-xs`=13px), 배지만 11px |

- 표·카드 안 옅은 회색: `bg-black/[0.03~0.05]`(hover), `bg-[#F7F7F9]`(표 머리글·묶음 행).
- 파란 계열 배경은 `bg-accent-soft`, 파란 글자는 `text-accent`. `bg-blue-50`·`text-blue-600` 등 Tailwind 기본 파랑은 쓰지 않는다.
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
| 버튼 | `Button` — `variant`: `primary`(한 화면에 주요 액션 하나) / `secondary`(기본) / `ghost`(툴바) / `danger`(되돌리기 어려운 삭제). `size`: `md`(32px, 기본) / `sm`(28px) |
| 아이콘만 있는 버튼 | `IconButton` (`tone="danger"` 삭제) |
| 화면 안 탭·보기 전환·방식 고르기 | `ui/Segmented` 또는 `.mac-seg` + `.mac-seg-item`(+`.mac-seg-item-on`) |
| 드롭다운 | 기본 `<select>` — 전역 스타일(위아래 화살표·포커스 링)이 자동 적용. 모양 클래스는 크기(`h-8 px-2.5 text-[13px]`)만 |
| 입력칸 | 기본 `<input>`/`<textarea>` + `h-8 rounded-control border px-2.5 text-[13px]`. 포커스 링은 전역 |
| 날짜 | 표 안: DataGrid 날짜 칸(자동). 표 밖: `DatePicker`. 둘 다 `grid/DatePopup` 한 달력 |
| 체크박스 | 기본 `<input type="checkbox">` (`accent-color` 전역) |
| 팝오버·메뉴 | 컨테이너 `.mac-pop`, 항목 `.mac-menu-item`(삭제 `.mac-menu-item-danger`), 구분선 `.mac-menu-sep` |
| 확인 창 | `ConfirmDialog` (macOS 알림 모양) |
| 구역 묶음 | `.mac-card` 또는 `rounded-card border border-separator` |
| 배지 | `.mac-badge` + 색(`bg-accent-soft text-accent`, `bg-black/[0.05] text-label-2` 등) |
| 표(편집) | `grid/DataGrid` — 엑셀식 선택·복사/붙여넣기·행/열 추가·삭제·끌어 옮기기·되돌리기 |

## 4. 레이아웃

- 상단: `StageTabs` = macOS 툴바(반투명 흰 바탕 + 아래 구분선), 메뉴는 세그먼트 컨트롤.
- 화면 제목 `text-[17px] font-semibold text-label`, 설명 한 줄 `text-[13px] text-label-2`. 긴 설명 문단은 쓰지 않는다.
- 간격: 구역 사이 `space-y-5`, 카드 안 `p-4`, 툴바 줄 높이 32px.

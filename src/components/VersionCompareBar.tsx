// 기존 버전(main 배포, /preview/)과 이 개선판(V2)을 나란히 비교할 수 있도록
// 화면 좌하단에 아주 작게 띄우는 배지. 실제 업무 기능보다 눈에 띄면 안 되므로
// 고정 크기의 작은 알약 모양 하나로만 존재한다. V2 브랜치에만 존재하고 기존
// 버전 코드는 전혀 건드리지 않는다 -- 기존 버전 보호가 비교 UI보다 우선.
const LEGACY_URL = 'https://kukkkuku.github.io/desktop-tutorial/preview/'

export default function VersionCompareBar() {
  return (
    <div className="fixed bottom-3 left-3 z-[100] flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 p-1 text-xs shadow-sm backdrop-blur">
      <a
        href={LEGACY_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="기존 버전을 새 탭에서 엽니다"
        className="rounded-full px-2.5 py-1 font-medium text-gray-500 hover:bg-gray-100 hover:text-black"
      >
        기존 버전
      </a>
      <span className="rounded-full bg-orange-50 px-2.5 py-1 font-bold text-accent">개선 버전</span>
    </div>
  )
}

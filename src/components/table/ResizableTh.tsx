interface ResizableThProps {
  // width를 생략하면(필러 컬럼) 이 셀은 고정폭을 갖지 않고 테이블의 나머지
  // 여유 공간을 전부 흡수한다 — 드래그 손잡이도 그려지지 않는다.
  width?: number
  // 마지막(맨 오른쪽) 컬럼처럼 오른쪽에 더 조절할 게 없는 경우 폭은 고정하되
  // 손잡이만 숨기고 싶을 때 false로 넘긴다. 기본값 true.
  resizable?: boolean
  onResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onResizeEnd: () => void
  className?: string
  children?: React.ReactNode
}

// table-fixed 테이블에서 쓰는 공용 헤더 셀 — 오른쪽 경계를 드래그해서 그 컬럼의
// 너비만 조절한다. 실제 너비 상태는 useResizableColumns가 들고 있고, 이 컴포넌트는
// 표시와 드래그 제스처만 담당한다.
// className은 기본값을 덧붙이는 게 아니라 완전히 대체한다 — Tailwind는 클래스
// 목록 순서가 아니라 생성된 스타일시트 순서로 우선순위가 정해지므로, 두 개의
// px/py 유틸리티를 이어붙이면(px-4 py-3 + px-3 py-2) 어느 쪽이 이길지 예측할 수
// 없다. 테이블마다 패딩이 달라 각 호출부가 자신의 전체 클래스를 넘긴다.
//
// 드래그 손잡이는 th 경계 밖으로 절대 삐져나오지 않는다(right-0, th 안쪽에만
// 위치) — 예전에는 경계에 걸치도록 -right-1.5로 바깥까지 나갔는데, 좁은
// 컨테이너(모달, Drawer)에서는 마지막 컬럼의 그 몇 px가 테이블 전체 너비를
// 넘겨서 항상 불필요한 가로 스크롤이 생기는 원인이었다.
export default function ResizableTh({
  width,
  resizable = true,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  className = 'px-4 py-3 font-semibold',
  children,
}: ResizableThProps) {
  return (
    <th style={width === undefined ? undefined : { width }} className={`relative ${className}`}>
      {children}
      {width !== undefined && resizable && (
        <div
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          style={{ touchAction: 'none' }}
          title="드래그해서 열 너비 조절"
          aria-hidden="true"
          className="group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize select-none items-center justify-end"
        >
          <span className="h-4 w-px bg-gray-300 transition-colors group-hover:bg-accent group-active:bg-accent" />
        </div>
      )}
    </th>
  )
}

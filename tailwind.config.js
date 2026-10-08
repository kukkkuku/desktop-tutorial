/** @type {import('tailwindcss').Config} */
// 디자인 시스템 v2 토큰. 규칙과 사용 예는 docs/DESIGN-SYSTEM.md.
// 색은 여기와 src/index.css의 :root 변수만 쓰고, 화면에서 #색상코드를 직접 쓰지 않는다.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // v2: 중성 회색 캔버스 + 흰 카드 + 검정 기본 버튼, 선택 · 링크만 파랑(docs/DESIGN-SYSTEM.md)
        accent: '#0A72F5',
        'accent-hover': '#0A5FD0',
        'accent-soft': '#E6F0FE',
        ink: '#141B34', // 선택된 메뉴 · 탭 바탕(짙은 남색)
        success: '#16A34A',
        'success-soft': '#ECFDF3',
        danger: '#DC2626',
        'danger-soft': '#FEF2F2',
        warning: '#EA580C',
        'warning-soft': '#FFF4EC',
        info: '#0891B2',
        'info-soft': '#ECFEFF',
        promo: '#2F3B63',
        // 글자 3단계
        label: { DEFAULT: '#1B2238', 2: '#5E667C', 3: '#9BA3B5' },
        // 캔버스(사이드바 · 앱 바탕) · 카드 · 묶음 칸 바탕 · 선
        window: '#E8EEF5',
        canvas: '#E8EEF5',
        surface: '#FFFFFF',
        subtle: '#F3F6FA',
        separator: 'rgba(40, 60, 100, 0.09)',
        hairline: 'rgba(40, 60, 100, 0.16)',
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Apple SD Gothic Neo"',
          'ui-sans-serif',
          'system-ui',
          '"Segoe UI"',
          'Roboto',
          '"Noto Sans KR"',
          'sans-serif',
        ],
      },
      // 기본 글자 14px(text-xs = 14px). 추진현황 입력 표(ScheduleTable의 <table>)만 예전 크기 유지
      fontSize: {
        xs: ['calc(14px * var(--ui-fs, 1))', { lineHeight: '1.43' }],
      },
      borderRadius: {
        control: '12px',
        card: '20px',
        pop: '18px',
        panel: '28px', // 콘텐츠 판(사이드바 옆 유리 판) · 옆 패널
      },
      boxShadow: {
        // 부드러운 유리 · 뉴모피즘: 위쪽 흰 하이라이트 + 아래로 번지는 푸른 회색 그림자
        control: '0 0 0 1px rgba(255,255,255,0.9) inset, 0 1px 2px rgba(40,60,100,0.08), 0 4px 12px -4px rgba(40,60,100,0.14)',
        card: '0 0 0 1px rgba(255,255,255,0.85) inset, 0 1px 2px rgba(40,60,100,0.05), 0 10px 28px -12px rgba(40,60,100,0.18)',
        pill: '0 0 0 1px rgba(255,255,255,0.9) inset, 0 1px 2px rgba(40,60,100,0.08), 0 6px 14px -6px rgba(40,60,100,0.22)',
        pop: '0 0 0 1px rgba(255,255,255,0.8) inset, 0 20px 48px -14px rgba(40,60,100,0.30), 0 4px 12px -4px rgba(40,60,100,0.10)',
        dialog: '0 0 0 1px rgba(255,255,255,0.8) inset, 0 32px 80px -20px rgba(30,45,80,0.42)',
        focus: '0 0 0 3px rgba(10,114,245,0.22)',
        glow: '0 8px 20px -6px rgba(10,114,245,0.55), 0 0 0 1px rgba(255,255,255,0.28) inset',
      },
    },
  },
  plugins: [],
}

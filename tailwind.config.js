/** @type {import('tailwindcss').Config} */
// 디자인 시스템 v2 토큰. 규칙과 사용 예는 docs/DESIGN-SYSTEM.md.
// 색은 여기와 src/index.css의 :root 변수만 쓰고, 화면에서 #색상코드를 직접 쓰지 않는다.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // v2: 중성 회색 캔버스 + 흰 카드 + 검정 기본 버튼, 선택 · 링크만 파랑(docs/DESIGN-SYSTEM.md)
        accent: '#F26B1D',
        'accent-hover': '#D95A10',
        'accent-soft': '#FFF0E4',
        ink: '#18181B', // 짙은 글자 · 말풍선 바탕
        success: '#16A34A',
        'success-soft': '#ECFDF3',
        danger: '#DC2626',
        'danger-soft': '#FEF2F2',
        warning: '#C98A00',
        'warning-soft': '#FFF8DB',
        info: '#0891B2',
        'info-soft': '#ECFEFF',
        promo: '#2F3B63',
        // 글자 3단계
        label: { DEFAULT: '#18181B', 2: '#5F5F68', 3: '#A1A1AA' },
        // 캔버스(사이드바 · 앱 바탕) · 카드 · 묶음 칸 바탕 · 선
        window: '#F6F6F7',
        canvas: '#F6F6F7',
        surface: '#FFFFFF',
        subtle: '#FAFAFA',
        separator: 'rgba(24, 24, 27, 0.08)',
        hairline: 'rgba(24, 24, 27, 0.13)',
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
        control: '10px',
        card: '14px',
        pop: '14px',
        panel: '20px', // 콘텐츠 판(사이드바 옆 흰 판) · 옆 패널
      },
      boxShadow: {
        // 심플: 얇은 테두리 + 아주 옅은 그림자
        control: '0 0 0 1px rgba(24,24,27,0.10), 0 1px 2px rgba(24,24,27,0.04)',
        card: '0 0 0 1px rgba(24,24,27,0.06), 0 1px 2px rgba(24,24,27,0.03)',
        pill: '0 0 0 1px rgba(24,24,27,0.06), 0 1px 3px rgba(24,24,27,0.08)',
        pop: '0 0 0 1px rgba(24,24,27,0.07), 0 12px 32px -10px rgba(24,24,27,0.20), 0 3px 8px -3px rgba(24,24,27,0.08)',
        dialog: '0 0 0 1px rgba(24,24,27,0.08), 0 24px 64px -16px rgba(24,24,27,0.32)',
        focus: '0 0 0 3px rgba(242,107,29,0.25)',
        glow: '0 1px 2px rgba(217,90,16,0.35)',
      },
    },
  },
  plugins: [],
}

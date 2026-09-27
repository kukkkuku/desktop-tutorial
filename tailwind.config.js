/** @type {import('tailwindcss').Config} */
// 디자인 시스템 v2 토큰. 규칙과 사용 예는 docs/DESIGN-SYSTEM.md.
// 색은 여기와 src/index.css의 :root 변수만 쓰고, 화면에서 #색상코드를 직접 쓰지 않는다.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // v2: 중성 회색 캔버스 + 흰 카드 + 검정 기본 버튼, 선택 · 링크만 파랑(docs/DESIGN-SYSTEM.md)
        accent: '#2563EB',
        'accent-hover': '#1D4ED8',
        'accent-soft': '#EEF3FE',
        ink: '#18181B', // 기본 버튼 · 선택된 탭 바탕
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
        label: { DEFAULT: '#18181B', 2: '#5F5F68', 3: '#A1A1AA' },
        // 캔버스(사이드바 · 앱 바탕) · 카드 · 묶음 칸 바탕 · 선
        window: '#F4F4F5',
        canvas: '#F4F4F5',
        surface: '#FFFFFF',
        subtle: '#F8F8F9',
        separator: 'rgba(24, 24, 27, 0.08)',
        hairline: 'rgba(24, 24, 27, 0.14)',
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
      // 폰트 최소 사이즈 규칙: 13px 미만은 쓰지 않는다(text-xs = 13px).
      fontSize: {
        xs: ['13px', { lineHeight: '18px' }],
      },
      borderRadius: {
        control: '8px',
        card: '12px',
        pop: '12px',
        panel: '16px', // 콘텐츠 판(사이드바 옆 흰 판) · 옆 패널
      },
      boxShadow: {
        // 버튼 · 입력칸: 옅은 테두리 + 아주 얕은 그림자
        control: '0 0 0 1px rgba(24,24,27,0.10), 0 1px 2px rgba(24,24,27,0.05)',
        card: '0 0 0 1px rgba(24,24,27,0.06), 0 1px 2px rgba(24,24,27,0.04)',
        // 사이드바에서 고른 항목 · 세그먼트에서 고른 칸(흰 알약)
        pill: '0 0 0 1px rgba(24,24,27,0.06), 0 1px 3px rgba(24,24,27,0.08)',
        pop: '0 0 0 1px rgba(24,24,27,0.07), 0 16px 40px -12px rgba(24,24,27,0.22), 0 4px 10px -4px rgba(24,24,27,0.08)',
        dialog: '0 0 0 1px rgba(24,24,27,0.08), 0 24px 64px -16px rgba(24,24,27,0.35)',
        focus: '0 0 0 3px rgba(37,99,235,0.22)',
      },
    },
  },
  plugins: [],
}

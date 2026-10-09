/** @type {import('tailwindcss').Config} */
// 디자인 시스템 v2 토큰. 규칙과 사용 예는 docs/DESIGN-SYSTEM.md.
// 색은 여기와 src/index.css의 :root 변수만 쓰고, 화면에서 #색상코드를 직접 쓰지 않는다.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // v2: 중성 회색 캔버스 + 흰 카드 + 검정 기본 버튼, 선택 · 링크만 파랑(docs/DESIGN-SYSTEM.md)
        // 테마 변수(src/theme.css)를 쓴다 -- <html data-theme>로 갈아 끼움
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--c-accent-hover) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)', // 짙은 글자 · 말풍선 바탕
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
        label: { DEFAULT: 'rgb(var(--c-label) / <alpha-value>)', 2: 'rgb(var(--c-label-2) / <alpha-value>)', 3: 'rgb(var(--c-label-3) / <alpha-value>)' },
        // 캔버스(사이드바 · 앱 바탕) · 카드 · 묶음 칸 바탕 · 선
        window: 'rgb(var(--c-canvas) / <alpha-value>)',
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: '#FFFFFF',
        subtle: 'rgb(var(--c-subtle) / <alpha-value>)',
        separator: 'rgb(var(--c-sep) / 0.08)',
        hairline: 'rgb(var(--c-hair) / 0.14)',
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
        control: 'var(--r-control)',
        card: 'var(--r-card)',
        pop: 'var(--r-pop)',
        panel: 'var(--r-panel)', // 콘텐츠 판(사이드바 옆 흰 판) · 옆 패널
      },
      boxShadow: {
        control: 'var(--sh-control)',
        card: 'var(--sh-card)',
        pill: 'var(--sh-pill)',
        pop: 'var(--sh-pop)',
        dialog: 'var(--sh-dialog)',
        focus: '0 0 0 3px rgb(var(--c-accent) / 0.25)',
        glow: 'var(--btn-primary-shadow)',
      },
    },
  },
  plugins: [],
}

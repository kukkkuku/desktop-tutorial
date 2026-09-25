/** @type {import('tailwindcss').Config} */
// 디자인 시스템 토큰(macOS 스타일). 규칙과 사용 예는 docs/DESIGN-SYSTEM.md.
// 색은 여기와 src/index.css의 :root 변수만 쓰고, 화면에서 #색상코드를 직접 쓰지 않는다.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // macOS 시스템 색
        accent: '#007AFF',
        'accent-hover': '#0066D6',
        'accent-soft': '#E8F1FF',
        success: '#28A745',
        danger: '#FF3B30',
        warning: '#FF9500',
        promo: '#2F3B63',
        // 글자(라벨) 3단계
        label: { DEFAULT: '#1D1D1F', 2: '#6E6E73', 3: '#AEAEB2' },
        // 창 배경·컨트롤 배경·구분선
        window: '#F5F5F7',
        control: '#FFFFFF',
        separator: 'rgba(0, 0, 0, 0.1)',
        hairline: 'rgba(0, 0, 0, 0.14)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Apple SD Gothic Neo"',
          'Pretendard',
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
        control: '6px',
        card: '10px',
        pop: '10px',
      },
      boxShadow: {
        // 버튼·입력칸: 머리카락 테두리 + 아주 옅은 그림자
        control: '0 0 0 0.5px rgba(0,0,0,0.18), 0 1px 1.5px rgba(0,0,0,0.06)',
        card: '0 0 0 0.5px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        // 팝오버·메뉴·달력
        pop: '0 0 0 0.5px rgba(0,0,0,0.14), 0 10px 32px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.06)',
        dialog: '0 0 0 0.5px rgba(0,0,0,0.14), 0 22px 70px rgba(0,0,0,0.28)',
        focus: '0 0 0 3px rgba(0,122,255,0.28)',
      },
    },
  },
  plugins: [],
}

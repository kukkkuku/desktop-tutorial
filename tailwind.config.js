/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#2563EB',
        success: '#10B981',
        danger: '#EF4444',
        promo: '#2F3B63',
      },
      fontFamily: {
        sans: [
          'Pretendard',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans KR"',
          'sans-serif',
        ],
      },
      // 폰트 최소 사이즈 규칙: 13px 미만은 쓰지 않는다 -- 기본 text-xs(12px)를
      // 13px로 올려서, 앱 전체에서 text-xs를 쓰는 모든 곳에 한 번에 적용한다.
      fontSize: {
        xs: ['13px', { lineHeight: '18px' }],
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#171717',
        success: '#10B981',
        danger: '#EF4444',
        promo: '#2F3B63',
      },
    },
  },
  plugins: [],
}

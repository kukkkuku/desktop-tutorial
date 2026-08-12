/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#EB6100',
        success: '#10B981',
        danger: '#EF4444',
      },
    },
  },
  plugins: [],
}

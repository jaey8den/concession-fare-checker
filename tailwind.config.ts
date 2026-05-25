import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#7C5FD3',
          magenta: '#C73E8E',
          accent: '#5A4FCF',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          card: '#F7F7FA',
          border: '#E5E5EC',
        },
        ink: {
          DEFAULT: '#1A1A2E',
          muted: '#6B7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config

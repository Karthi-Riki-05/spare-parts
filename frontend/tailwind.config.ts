import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0b0e14',
          surface: '#10131a',
          card: '#141825',
        },
        brand: {
          cyan: '#06b6d4',
          green: '#34d399',
          red: '#ef4444',
          yellow: '#fbbf24',
          orange: '#f97316',
          blue: '#60a5fa',
          teal: '#2dd4bf',
          purple: '#a78bfa',
        },
        border: {
          DEFAULT: '#1a1f2e',
          hover: '#222838',
        },
        text: {
          primary: '#c8cdd5',
          muted: '#5c6578',
          hint: '#3b4559',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;

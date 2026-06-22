import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // VIA brand palette
        via: {
          bg: '#0a0b0f',
          surface: '#111318',
          surfaceHover: '#1a1d24',
          border: '#1e2130',
          borderMuted: '#161925',
          accent: '#3b82f6',
          accentMuted: '#1d4ed8',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          muted: '#6b7280',
          text: '#f1f5f9',
          textMuted: '#94a3b8',
          textFaint: '#475569',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

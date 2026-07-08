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
          bg: '#f7f8fa',
          surface: '#ffffff',
          surfaceHover: '#f3f4f6',
          border: '#e5e7eb',
          borderMuted: '#eef0f2',
          accent: '#2563eb',
          accentMuted: '#1d4ed8',
          success: '#16a34a',
          warning: '#d97706',
          danger: '#dc2626',
          muted: '#6b7280',
          text: '#111827',
          textMuted: '#374151',
          textFaint: '#9ca3af',
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

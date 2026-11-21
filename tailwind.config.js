/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{html,js,ts,jsx,tsx}",
    "./index.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          void: '#070507',
          bg: '#0B070A',
          canvas: '#0E090C',
          surface: '#140E12',
          surfaceLight: '#1D141A',
          surfaceHover: '#281C24',
          border: 'rgba(255, 255, 255, 0.08)',
          borderHover: 'rgba(255, 92, 56, 0.36)',
        },
        brand: {
          crimson: '#FF124F',
          red: '#FF2A42',
          redHover: '#FF445A',
          redMuted: 'rgba(255, 18, 79, 0.16)',
          ember: '#FF4D1A',
          orange: '#FF7A00',
          orangeHover: '#FF9526',
          gold: '#FFB830',
        },
      },
      fontFamily: {
        display: ['Montserrat', 'Manrope', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '22px',
        '4xl': '28px',
      },
      boxShadow: {
        'glow': '0 0 28px -4px rgba(255, 34, 68, 0.5), 0 0 14px -4px rgba(255, 122, 0, 0.32)',
        'glow-orange': '0 0 28px -4px rgba(255, 122, 0, 0.42)',
        'glow-sm': '0 0 14px -2px rgba(255, 42, 66, 0.42)',
        'card': '0 14px 32px -10px rgba(0, 0, 0, 0.78), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'elevated': '0 24px 60px -12px rgba(0, 0, 0, 0.88), 0 0 36px -10px rgba(255, 34, 68, 0.24)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.99)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        emberPulse: {
          '0%, 100%': { boxShadow: '0 0 18px -2px rgba(255, 34, 68, 0.45), 0 0 8px rgba(255, 122, 0, 0.3)' },
          '50%': { boxShadow: '0 0 28px 0px rgba(255, 34, 68, 0.65), 0 0 14px rgba(255, 122, 0, 0.45)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        slideDown: 'slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        emberPulse: 'emberPulse 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

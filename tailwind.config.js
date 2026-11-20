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
          bg: '#08080c',
          canvas: '#0c0d12',
          surface: '#12131a',
          surfaceLight: '#1a1c26',
          surfaceHover: '#242736',
          border: 'rgba(255, 255, 255, 0.08)',
          borderHover: 'rgba(255, 255, 255, 0.16)',
        },
        brand: {
          red: '#E50914',
          redHover: '#FF1E27',
          redMuted: 'rgba(229, 9, 20, 0.15)',
          orange: '#F97316',
          orangeHover: '#FB923C',
          gold: '#EAB308',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        'glow': '0 0 30px -5px rgba(229, 9, 20, 0.45)',
        'glow-orange': '0 0 30px -5px rgba(249, 115, 22, 0.35)',
        'glow-sm': '0 0 15px -3px rgba(229, 9, 20, 0.35)',
        'card': '0 12px 30px -6px rgba(0, 0, 0, 0.6), 0 6px 12px -4px rgba(0, 0, 0, 0.4)',
        'elevated': '0 20px 45px -10px rgba(0, 0, 0, 0.8), 0 0 25px -4px rgba(229, 9, 20, 0.2)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        slideDown: 'slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }
    },
  },
  plugins: [],
}

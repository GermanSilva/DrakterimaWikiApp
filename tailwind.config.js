/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-deep':        '#060606',
        'bg-mid':         '#0b0b0b',
        'bg-card':        '#111111',
        'bg-card-hover':  '#171717',
        'border-base':    '#1e1e1e',
        'border-light':   '#282828',
        accent:           '#dc2626',
        'accent-bright':  '#ef4444',
        'accent-dim':     '#991b1b',
        'accent-subtle':  '#450a0a',
        'txt-primary':    '#ececec',
        'txt-secondary':  '#888888',
        'txt-muted':      '#6e6e6e',
      },
      fontFamily: {
        exo:    ["'Exo 2'", 'sans-serif'],
        barlow: ['Barlow', 'sans-serif'],
        cinzel: ['Cinzel', 'serif'],
      },
      animation: {
        'card-in':  'cardIn 0.2s ease both',
        'slide-in': 'slideIn 0.22s ease',
        'fade-in':  'fadeIn 0.18s ease',
        'slide-up': 'slideUp 0.25s ease',
      },
      keyframes: {
        cardIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { transform: 'translateX(40px)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

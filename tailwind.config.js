/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0c1210',
          900: '#121a17',
          800: '#1a2621',
          700: '#2a3a33',
          600: '#3d5248',
          500: '#5a7266',
          400: '#7a9488',
          300: '#a3b5ab',
          200: '#c9d5ce',
          100: '#e4ebe7',
          50: '#f3f6f4',
        },
        leaf: {
          400: '#4db88a',
          500: '#2f9e6e',
          600: '#1f7a54',
          700: '#176143',
        },
        ember: {
          400: '#e8a54b',
          500: '#d4892a',
        },
        rose: {
          500: '#c45c5c',
        },
      },
      fontFamily: {
        display: ['"Syne"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(12,18,16,0.06), 0 12px 40px rgba(12,18,16,0.08)',
      },
      backgroundImage: {
        grid: `linear-gradient(to right, rgba(12,18,16,0.05) 1px, transparent 1px),
               linear-gradient(to bottom, rgba(12,18,16,0.05) 1px, transparent 1px)`,
        wash: `radial-gradient(ellipse 80% 60% at 10% -10%, rgba(47,158,110,0.18), transparent 55%),
               radial-gradient(ellipse 60% 50% at 90% 0%, rgba(232,165,75,0.12), transparent 50%),
               linear-gradient(165deg, #f3f6f4 0%, #e8efe9 45%, #dfe8e2 100%)`,
      },
      backgroundSize: {
        grid: '28px 28px',
      },
    },
  },
  plugins: [],
}

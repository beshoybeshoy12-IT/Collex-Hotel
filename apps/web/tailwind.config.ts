import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-arabic)', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef7f6', 100: '#d5ecea', 500: '#14857a', 600: '#0f6f66', 700: '#0c5a53', 900: '#073531' },
        sand: { 50: '#fbf8f3', 100: '#f4ede1', 200: '#e8dcc6' },
      },
    },
  },
  plugins: [],
} satisfies Config;

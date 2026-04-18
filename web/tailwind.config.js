/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        success: 'var(--success)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        border: 'var(--border)'
      },
      maxWidth: {
        'app-sm': '28rem',
        'app-md': '36rem'
      }
    }
  },
  plugins: []
};

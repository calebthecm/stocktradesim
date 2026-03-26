/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sim: {
          bg:        '#0d1117',
          surface:   '#161b22',
          border:    '#21262d',
          hover:     '#1c2128',
          text:      '#e6edf3',
          muted:     '#8b949e',
          green:     '#26a69a',
          red:       '#ef5350',
          blue:      '#2962ff',
          amber:     '#f59e0b',
          badge:     '#ff6b35',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

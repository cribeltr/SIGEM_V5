/** Config de Tailwind solo para el build standalone offline (CSS compilado). */
module.exports = {
  darkMode: 'class',
  content: ['./web/js/app.js', './web/index.html'],
  theme: { extend: {
    colors: {
      brand: { DEFAULT: '#22d3ee', 2: '#0891b2', 3: '#67e8f9', dk: '#22d3ee', ink: '#04212b' },
      lime:  { DEFAULT: '#a3e635', dk: '#bef264' },
      ink:   { 900: '#0b1220', 800: '#0f1729', 700: '#141d30', 600: '#1b2740', line: '#22304d' },
      op:    { DEFAULT: '#22c55e', soft: '#0f2a1a', dk: '#4ade80' },
      noop:  { DEFAULT: '#f43f5e', soft: '#2a0f17', dk: '#fb7185' },
      st:    { DEFAULT: '#f59e0b', soft: '#2a1f08', dk: '#fbbf24' },
      baja:  { DEFAULT: '#64748b', soft: '#1a2233', dk: '#94a3b8' },
      desc:  { DEFAULT: '#64748b', soft: '#1a2233', dk: '#94a3b8' }
    },
    borderRadius: { md: '6px', lg: '8px', xl: '11px', '2xl': '14px' },
    boxShadow: { soft: '0 1px 2px rgba(0,0,0,.4)', lift: '0 8px 30px -8px rgba(0,0,0,.6)', glow: '0 0 0 1px rgba(34,211,238,.25), 0 0 24px -6px rgba(34,211,238,.45)' },
    fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] }
  } }
};

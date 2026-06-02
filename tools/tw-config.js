/** Config de Tailwind solo para el build standalone offline (CSS compilado). */
module.exports = {
  darkMode: 'class',
  content: ['./web/js/app.js', './web/index.html'],
  theme: { extend: {
    colors: {
      brand: { DEFAULT: '#0d9488', 2: '#0f766e', 3: '#14b8a6', dk: '#2dd4bf', ink: '#042f2e' },
      accent:{ DEFAULT: '#f59e0b', dk: '#fbbf24' },
      op:    { DEFAULT: '#0f9d6b', soft: '#e6f6ef', dk: '#2bbd83' },
      noop:  { DEFAULT: '#e0334b', soft: '#fdecef', dk: '#f1647c' },
      st:    { DEFAULT: '#d98613', soft: '#fcf2e3', dk: '#e6a23c' },
      baja:  { DEFAULT: '#6b7280', soft: '#eef0f2', dk: '#8b94a0' },
      desc:  { DEFAULT: '#8a93a0', soft: '#eef1f4', dk: '#79828e' }
    },
    borderRadius: { md: '10px', lg: '14px', xl: '18px', '2xl': '24px' },
    boxShadow: { soft: '0 1px 2px rgba(13,148,136,.04), 0 6px 24px -8px rgba(15,23,42,.12)', lift: '0 10px 40px -12px rgba(13,148,136,.30)' },
    fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] }
  } }
};

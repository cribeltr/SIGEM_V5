/** Config de Tailwind solo para el build standalone offline (CSS compilado). */
module.exports = {
  darkMode: 'class',
  content: ['./web/js/app.js', './web/index.html'],
  theme: { extend: {
    colors: {
      brand: { DEFAULT: '#4f46e5', 2: '#6366f1', dk: '#7c7bf6' },
      op:    { DEFAULT: '#0f9d6b', soft: '#e6f6ef', dk: '#2bbd83' },
      noop:  { DEFAULT: '#e0334b', soft: '#fdecef', dk: '#f1647c' },
      st:    { DEFAULT: '#d98613', soft: '#fcf2e3', dk: '#e6a23c' },
      baja:  { DEFAULT: '#6b7280', soft: '#eef0f2', dk: '#8b94a0' },
      desc:  { DEFAULT: '#8a93a0', soft: '#eef1f4', dk: '#79828e' }
    },
    borderRadius: { lg: '7px', xl: '9px', md: '5px' },
    fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] }
  } }
};

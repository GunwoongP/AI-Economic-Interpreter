import type { Config } from 'tailwindcss';
export default {
content: [
'./src/app/**/*.{ts,tsx}',
'./src/components/**/*.{ts,tsx}',
],
theme: {
extend: {
colors: {
bg: 'var(--bg)', panel: 'var(--panel)', text: 'var(--text)',
muted: 'var(--muted)', chip: 'var(--chip)', border: 'var(--border)',
accent: 'var(--accent)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)'
},
boxShadow: { soft: '0 10px 24px rgba(0,0,0,.20)' }
},
},
plugins: [],
} satisfies Config;
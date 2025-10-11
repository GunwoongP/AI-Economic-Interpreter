import type { Config } from 'tailwindcss';

const withOpacity = (variable: string, fallbackVar?: string) => {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variable}) / ${opacityValue})`;
    }
    return fallbackVar ? `var(${fallbackVar})` : `rgb(var(${variable}) / 1)`;
  };
};

export default {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: withOpacity('--bg-rgb', '--bg'),
        panel: withOpacity('--panel-rgb', '--panel'),
        text: withOpacity('--text-rgb', '--text'),
        muted: withOpacity('--muted-rgb', '--muted'),
        chip: withOpacity('--chip-rgb', '--chip'),
        border: withOpacity('--border-rgb', '--border'),
        accent: withOpacity('--accent-rgb', '--accent'),
        good: withOpacity('--good-rgb', '--good'),
        warn: withOpacity('--warn-rgb', '--warn'),
        bad: withOpacity('--bad-rgb', '--bad'),
      },
      boxShadow: { soft: '0 10px 24px rgba(0,0,0,.20)' },
    },
  },
  plugins: [],
} satisfies Config;

export type Theme = 'system'|'dark'|'light';
export function applyTheme(mode: Theme){
const root = document.documentElement;
(root as any).dataset.theme = mode;
if (mode==='light') root.classList.add('light');
else if (mode==='dark') root.classList.remove('light');
else root.classList.toggle('light', matchMedia('(prefers-color-scheme: light)').matches);
localStorage.setItem('econ.theme', mode);
}
export function initTheme(){
const saved = (localStorage.getItem('econ.theme') as Theme) || 'system';
applyTheme(saved);
matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{
if(((localStorage.getItem('econ.theme') as Theme)||'system')==='system') applyTheme('system');
});
return saved;
}
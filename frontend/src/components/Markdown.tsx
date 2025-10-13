import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const components: Components = {
  p: ({ children, ...props }) => (
    <p className="leading-relaxed text-muted" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-text" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="text-text/90" {...props}>
      {children}
    </em>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc space-y-2 pl-5 text-muted marker:text-border" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-border" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed text-muted" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="font-medium text-accent underline decoration-dotted underline-offset-4"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ inline, children, ...props }) =>
    inline ? (
      <code className="rounded bg-chip/60 px-1.5 py-[1px] font-mono text-[12px] text-accent" {...props}>
        {children}
      </code>
    ) : (
      <pre className="overflow-auto rounded-xl border border-border/50 bg-chip/70 p-3 text-xs leading-relaxed" {...props}>
        <code>{children}</code>
      </pre>
    ),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  const combined = ['space-y-2 text-sm leading-relaxed', className].filter(Boolean).join(' ');
  return (
    <div className={combined}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}

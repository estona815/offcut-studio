import type { SVGProps } from 'react';

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: 'chevron' | 'mic' | 'send' | 'close' | 'volume' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {name === 'chevron' && <path d="m5 9 7 7 7-7" />}
    {name === 'mic' && <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3m-3 0h6" /></>}
    {name === 'send' && <><path d="m3 10 18-7-7 18-3-8-8-3Z" fill="currentColor" strokeLinejoin="round" /><path d="m11 13 6-6" stroke="var(--forest)" /></>}
    {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
    {name === 'volume' && <><path d="m11 4-6 5H2v6h3l6 5V4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>}
  </svg>;
}

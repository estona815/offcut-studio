import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icons';

export function DialogShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); return () => { if (dialog?.open) dialog.close(); }; }, []);
  return <dialog ref={ref} className="editor-dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>{children}
  </dialog>;
}

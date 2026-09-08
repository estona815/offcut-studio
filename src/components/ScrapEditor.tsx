import { useState, type FormEvent } from 'react';
import type { Grain, Scrap } from '../domain/types';
import { stockSize } from './presentation';
import { DialogShell } from './DialogShell';

export interface ScrapInput { name: string; width: number; height: number; color: string; shape: 'rectangle' | 'l'; grain: Grain }
export function ScrapEditor({ scrap, onClose, onSave }: { scrap?: Scrap; onClose: () => void; onSave: (data: ScrapInput) => string | null }) {
  const size = scrap ? stockSize(scrap) : { width: 200, height: 150 };
  const [error, setError] = useState('');
  const [shape, setShape] = useState<'rectangle' | 'l'>('rectangle');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = onSave({ name: String(form.get('name')).trim(), width: Number(form.get('width')), height: Number(form.get('height')), color: String(form.get('color')), shape, grain: form.get('grain') as Grain });
    if (result) setError(result); else onClose();
  }
  return <DialogShell title={scrap ? `Edit ${scrap.name}` : 'Add scrap'} onClose={onClose}>
    <form onSubmit={submit} className="scrap-form">
      <p className="muted">{scrap ? 'Trim only. Add a separate scrap for new fabric. Every completed cut stays fixed.' : 'Add a measured piece of leftover fabric.'}</p>
      <label>Scrap name<input name="name" defaultValue={scrap?.name ?? ''} required maxLength={50} readOnly={!!scrap} autoFocus={!scrap} placeholder="e.g. Cotton offcut" /></label>
      <div className="form-pair"><label>Width (mm)<input name="width" type="number" min="1" max="2000" step="1" defaultValue={size.width || 1} required autoFocus={!!scrap} /></label><label>Height (mm)<input name="height" type="number" min="1" max="2000" step="1" defaultValue={size.height || 1} required /></label></div>
      <div className="form-pair"><label>Shape<select name="shape" value={shape} onChange={event => setShape(event.target.value as 'rectangle' | 'l')}><option value="rectangle">Rectangle</option><option value="l">L-shaped offcut</option></select></label><label>Grain<select name="grain" defaultValue={scrap?.grain ?? 'fixed'}><option value="fixed">Follow grain · no rotation</option><option value="free">Free rotation</option></select></label></div>
      {shape === 'l' && <p className="form-note">A notch removes the lower-right corner: 35% of the width and 45% of the height. Width and height measure the outside edges.</p>}
      <label>Fabric colour<select name="color" defaultValue={scrap?.color ?? '#c58a3b'} disabled={!!scrap}><option value="#344a64">Indigo</option><option value="#d9c9ac">Natural linen</option><option value="#c58a3b">Ochre</option></select>{scrap && <input type="hidden" name="color" value={scrap.color} />}</label>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{scrap ? 'Update scrap' : 'Add scrap'}</button></div>
    </form>
  </DialogShell>;
}

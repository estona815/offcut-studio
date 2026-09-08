import { useState } from 'react';
import type { Scrap } from '../domain/types';
import { fabricFor, stockSize } from './presentation';
import { Icon } from './Icons';

export function ScrapInventory({ scraps, onEdit, onAdd }: { scraps: Scrap[]; onEdit: (scrap: Scrap) => void; onAdd: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return <section className={`panel inventory ${expanded ? 'is-expanded' : ''}`} aria-labelledby="scraps-heading">
    <div className="inventory-heading"><h2 id="scraps-heading">Your scraps <span className="mobile-only">· {scraps.length}</span></h2><button className="text-button add-scrap desktop-only" onClick={onAdd}>Add scrap</button>
      <button className="icon-button mobile-only" aria-label={expanded ? 'Collapse scraps' : 'Expand scraps'} aria-expanded={expanded} aria-controls="scrap-list" onClick={() => setExpanded(!expanded)}><Icon name="chevron" /></button></div>
    <div className="inventory-preview mobile-only" aria-hidden={expanded}>{scraps.slice(0, 3).map(scrap => <img key={scrap.id} src={fabricFor(scrap)} alt="" />)}<button className="text-button" onClick={() => setExpanded(true)}>Edit scraps</button></div>
    <div className="scrap-list" id="scrap-list">{scraps.map(scrap => {
      const size = stockSize(scrap);
      return <button className="scrap-row" key={scrap.id} onClick={() => onEdit(scrap)} aria-label={`Edit ${scrap.name}, ${size.width} by ${size.height} millimetres`}>
        <img className="fabric-swatch" src={fabricFor(scrap)} alt="" />
        <span className="scrap-copy"><strong>{scrap.name}</strong><span>{size.width} × {size.height} mm</span><small>{scrap.grain === 'fixed' ? 'Follow grain' : 'Free rotation'}</small></span>
      </button>;
    })}<button className="text-button mobile-only add-mobile" onClick={onAdd}>Add scrap</button></div>
  </section>;
}

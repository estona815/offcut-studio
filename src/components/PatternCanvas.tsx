import { useId, useState } from 'react';
import type { Candidate, CutRecord, Plan, Scrap, Workspace } from '../domain/types';
import { bounds } from '../domain/geometry';
import { fabricFor, geometryPath, mm } from './presentation';

function StockDrawing({ scrap, plan, cuts, prefix }: { scrap: Scrap; plan: Plan; cuts: CutRecord[]; prefix: string }) {
  const cutIds = new Set(cuts.map(cut => cut.piece.id));
  const placements = [...cuts.filter(cut => cut.placement.scrapId === scrap.id).map(cut => cut.placement), ...plan.placements.filter(p => p.scrapId === scrap.id && !cutIds.has(p.pieceId))];
  const displayed = [...scrap.geometry, ...placements.map(p => [p.polygon])];
  const box = displayed.length ? bounds(displayed) : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const width = Math.max(100, box.maxX), height = Math.max(100, box.maxY);
  const patternId = `${prefix}-${scrap.id}`;
  return <svg className="stock-drawing" viewBox={`-20 -24 ${width + 32} ${height + 43}`} role="img" aria-label={`${scrap.name}: measured cutting layout in millimetres`}>
    <defs><pattern id={patternId} width="160" height="160" patternUnits="userSpaceOnUse"><image href={fabricFor(scrap)} width="160" height="160" preserveAspectRatio="xMidYMid slice" /></pattern><pattern id={`${patternId}-grid`} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#d8cfbe" strokeWidth="0.32" /></pattern></defs>
    <rect x="-20" y="-24" width={width + 32} height={height + 43} fill={`url(#${patternId}-grid)`} />
    {Array.from({ length: Math.floor(width / 50) + 1 }, (_, i) => <g key={`x${i}`}><path d={`M${i * 50} -5v5`} stroke="#817e74" strokeWidth=".6" /><text x={i * 50} y="-10" textAnchor="middle" className="ruler-label">{i * 50}</text></g>)}
    {Array.from({ length: Math.floor(height / 50) + 1 }, (_, i) => <g key={`y${i}`}><path d={`M-5 ${i * 50}h5`} stroke="#817e74" strokeWidth=".6" /><text x="-8" y={i * 50 + 2} textAnchor="end" className="ruler-label">{i * 50}</text></g>)}
    <path d={geometryPath(scrap.geometry)} fill={`url(#${patternId})`} fillOpacity=".22" fillRule="evenodd" stroke="#716e62" strokeDasharray="3 2" strokeWidth=".7" />
    {placements.map(placement => {
      const cut = cuts.find(item => item.piece.id === placement.pieceId);
      const spec = cut?.piece ?? plan.pieces.find(piece => piece.id === placement.pieceId);
      if (!spec) return null;
      const b = bounds([[placement.polygon]]), w = b.maxX - b.minX, h = b.maxY - b.minY;
      const light = scrap.id === 'indigo' || scrap.color.toLowerCase() === '#344a64';
      const label = { front: 'Front', back: 'Back', pocket: 'Pocket', 'coaster-a': 'Face', 'coaster-b': 'Reverse' }[spec.role];
      return <g key={placement.pieceId} className={cut ? 'cut-piece' : 'uncut-piece'}>
        <path d={geometryPath([[placement.polygon]])} fill={`url(#${patternId})`} stroke={cut ? '#526255' : '#123b31'} strokeWidth=".9" />
        <rect x={b.minX + spec.seam} y={b.minY + spec.seam} width={Math.max(0, w - 2 * spec.seam)} height={Math.max(0, h - 2 * spec.seam)} fill="none" stroke={light ? '#f8f5ee' : '#554b36'} strokeWidth=".7" strokeDasharray="3 2" />
        <text x={b.minX + w / 2} y={b.minY + h / 2 - 7} textAnchor="middle" fill={light ? '#fffdf7' : '#122d25'} className="piece-label"><tspan x={b.minX + w / 2}>{cut ? 'Cut · ' + label : label}</tspan><tspan x={b.minX + w / 2} dy="14">{mm(spec.cutWidth)} × {mm(spec.cutHeight)}</tspan><tspan x={b.minX + w / 2} dy="12" className="piece-unit">mm</tspan></text>
        {spec.grain === 'fixed' && <path d={`M${b.maxX - 10} ${b.minY + 13}v18m-3-14 3-4 3 4`} stroke={light ? '#fffdf7' : '#123b31'} strokeWidth=".8" fill="none" />}
      </g>;
    })}
    <text x="0" y={height + 12} className="ruler-label">mm · dashed inset = seam allowance</text>
  </svg>;
}

export function PatternCanvas({ state, candidates, valid, onRecipe, onCut, onDownload }: { state: Workspace; candidates: Candidate[]; valid: boolean; onRecipe: (id: string) => void; onCut: (id: string) => void; onDownload: () => void }) {
  const [selectedStock, setSelectedStock] = useState(state.scraps[0]?.id ?? '');
  const activeStock = state.scraps.some(scrap => scrap.id === selectedStock) ? selectedStock : state.scraps[0]?.id;
  const prefix = useId().replaceAll(':', '');
  const next = state.plan.pieces.find(piece => !state.cuts.some(cut => cut.piece.id === piece.id));
  return <section className="panel pattern-panel" aria-labelledby="pattern-heading">
    <div className="pattern-heading"><h2 id="pattern-heading">{state.plan.label}</h2><div className="recipe-control"><label className="sr-only" htmlFor="recipe">Pattern and size</label><select id="recipe" value={state.plan.recipeId} disabled={state.cuts.length > 0} onChange={event => onRecipe(event.target.value)}>{candidates.map(({ recipe, result }) => <option key={recipe.id} value={recipe.id}>{recipe.label} · {recipe.size}{result.ok ? '' : ' — No layout found'}</option>)}</select></div></div>
    <div className="material-tabs mobile-only" aria-label="Material view">{state.scraps.map((scrap, i) => <button key={scrap.id} aria-pressed={activeStock === scrap.id} onClick={() => setSelectedStock(scrap.id)}>{i + 1}. {scrap.name.split(' ')[0]}</button>)}</div>
    <div className="pattern-board">{state.scraps.map(scrap => <div key={scrap.id} className={`stock-board ${activeStock === scrap.id ? 'active-stock' : ''}`}><div className="stock-caption"><span>{scrap.name}</span><span className="stock-piece-summary">{state.plan.placements.filter(placement => placement.scrapId === scrap.id).map(placement => { const piece = state.plan.pieces.find(item => item.id === placement.pieceId); return piece ? `${piece.label} · ${piece.cutWidth} × ${piece.cutHeight} mm${state.cuts.some(cut => cut.piece.id === piece.id) ? ' · cut' : ''}` : ''; }).join('; ') || 'Unallocated stock'}</span></div><StockDrawing scrap={scrap} plan={state.plan} cuts={state.cuts} prefix={prefix} /></div>)}</div>
    <div className="canvas-footer"><span className="cut-count">{state.cuts.length} of {state.plan.pieces.length} pieces cut</span><div className="canvas-actions">{state.view === 'make' && <button className="button secondary cut-action" disabled={!valid || !next} onClick={() => next && onCut(next.id)}>{next ? `Mark ${next.role.replace('coaster-', '')} cut` : 'All pieces cut'}</button>}<button className="button secondary" disabled={!valid || !next} onClick={onDownload}>Download SVG</button></div></div>
    {!valid && <p className="canvas-warning" role="status">This layout no longer fits. Replan before cutting or downloading.</p>}
    {state.cuts.length > 0 && <p className="canvas-note">Keep this pattern while pieces are cut. Reset demo to start a different project.</p>}
    {state.view === 'plan' && <details className="candidate-details"><summary>Which patterns fit these scraps?</summary><ul>{candidates.map(candidate => <li key={candidate.recipe.id}><span>{candidate.recipe.label} · {candidate.recipe.size}</span><span className={candidate.result.ok ? 'feasible' : 'not-found'}>{candidate.result.ok ? 'Layout found' : 'No layout found'}</span></li>)}</ul><p className="form-note">Computed from the uncut stock. No layout found means the bounded search found none.</p></details>}
  </section>;
}

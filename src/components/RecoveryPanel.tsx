import type { PlanResult, Workspace } from '../domain/types';
import { mm } from './presentation';

function PocketComparison({ width, height, maxHeight, label }: { width: number; height: number; maxHeight: number; label: string }) {
  const baseline = maxHeight + 10;
  return <div className="comparison-piece"><strong>{label}</strong><svg viewBox={`0 0 ${width + 42} ${maxHeight + 28}`} role="img" aria-label={`${label}: ${width} by ${height} millimetres`}><rect x="10" y={baseline - height} width={width} height={height} fill="none" stroke="currentColor" strokeWidth="1" /><rect x="15" y={baseline - height + 5} width={Math.max(0, width - 10)} height={Math.max(0, height - 10)} fill="none" stroke="currentColor" strokeDasharray="4 3" strokeWidth=".8" /><path d={`M${width + 20} ${baseline - height}v${height}m-3 0h6M${width + 17} ${baseline - height}h6`} stroke="#5e615b" strokeWidth=".8" /><text x={width + 25} y={baseline - height / 2} fontSize="11" transform={`rotate(90 ${width + 25} ${baseline - height / 2})`} textAnchor="middle">{mm(height)} mm</text></svg></div>;
}
export function RecoveryPanel({ state, preview, valid, dismissed, onDismiss, onReview, onReplan, onMake }: { state: Workspace; preview: PlanResult; valid: boolean; dismissed: boolean; onDismiss: () => void; onReview: () => void; onReplan: () => void; onMake: () => void }) {
  const before = state.plan.pieces.find(piece => piece.role === 'pocket');
  const after = preview.ok ? preview.plan.pieces.find(piece => piece.role === 'pocket') : undefined;
  const changed = before && after && before.cutHeight !== after.cutHeight;
  return <aside className="panel recovery-panel" aria-labelledby="recovery-heading"><h2 id="recovery-heading">Make it fit again</h2>
    {!valid && !dismissed ? <>
      <p>{changed ? `The pocket can become ${mm(after.cutHeight)} mm tall.` : 'The measured fabric has changed. Let’s check the remaining pieces.'}</p>
      {changed && <div className="comparison"><PocketComparison width={before.cutWidth} height={before.cutHeight} maxHeight={Math.max(before.cutHeight, after.cutHeight)} label="Before" /><PocketComparison width={after.cutWidth} height={after.cutHeight} maxHeight={Math.max(before.cutHeight, after.cutHeight)} label="After" /></div>}
      <p className="recovery-explanation">{changed ? 'Keep the body pieces. Make the pocket shallower.' : preview.message}</p>
      <div className="recovery-actions"><button className="button primary" onClick={onReplan} disabled={!preview.ok}>{changed ? 'Replan pocket' : 'Replan remaining pieces'}</button><button className="button secondary" onClick={onDismiss}>Keep current plan</button></div>
      {!preview.ok && <p className="form-note">Edit or add usable fabric, then try again.</p>}
    </> : !valid ? <><p>Current plan kept for reference.</p><p className="recovery-explanation">It still does not fit the measured scraps. Cutting and export stay paused.</p><button className="button primary" onClick={onReview}>Review recovery</button></> : <>
      <p>Your pieces fit the measured scraps.</p>
      <dl className="ready-dimensions">{state.plan.pieces.map(piece => <div key={piece.id}><dt>{piece.label}</dt><dd>{piece.cutWidth} × {piece.cutHeight} mm{state.cuts.some(cut => cut.piece.id === piece.id) && <span> · cut</span>}</dd></div>)}</dl>
      <p className="recovery-explanation">{state.cuts.length ? 'The completed pieces are kept. Continue with the remaining cuts.' : 'Start with the body pieces. If a scrap changes, we’ll keep what you have already cut.'}</p>
      {state.view === 'plan' && <button className="button primary" onClick={onMake}>Start making</button>}
      {state.view === 'make' && <p className="form-note">Mark each piece only after you have actually cut it.</p>}
    </>}
  </aside>;
}

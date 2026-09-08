import { useEffect, useMemo, useState } from 'react';
import type { Scrap, Workspace } from './domain/types';
import { evaluateCandidates, recoverPlan, validatePlan } from './domain/planner';
import { makeSVG } from './domain/svg';
import { createWorkspace, markPieceCut, editScrap, addScrap, selectRecipe, replan, setView, nextInstruction } from './state/workspace';
import { executeCommand, COMMAND_HELP } from './state/commands';
import { loadWorkspace, saveWorkspace } from './state/persistence';
import { Header } from './components/Header';
import { ScrapInventory } from './components/ScrapInventory';
import { ScrapEditor, type ScrapInput } from './components/ScrapEditor';
import { PatternCanvas } from './components/PatternCanvas';
import { RecoveryPanel } from './components/RecoveryPanel';
import { CommandBar } from './components/CommandBar';
import { MakeSteps } from './components/MakeSteps';
import { DialogShell } from './components/DialogShell';

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [editor, setEditor] = useState<Scrap | 'new' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const candidates = useMemo(() => evaluateCandidates(workspace.scraps), [workspace.scraps]);
  const valid = useMemo(() => validatePlan(workspace.plan, workspace.scraps, workspace.cuts), [workspace.plan, workspace.scraps, workspace.cuts]);
  const preview = useMemo(() => recoverPlan(workspace.plan, workspace.scraps, workspace.cuts), [workspace.plan, workspace.scraps, workspace.cuts]);
  useEffect(() => { setSaveFailed(!saveWorkspace(workspace)); }, [workspace]);
  function commit(next: Workspace) { setWorkspace(next); setNotice(''); if (next.revision !== workspace.revision) setRecoveryDismissed(false); }
  function reset() { commit(createWorkspace()); setConfirmReset(false); setRecoveryDismissed(false); }
  function saveScrap(input: ScrapInput) {
    const next = editor && editor !== 'new' ? editScrap(workspace, editor.id, input.width, input.height, input.shape, input.grain) : addScrap(workspace, input);
    if (next.revision === workspace.revision) return next.message;
    commit(next); return null;
  }
  function download() {
    try {
      const content = makeSVG(workspace.plan, workspace.scraps, workspace.cuts);
      const href = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml;charset=utf-8' }));
      const link = document.createElement('a'); link.href = href; link.download = `offcut-${workspace.plan.recipeId}-r${workspace.revision}.svg`; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setNotice('SVG download prepared. Print at 100% and check the scale before cutting.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The SVG could not be prepared.'); }
  }
  return <><Header view={workspace.view} onView={view => commit(setView(workspace, view))} onReset={() => workspace.cuts.length ? setConfirmReset(true) : reset()} />
    <main id="main" className="app-main"><div className="intro"><h1>Keep the cut. Change the plan.</h1><p>A smaller scrap can still become something useful.</p></div>
      <div className="workspace-grid"><ScrapInventory scraps={workspace.scraps} onAdd={() => setEditor('new')} onEdit={setEditor} /><PatternCanvas state={workspace} candidates={candidates} valid={valid} onRecipe={id => commit(selectRecipe(workspace, id))} onCut={id => commit(markPieceCut(workspace, id))} onDownload={download} /><RecoveryPanel state={workspace} preview={preview} valid={valid} dismissed={recoveryDismissed} onDismiss={() => setRecoveryDismissed(true)} onReview={() => setRecoveryDismissed(false)} onReplan={() => commit(replan(workspace))} onMake={() => commit(setView(workspace, 'make'))} /></div>
      {workspace.view === 'make' && <MakeSteps state={workspace} instruction={nextInstruction(workspace)} />}
      <CommandBar onCommand={input => commit(executeCommand(workspace, input))} help={COMMAND_HELP} />
      <p className={`workspace-message ${!valid ? 'needs-recovery' : ''}`} role="status" aria-live="polite">{notice || workspace.message}</p>
      {saveFailed && <p className="error-message" role="alert">Browser storage is unavailable. This workspace may not survive a reload.</p>}
      <footer className="app-footer"><span>Sample scraps · Local workspace</span><span>All measurements in mm</span></footer>
    </main>
    {editor && <ScrapEditor scrap={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSave={saveScrap} />}
    {confirmReset && <DialogShell title="Reset this demo workspace?" onClose={() => setConfirmReset(false)}><p>You have marked {workspace.cuts.length} {workspace.cuts.length === 1 ? 'piece' : 'pieces'} cut. Resetting replaces this local sample with the original scraps and clears its progress.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setConfirmReset(false)}>Keep workspace</button><button className="button primary" onClick={reset}>Reset demo</button></div></DialogShell>}
  </>;
}

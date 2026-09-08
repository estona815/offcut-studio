import { useState, useEffect } from 'react';
import type { Workspace } from '../domain/types';
import { Icon } from './Icons';

export function MakeSteps({ state, instruction }: { state: Workspace; instruction: string }) {
  const [speaking, setSpeaking] = useState(false);
  const available = 'speechSynthesis' in window;
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  function readStep() {
    if (!available) return;
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const speech = new SpeechSynthesisUtterance(instruction); speech.lang = 'en-US';
    speech.onend = () => setSpeaking(false); speech.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(speech); setSpeaking(true);
  }
  return <section className="panel make-steps" aria-labelledby="steps-heading"><div className="steps-heading"><h2 id="steps-heading">Next steps</h2><button className="text-button read-step" disabled={!available} onClick={readStep}><Icon name="volume" />{speaking ? 'Stop reading' : available ? 'Read next step' : 'Audio unavailable'}</button></div><p className="next-instruction">{instruction}</p><details><summary>Assembly notes</summary><ol>{state.plan.steps.map(step => <li key={step}>{step}</li>)}</ol></details></section>;
}

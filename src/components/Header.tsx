import type { Workspace } from '../domain/types';

export function Header({ view, onView, onReset }: { view: Workspace['view']; onView: (view: Workspace['view']) => void; onReset: () => void }) {
  return <header className="app-header">
    <a className="wordmark" href="#main">Offcut Studio</a>
    <nav className="view-tabs" aria-label="Workspace view">
      {(['plan', 'make'] as const).map(tab => <button key={tab} className={view === tab ? 'active' : ''} aria-current={view === tab ? 'page' : undefined} onClick={() => onView(tab)}>{tab === 'plan' ? 'Plan' : 'Make'}</button>)}
    </nav>
    <div className="header-tools"><span>Alexa+ simulation</span><button className="text-button reset-button" onClick={onReset}>Reset demo</button></div>
  </header>;
}

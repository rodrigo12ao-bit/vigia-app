import {StrictMode,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
const App=lazy(()=>import('./App.tsx'));
import {AdultGate} from './components/AdultGate';
import './index.css';
import './learning.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdultGate><Suspense fallback={<main className="welcome-shell"><section className="welcome-card" role="status"><h1>Preparando a Vigia…</h1><p>Só um instante. Já vamos começar!</p></section></main>}><App /></Suspense></AdultGate>
  </StrictMode>,
);

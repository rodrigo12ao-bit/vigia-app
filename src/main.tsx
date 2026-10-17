import {StrictMode,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
const App=lazy(()=>import('./App.tsx').catch(()=>({default:BootLoadFailure})));
import {AdultGate} from './components/AdultGate';
import './index.css';
import './learning.css';
import './section-theme.css';

// Only an import failure reaches this screen; an existing App is never reset
// automatically, and retry leaves browser storage and saved drafts untouched.
function BootLoadFailure(){
  return <main className="welcome-shell"><section className="welcome-card" role="alert"><h1>O carregamento foi interrompido.</h1><p>Verifique a conexão e tente novamente. Seus dados salvos foram preservados.</p><button className="vigia-primary" onClick={()=>window.location.reload()}>Tentar carregar novamente</button></section></main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdultGate><Suspense fallback={<main className="welcome-shell"><section className="welcome-card" role="status"><h1>Preparando a Vigia…</h1><p>Só um instante. Já vamos começar!</p></section></main>}><App /></Suspense></AdultGate>
  </StrictMode>,
);

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AdultGate} from './components/AdultGate';
import { MotionConfig } from 'motion/react';
import './index.css';
import './learning.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user"><AdultGate><App /></AdultGate></MotionConfig>
  </StrictMode>,
);

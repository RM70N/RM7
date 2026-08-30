import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, readTheme } from './lib/theme';
import './styles/index.css';

// نطبّق الثيم قبل أول رسم حتى ما يصير وميض أبيض
applyTheme(readTheme());

const container = document.getElementById('root');
if (!container) throw new Error('ما لقينا عنصر #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

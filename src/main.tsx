import { createRoot } from 'react-dom/client';
import { App } from './App';
import { demoFlag } from './ui/musicMode';
import './ui/theme.css';

// Catch the ?demo flag before anything rewrites the URL.
demoFlag();

createRoot(document.getElementById('root')!).render(<App />);

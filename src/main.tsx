import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
console.log("Main.tsx starting...");
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

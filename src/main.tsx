import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App.tsx';
import './index.css';

// #region agent log
fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
  body: JSON.stringify({
    sessionId: 'ec45ad',
    runId: 'white-screen-triage',
    hypothesisId: 'W0',
    location: 'src/main.tsx:module',
    message: 'Main module evaluated',
    data: { href: window.location.href },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

// #region agent log
window.addEventListener('error', (event) => {
  fetch('http://127.0.0.1:7397/ingest/56484124-7df3-4537-80fa-738427537570', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec45ad' },
    body: JSON.stringify({
      sessionId: 'ec45ad',
      runId: 'white-screen-triage',
      hypothesisId: 'W5',
      location: 'src/main.tsx:window:error',
      message: 'Window error caught in main',
      data: { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
});
// #endregion

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <Analytics />
      <SpeedInsights />
    </>
  </StrictMode>,
);

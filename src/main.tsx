import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n/context';
import { applyTheme, getStoredAccent, getStoredAppearance } from './config/theme';
import { ToastProvider } from './components/Toast';
import './index.css';
import './styles/forms.css';
import './styles/layout.css';

// The inline script in index.html has already set data-theme and the accent
// so the first paint is right; this fills in --accent-strong, which needs the
// contrast loop and is too much to inline.
applyTheme(getStoredAccent(), getStoredAppearance());

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

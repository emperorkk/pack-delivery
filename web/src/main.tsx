import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { I18nProvider } from './i18n/provider';
import { ThemeProvider } from './themes/ThemeProvider';
import { startGeolocation } from './geo/service';
import './themes/base.css';
import './index.css';

// Kick off GPS subscription early. The service itself respects the
// "share location" Settings toggle and the browser permission state.
startGeolocation();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>
);

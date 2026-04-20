import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AdminApp } from './App';
import { ThemeProvider } from '@/themes/ThemeProvider';
import { I18nProvider } from '@/i18n/provider';
import '@/themes/base.css';
import './admin.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AdminApp />
        </BrowserRouter>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>
);

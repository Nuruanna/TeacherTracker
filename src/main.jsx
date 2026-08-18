import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import AuthGate from './components/AuthGate';
import { ConfirmDialogProvider } from './components/ConfirmDialog';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <ConfirmDialogProvider><HashRouter><App /></HashRouter></ConfirmDialogProvider>
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>,
);

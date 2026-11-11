import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ConfirmationProvider from './components/ConfirmationProvider';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><ConfirmationProvider><App /></ConfirmationProvider></React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('PWA belum tersedia:', error));
}

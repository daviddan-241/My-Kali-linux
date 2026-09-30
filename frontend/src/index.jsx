import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import App from './App.jsx';

const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

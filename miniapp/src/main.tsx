import ReactDOM from 'react-dom/client';
import { init, backButton } from '@telegram-apps/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import '@telegram-apps/telegram-ui/dist/styles.css';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App';

try {
  init(); // вне Telegram бросает — dev в браузере продолжает работать
  if (backButton.mount.isAvailable()) backButton.mount();
} catch { /* браузер без Telegram */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppRoot>
    <App />
  </AppRoot>,
);

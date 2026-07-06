import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { Tabbar } from '@telegram-apps/telegram-ui';
import { api, type Me } from './api';
import Home from './pages/Home';
import PartnerPage from './pages/Partner';
import MapPage from './pages/Map';
import Activate from './pages/Activate';
import Profile from './pages/Profile';
import PartnerCabinet from './pages/PartnerCabinet';
import Admin from './pages/admin';

/** startapp=p_123 (наклейка на кассе) → сразу экран активации. */
function StartParamRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const { tgWebAppStartParam } = retrieveLaunchParams();
      const m = /^p_(\d+)$/.exec(tgWebAppStartParam ?? '');
      if (m) navigate(`/activate/${m[1]}`, { replace: true });
    } catch { /* вне Telegram */ }
  }, [navigate]);
  return null;
}

function Nav({ role }: { role: Me['role'] | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useMemo(() => {
    const base = [
      { id: '/', text: 'Скидки' },
      { id: '/map', text: 'Карта' },
      { id: '/profile', text: 'Профиль' },
    ];
    if (role === 'partner') base.push({ id: '/cabinet', text: 'Кабинет' });
    if (role === 'admin') base.push({ id: '/admin', text: 'Админ' });
    return base;
  }, [role]);

  if (location.pathname.startsWith('/activate')) return null; // на экране активации таббар мешает

  return (
    <Tabbar>
      {tabs.map((tab) => (
        <Tabbar.Item
          key={tab.id}
          text={tab.text}
          selected={location.pathname === tab.id}
          onClick={() => navigate(tab.id)}
        />
      ))}
    </Tabbar>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>('/me').then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <HashRouter>
      <StartParamRedirect />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/partners/:id" element={<PartnerPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/activate/:partnerId" element={<Activate />} />
        <Route path="/profile" element={<Profile me={me} onChange={setMe} />} />
        <Route path="/cabinet" element={<PartnerCabinet />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <Nav role={me?.role ?? null} />
    </HashRouter>
  );
}
